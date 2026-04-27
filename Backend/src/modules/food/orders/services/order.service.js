import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodUserDebt } from '../models/userDebt.model.js';
// import { paymentSnapshotFromOrder } from './foodOrderPayment.service.js';
import { logger } from '../../../../utils/logger.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodZone } from '../../admin/models/zone.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { ValidationError, ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';
import { buildPaginationOptions, buildPaginatedResult } from '../../../../utils/helpers.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { RestaurantOffer } from '../../restaurant/models/restaurantOffer.model.js';
import { RestaurantOfferUsage } from '../../restaurant/models/restaurantOfferUsage.model.js';
import { FoodDeliveryCommissionRule } from '../../admin/models/deliveryCommissionRule.model.js';
import { FoodRestaurantCommission } from '../../admin/models/restaurantCommission.model.js';
import { FoodPayoutSettlement } from '../../admin/models/foodPayoutSettlement.model.js';
import {
  sendNotificationToOwner,
  sendNotificationToOwners,
  notifyAdminsSafely,
} from "../../../../core/notifications/firebase.service.js";
import { FoodTransaction } from '../models/foodTransaction.model.js';
import { FoodSupportTicket } from '../../user/models/supportTicket.model.js';
import {
    createRazorpayOrder,
    createPaymentLink,
    verifyPaymentSignature,
    getRazorpayKeyId,
    isRazorpayConfigured,
    fetchRazorpayPaymentLink,
    initiateRazorpayRefund
} from '../helpers/razorpay.helper.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { addOrderJob } from '../../../../queues/producers/order.producer.js';
import { fetchPolyline } from '../utils/googleMaps.js';
import { getFirebaseDB } from '../../../../config/firebase.js';
import * as foodTransactionService from './foodTransaction.service.js';

const ORDER_ID_PREFIX = "FOD-";
const ORDER_ID_LENGTH = 6;

const getCartItemProductId = (item = {}) =>
  String(item?.itemId || item?.productId || item?.id || '').trim();

const calculateRestaurantOfferDiscount = (offer, eligibleSubtotal) => {
  if (!Number.isFinite(eligibleSubtotal) || eligibleSubtotal <= 0) return 0;

  if (offer?.discountType === 'flat-price') {
    return Math.max(
      0,
      Math.min(eligibleSubtotal, Math.floor(Number(offer?.discountValue) || 0)),
    );
  }

  const raw = eligibleSubtotal * ((Number(offer?.discountValue) || 0) / 100);
  const capped = Number(offer?.maxDiscount)
    ? Math.min(raw, Number(offer.maxDiscount))
    : raw;

  return Math.max(0, Math.min(eligibleSubtotal, Math.floor(capped)));
};

const findApplicableRestaurantAutoOffer = async (restaurantId, items = [], userId = null) => {
  const normalizedRestaurantId = String(restaurantId || '').trim();
  if (
    !normalizedRestaurantId ||
    !mongoose.Types.ObjectId.isValid(normalizedRestaurantId) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return null;
  }

  const cartProductIds = items
    .map((item) => getCartItemProductId(item))
    .filter(Boolean);

  if (cartProductIds.length === 0 || cartProductIds.length !== items.length) {
    return null;
  }

  const uniqueCartProductIds = [...new Set(cartProductIds)];
  const now = new Date();
  const offers = await RestaurantOffer.find({
    restaurantId: new mongoose.Types.ObjectId(normalizedRestaurantId),
  }).lean();

  let bestMatch = null;
  let invalidMatch = null;

  for (const offer of offers) {
    const productIds = Array.isArray(offer?.productIds) && offer.productIds.length > 0
      ? offer.productIds.map((id) => String(id))
      : offer?.productId
        ? [String(offer.productId)]
        : [];

    if (productIds.length === 0) continue;
    if (offer?.status === 'paused') continue;
    if (offer?.startDate && now < new Date(offer.startDate)) continue;
    if (offer?.endDate && now >= new Date(offer.endDate)) continue;
    if (
      Number(offer?.usageLimit) > 0 &&
      Number(offer?.usedCount || 0) >= Number(offer?.usageLimit)
    ) continue;

    if (userId && Number(offer?.perUserLimit) > 0) {
      const usage = await RestaurantOfferUsage.findOne({
        offerId: offer._id,
        userId,
      }).lean();
      if (usage && Number(usage.count) >= Number(offer.perUserLimit)) continue;
    }

    const allowedProducts = new Set(productIds);
    const allCartItemsBelongToOffer = uniqueCartProductIds.every((id) => allowedProducts.has(id));
    if (!allCartItemsBelongToOffer) continue;

    const eligibleItemCount = items.reduce((sum, item) => {
      const itemId = getCartItemProductId(item);
      if (!allowedProducts.has(itemId)) return sum;
      return sum + Math.max(0, Number(item?.quantity) || 0);
    }, 0);

    if (
      Number(offer?.maxOfferQuantityPerOrder) > 0 &&
      eligibleItemCount > Number(offer.maxOfferQuantityPerOrder)
    ) {
      invalidMatch = {
        offer,
        reason: 'max_items_exceeded',
        eligibleItemCount,
        maxOfferQuantityPerOrder: Number(offer.maxOfferQuantityPerOrder),
      };
      continue;
    }

    const eligibleSubtotal = items.reduce((sum, item) => {
      const itemId = getCartItemProductId(item);
      if (!allowedProducts.has(itemId)) return sum;
      return sum + (Number(item?.price) || 0) * (Number(item?.quantity) || 1);
    }, 0);

    if (eligibleSubtotal <= 0) continue;

    const discount = calculateRestaurantOfferDiscount(offer, eligibleSubtotal);
    if (discount <= 0) continue;

    if (!bestMatch || discount > bestMatch.discount) {
      bestMatch = { offer, eligibleSubtotal, discount };
    }
  }

  return bestMatch || (invalidMatch ? { invalidReason: invalidMatch.reason, ...invalidMatch } : null);
};

/**
 * Fire-and-forget BullMQ enqueue for order lifecycle events.
 * Never blocks API response; failures are logged only.
 */
function enqueueOrderEvent(action, payload = {}) {
    try {
        void addOrderJob({ action, ...payload }).catch((err) => {
            logger.warn(`BullMQ enqueue order event failed: ${action} - ${err?.message || err}`);
        });
    } catch (err) {
        logger.warn(`BullMQ enqueue order event failed (sync): ${action} - ${err?.message || err}`);
    }
}

function generateFourDigitDeliveryOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Remove secret fields before returning order JSON to delivery partner / restaurant. */
function sanitizeOrderForExternal(orderDoc) {
  const o = orderDoc?.toObject ? orderDoc.toObject() : { ...(orderDoc || {}) };
  delete o.deliveryOtp;
  const dv = o.deliveryVerification;
  if (dv && dv.dropOtp != null) {
    const d = dv.dropOtp;
    o.deliveryVerification = {
      ...dv,
      dropOtp: {
        required: Boolean(d.required),
        verified: Boolean(d.verified),
      },
    };
  }
  return o;
}

function emitDeliveryDropOtpToUser(order, plainOtp) {
  try {
    const io = getIO();
    if (!io || !plainOtp || !order?.userId) return;
    io.to(rooms.user(order.userId)).emit("delivery_drop_otp", {
      orderMongoId: order._id?.toString?.(),
      orderId: order.orderId,
      otp: plainOtp,
      message:
        "Share this OTP with your delivery partner to hand over the order.",
    });
  } catch (e) {
    logger.warn(`emitDeliveryDropOtpToUser failed: ${e?.message || e}`);
  }
}

async function notifyOwnersSafely(targets, payload) {
  try {
    await sendNotificationToOwners(targets, payload);
  } catch (error) {
    logger.warn(`FCM notification failed: ${error?.message || error}`);
  }
}

async function notifyOwnerSafely(target, payload) {
  try {
    await sendNotificationToOwner({ ...target, payload });
  } catch (error) {
    logger.warn(`FCM notification failed: ${error?.message || error}`);
  }
}

async function notifyAdminsOrderReadyForAssignment(order) {
  try {
    await notifyAdminsSafely({
      title: "Order Ready For Delivery Assignment",
      body: `Order ${order.orderId} is ready. Please assign a delivery partner.`,
      data: {
        type: "order_ready_for_assignment",
        orderId: String(order.orderId || ""),
        orderMongoId: String(order._id || ""),
        link: "/admin/food/order-detect-delivery",
      },
    });
  } catch (error) {
    logger.warn(`Admin ready notification failed: ${error?.message || error}`);
  }
}

async function notifyAssignedDeliveryPartner(order) {
  const assignedId =
    order?.dispatch?.deliveryPartnerId?._id?.toString?.() ||
    order?.dispatch?.deliveryPartnerId?.toString?.() ||
    order?.dispatch?.deliveryPartnerId;
  if (!assignedId) return { notified: false };

  const restaurant = await FoodRestaurant.findById(order.restaurantId)
    .select("restaurantName location addressLine1 area city state")
    .lean();
  const payload = buildDeliverySocketPayload(order, restaurant);
  const io = getIO();

  if (io) {
    io.to(rooms.delivery(assignedId)).emit("new_order", payload);
    io.to(rooms.delivery(assignedId)).emit("play_notification_sound", {
      orderId: payload.orderId,
      orderMongoId: payload.orderMongoId,
    });
  }

  await notifyOwnerSafely(
    { ownerType: "DELIVERY_PARTNER", ownerId: assignedId },
    {
      title: "New delivery task",
      body: `Order ${payload.orderId} is assigned to you.`,
      data: {
        type: "new_order",
        orderId: payload.orderId,
        orderMongoId: payload.orderMongoId,
        link: "/delivery",
      },
    },
  );

  return { notified: true };
}

function buildOrderIdentityFilter(orderIdOrMongoId) {
  const raw = String(orderIdOrMongoId || "").trim();
  if (!raw) return null;
  if (mongoose.isValidObjectId(raw))
    return { _id: new mongoose.Types.ObjectId(raw) };
  return { orderId: raw };
}

function generateOrderId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ORDER_ID_LENGTH; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return ORDER_ID_PREFIX + s;
}

async function ensureUniqueOrderId() {
  let orderId;
  let exists = true;
  let attempts = 0;
  while (exists && attempts < 10) {
    orderId = generateOrderId();
    const found = await FoodOrder.exists({ orderId });
    exists = !!found;
    attempts++;
  }
  if (exists) throw new ValidationError("Could not generate unique order id");
  return orderId;
}

function toGeoPoint(lat, lng) {
  if (lat == null || lng == null) return undefined;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return { type: "Point", coordinates: [b, a] };
}

function formatDeliveryAddressWithLabels(address = {}) {
  if (!address || typeof address !== "object") return "";

  const fieldValue = (value) => String(value || "").trim();
  const building = fieldValue(address.buildingName || address.addressLine1);
  const floor = fieldValue(address.floor);
  const street = fieldValue(address.street || address.addressLine2);
  const area = fieldValue(address.additionalDetails || address.area);
  const landmark = fieldValue(address.landmark);
  const city = fieldValue(address.city);
  const state = fieldValue(address.state);
  const zipCode = fieldValue(address.zipCode || address.postalCode);
  const label = fieldValue(address.label);

  const labeledParts = [
    label ? `Type: ${label}` : "",
    building ? `Building: ${building}` : "",
    floor ? `Floor/Flat: ${floor}` : "",
    street ? `Street: ${street}` : "",
    area ? `Area: ${area}` : "",
    landmark ? `Landmark: ${landmark}` : "",
    city ? `City: ${city}` : "",
    state ? `State: ${state}` : "",
    zipCode ? `Pincode: ${zipCode}` : "",
  ].filter(Boolean);

  if (labeledParts.length > 0) return labeledParts.join(", ");

  return fieldValue(address.formattedAddress || address.address);
}

function buildDeliveryAddressSnapshot(address = {}) {
  if (!address || typeof address !== "object") return undefined;

  const label = String(address?.label || "Home").trim() || "Home";
  const street = String(address?.street || "").trim();
  const additionalDetails = String(address?.additionalDetails || "").trim();
  const buildingName = String(address?.buildingName || "").trim();
  const floor = String(address?.floor || "").trim();
  const landmark = String(address?.landmark || "").trim();
  const city = String(address?.city || "").trim();
  const state = String(address?.state || "").trim();
  const zipCode = String(address?.zipCode || "").trim();
  const phone = String(address?.phone || "").trim();
  const name = String(address?.name || "").trim();
  const fullName = String(address?.fullName || name).trim();

  const addressParts = [
    floor ? `Floor ${floor}` : "",
    buildingName,
    street,
    additionalDetails,
    landmark,
    city,
    state,
    zipCode,
  ].filter(Boolean);

  const formattedAddress =
    String(address?.formattedAddress || "").trim() ||
    String(address?.address || "").trim() ||
    addressParts.join(", ");
  const labeledAddress = formatDeliveryAddressWithLabels({
    label,
    buildingName,
    floor,
    street,
    additionalDetails,
    landmark,
    city,
    state,
    zipCode,
    formattedAddress,
    address: String(address?.address || "").trim(),
  });

  return {
    label,
    street,
    additionalDetails,
    buildingName,
    floor,
    landmark,
    address: labeledAddress || String(address?.address || "").trim() || formattedAddress,
    formattedAddress,
    city,
    state,
    zipCode,
    phone,
    name,
    fullName,
    location: address?.location?.coordinates
      ? { type: "Point", coordinates: address.location.coordinates }
      : undefined,
  };
}

async function getUnpaidDebtSummary(userId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    return { totalDue: 0, count: 0 };
  }
  const rows = await FoodUserDebt.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: "unpaid",
  })
    .select("amount")
    .lean();
  const totalDue = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row?.amount || 0)),
    0,
  );
  return {
    totalDue: Math.round(totalDue),
    count: rows.length,
  };
}

async function settleUnpaidDebtsForOrder(userId, settledOrderId) {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    return { settledCount: 0, settledAmount: 0 };
  }

  const unpaidDebts = await FoodUserDebt.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: "unpaid",
  })
    .select("amount failedOrderId reasonType")
    .lean();

  if (!unpaidDebts.length) return { settledCount: 0, settledAmount: 0 };

  const settledAmount = unpaidDebts.reduce(
    (sum, row) => sum + Math.max(0, Number(row?.amount || 0)),
    0,
  );

  const noResponseFailedOrderIds = unpaidDebts
    .filter((row) => String(row?.reasonType || "").toLowerCase() === "user_unavailable")
    .map((row) => String(row?.failedOrderId || "").trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (noResponseFailedOrderIds.length) {
    await Promise.all(
      noResponseFailedOrderIds.map(async (failedOrderId) => {
        try {
          await foodTransactionService.updateTransactionStatus(
            new mongoose.Types.ObjectId(failedOrderId),
            "recovered_user_due",
            {
              status: "captured",
              note: `Recovered from user due settlement via order ${String(settledOrderId || "")}`,
              recordedByRole: "SYSTEM",
            },
          );
        } catch (txErr) {
          logger.warn(
            `Failed to mark recovered transaction for failed order ${failedOrderId}: ${txErr?.message || txErr}`,
          );
        }
      }),
    );
  }

  await FoodUserDebt.updateMany(
    {
      userId: new mongoose.Types.ObjectId(userId),
      status: "unpaid",
    },
    {
      $set: {
        status: "paid",
        settledOrderId: new mongoose.Types.ObjectId(settledOrderId),
        settledAt: new Date(),
      },
    },
  );

  return { settledCount: unpaidDebts.length, settledAmount };
}

async function buildNoResponseMetaMap(orderIds = []) {
  const validIds = (orderIds || [])
    .map((id) => String(id || "").trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!validIds.length) return new Map();

  const debts = await FoodUserDebt.find({
    failedOrderId: { $in: validIds },
    reasonType: "user_unavailable",
  })
    .select("failedOrderId amount status reasonType proofImageUrl callAttempted waitTimerCompletedAt settledOrderId settledAt")
    .lean();

  const map = new Map();
  for (const debt of debts) {
    const key = String(debt?.failedOrderId || "");
    if (!key) continue;
    map.set(key, {
      isUserUnavailable: true,
      dueAmount: Number(debt?.amount || 0),
      dueStatus: debt?.status || "unpaid",
      proofImageUrl: debt?.proofImageUrl || "",
      callAttempted: debt?.callAttempted === true,
      waitTimerCompletedAt: debt?.waitTimerCompletedAt || null,
      settledOrderId: debt?.settledOrderId || null,
      settledAt: debt?.settledAt || null,
    });
  }
  return map;
}

function withNoResponseMeta(orderLike, metaMap) {
  const order = orderLike?.toObject ? orderLike.toObject() : { ...(orderLike || {}) };
  const key = String(order?._id || order?.id || "");
  const meta = key ? metaMap?.get(key) : null;
  return {
    ...order,
    noResponseMeta:
      meta ||
      {
        isUserUnavailable: false,
        dueAmount: 0,
        dueStatus: null,
        proofImageUrl: "",
        callAttempted: false,
        waitTimerCompletedAt: null,
        settledOrderId: null,
        settledAt: null,
      },
  };
}

function pushStatusHistory(order, { byRole, byId, from, to, note = "" }) {
  order.statusHistory.push({
    at: new Date(),
    byRole,
    byId: byId || undefined,
    from,
    to,
    note,
  });
}

function isDispatchAccepted(orderLike = {}) {
  const dispatchStatus = String(orderLike?.dispatch?.status || "").toLowerCase();
  return dispatchStatus === "accepted" || Boolean(orderLike?.dispatch?.acceptedAt);
}

function sanitizeDispatchForClient(orderLike = {}) {
  const order = orderLike?.toObject ? orderLike.toObject() : { ...(orderLike || {}) };
  if (isDispatchAccepted(order)) return order;

  return {
    ...order,
    deliveryPartnerId: null,
    deliveryPartnerName: null,
    deliveryPartnerPhone: null,
    dispatch: {
      ...(order?.dispatch || {}),
      deliveryPartnerId: null,
      acceptedAt: null,
    },
  };
}

function normalizeOrderForClient(orderDoc) {
  const order = sanitizeDispatchForClient(orderDoc);
  return {
    ...order,
    status: order?.orderStatus || order?.status || "",
    deliveredAt:
      order?.deliveryState?.deliveredAt || order?.deliveredAt || null,
    deliveryPartnerId: isDispatchAccepted(order)
      ? (order?.dispatch?.deliveryPartnerId || order?.deliveryPartnerId || null)
      : null,
    rating: order?.ratings?.restaurant?.rating ?? order?.rating ?? null,
    deliveryState: {
      ...(order?.deliveryState || {}),
      currentLocation: order?.lastRiderLocation?.coordinates?.length >= 2 ? {
        lat: order.lastRiderLocation.coordinates[1],
        lng: order.lastRiderLocation.coordinates[0]
      } : (order?.deliveryState?.currentLocation || null)
    }
  };
}

async function applyAggregateRating(model, entityId, newRating) {
  if (!entityId) return;
  const doc = await model.findById(entityId).select("rating totalRatings");
  if (!doc) return;

  const totalRatings = Number(doc.totalRatings || 0);
  const currentAverage = Number(doc.rating || 0);
  const nextTotal = totalRatings + 1;
  const nextAverage = Number(
    ((currentAverage * totalRatings + Number(newRating)) / nextTotal).toFixed(
      1,
    ),
  );

  doc.totalRatings = nextTotal;
  doc.rating = nextAverage;
  await doc.save();
}

const COMMISSION_CACHE_MS = 10 * 1000;
let commissionRulesCache = null;
let commissionRulesLoadedAt = 0;

async function getActiveCommissionRules() {
  const now = Date.now();
  if (
    commissionRulesCache &&
    now - commissionRulesLoadedAt < COMMISSION_CACHE_MS
  ) {
    return commissionRulesCache;
  }
  const list = await FoodDeliveryCommissionRule.find({
    status: { $ne: false },
  }).lean();
  commissionRulesCache = list || [];
  commissionRulesLoadedAt = now;
  return commissionRulesCache;
}

// 🗑️ Moved to foodTransaction.service.js to centralize finance logic.


async function getRiderEarning(distanceKm) {
  const d = Number(distanceKm);
  if (!Number.isFinite(d) || d <= 0) return 0;
  const rules = await getActiveCommissionRules();
  if (!rules.length) return 0;

  const sorted = [...rules].sort(
    (a, b) => (a.minDistance || 0) - (b.minDistance || 0),
  );
  const baseRule = sorted.find((r) => Number(r.minDistance || 0) === 0) || null;
  if (!baseRule) return 0;

  let earning = Number(baseRule.basePayout || 0);

  for (const r of sorted) {
    const perKm = Number(r.commissionPerKm || 0);
    if (!Number.isFinite(perKm) || perKm <= 0) continue;
    const min = Number(r.minDistance || 0);
    const max = r.maxDistance == null ? null : Number(r.maxDistance);
    if (d <= min) continue;
    const upper = max == null ? d : Math.min(d, max);
    const kmInSlab = Math.max(0, upper - min);
    if (kmInSlab > 0) {
      earning += kmInSlab * perKm;
    }
  }

  if (!Number.isFinite(earning) || earning <= 0) return 0;
  return Math.round(earning);
}

/** Append-only food_order_payments row; never blocks main flow on failure */
// 🗑️ Deprecated in favor of FoodTransaction system.

function buildDeliverySocketPayload(orderDoc, restaurantDoc = null) {
  const order = orderDoc?.toObject ? orderDoc.toObject() : orderDoc || {};
  const restaurant = restaurantDoc || order?.restaurantId || null;
  const restaurantLocation = restaurant?.location || {};

  return {
    orderMongoId:
      orderDoc?._id?.toString?.() || order?._id?.toString?.() || order?._id,
    orderId: order?.orderId,
    status: orderDoc?.orderStatus || order?.orderStatus,
    items: order?.items || [],
    pricing: order?.pricing,
    total: order?.pricing?.total,
    payment: order?.payment,
    paymentMethod: order?.payment?.method,
    restaurantId:
      order?.restaurantId?._id?.toString?.() ||
      order?.restaurantId?.toString?.() ||
      order?.restaurantId,
    restaurantName: restaurant?.restaurantName || order?.restaurantName,
    restaurantAddress:
      restaurantLocation?.address ||
      restaurantLocation?.formattedAddress ||
      restaurant?.addressLine1 ||
      "",
    restaurantPhone: restaurant?.phone || "",
    restaurantLocation: {
      latitude: restaurantLocation?.latitude,
      longitude: restaurantLocation?.longitude,
      address:
        restaurantLocation?.address ||
        restaurantLocation?.formattedAddress ||
        restaurant?.addressLine1 ||
        "",
      area: restaurantLocation?.area || restaurant?.area || "",
      city: restaurantLocation?.city || restaurant?.city || "",
      state: restaurantLocation?.state || restaurant?.state || "",
    },
    deliveryAddress: order?.deliveryAddress,
    customerAddress:
      formatDeliveryAddressWithLabels(order?.deliveryAddress || {}) ||
      order?.deliveryAddress?.formattedAddress ||
      order?.deliveryAddress?.address ||
      "",
    customerName:
      order?.customerName ||
      order?.deliveryAddress?.fullName ||
      order?.deliveryAddress?.name ||
      order?.userId?.name ||
      "",
    customerPhone:
      order?.customerPhone ||
      order?.deliveryAddress?.phone ||
      order?.userId?.phone ||
      "",
    userName:
      order?.customerName ||
      order?.deliveryAddress?.fullName ||
      order?.deliveryAddress?.name ||
      order?.userId?.name ||
      "",
    userPhone:
      order?.customerPhone ||
      order?.deliveryAddress?.phone ||
      order?.userId?.phone ||
      "",
    riderEarning: order?.riderEarning || 0,
    earnings: order?.riderEarning || order?.pricing?.deliveryFee || 0,
    deliveryFee: order?.pricing?.deliveryFee || 0,
    deliveryFleet: order?.deliveryFleet,
    dispatch: order?.dispatch,
    createdAt: order?.createdAt,
    updatedAt: order?.updatedAt,
  };
}

function canExposeOrderToRestaurant(orderLike) {
  const method = String(orderLike?.payment?.method || "").toLowerCase();
  const status = String(orderLike?.payment?.status || "").toLowerCase();

  // Cash and Wallet are considered confirmed immediately
  if (["cash", "wallet"].includes(method)) return true;
  // Online payments must be successful
  return ["paid", "authorized", "captured", "settled"].includes(status);
}

async function notifyRestaurantNewOrder(orderDoc) {
  try {
    if (!orderDoc || !canExposeOrderToRestaurant(orderDoc)) return;

    const io = getIO();
    if (io) {
      const payload = {
        ...orderDoc.toObject(),
        orderMongoId: orderDoc._id?.toString?.() || undefined,
      };
      io.to(rooms.restaurant(orderDoc.restaurantId)).emit("new_order", payload);
      io.to(rooms.restaurant(orderDoc.restaurantId)).emit(
        "play_notification_sound",
        {
          orderId: payload.orderId,
          orderMongoId: payload.orderMongoId,
        },
      );
      io.to(rooms.admin()).emit("admin_new_order", payload);
      io.to(rooms.admin()).emit("play_notification_sound", {
        orderId: payload.orderId,
        orderMongoId: payload.orderMongoId,
      });
    }

    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: orderDoc.restaurantId }],
      {
        title: "New order received",
        body: `Order ${orderDoc.orderId} is waiting for review.`,
        data: {
          type: "new_order",
          orderId: orderDoc.orderId,
          orderMongoId: orderDoc._id?.toString?.() || "",
          link: `/restaurant/orders/${orderDoc._id?.toString?.() || ""}`,
        },
      },
    );
  } catch {
    // Do not block order/payment flow if notification fails.
  }
}

async function listNearbyOnlineDeliveryPartners(
  restaurantId,
  { maxKm = 15, limit = 25 } = {},
) {
  const restaurant = await FoodRestaurant.findById(restaurantId)
    .select("location")
    .lean();
  if (!restaurant?.location?.coordinates?.length) {
    // Fallback: if restaurant location is missing, notify any online approved partners.
    const partners = await FoodDeliveryPartner.find({
      status: "approved",
      availabilityStatus: "online",
    })
      .select("_id")
      .limit(Math.max(1, limit))
      .lean();
    return {
      restaurant: null,
      partners: partners.map((p) => ({ partnerId: p._id, distanceKm: null })),
    };
  }

  const [rLng, rLat] = restaurant.location.coordinates;
  const partners = await FoodDeliveryPartner.find({
    status: "approved",
    availabilityStatus: "online",
    lastLat: { $exists: true, $ne: null },
    lastLng: { $exists: true, $ne: null },
  })
    .select("_id lastLat lastLng")
    .lean();

  console.log(
    `[DEBUG] listNearby: Restaurant [${rLat}, ${rLng}] found ${partners.length} online approved partners with GPS`,
  );

  const scored = [];
  for (const p of partners) {
    const d = haversineKm(rLat, rLng, p.lastLat, p.lastLng);
    if (Number.isFinite(d) && d <= maxKm)
      scored.push({ partnerId: p._id, distanceKm: d });
  }

  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  const picked = scored.slice(0, Math.max(1, limit));

  // Fallback: if no one has GPS yet, still notify online partners (common right after login).
  if (picked.length === 0) {
    const anyOnline = await FoodDeliveryPartner.find({
      status: "approved",
      availabilityStatus: "online",
    })
      .select("_id")
      .limit(Math.max(1, limit))
      .lean();
    return {
      restaurant,
      partners: anyOnline.map((p) => ({ partnerId: p._id, distanceKm: null })),
    };
  }

  return { restaurant, partners: picked };
}

// ----- Settings -----
export async function getDispatchSettings() {
  let doc = await FoodSettings.findOne({ key: "dispatch" }).lean();
  if (!doc) {
    await FoodSettings.create({ key: "dispatch", dispatchMode: "manual" });
    doc = await FoodSettings.findOne({ key: "dispatch" }).lean();
  }
  return { dispatchMode: doc?.dispatchMode || "manual" };
}

export async function updateDispatchSettings(dispatchMode, adminId) {
  await FoodSettings.findOneAndUpdate(
    { key: "dispatch" },
    {
      $set: {
        dispatchMode,
        updatedBy: { role: "ADMIN", adminId, at: new Date() },
      },
    },
    { upsert: true, new: true },
  );
  return getDispatchSettings();
}

// ----- Calculate (validation + return pricing from payload) -----
export async function calculateOrder(userId, dto) {
  const orderType = dto.orderType === "quick" ? "quick" : "food";
  const items = Array.isArray(dto.items) ? dto.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );

  // Fee settings (admin-configured). Use safe fallbacks for dev if not configured.
  const feeDoc = await FoodFeeSettings.findOne({ isActive: true })
    .sort({ createdAt: -1 })
    .lean();
  const feeSettings = feeDoc || {
    deliveryFee: 25,
    deliveryFeeRanges: [],
    freeDeliveryThreshold: 149,
    platformFee: 5,
    gstRate: 5,
  };

  if (orderType === "quick") {
    const packagingFee = 0;
    const platformFee = Number(feeSettings.platformFee || 0);
    const deliveryFee = Number(feeSettings.deliveryFee || 25);
    const gstRate = Number(feeSettings.gstRate || 0);
    const tax =
      Number.isFinite(gstRate) && gstRate > 0
        ? Math.round(subtotal * (gstRate / 100))
        : 0;
    const discount = 0;
    const total = Math.max(
      0,
      subtotal + packagingFee + deliveryFee + platformFee + tax - discount,
    );

    const debtSummary = await getUnpaidDebtSummary(userId);
    const totalPayable = total + debtSummary.totalDue;
    return {
      pricing: {
        subtotal,
        tax,
        packagingFee,
        deliveryFee,
        platformFee,
        discount,
        previousDue: debtSummary.totalDue,
        totalPayable,
        total,
        currency: "INR",
        couponCode: null,
        appliedCoupon: null,
      },
      dues: {
        count: debtSummary.count,
        amount: debtSummary.totalDue,
      },
    };
  }

  const restaurant = await FoodRestaurant.findById(dto.restaurantId)
    .select("status")
    .lean();
  if (!restaurant) throw new ValidationError("Restaurant not found");
  if (restaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");

  const packagingFee = 0;
  const platformFee = Number(feeSettings.platformFee || 0);

  // Delivery fee by subtotal range (fallback to flat fee; free above threshold).
  const freeThreshold = Number(feeSettings.freeDeliveryThreshold || 0);
  let deliveryFee = 0;
  if (
    Number.isFinite(freeThreshold) &&
    freeThreshold > 0 &&
    subtotal >= freeThreshold
  ) {
    deliveryFee = 0;
  } else {
    const ranges = Array.isArray(feeSettings.deliveryFeeRanges)
      ? [...feeSettings.deliveryFeeRanges]
      : [];
    if (ranges.length > 0) {
      ranges.sort((a, b) => Number(a.min) - Number(b.min));
      let matched = null;
      for (let i = 0; i < ranges.length; i += 1) {
        const r = ranges[i] || {};
        const min = Number(r.min);
        const max = Number(r.max);
        const fee = Number(r.fee);
        if (
          !Number.isFinite(min) ||
          !Number.isFinite(max) ||
          !Number.isFinite(fee)
        )
          continue;
        const isLast = i === ranges.length - 1;
        const inRange = isLast
          ? subtotal >= min && subtotal <= max
          : subtotal >= min && subtotal < max;
        if (inRange) {
          matched = fee;
          break;
        }
      }
      deliveryFee = Number.isFinite(matched)
        ? matched
        : Number(feeSettings.deliveryFee || 0);
    } else {
      deliveryFee = Number(feeSettings.deliveryFee || 0);
    }
  }

  const gstRate = Number(feeSettings.gstRate || 0);
  const tax =
    Number.isFinite(gstRate) && gstRate > 0
      ? Math.round(subtotal * (gstRate / 100))
      : 0;

  let discount = 0;
  let couponDiscount = 0;
  let autoOfferDiscount = 0;
  let appliedCoupon = null;
  let autoAppliedOffer = null;
  const codeRaw = dto.couponCode
    ? String(dto.couponCode).trim().toUpperCase()
    : "";
  if (codeRaw) {
    const now = new Date();
    const offer = await FoodOffer.findOne({ couponCode: codeRaw }).lean();
    if (!offer) {
      discount = 0;
    } else {
      const approvalOk = (offer.approvalStatus || "approved") === "approved";
      const statusOk = offer.status === "active";
      const startOk = !offer.startDate || now >= new Date(offer.startDate);
      const endOk = !offer.endDate || now < new Date(offer.endDate);
      const scopeOk =
        offer.restaurantScope !== "selected" ||
        String(offer.restaurantId || "") === String(dto.restaurantId || "");
      const minOk = subtotal >= (Number(offer.minOrderValue) || 0);
      let usageOk = true;
      if (
        Number(offer.usageLimit) > 0 &&
        Number(offer.usedCount || 0) >= Number(offer.usageLimit)
      )
        usageOk = false;
      let perUserOk = true;
      if (userId && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId,
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit))
          perUserOk = false;
      }
      let firstOrderOk = true;
      if (userId && offer.customerScope === "first-time") {
        const c = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        firstOrderOk = c === 0;
      }
      if (userId && offer.isFirstOrderOnly === true) {
        const c2 = await FoodOrder.countDocuments({
          userId: new mongoose.Types.ObjectId(userId),
        });
        if (c2 > 0) firstOrderOk = false;
      }
      const allowed =
        approvalOk &&
        statusOk &&
        startOk &&
        endOk &&
        scopeOk &&
        minOk &&
        usageOk &&
        perUserOk &&
        firstOrderOk;
      if (allowed) {
        if (offer.discountType === "percentage") {
          const raw = subtotal * (Number(offer.discountValue) / 100);
          const capped = Number(offer.maxDiscount)
            ? Math.min(raw, Number(offer.maxDiscount))
            : raw;
          couponDiscount = Math.max(0, Math.min(subtotal, Math.floor(capped)));
        } else {
          couponDiscount = Math.max(
            0,
            Math.min(subtotal, Math.floor(Number(offer.discountValue) || 0)),
          );
        }
        appliedCoupon = { code: codeRaw, discount: couponDiscount, fundedBy: offer.fundedBy || 'platform' };
      }
    }
  }

  const autoOfferMatch = await findApplicableRestaurantAutoOffer(dto.restaurantId, dto.items || [], userId);
  let autoOfferFeedback = null;
  if (autoOfferMatch?.offer && !autoOfferMatch?.invalidReason) {
    autoOfferDiscount = autoOfferMatch.discount;
    autoAppliedOffer = {
      code: null,
      title: autoOfferMatch.offer.title || "Restaurant offer",
      discount: autoOfferDiscount,
      type: "restaurant-auto-offer",
      autoApplied: true,
      offerId: String(autoOfferMatch.offer._id),
      eligibleSubtotal: autoOfferMatch.eligibleSubtotal,
      maxOfferQuantityPerOrder: Number(autoOfferMatch.offer?.maxOfferQuantityPerOrder) || null,
    };
  } else if (autoOfferMatch?.invalidReason === 'max_items_exceeded') {
    autoOfferFeedback = {
      type: 'restaurant-auto-offer',
      reason: autoOfferMatch.invalidReason,
      title: autoOfferMatch.offer?.title || 'Restaurant offer',
      offerId: String(autoOfferMatch.offer?._id || ''),
      eligibleItemCount: Number(autoOfferMatch.eligibleItemCount) || 0,
      maxOfferQuantityPerOrder: Number(autoOfferMatch.maxOfferQuantityPerOrder) || null,
      message: Number(autoOfferMatch.maxOfferQuantityPerOrder) > 0
        ? `Only ${Number(autoOfferMatch.maxOfferQuantityPerOrder)} item${Number(autoOfferMatch.maxOfferQuantityPerOrder) > 1 ? 's are' : ' is'} allowed for this offer in one order.`
        : 'This restaurant offer is no longer applicable.',
    };
  }
  discount = Math.max(0, Math.min(subtotal, couponDiscount + autoOfferDiscount));
  
  // Calculate discount breakdown for reporting
  let couponByAdmin = 0;
  let couponByRestaurant = 0;
  let offerByRestaurant = autoOfferDiscount;

  if (appliedCoupon) {
    if (appliedCoupon.fundedBy === 'restaurant') {
      couponByRestaurant = couponDiscount;
    } else {
      couponByAdmin = couponDiscount;
    }
  }
  
  const total = Math.max(
    0,
    subtotal + packagingFee + deliveryFee + platformFee + tax - discount,
  );
  const debtSummary = await getUnpaidDebtSummary(userId);
  const totalPayable = total + debtSummary.totalDue;
  return {
    pricing: {
      subtotal,
      tax,
      packagingFee,
      deliveryFee,
      platformFee,
      couponDiscount,
      autoOfferDiscount,
      discount,
      couponByAdmin,
      couponByRestaurant,
      offerByRestaurant,
      previousDue: debtSummary.totalDue,
      totalPayable,
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
      autoAppliedOffer,
      autoOfferFeedback,
    },
    dues: {
      count: debtSummary.count,
      amount: debtSummary.totalDue,
    },
  };
}

const normalizeAdminScope = (adminScope = {}) => {
  const adminType = String(adminScope?.adminType || "SUPER_ADMIN").toUpperCase();
  const zoneIds = Array.isArray(adminScope?.zoneIds)
    ? adminScope.zoneIds
      .map((id) => String(id || "").trim())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id))
    : [];
  return {
    adminType,
    isSubAdmin: adminType === "SUB_ADMIN",
    isSuperAdmin: adminType === "SUPER_ADMIN",
    zoneIds,
  };
};

// ----- Create order -----
export async function createOrder(userId, dto) {
  const orderType = dto.orderType === "quick" ? "quick" : "food";
  let restaurant = null;
  if (orderType === "food") {
    restaurant = await FoodRestaurant.findById(dto.restaurantId)
      .select("status restaurantName zoneId location")
      .lean();
    if (!restaurant) throw new ValidationError("Restaurant not found");
    if (restaurant.status !== "approved")
      throw new ValidationError("Restaurant not accepting orders");
  }

  const orderId = await ensureUniqueOrderId();
  const settings = orderType === "food" ? await getDispatchSettings() : null;
  const dispatchMode = settings?.dispatchMode || "manual";

  const deliveryAddress = buildDeliveryAddressSnapshot(dto.address);

  const paymentMethod =
    dto.paymentMethod === "card" ? "razorpay" : dto.paymentMethod;
  const isCash = paymentMethod === "cash";
  const isWallet = paymentMethod === "wallet";

  // Ensure pricing is present and consistent.
  const computedSubtotal = (dto.items || []).reduce((sum, item) => {
    const price = Number(item?.price);
    const qty = Number(item?.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(qty)) return sum;
    return sum + Math.max(0, price) * Math.max(0, qty);
  }, 0);
  const normalizedPricing = {
    subtotal: Number(dto.pricing?.subtotal ?? computedSubtotal),
    tax: Number(dto.pricing?.tax ?? 0),
    packagingFee: Number(dto.pricing?.packagingFee ?? 0),
    deliveryFee: Number(dto.pricing?.deliveryFee ?? 0),
    platformFee: Number(dto.pricing?.platformFee ?? 0),
    discount: Number(dto.pricing?.discount ?? 0),
    couponByAdmin: Number(dto.pricing?.couponByAdmin ?? 0),
    couponByRestaurant: Number(dto.pricing?.couponByRestaurant ?? 0),
    offerByRestaurant: Number(dto.pricing?.offerByRestaurant ?? 0),
    previousDue: 0,
    totalPayable: 0,
    total: Number(dto.pricing?.total ?? 0),
    currency: String(dto.pricing?.currency || "INR"),
  };
  const computedTotal = Math.max(
    0,
    (Number.isFinite(normalizedPricing.subtotal)
      ? normalizedPricing.subtotal
      : 0) +
      (Number.isFinite(normalizedPricing.tax) ? normalizedPricing.tax : 0) +
      (Number.isFinite(normalizedPricing.packagingFee)
        ? normalizedPricing.packagingFee
        : 0) +
      (Number.isFinite(normalizedPricing.deliveryFee)
        ? normalizedPricing.deliveryFee
        : 0) +
      (Number.isFinite(normalizedPricing.platformFee)
        ? normalizedPricing.platformFee
        : 0) -
      (Number.isFinite(normalizedPricing.discount)
        ? normalizedPricing.discount
        : 0),
  );
  if (
    !Number.isFinite(normalizedPricing.total) ||
    normalizedPricing.total <= 0
  ) {
    normalizedPricing.total = computedTotal;
  }

  const debtSummary = await getUnpaidDebtSummary(userId);
  normalizedPricing.previousDue = debtSummary.totalDue;
  normalizedPricing.totalPayable = Math.max(
    0,
    Number(normalizedPricing.total || 0) + Number(debtSummary.totalDue || 0),
  );

  const payment = {
    method: paymentMethod,
    status: isCash ? "cod_pending" : isWallet ? "paid" : "created",
    amountDue: normalizedPricing.totalPayable ?? normalizedPricing.total ?? 0,
    razorpay: {},
    qr: {},
  };

  let distanceKm = null;
  if (
    orderType === "food" &&
    restaurant?.location?.coordinates?.length === 2 &&
    dto.address?.location?.coordinates?.length === 2
  ) {
    const [rLng, rLat] = restaurant.location.coordinates;
    const [dLng, dLat] = dto.address.location.coordinates;
    const d = haversineKm(rLat, rLng, dLat, dLng);
    distanceKm = Number.isFinite(d) ? d : null;
  } else {
    console.warn(
      `Food order ${orderId}: distance not available, rider earning set to 0`,
    );
  }

  const riderEarning =
    orderType === "food" ? await getRiderEarning(distanceKm) : 0;
  
  // Calculate restaurant commission from subtotal
  const { commissionAmount: restaurantCommission } =
    orderType === "food"
      ? await foodTransactionService.getRestaurantCommissionSnapshot({
          pricing: normalizedPricing,
          restaurantId: dto.restaurantId,
        })
      : { commissionAmount: 0 };

  normalizedPricing.restaurantCommission = restaurantCommission || 0;

  const platformProfit = Math.max(
    0,
    (Number.isFinite(normalizedPricing.deliveryFee) ? normalizedPricing.deliveryFee : 0) +
      (Number.isFinite(normalizedPricing.platformFee) ? normalizedPricing.platformFee : 0) +
      restaurantCommission -
      riderEarning,
  );

  const order = new FoodOrder({
    orderType,
    orderId,
    userId: new mongoose.Types.ObjectId(userId),
    restaurantId:
      orderType === "food" ? new mongoose.Types.ObjectId(dto.restaurantId) : null,
    zoneId:
      orderType === "food"
        ? dto.zoneId
          ? new mongoose.Types.ObjectId(dto.zoneId)
          : restaurant.zoneId
        : undefined,
    items: dto.items,
    ...(deliveryAddress ? { deliveryAddress } : {}),
    pricing: normalizedPricing,
    payment,
    orderStatus: "created",
    ...(orderType === "food"
      ? { dispatch: { modeAtCreation: dispatchMode, status: "unassigned" } }
      : {}),
    statusHistory: [
      {
        at: new Date(),
        byRole: "SYSTEM",
        from: "",
        to: "created",
        note: "Order placed",
      },
    ],
    note: dto.note || "",
    restaurantNote: dto.restaurantNote || "",
    sendCutlery: dto.sendCutlery !== false,
    deliveryFleet: orderType === "food" ? dto.deliveryFleet || "standard" : "quick",
    scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
    riderEarning,
    platformProfit,
  });

  let razorpayPayload = null;

  if (paymentMethod === "razorpay" && isRazorpayConfigured()) {
    const amountPaise = Math.round((payment.amountDue ?? 0) * 100);
    if (amountPaise < 100)
      throw new ValidationError("Amount too low for online payment");
    try {
      const rzOrder = await createRazorpayOrder(amountPaise, "INR", orderId);
      order.payment.razorpay = {
        orderId: rzOrder.id,
        paymentId: "",
        signature: "",
      };
      order.payment.status = "created";
      razorpayPayload = {
        key: getRazorpayKeyId(),
        orderId: rzOrder.id,
        amount: rzOrder.amount,
        currency: rzOrder.currency || "INR",
      };
    } catch (err) {
      throw new ValidationError(err?.message || "Payment gateway error");
    }
  }

  await order.save();

  await foodTransactionService.createInitialTransaction(order);

  if (paymentMethod === "razorpay" && order.payment?.razorpay?.orderId) {
    // Audit can still happen here or via FinanceService events
  }

  // Realtime + push notifications.
  try {
    // Notify customer. For online payments, order is created but awaits payment confirmation.
    const isAwaitingOnlinePayment =
      String(order.payment?.method || "").toLowerCase() === "razorpay" &&
      String(order.payment?.status || "").toLowerCase() !== "paid";
    await notifyOwnersSafely([{ ownerType: "USER", ownerId: userId }], {
      title: isAwaitingOnlinePayment
        ? "Complete Payment to Confirm Order"
        : orderType === "quick"
          ? "Quick Order Confirmed!"
          : "Order Confirmed!",
      body: isAwaitingOnlinePayment
        ? orderType === "quick"
          ? `Order #${orderId} is created. Please complete payment to confirm your quick order.`
          : `Order #${orderId} is created. Please complete payment to send it to ${restaurant.restaurantName || "the restaurant"}.`
        : orderType === "quick"
          ? `Your quick order #${orderId} has been placed successfully.`
          : `Your order #${orderId} from ${restaurant.restaurantName || "the restaurant"} has been placed successfully.`,
      image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
      data: {
        type: isAwaitingOnlinePayment
          ? "order_created_pending_payment"
          : "order_created",
        orderId: String(orderId),
        orderMongoId: order._id?.toString?.() || "",
        link: `/food/user/orders/${order._id?.toString?.() || ""}`,
      },
    });

    // Restaurant gets new-order request only when payment flow is eligible.
    if (orderType === "food") {
      await notifyRestaurantNewOrder(order);
    }
  } catch {
    // Don't block order placement on socket failures.
  }
  const couponCode = dto.pricing?.couponCode
    ? String(dto.pricing.couponCode).trim().toUpperCase()
    : "";
  if (orderType === "food" && couponCode) {
    const offer = await FoodOffer.findOne({ couponCode }).lean();
    if (offer) {
      await FoodOffer.updateOne({ _id: offer._id }, { $inc: { usedCount: 1 } });
      // Store coupon offer ID on order for reversal on cancellation
      await FoodOrder.updateOne({ _id: order._id }, { $set: { appliedCouponOfferId: offer._id } });
      if (userId) {
        await FoodOfferUsage.updateOne(
          { offerId: offer._id, userId: new mongoose.Types.ObjectId(userId) },
          { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
          { upsert: true },
        );
      }
    }
  }

  const restaurantAutoOfferId = dto.pricing?.autoAppliedOffer?.offerId
    ? String(dto.pricing.autoAppliedOffer.offerId).trim()
    : "";
  if (
    orderType === "food" &&
    restaurantAutoOfferId &&
    mongoose.Types.ObjectId.isValid(restaurantAutoOfferId)
  ) {
    await RestaurantOffer.updateOne(
      { _id: new mongoose.Types.ObjectId(restaurantAutoOfferId) },
      { $inc: { usedCount: 1 } },
    );
    // Store restaurant offer ID on order for reversal on cancellation
    await FoodOrder.updateOne({ _id: order._id }, { $set: { appliedRestaurantOfferId: new mongoose.Types.ObjectId(restaurantAutoOfferId) } });
    if (userId) {
      await RestaurantOfferUsage.updateOne(
        {
          offerId: new mongoose.Types.ObjectId(restaurantAutoOfferId),
          userId: new mongoose.Types.ObjectId(userId),
        },
        { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
        { upsert: true },
      );
    }
  }

  const saved = order.toObject();
  return { order: saved, razorpay: razorpayPayload };
}

// ----- Verify payment -----
export async function verifyPayment(userId, dto) {
  const identity = buildOrderIdentityFilter(dto.orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");
  if (order.payment.status === "paid")
    return { order: order.toObject(), payment: order.payment };

  const valid = verifyPaymentSignature(
    dto.razorpayOrderId,
    dto.razorpayPaymentId,
    dto.razorpaySignature,
  );
  if (!valid) throw new ValidationError("Payment verification failed");

  order.payment.status = "paid";
  order.payment.razorpay.paymentId = dto.razorpayPaymentId;
  order.payment.razorpay.signature = dto.razorpaySignature;
  pushStatusHistory(order, {
    byRole: "USER",
    byId: userId,
    from: order.orderStatus,
    to: "created",
    note: "Payment verified",
  });
  await order.save();

  try {
    await settleUnpaidDebtsForOrder(userId, order._id);
  } catch (debtErr) {
    logger.warn(
      `verifyPayment debt settlement failed for order ${order._id}: ${debtErr?.message || debtErr}`,
    );
  }

  await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
    status: 'captured',
    razorpayPaymentId: dto.razorpayPaymentId,
    razorpaySignature: dto.razorpaySignature,
    recordedByRole: "USER",
    recordedById: new mongoose.Types.ObjectId(userId)
  });

  // After online payment is verified, now notify restaurant about the new order.
  if (order.orderType === "food") {
    await notifyRestaurantNewOrder(order);
  }

  // Notify Customer about payment success
  await notifyOwnersSafely([{ ownerType: "USER", ownerId: userId }], {
    title: "Payment Successful! ✅",
    body: `We have received your payment of ₹${order.payment.amountDue} for Order #${order.orderId}.`,
    image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
    data: {
      type: "payment_success",
      orderId: String(order.orderId),
      orderMongoId: String(order._id),
    },
  });

  return { order: order.toObject(), payment: order.payment };
}

// ----- Auto-assign -----
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Start or continue a smart cascading dispatch.
 * @param {string} orderId - Mongo ID of the order.
 * @param {object} options - Options (retry count, etc)
 */
export async function tryAutoAssign(orderId, options = {}) {
    const order = await FoodOrder.findById(orderId).populate(['restaurantId', 'userId']);
    if (!order) return null;

    // Guard: only dispatch if unassigned OR if we are doing a timeout-reassign.
    const isUnassigned = order.dispatch?.status === 'unassigned';
    const isAssignedButUnaccepted = order.dispatch?.status === 'assigned' && !order.dispatch?.acceptedAt;
    
    if (!isUnassigned && !isAssignedButUnaccepted) {
        return order;
    }

    // Find ineligible partners (who already rejected it or were already offered if we want fresh ones)
    const offeredIds = (order.dispatch?.offeredTo || []).map(o => o.partnerId.toString());
    
    // Find nearby online partners
    const { partners } = await listNearbyOnlineDeliveryPartners(order.restaurantId, { maxKm: 15, limit: 10 });
    
    // Filter out already offered/rejected partners
    const eligible = partners.filter(p => !offeredIds.includes(p.partnerId.toString()));

    if (eligible.length === 0) {
        // No more specific partners to offer to? 
        // If it's still unassigned, we leave it in the marketplace pool (broadcast was already sent)
        // or we could expand the search radius.
        logger.info(`SmartDispatch: No more eligible partners for order ${order.orderId}. Leaving in marketplace.`);
        return order;
    }

    // Pick the best (first in sorted list)
    const best = eligible[0];
    
    // Assign to this partner
    order.dispatch.status = 'assigned';
    order.dispatch.deliveryPartnerId = best.partnerId;
    order.dispatch.assignedAt = new Date();
    
    // Record in history
    order.dispatch.offeredTo.push({
        partnerId: best.partnerId,
        at: new Date(),
        action: 'offered'
    });

    await order.save();

    // 🚀 Notify the specific partner instantly
    try {
        const io = getIO();
        if (io) {
            const restaurant = order.restaurantId;
            const payload = buildDeliverySocketPayload(order, restaurant);
            io.to(rooms.delivery(best.partnerId)).emit('new_order', payload);
            io.to(rooms.delivery(best.partnerId)).emit('play_notification_sound', {
                orderId: payload.orderId,
                orderMongoId: payload.orderMongoId
            });
        }
        await notifyOwnerSafely(
            { ownerType: 'DELIVERY_PARTNER', ownerId: best.partnerId },
            {
                title: 'New order assigned! 🛵',
                body: `You have 60 seconds to accept Order #${order.orderId}.`,
                data: {
                    type: 'new_order',
                    orderId: order.orderId,
                    orderMongoId: order._id.toString(),
                    link: '/delivery'
                }
            }
        );
    } catch (err) {
        logger.error(`SmartDispatch: Failed to notify partner ${best.partnerId}: ${err.message}`);
    }

    // ⏱️ Schedule a timeout check in 60 seconds
    await addOrderJob({
        action: 'DISPATCH_TIMEOUT_CHECK',
        orderMongoId: order._id.toString(),
        orderId: order.orderId,
        partnerId: best.partnerId.toString()
    }, { delay: 60000 }); // 60 seconds

    return order;
}

/**
 * Triggered by worker after 60 seconds of zero response.
 */
export async function processDispatchTimeout(orderId, partnerId) {
    const order = await FoodOrder.findById(orderId);
    if (!order) return;

    // Check if the order is still assigned to this specific partner and not accepted
    const stillAssigned = order.dispatch?.status === 'assigned' && 
                          String(order.dispatch?.deliveryPartnerId) === String(partnerId) &&
                          !order.dispatch?.acceptedAt;

    if (stillAssigned) {
        logger.info(`SmartDispatch: Timeout for order ${order.orderId} (Partner: ${partnerId}). Moving to next.`);
        
        // Mark as timeout in history
        const offer = order.dispatch.offeredTo.find(o => String(o.partnerId) === String(partnerId) && o.action === 'offered');
        if (offer) offer.action = 'timeout';

        // Unassign and trigger next step
        pushStatusHistory(order, {
          byRole: 'SYSTEM',
          from: 'assigned',
          to: 'unassigned',
          note: 'Timed out without response',
        });
        order.dispatch.status = 'unassigned';
        order.dispatch.deliveryPartnerId = null;
        await order.save();

        // 🔄 Recursively try next partner
        await tryAutoAssign(orderId);
    }
}

// ----- User: list, get, cancel -----
export async function listOrdersUser(userId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = { userId: new mongoose.Types.ObjectId(userId) };
  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate(
        "restaurantId",
        "restaurantName profileImage area city location rating totalRatings",
      )
      .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  const noResponseMap = await buildNoResponseMetaMap(docs.map((d) => d?._id));
  return buildPaginatedResult({
    docs: docs.map((doc) =>
      normalizeOrderForClient(withNoResponseMeta(doc, noResponseMap)),
    ),
    total,
    page,
    limit,
  });
}

export async function getOrderById(
  orderId,
  { userId, restaurantId, deliveryPartnerId, admin, adminScope } = {},
) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");
  const order = await FoodOrder.findOne(identity)
    .populate(
      "restaurantId",
      "restaurantName profileImage area city location rating totalRatings",
    )
    .populate("dispatch.deliveryPartnerId", "name phone rating totalRatings")
    .populate("userId", "name phone email")
    .select("+deliveryOtp")
    .lean();
  if (!order) throw new NotFoundError("Order not found");

  if (admin) {
    const scope = normalizeAdminScope(adminScope || {});
    if (scope.isSubAdmin) {
      const orderZoneId = order?.zoneId ? String(order.zoneId) : "";
      const hasZoneAccess = scope.zoneIds.some((zid) => String(zid) === orderZoneId);
      if (!hasZoneAccess) throw new ForbiddenError("Sub-admin can only access assigned zones");
    }
    const noResponseMap = await buildNoResponseMetaMap([order?._id]);
    return normalizeOrderForClient(withNoResponseMeta(order, noResponseMap));
  }

  const orderUserId = order.userId?._id?.toString() || order.userId?.toString();
  const orderRestaurantId = order.restaurantId?._id?.toString() || order.restaurantId?.toString();
  const orderPartnerId = order.dispatch?.deliveryPartnerId?._id?.toString() || order.dispatch?.deliveryPartnerId?.toString();

  if (userId && orderUserId !== userId.toString())
    throw new ForbiddenError("Not your order");
  if (restaurantId && orderRestaurantId !== restaurantId.toString())
    throw new ForbiddenError("Not your restaurant order");
  if (deliveryPartnerId && orderPartnerId !== deliveryPartnerId.toString())
    throw new ForbiddenError("Not assigned to you");

  if (deliveryPartnerId) {
    const noResponseMap = await buildNoResponseMetaMap([order?._id]);
    return sanitizeOrderForExternal(withNoResponseMeta(order, noResponseMap));
  }
  if (restaurantId) {
    const noResponseMap = await buildNoResponseMetaMap([order?._id]);
    return sanitizeOrderForExternal(
      withNoResponseMeta(sanitizeDispatchForClient(order), noResponseMap),
    );
  }

  if (userId) {
    const drop = order.deliveryVerification?.dropOtp || {};
    const secret = String(order.deliveryOtp || "").trim();
    const noResponseMap = await buildNoResponseMetaMap([order?._id]);
    const out = normalizeOrderForClient(withNoResponseMeta(order, noResponseMap));
    delete out.deliveryOtp;
    out.deliveryVerification = {
      ...(order.deliveryVerification || {}),
      dropOtp: {
        required: Boolean(drop.required),
        verified: Boolean(drop.verified),
      },
    };
    if (drop.required && !drop.verified && secret) {
      out.handoverOtp = secret;
    }
    return out;
  }

  const noResponseMap = await buildNoResponseMetaMap([order?._id]);
  return sanitizeOrderForExternal(withNoResponseMeta(order, noResponseMap));
}

export async function cancelOrder(orderId, userId, reason) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const allowed = ["created"];
  if (!allowed.includes(order.orderStatus))
    throw new ValidationError("Order cannot be cancelled");

  const from = order.orderStatus;
  order.orderStatus = "cancelled_by_user";
  pushStatusHistory(order, {
    byRole: "USER",
    byId: userId,
    from,
    to: "cancelled_by_user",
    note: reason || "",
  });

  // ✅ NEW: Automated Razorpay Refund on User Cancel
  if (
    order.payment.status === "paid" &&
    order.payment.method === "razorpay" &&
    order.payment.razorpay?.paymentId &&
    (!order.payment.refund || order.payment.refund.status !== "processed")
  ) {
    try {
      const refundResult = await initiateRazorpayRefund(
        order.payment.razorpay.paymentId,
        order.pricing.total
      );

      if (refundResult.success) {
        order.payment.status = "refunded";
        order.payment.refund = {
          status: "processed",
          amount: order.pricing.total,
          refundId: refundResult.refundId,
          processedAt: new Date()
        };
      } else {
        // Log failure but let order cancellation proceed
        order.payment.refund = {
          status: "failed",
          amount: order.pricing.total
        };
      }
    } catch (err) {
      console.error(`Refund processing error for Order ${orderId}:`, err);
      order.payment.refund = { status: "failed", amount: order.pricing.total };
    }
  }

  await order.save();

  // Reverse offer usage counts on cancellation
  try {
    const cancelledOrder = order.toObject ? order.toObject() : order;
    const cancelUserId = cancelledOrder.userId ? String(cancelledOrder.userId) : null;

    if (cancelledOrder.appliedRestaurantOfferId) {
      await RestaurantOffer.updateOne(
        { _id: cancelledOrder.appliedRestaurantOfferId },
        { $inc: { usedCount: -1 } }
      );
      if (cancelUserId && mongoose.Types.ObjectId.isValid(cancelUserId)) {
        await RestaurantOfferUsage.updateOne(
          { offerId: cancelledOrder.appliedRestaurantOfferId, userId: new mongoose.Types.ObjectId(cancelUserId) },
          { $inc: { count: -1 } }
        );
      }
    }

    if (cancelledOrder.appliedCouponOfferId) {
      await FoodOffer.updateOne(
        { _id: cancelledOrder.appliedCouponOfferId },
        { $inc: { usedCount: -1 } }
      );
      if (cancelUserId && mongoose.Types.ObjectId.isValid(cancelUserId)) {
        await FoodOfferUsage.updateOne(
          { offerId: cancelledOrder.appliedCouponOfferId, userId: new mongoose.Types.ObjectId(cancelUserId) },
          { $inc: { count: -1 } }
        );
      }
    }
  } catch (offerReverseErr) {
    logger.warn(`cancelOrder offer usage reversal failed: ${offerReverseErr?.message || offerReverseErr}`);
  }

  enqueueOrderEvent("order_cancelled_by_user", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    userId,
    reason: reason || "",
  });

  // Sync transaction status
  try {
    const isOnlinePaid = order.payment.method === "razorpay" && (order.payment.status === "paid" || order.payment.status === "refunded");
    await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_user', {
        status: isOnlinePaid ? 'refunded' : 'failed',
        note: `Order cancelled by user: ${reason || "No reason"}`,
        recordedByRole: 'USER',
        recordedById: userId
    });
  } catch (err) {
    logger.warn(`cancelOrder transaction sync failed: ${err?.message || err}`);
  }

  // Notify User and Restaurant about the cancellation
  const isOnlinePaid = order.payment.method === "razorpay" && (order.payment.status === "paid" || order.payment.status === "refunded");
  const refundDetail = isOnlinePaid ? ` Your refund of ₹${order.pricing.total} is being processed and will be credited to your original payment method within 5-7 working days.` : "";
  
  await notifyOwnersSafely(
    [
      { ownerType: "USER", ownerId: userId },
      { ownerType: "RESTAURANT", ownerId: order.restaurantId },
    ],
    {
      title: "Order Cancelled ❌",
      body: `Order #${order.orderId} has been cancelled successfully.${refundDetail}`,
      image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
      data: {
        type: "order_cancelled",
        orderId: String(order.orderId),
        orderMongoId: String(order._id),
      },
    },
  );

  // Real-time: status update via socket
  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        message: `Order #${order.orderId} has been cancelled successfully.${refundDetail}`
      };
      io.to(rooms.user(userId)).emit("order_status_update", payload);
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", payload);
      io.to(rooms.admin()).emit("order_status_update", payload);
    }
  } catch (err) {
    logger.warn(`cancelOrder socket emit failed: ${err?.message || err}`);
  }

  return order.toObject();
}

export async function updateOrderInstructions(orderId, userId, instructions) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const normalizedInstructions = String(instructions ?? "").trim();
  if (normalizedInstructions.length > 500) {
    throw new ValidationError("Instructions cannot exceed 500 characters");
  }

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");

  const blockedStatuses = new Set([
    "delivered",
    "cancelled_by_user",
    "cancelled_by_restaurant",
    "cancelled_by_user_unavailable",
    "cancelled_by_admin",
  ]);
  if (blockedStatuses.has(String(order.orderStatus || "").toLowerCase())) {
    throw new ValidationError("Cannot update instructions for this order");
  }

  order.note = normalizedInstructions;
  await order.save();

  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        note: order.note || "",
      };
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", payload);
      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("order_status_update", payload);
      }
      io.to(rooms.admin()).emit("order_status_update", payload);
    }
  } catch (err) {
    logger.warn(`updateOrderInstructions socket emit failed: ${err?.message || err}`);
  }

  return order.toObject();
}

export async function submitOrderRatings(orderId, userId, dto) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    userId: new mongoose.Types.ObjectId(userId),
  });
  if (!order) throw new NotFoundError("Order not found");
  if (String(order.orderStatus) !== "delivered") {
    throw new ValidationError("You can rate only delivered orders");
  }

  const hasDeliveryPartner = !!order.dispatch?.deliveryPartnerId;
  if (hasDeliveryPartner && !dto.deliveryPartnerRating) {
    throw new ValidationError("Delivery partner rating is required");
  }

  const restaurantAlreadyRated = Number.isFinite(
    Number(order?.ratings?.restaurant?.rating),
  );
  const deliveryAlreadyRated = Number.isFinite(
    Number(order?.ratings?.deliveryPartner?.rating),
  );
  if (restaurantAlreadyRated || (hasDeliveryPartner && deliveryAlreadyRated)) {
    throw new ValidationError("Ratings already submitted for this order");
  }

  const now = new Date();
  order.ratings = order.ratings || {};
  order.ratings.restaurant = {
    rating: dto.restaurantRating,
    comment: dto.restaurantComment || "",
    ratedAt: now,
  };

  if (hasDeliveryPartner) {
    order.ratings.deliveryPartner = {
      rating: dto.deliveryPartnerRating,
      comment: dto.deliveryPartnerComment || "",
      ratedAt: now,
    };
  }

  await Promise.all([
    applyAggregateRating(
      FoodRestaurant,
      order.restaurantId,
      dto.restaurantRating,
    ),
    hasDeliveryPartner
      ? applyAggregateRating(
          FoodDeliveryPartner,
          order.dispatch.deliveryPartnerId,
          dto.deliveryPartnerRating,
        )
      : Promise.resolve(),
  ]);

    await order.save();
    enqueueOrderEvent('order_ratings_submitted', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        userId,
        restaurantRating: dto.restaurantRating,
        deliveryPartnerRating: hasDeliveryPartner ? dto.deliveryPartnerRating : null
    });
}

// ----- Restaurant -----
export async function listOrdersRestaurant(restaurantId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
    $or: [
      { "payment.method": { $in: ["cash", "wallet"] } },
      { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
      // Include cancelled orders regardless of payment status
      { orderStatus: { $in: ["cancelled_by_user", "cancelled_by_restaurant", "cancelled_by_user_unavailable", "cancelled_by_admin"] } },
    ],
  };
  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate("userId", "name phone email profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  const noResponseMap = await buildNoResponseMetaMap(docs.map((d) => d?._id));
  const docsWithMeta = docs.map((doc) => withNoResponseMeta(doc, noResponseMap));
  return buildPaginatedResult({ docs: docsWithMeta, total, page, limit });
}

export async function updateOrderStatusRestaurant(
  orderId,
  restaurantId,
  orderStatus,
) {
  let order = await FoodOrder.findOne({
    _id: new mongoose.Types.ObjectId(orderId),
    restaurantId: new mongoose.Types.ObjectId(restaurantId),
  });
  if (!order) throw new NotFoundError("Order not found");
  const from = order.orderStatus;
  order.orderStatus = orderStatus;
  pushStatusHistory(order, {
    byRole: "RESTAURANT",
    byId: restaurantId,
    from,
    to: orderStatus,
  });
  await order.save();

  // Reverse offer usage counts when restaurant cancels
  if (String(orderStatus).includes("cancel")) {
    try {
      const cancelledOrder = order.toObject ? order.toObject() : order;
      const cancelUserId = cancelledOrder.userId ? String(cancelledOrder.userId) : null;

      if (cancelledOrder.appliedRestaurantOfferId) {
        await RestaurantOffer.updateOne(
          { _id: cancelledOrder.appliedRestaurantOfferId },
          { $inc: { usedCount: -1 } }
        );
        if (cancelUserId && mongoose.Types.ObjectId.isValid(cancelUserId)) {
          await RestaurantOfferUsage.updateOne(
            { offerId: cancelledOrder.appliedRestaurantOfferId, userId: new mongoose.Types.ObjectId(cancelUserId) },
            { $inc: { count: -1 } }
          );
        }
      }

      if (cancelledOrder.appliedCouponOfferId) {
        await FoodOffer.updateOne(
          { _id: cancelledOrder.appliedCouponOfferId },
          { $inc: { usedCount: -1 } }
        );
        if (cancelUserId && mongoose.Types.ObjectId.isValid(cancelUserId)) {
          await FoodOfferUsage.updateOne(
            { offerId: cancelledOrder.appliedCouponOfferId, userId: new mongoose.Types.ObjectId(cancelUserId) },
            { $inc: { count: -1 } }
          );
        }
      }
    } catch (offerReverseErr) {
      logger.warn(`updateOrderStatusRestaurant offer usage reversal failed: ${offerReverseErr?.message || offerReverseErr}`);
    }
  }

    let title = `Order ${order.orderId} updated`;
    let body = `Status changed to ${String(orderStatus).replace(/_/g, " ")}`;

    // Custom messages for customer based on status
    if (orderStatus === "confirmed") {
      title = "Order Accepted! 🧑‍🍳";
      body =
        "The restaurant has accepted your order and is starting to prepare it.";
    } else if (orderStatus === "preparing") {
      title = "Food is being prepared! 🍳";
      body = "Your food is currently being prepared by the restaurant.";
    } else if (orderStatus === "ready_for_pickup" || orderStatus === "ready") {
      title = "Food is ready! 🛍️";
      body = "Your order is ready and waiting to be picked up.";
    } else if (String(orderStatus).includes("cancel")) {
      const isOnlinePaid = order.payment.method === "razorpay" && (order.payment.status === "paid" || order.payment.status === "refunded");
      const refundDetail = isOnlinePaid ? ` Your refund of ₹${order.pricing.total} is being processed and will be credited to your original payment method within 5-7 working days.` : "";
      
      title = "Order Cancelled ❌";
      body = `Unfortunately, your order has been cancelled by the restaurant.${refundDetail}`;
    }

    // Real-time: status update to restaurant room.
    try {
      const io = getIO();
      if (io) {
        console.log(
          `[DEBUG] Emitting status update to restaurant ${restaurantId} and user ${order.userId}: ${orderStatus}`,
        );
        const payload = {
          orderMongoId: order._id?.toString?.(),
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          title: title,
          message: body,
        };
        io.to(rooms.restaurant(restaurantId)).emit(
          "order_status_update",
          payload,
        );
        io.to(rooms.user(order.userId)).emit("order_status_update", payload);
        io.to(rooms.admin()).emit("order_status_update", payload);
      }

    const notifyList = [
      { ownerType: "USER", ownerId: order.userId },
      { ownerType: "RESTAURANT", ownerId: restaurantId },
    ];

    const assignedRiderId = order.dispatch?.deliveryPartnerId;
    if (assignedRiderId) {
      notifyList.push({ ownerType: "DELIVERY_PARTNER", ownerId: assignedRiderId });
    }

    let riderTitle = `Order #${order.orderId} updated`;
    let riderBody = `The order status is now ${String(orderStatus).replace(/_/g, " ")}.`;

    if (String(orderStatus).includes("cancel")) {
      riderTitle = "Order Cancelled ❌";
      riderBody = `Order #${order.orderId} has been cancelled. Please stop your current task.`;
      
      // Sync transaction status
      try {
        const isOnlinePaid = order.payment.method === "razorpay" && (order.payment.status === "paid" || order.payment.status === "refunded");
        await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_restaurant', {
            status: isOnlinePaid ? 'refunded' : 'failed',
            note: `Order cancelled by restaurant/admin`,
            recordedByRole: 'RESTAURANT',
            recordedById: restaurantId
        });
      } catch (err) {
        logger.warn(`updateOrderStatusRestaurant transaction sync failed: ${err?.message || err}`);
      }
    }

    await notifyOwnersSafely(
      notifyList,
      {
        title: title,
        body: body,
        image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
        data: {
          type: "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: String(orderStatus || ""),
          link: `/food/user/orders/${order._id?.toString?.() || ""}`,
        },
      },
    );
  } catch (err) {
    console.error("[DEBUG] Error emitting status update to restaurant:", err);
  }

  // Real-time: admin assignment notifications + ready notifications for assigned rider only.
  try {
    const io = getIO();
    if (io) {
      if (String(orderStatus) === 'ready_for_pickup' && String(from) !== 'ready_for_pickup') {
        if (order.dispatch?.status === 'assigned' && order.dispatch?.deliveryPartnerId) {
          const assignedId = order.dispatch.deliveryPartnerId?.toString?.() || order.dispatch.deliveryPartnerId;
          const restaurant = await FoodRestaurant.findById(order.restaurantId)
            .select('restaurantName location addressLine1 area city state')
            .lean();
          const payload = buildDeliverySocketPayload(order, restaurant);
          io.to(rooms.delivery(assignedId)).emit('order_ready', payload);
        } else {
          await notifyAdminsOrderReadyForAssignment(order);
        }
      }
    }
  } catch (err) {
    console.error('[DEBUG] Error in delivery notification logic:', err);
  }

    enqueueOrderEvent('restaurant_order_status_updated', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        restaurantId,
        from,
        to: orderStatus
    });

    // ✅ NEW: Automated Razorpay Refund on Restaurant Cancel
    // Triggers if the restaurant sets status to a cancelled state (e.g., cancelled_by_restaurant)
    if (
      String(orderStatus).includes("cancel") &&
      order.payment.status === "paid" &&
      order.payment.method === "razorpay" &&
      order.payment.razorpay?.paymentId &&
      (!order.payment.refund || order.payment.refund.status !== "processed")
    ) {
      try {
        const refundResult = await initiateRazorpayRefund(
          order.payment.razorpay.paymentId,
          order.pricing.total
        );

        if (refundResult.success) {
          order.payment.status = "refunded";
          order.payment.refund = {
            status: "processed",
            amount: order.pricing.total,
            refundId: refundResult.refundId,
            processedAt: new Date()
          };
        } else {
          // Record failure so admin knows a manual refund might be needed
          order.payment.refund = {
            status: "failed",
            amount: order.pricing.total
          };
        }
      } catch (err) {
        console.error(`Automated refund failed for Order ${orderId} (Restaurant Cancel):`, err);
        order.payment.refund = { status: "failed", amount: order.pricing.total };
      }
      // Re-save order with updated payment status
      await order.save();
    }

    return order.toObject();
}

/**
 * Manually re-trigger delivery partner search for a restaurant order.
 * Only allowed if status is preparing/ready and no partner has accepted yet.
 */
export async function resendDeliveryNotificationRestaurant(orderId, restaurantId) {
    const order = await FoodOrder.findOne({
        _id: new mongoose.Types.ObjectId(orderId),
        restaurantId: new mongoose.Types.ObjectId(restaurantId)
    });

    if (!order) throw new NotFoundError('Order not found');

    const activeStatuses = ['preparing', 'ready_for_pickup', 'ready', 'confirmed'];
    if (!activeStatuses.includes(order.orderStatus)) {
        throw new ValidationError(`Cannot resend notification for order in status: ${order.orderStatus}`);
    }

    if (order.dispatch?.status === 'accepted') {
        throw new ValidationError('A delivery partner has already accepted this order.');
    }

    await notifyAdminsOrderReadyForAssignment(order);
    return { notifiedCount: 1 };
}

export async function updateOrderStatusAdmin(
  orderId,
  adminId,
  orderStatus,
  reason = "",
  adminScope = {},
) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const normalizedStatus = String(orderStatus || "").trim().toLowerCase();
  const allowedStatuses = new Set([
    "confirmed",
    "preparing",
    "ready_for_pickup",
    "picked_up",
    "delivered",
    "cancelled_by_admin",
  ]);
  if (!allowedStatuses.has(normalizedStatus)) {
    throw new ValidationError("Invalid order status for admin update");
  }

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");

  const scope = normalizeAdminScope(adminScope || {});
  if (scope.isSubAdmin) {
    const orderZoneId = order?.zoneId ? String(order.zoneId) : "";
    const hasZoneAccess = scope.zoneIds.some((zid) => String(zid) === orderZoneId);
    if (!hasZoneAccess) throw new ForbiddenError("Sub-admin can only access assigned zones");
  }

  const from = String(order.orderStatus || "").toLowerCase();
  const prevPayStatus = String(order?.payment?.status || "");
  const payMethod = String(order?.payment?.method || "");
  const terminalStatuses = new Set([
    "delivered",
    "cancelled_by_user",
    "cancelled_by_restaurant",
    "cancelled_by_admin",
  ]);
  if (terminalStatuses.has(from) && from !== normalizedStatus) {
    throw new ValidationError(`Cannot update order in ${from} status`);
  }
  if (normalizedStatus === "confirmed" && !["created", "confirmed"].includes(from)) {
    throw new ValidationError(`Cannot accept order from ${from} status`);
  }
  if (from === normalizedStatus) return order.toObject();

  order.orderStatus = normalizedStatus;
  if (normalizedStatus === "delivered") {
    order.payment.status = "paid";
    order.deliveryState = {
      ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
      currentPhase: "delivered",
      status: "delivered",
      deliveredAt: new Date(),
    };
  }
  pushStatusHistory(order, {
    byRole: "ADMIN",
    byId: adminId,
    from,
    to: normalizedStatus,
    note: reason || "",
  });
  await order.save();
  if (normalizedStatus === "delivered" && order.payment?.status === "paid" && order.userId) {
    try {
      await settleUnpaidDebtsForOrder(order.userId, order._id);
    } catch (debtErr) {
      logger.warn(
        `updateOrderStatusAdmin debt settlement failed for order ${order._id}: ${debtErr?.message || debtErr}`,
      );
    }
  }

  if (normalizedStatus === "cancelled_by_admin") {
    try {
      const cancelledOrder = order.toObject ? order.toObject() : order;
      const cancelUserId = cancelledOrder.userId ? String(cancelledOrder.userId) : null;

      if (cancelledOrder.appliedRestaurantOfferId) {
        await RestaurantOffer.updateOne(
          { _id: cancelledOrder.appliedRestaurantOfferId },
          { $inc: { usedCount: -1 } },
        );
        if (cancelUserId && mongoose.Types.ObjectId.isValid(cancelUserId)) {
          await RestaurantOfferUsage.updateOne(
            { offerId: cancelledOrder.appliedRestaurantOfferId, userId: new mongoose.Types.ObjectId(cancelUserId) },
            { $inc: { count: -1 } },
          );
        }
      }

      if (cancelledOrder.appliedCouponOfferId) {
        await FoodOffer.updateOne(
          { _id: cancelledOrder.appliedCouponOfferId },
          { $inc: { usedCount: -1 } },
        );
        if (cancelUserId && mongoose.Types.ObjectId.isValid(cancelUserId)) {
          await FoodOfferUsage.updateOne(
            { offerId: cancelledOrder.appliedCouponOfferId, userId: new mongoose.Types.ObjectId(cancelUserId) },
            { $inc: { count: -1 } },
          );
        }
      }
    } catch (offerReverseErr) {
      logger.warn(`updateOrderStatusAdmin offer usage reversal failed: ${offerReverseErr?.message || offerReverseErr}`);
    }
  }

  const notifyList = [
    { ownerType: "USER", ownerId: order.userId },
    { ownerType: "RESTAURANT", ownerId: order.restaurantId },
  ];
  if (order.dispatch?.deliveryPartnerId) {
    notifyList.push({ ownerType: "DELIVERY_PARTNER", ownerId: order.dispatch.deliveryPartnerId });
  }

  const statusText = normalizedStatus.replace(/_/g, " ");
  const title = normalizedStatus === "confirmed" ? "Order Accepted" : `Order ${order.orderId} updated`;
  const body = normalizedStatus === "cancelled_by_admin"
    ? `Order #${order.orderId} was cancelled by admin.${reason ? ` Reason: ${reason}` : ""}`
    : `Order status changed to ${statusText}.`;

  await notifyOwnersSafely(notifyList, {
    title,
    body,
    image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
    data: {
      type: "order_status_update",
      orderId: order.orderId,
      orderMongoId: order._id?.toString?.() || "",
      orderStatus: normalizedStatus,
    },
  });

  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: normalizedStatus,
        title,
        message: body,
      };
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", payload);
      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("order_status_update", payload);
      }
      io.to(rooms.admin()).emit("order_status_update", payload);
    }
  } catch (err) {
    logger.warn(`updateOrderStatusAdmin socket emit failed: ${err?.message || err}`);
  }

  if (normalizedStatus === "cancelled_by_admin") {
    try {
      const isOnlinePaid =
        order.payment.method === "razorpay" &&
        (order.payment.status === "paid" || order.payment.status === "refunded");
      await foodTransactionService.updateTransactionStatus(order._id, "cancelled_by_admin", {
        status: isOnlinePaid ? "refunded" : "failed",
        note: "Order cancelled by admin",
        recordedByRole: "ADMIN",
        recordedById: adminId,
      });
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin transaction sync failed: ${err?.message || err}`);
    }
  }
  if (normalizedStatus === "delivered") {
    try {
      const ledgerKind =
        payMethod === "cash" && prevPayStatus === "cod_pending"
          ? "cod_marked_paid_on_delivery"
          : "payment_snapshot_sync";
      await foodTransactionService.updateTransactionStatus(order._id, ledgerKind, {
        status: "captured",
        recordedByRole: "ADMIN",
        recordedById: adminId,
        note: `Delivery marked complete by admin. Prev status: ${prevPayStatus}`,
      });
    } catch (err) {
      logger.warn(`updateOrderStatusAdmin delivery transaction sync failed: ${err?.message || err}`);
    }

    enqueueOrderEvent("delivery_completed", {
      orderMongoId: order._id?.toString?.(),
      orderId: order.orderId,
      deliveryPartnerId: order.dispatch?.deliveryPartnerId?.toString?.() || "",
      payMethod,
      prevPayStatus,
      paymentStatus: order.payment?.status,
    });
  }

  enqueueOrderEvent("admin_order_status_updated", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    adminId: adminId ? String(adminId) : "",
    from,
    to: normalizedStatus,
  });

  return order.toObject();
}

export async function getCurrentTripDelivery(deliveryPartnerId) {
  if (!deliveryPartnerId) throw new ValidationError("Delivery partner ID required");
  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  
  // Active trip must be accepted by this rider.
  // Assigned-but-not-accepted orders should appear in available requests modal.
  const order = await FoodOrder.findOne({
    "dispatch.deliveryPartnerId": partnerId,
    "dispatch.status": "accepted",
    orderStatus: {
      $in: ["confirmed", "preparing", "ready_for_pickup", "picked_up", "reached_pickup", "reached_drop"]
    }
  })
    .populate({ path: "restaurantId", select: "restaurantName name phone location addressLine1 area city state profileImage" })
    .populate({ path: "userId", select: "name phone" })
    .sort({ updatedAt: -1 })
    .lean();

  if (!order) return null;
  return sanitizeOrderForExternal(order);
}

// ----- Delivery: available, accept, reject, status -----
export async function listOrdersAvailableDelivery(deliveryPartnerId, query) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const filter = {
    "dispatch.deliveryPartnerId": new mongoose.Types.ObjectId(
      deliveryPartnerId,
    ),
    "dispatch.status": "assigned",
    $or: [
      { "dispatch.acceptedAt": { $exists: false } },
      { "dispatch.acceptedAt": null },
    ],
    orderStatus: {
      $nin: [
        "delivered",
        "cancelled_by_user",
        "cancelled_by_restaurant",
        "cancelled_by_user_unavailable",
        "cancelled_by_admin",
      ],
    },
  };
  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name phone email")
      .populate("restaurantId", "restaurantName name address phone ownerPhone location profileImage")
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);
  return buildPaginatedResult({ docs, total, page, limit });
}

export async function acceptOrderDelivery(orderId, deliveryPartnerId) {
  const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne({
    ...identity,
    orderStatus: {
      $nin: [
        "delivered",
        "cancelled_by_user",
        "cancelled_by_restaurant",
        "cancelled_by_user_unavailable",
        "cancelled_by_admin",
      ],
    },
    "dispatch.deliveryPartnerId": partnerId,
  });

  if (!order) throw new NotFoundError("Order not found");

  // Guard: only dispatchable after restaurant accepted.
  if (
    !["preparing", "ready_for_pickup", "picked_up"].includes(order.orderStatus)
  ) {
    throw new ValidationError("Order not ready for delivery assignment");
  }

  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  ) {
    throw new ForbiddenError("Not your order");
  }

  const from = order.dispatch?.status || "assigned";
  order.dispatch.deliveryPartnerId = partnerId;
  order.dispatch.status = "accepted";
  if (!order.dispatch.assignedAt) order.dispatch.assignedAt = new Date();
  order.dispatch.acceptedAt = new Date();
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "accepted",
  });
  await order.save();
  await order.populate('restaurantId'); // Need coordinates for Firebase initial write

  // ─── Firebase Realtime Database Tracking Initialization (Cost Optimization) ───
  try {
      const rest = order.restaurantId;
      const userLoc = order.deliveryAddress?.location?.coordinates; // [lng, lat]
      const restLoc = rest?.location?.coordinates; // [lng, lat]

      if (restLoc?.[0] && userLoc?.[0]) {
          // Fetch polyline only once upon acceptance.
          const polyline = await fetchPolyline(
              { lat: restLoc[1], lng: restLoc[0] },
              { lat: userLoc[1], lng: userLoc[0] }
          );

          const db = getFirebaseDB();
          if (db) {
              const orderRef = db.ref(`active_orders/${order.orderId}`);
              await orderRef.set({
                  polyline,
                  lat: restLoc[1], // Initial boy position at restaurant
                  lng: restLoc[0],
                  boy_lat: restLoc[1],
                  boy_lng: restLoc[0],
                  restaurant_lat: restLoc[1],
                  restaurant_lng: restLoc[0],
                  customer_lat: userLoc[1],
                  customer_lng: userLoc[0],
                  status: 'accepted',
                  last_updated: Date.now()
              }).catch(e => logger.error(`Firebase orderRef set error: ${e.message}`));
          }
      }
  } catch (err) {
      logger.error(`Error initializing Firebase order tracking: ${err.message}`);
  }

  await foodTransactionService.updateTransactionRider(order._id, deliveryPartnerId);

  // Notify delivery partner (self) + restaurant about dispatch acceptance.
  try {
    const io = getIO();
    if (io) {
      io.to(rooms.delivery(deliveryPartnerId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.user(order.userId)).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
      io.to(rooms.admin()).emit("order_status_update", {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        dispatchStatus: order.dispatch?.status,
      });
    }
    await notifyOwnersSafely(
      [
        { ownerType: "USER", ownerId: order.userId },
        { ownerType: "RESTAURANT", ownerId: order.restaurantId },
        { ownerType: "DELIVERY_PARTNER", ownerId: deliveryPartnerId },
      ],
      {
        title: `Order ${order.orderId} accepted`,
        body: "A delivery partner has accepted your order.",
        data: {
          type: "delivery_accepted",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          dispatchStatus: order.dispatch?.status,
          link: "/food/user/orders",
        },
      },
    );
  } catch {}

  enqueueOrderEvent("delivery_accepted", {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId,
    dispatchStatus: order.dispatch?.status,
    orderStatus: order.orderStatus,
  });

  // Return full populated order so delivery app has restaurant coords for route polyline
  return getOrderById(order._id, { deliveryPartnerId });
}

export async function rejectOrderDelivery(orderId, deliveryPartnerId, reasonType = 'passed') {
    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne(identity);
    if (!order) throw new NotFoundError('Order not found');
    if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) throw new ForbiddenError('Not your order');
    
    // Mark as rejected in history
    const offer = order.dispatch.offeredTo.find(o => String(o.partnerId) === String(deliveryPartnerId) && o.action === 'offered');
    if (offer) offer.action = 'rejected';

    order.dispatch.status = 'unassigned';
    order.dispatch.deliveryPartnerId = undefined;
    order.dispatch.assignedAt = undefined;
    order.dispatch.acceptedAt = undefined;
    const normalizedReasonType = String(reasonType || '').trim().toLowerCase() === 'timeout' ? 'timed_out' : 'passed';
    const historyNote = normalizedReasonType === 'timed_out'
      ? 'Timed out without response'
      : 'Passed by delivery partner';
    pushStatusHistory(order, { byRole: 'DELIVERY_PARTNER', byId: deliveryPartnerId, from: 'assigned', to: 'unassigned', note: historyNote });
    await order.save();

    try {
      const io = getIO();
      if (io) {
        io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", {
          orderMongoId: order._id?.toString?.(),
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          dispatchStatus: order.dispatch?.status,
        });
        io.to(rooms.user(order.userId)).emit("order_status_update", {
          orderMongoId: order._id?.toString?.(),
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          dispatchStatus: order.dispatch?.status,
        });
        io.to(rooms.admin()).emit("order_status_update", {
          orderMongoId: order._id?.toString?.(),
          orderId: order.orderId,
          orderStatus: order.orderStatus,
          dispatchStatus: order.dispatch?.status,
        });
      }

      const timeoutCase = normalizedReasonType === 'timed_out';
      await notifyAdminsSafely({
        title: timeoutCase ? "Delivery Request Timed Out" : "Delivery Boy Passed Task",
        body: timeoutCase
          ? `Delivery request timed out for order ${order.orderId}. Please reassign.`
          : `Delivery boy passed request for order ${order.orderId}. Please reassign.`,
        data: {
          type: timeoutCase ? "delivery_request_timed_out" : "delivery_request_passed",
          orderId: String(order.orderId || ""),
          orderMongoId: String(order._id || ""),
          reasonType: normalizedReasonType,
          link: "/admin/food/order-detect-delivery",
        },
      });
    } catch {}
    
    enqueueOrderEvent('delivery_rejected', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        reasonType: normalizedReasonType
    });

    return order.toObject();
}

export async function confirmReachedPickupDelivery(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");
  if (order.orderStatus === "delivered")
    throw new ValidationError("Order already delivered");

  // Idempotent: if already at/after pickup, keep success.
  const currentPhase = order.deliveryState?.currentPhase || "";
  const currentStatus = order.deliveryState?.status || "";
  if (currentPhase === "at_pickup" || currentStatus === "reached_pickup") {
    return order.toObject();
  }

  const from = currentStatus || currentPhase || order.orderStatus;
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "at_pickup",
    status: "reached_pickup",
    reachedPickupAt: order.deliveryState?.reachedPickupAt || new Date(),
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "reached_pickup",
    note: "Reached pickup location",
  });
  await order.save();

  // Notify
  emitOrderUpdate(order, deliveryPartnerId);

  // Notify Restaurant about rider arrival
  try {
    const restaurant = await FoodRestaurant.findById(order.restaurantId).select("restaurantName").lean();
    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select("name").lean();
    
    const { notifyOwnersSafely } = await import("../../../../core/notifications/firebase.service.js");
    await notifyOwnersSafely(
      [{ ownerType: "RESTAURANT", ownerId: order.restaurantId }],
      {
        title: "Rider Arrived! 🛵",
        body: `${partner?.name || "The delivery partner"} has arrived at your restaurant to pick up Order #${order.orderId}.`,
        image: "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png",
        data: {
          type: "rider_arrived",
          orderId: String(order.orderId),
          orderMongoId: String(order._id),
          partnerName: partner?.name || ""
        }
      }
    );
  } catch (err) {
    console.error("[DEBUG] Error notifying restaurant about rider arrival:", err);
  }

    enqueueOrderEvent('reached_pickup', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        orderStatus: order.orderStatus,
        deliveryPhase: order.deliveryState?.currentPhase,
        deliveryStatus: order.deliveryState?.status
    });
    return order.toObject();
}

/**
 * Slide to confirm pickup (Bill uploaded)
 */
export async function confirmPickupDelivery(
  orderId,
  deliveryPartnerId,
  billImageUrl,
) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  const from = order.orderStatus;
  order.orderStatus = "picked_up";
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "en_route_to_delivery",
    status: "picked_up",
    pickedUpAt: new Date(),
    billImageUrl,
  };
  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "picked_up",
    note: "Order picked up",
  });
  await order.save();

    emitOrderUpdate(order, deliveryPartnerId);
    enqueueOrderEvent('picked_up', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        billImageUrl: billImageUrl || null
    });
    return order.toObject();
}

export async function confirmReachedDropDelivery(orderId, deliveryPartnerId) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).select("+deliveryOtp");
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  if (order.deliveryVerification?.dropOtp?.verified) {
    emitOrderUpdate(order, deliveryPartnerId);
    return sanitizeOrderForExternal(order);
  }

  const alreadyAtDrop =
    order.deliveryState?.currentPhase === "at_drop" ||
    order.deliveryState?.status === "reached_drop";
  const fromPhase =
    order.deliveryState?.status ||
    order.deliveryState?.currentPhase ||
    order.orderStatus ||
    "";

  const existingOtp = String(order.deliveryOtp || "").trim();
  if (!alreadyAtDrop || !existingOtp) {
    order.deliveryOtp = generateFourDigitDeliveryOtp();
    order.deliveryVerification = {
      ...(order.deliveryVerification?.toObject?.() ||
        order.deliveryVerification ||
        {}),
      dropOtp: { required: true, verified: false },
    };
  }

  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "at_drop",
    status: "reached_drop",
    reachedDropAt: order.deliveryState?.reachedDropAt || new Date(),
  };

  if (!alreadyAtDrop) {
    pushStatusHistory(order, {
      byRole: "DELIVERY_PARTNER",
      byId: deliveryPartnerId,
      from: fromPhase,
      to: "reached_drop",
      note: "Reached drop location",
    });
  }

  await order.save();

    const plainOtp = String(order.deliveryOtp || '').trim();
    emitDeliveryDropOtpToUser(order, plainOtp);
    emitOrderUpdate(order, deliveryPartnerId);
    enqueueOrderEvent('reached_drop', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        dropOtpRequired: order.deliveryVerification?.dropOtp?.required ?? true,
        dropOtpVerified: order.deliveryVerification?.dropOtp?.verified ?? false
    });
    return sanitizeOrderForExternal(order);
}

export async function verifyDropOtpDelivery(orderId, deliveryPartnerId, otp) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity).select("+deliveryOtp");
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  const otpStr = String(otp || "").trim();
  if (!otpStr) throw new ValidationError("OTP is required");

  if (!order.deliveryVerification?.dropOtp?.required) {
    throw new ValidationError(
      "OTP verification is not active for this order. Confirm reached drop first.",
    );
  }
  if (order.deliveryVerification?.dropOtp?.verified) {
    return { order: sanitizeOrderForExternal(order) };
  }

  const expected = String(order.deliveryOtp || "").trim();
  if (!expected || expected !== otpStr) {
    throw new ValidationError(
      "Invalid OTP. Ask the customer for the code shown in their app.",
    );
  }

  // Use direct path assignment for robustness in Mongoose change detection
  if (!order.deliveryVerification) order.deliveryVerification = { dropOtp: {} };
  order.deliveryVerification.dropOtp.verified = true;
  order.markModified('deliveryVerification.dropOtp.verified');
  
  order.deliveryOtp = "";
  await order.save();

    emitOrderUpdate(order, deliveryPartnerId);
    enqueueOrderEvent('drop_otp_verified', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId
    });
    return { order: sanitizeOrderForExternal(order) };
}

export async function completeDelivery(orderId, deliveryPartnerId, body = {}) {
  const identity = buildOrderIdentityFilter(orderId);
  const order = await FoodOrder.findOne(identity);
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  const { ratings } = body;

  const from = order.orderStatus;
  const prevPayStatus = order.payment.status;
  const payMethod = order.payment.method;

  // Security gate: only complete QR delivery after Razorpay payment-link is actually paid.
  // This enables frontend auto-complete after QR success.
  if (payMethod === "razorpay_qr") {
    // syncRazorpayQrPayment is a helper presumed present in this service context
    if (typeof syncRazorpayQrPayment === 'function') await syncRazorpayQrPayment(order);
    if (order.payment.status !== "paid") {
      throw new ValidationError("QR payment not verified yet");
    }
  }

  order.orderStatus = "delivered";
  order.payment.status = "paid"; 
  order.deliveryState = {
    ...(order.deliveryState?.toObject?.() || order.deliveryState || {}),
    currentPhase: "delivered",
    status: "delivered",
    deliveredAt: new Date(),
  };

  if (ratings) {
    order.ratings = {
       ...(order.ratings?.toObject?.() || order.ratings || {}),
       ...ratings
    };
  }

  pushStatusHistory(order, {
    byRole: "DELIVERY_PARTNER",
    byId: deliveryPartnerId,
    from,
    to: "delivered",
    note: "Delivery completed successfully",
  });

  await order.save();
  if (order.payment?.status === "paid" && order.userId) {
    try {
      await settleUnpaidDebtsForOrder(order.userId, order._id);
    } catch (debtErr) {
      logger.warn(
        `completeDelivery debt settlement failed for order ${order._id}: ${debtErr?.message || debtErr}`,
      );
    }
  }
  emitOrderUpdate(order, deliveryPartnerId);
  const ledgerKind =
    payMethod === "cash" && prevPayStatus === "cod_pending"
      ? "cod_marked_paid_on_delivery"
      : "payment_snapshot_sync";
      
  await foodTransactionService.updateTransactionStatus(order._id, ledgerKind, {
    status: 'captured',
    recordedByRole: "DELIVERY_PARTNER",
    recordedById: deliveryPartnerId,
    note: `Delivery completed. Prev status: ${prevPayStatus}`
  });
  enqueueOrderEvent('delivery_completed', {
      orderMongoId: order._id?.toString?.(),
      orderId: order.orderId,
      deliveryPartnerId,
      payMethod,
      prevPayStatus,
      paymentStatus: order.payment?.status
  });
  return sanitizeOrderForExternal(order);
}

function emitOrderUpdate(order, deliveryPartnerId) {
  try {
    const io = getIO();
    const status = String(order?.orderStatus || "").toLowerCase();
    const isCod = String(order?.payment?.method || "").toLowerCase() === "cash";

    const statusLabel = status
      .replace(/^cancelled_by_/i, "cancelled ")
      .replace(/_/g, " ")
      .trim();

    let restaurantUserTitle = `Order #${order.orderId} status updated`;
    let restaurantUserBody = `Order is now ${statusLabel}.`;

    if (status === "picked_up") {
      restaurantUserTitle = `Order #${order.orderId} picked up`;
      restaurantUserBody = "Your order is on the way.";
    } else if (status === "reached_drop") {
      restaurantUserTitle = `Order #${order.orderId} reached drop`;
      restaurantUserBody = "Delivery partner has arrived at the drop location.";
    } else if (status === "delivered") {
      restaurantUserTitle = `Order #${order.orderId} delivered!`;
      restaurantUserBody = "Hope you enjoyed your meal!";
    } else if (status === "cancelled_by_user_unavailable") {
      restaurantUserTitle = `Order #${order.orderId} cancelled`;
      restaurantUserBody = "Order closed because user was unavailable at drop location.";
    }

    let riderTitle = "Order status updated";
    let riderBody = `Order #${order.orderId} is now ${statusLabel}.`;

    if (status === "picked_up") {
      riderTitle = "Pickup confirmed";
      riderBody = `Order #${order.orderId} picked up successfully.`;
    } else if (status === "reached_drop") {
      riderTitle = "Reached drop location";
      riderBody = `Order #${order.orderId} is ready for handover.`;
    } else if (status === "delivered") {
      riderTitle = "Order delivered";
      riderBody = `Order #${order.orderId} has been marked as delivered.`;
      if (isCod) {
        riderTitle = "Payment Collected";
        riderBody = `You have collected INR ${order.pricing?.total || 0} cash for Order #${order.orderId}.`;
      }
    } else if (status === "cancelled_by_user_unavailable") {
      riderTitle = "User unavailable marked";
      riderBody = `Order #${order.orderId} marked as user unavailable.`;
    }

    if (io) {
      const dv =
        order.deliveryVerification?.toObject?.() || order.deliveryVerification;
      const payload = {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        deliveryState: order.deliveryState,
        deliveryVerification: dv,
      };
      io.to(rooms.delivery(deliveryPartnerId)).emit("order_status_update", payload);
      io.to(rooms.restaurant(order.restaurantId)).emit("order_status_update", payload);
      io.to(rooms.user(order.userId)).emit("order_status_update", payload);
      io.to(rooms.admin()).emit("order_status_update", payload);
    }

    void notifyOwnersSafely(
      [
        { ownerType: "RESTAURANT", ownerId: order.restaurantId },
        { ownerType: "USER", ownerId: order.userId },
      ],
      {
        title: restaurantUserTitle,
        body: restaurantUserBody,
        data: {
          type: "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: status || order.orderStatus,
        },
      },
    );

    void notifyOwnerSafely(
      { ownerType: "DELIVERY_PARTNER", ownerId: deliveryPartnerId },
      {
        title: riderTitle,
        body: riderBody,
        data: {
          type: status === "delivered" ? "order_completed" : "order_status_update",
          orderId: order.orderId,
          orderMongoId: order._id?.toString?.() || "",
          orderStatus: status || order.orderStatus,
          paymentMethod: order.payment?.method,
          amountCollected: String(order.pricing?.total || 0),
        },
      }
    );
  } catch (e) {
    console.error("Error emitting order update:", e);
  }
}
export async function updateOrderStatusDelivery(orderId, deliveryPartnerId, orderStatus) {
    const payload = orderStatus && typeof orderStatus === 'object' ? orderStatus : { orderStatus };
    let nextOrderStatus = String(payload?.orderStatus || '').trim();
    if (!nextOrderStatus) throw new ValidationError('orderStatus is required');
    const normalizedReasonType = String(payload?.reasonType || '').trim().toLowerCase();
    if (nextOrderStatus === 'cancelled_by_restaurant' && normalizedReasonType === 'user_unavailable') {
      nextOrderStatus = 'cancelled_by_user_unavailable';
    }

    const identity = buildOrderIdentityFilter(orderId);
    if (!identity) throw new ValidationError('Order id required');
    const order = await FoodOrder.findOne(identity);
    if (!order) throw new NotFoundError('Order not found');
    if (order.dispatch.deliveryPartnerId?.toString() !== deliveryPartnerId.toString()) throw new ForbiddenError('Not your order');
    const from = order.orderStatus;
    order.orderStatus = nextOrderStatus;
    pushStatusHistory(order, { byRole: 'DELIVERY_PARTNER', byId: deliveryPartnerId, from, to: nextOrderStatus });
    await order.save();

    const isNoResponseCancellation =
      nextOrderStatus === 'cancelled_by_user_unavailable' &&
      normalizedReasonType === 'user_unavailable';

    if (isNoResponseCancellation) {
      const recoverableAmount = Number(order?.pricing?.total || 0);
      if (recoverableAmount > 0 && order?.userId) {
        const waitTimerCompletedAt = payload?.waitTimerCompletedAt
          ? new Date(payload.waitTimerCompletedAt)
          : null;

        await FoodUserDebt.findOneAndUpdate(
          { failedOrderId: order._id },
          {
            $set: {
              userId: order.userId,
              amount: recoverableAmount,
              currency: String(order?.pricing?.currency || 'INR'),
              reasonType: normalizedReasonType,
              reason: String(payload?.reason || 'User not responding at drop location'),
              proofImageUrl: String(payload?.noResponseProofImage || ''),
              callAttempted: payload?.callAttempted === true,
              waitTimerCompletedAt:
                waitTimerCompletedAt && !Number.isNaN(waitTimerCompletedAt.getTime())
                  ? waitTimerCompletedAt
                  : null,
              meta: {
                cancelledBy: 'DELIVERY_PARTNER',
                deliveryPartnerId: String(deliveryPartnerId || ''),
              },
            },
            $setOnInsert: {
              status: 'unpaid',
              failedOrderId: order._id,
            },
          },
          { new: true, upsert: true },
        );

        enqueueOrderEvent('user_debt_recorded', {
          orderMongoId: order._id?.toString?.(),
          orderId: order.orderId,
          userId: String(order.userId || ''),
          amount: recoverableAmount,
          reasonType: normalizedReasonType,
        });

        try {
          await foodTransactionService.updateTransactionStatus(order._id, 'cancelled_by_delivery_no_response', {
            status: 'captured',
            note: 'User unavailable at drop. Restaurant payout preserved in normal flow.',
            recordedByRole: 'DELIVERY_PARTNER',
            recordedById: deliveryPartnerId,
          });
        } catch (txErr) {
          logger.warn(
            `No-response transaction sync failed for order ${order._id?.toString?.() || ''}: ${txErr?.message || txErr}`,
          );
        }
      } else {
        logger.warn(
          `Skipped no-response debt creation for order ${order._id?.toString?.() || ''}: missing userId/amount`,
        );
      }
    }

    emitOrderUpdate(order, deliveryPartnerId);

    enqueueOrderEvent('delivery_status_updated', {
        orderMongoId: order._id?.toString?.(),
        orderId: order.orderId,
        deliveryPartnerId,
        from,
        to: nextOrderStatus
    });
    return order.toObject();
}

// ----- COD QR collection -----
export async function createCollectQr(
  orderId,
  deliveryPartnerId,
  customerInfo = {},
) {
  const query = mongoose.Types.ObjectId.isValid(orderId) ? { _id: orderId } : { orderId };
  const order = await FoodOrder.findOne(query)
    .populate("userId", "name email phone")
    .lean();
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");
  if (order.payment.method !== "cash" && order.payment.status === "paid")
    throw new ValidationError("Order already paid");
  const amountDue = order.payment.amountDue ?? order.pricing?.total ?? 0;
  if (amountDue < 1) throw new ValidationError("No amount due");

  if (!isRazorpayConfigured())
    throw new ValidationError("QR payment not configured");

  const amountPaise = Math.round(amountDue * 100);
  const user = order.userId || {};
  const link = await createPaymentLink({
    amountPaise,
    currency: "INR",
    description: `Order ${order.orderId} - COD collect`,
    orderId: order.orderId,
    customerName: customerInfo.name || user.name || "Customer",
    customerEmail: customerInfo.email || user.email || "customer@example.com",
    customerPhone: customerInfo.phone || user.phone,
  });

  await FoodOrder.findByIdAndUpdate(order._id, {
    $set: {
      "payment.method": "razorpay_qr",
      "payment.status": "pending_qr",
      "payment.qr": {
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        imageUrl: link.short_url,
        status: link.status || "created",
        expiresAt: link.expire_by ? new Date(link.expire_by * 1000) : null,
      },
    },
  });

    const updated = await FoodOrder.findById(order._id).select('orderId restaurantId userId riderEarning payment pricing').lean();
    if (updated) {
        await foodTransactionService.updateTransactionStatus(order._id, 'cod_collect_qr_created', {
            recordedByRole: 'DELIVERY_PARTNER',
            recordedById: deliveryPartnerId,
            note: 'COD collection QR created'
        });
    }

    enqueueOrderEvent('collect_qr_created', {
        orderMongoId: String(orderId),
        orderId: updated?.orderId || null,
        deliveryPartnerId,
        paymentLinkId: link.id,
        shortUrl: link.short_url,
        amountDue
    });

  // IMPORTANT: return QR payload so frontend can render "Generate QR" / "Show QR".
  const shortUrl =
    link?.short_url ?? link?.shortUrl ?? link?.short_url_path ?? null;
  const imageUrl =
    link?.short_url ??
    link?.image_url ??
    link?.imageUrl ??
    link?.image ??
    null;

  return {
    shortUrl,
    imageUrl,
    amount: amountDue,
    expiresAt:
      link?.expire_by
        ? new Date(link.expire_by * 1000)
        : link?.expiresAt
          ? new Date(link.expiresAt)
          : null,
  };
}

/**
 * Razorpay QR auto-verify:
 * - Fetch payment-link status from Razorpay
 * - Update `order.payment.status` to `paid` when Razorpay marks it paid
 * - Update `order.payment.qr.status` for UI/debugging
 *
 * IMPORTANT: Callers should `await` this before completing delivery.
 */
async function syncRazorpayQrPayment(orderDoc) {
  if (!orderDoc?.payment) return orderDoc?.payment;
  if (orderDoc.payment.method !== "razorpay_qr") return orderDoc.payment;
  if (orderDoc.payment.status === "paid") return orderDoc.payment;

  const paymentLinkId = orderDoc.payment?.qr?.paymentLinkId;
  if (!paymentLinkId) return orderDoc.payment;
  if (!isRazorpayConfigured()) return orderDoc.payment;

  let link;
  try {
    link = await fetchRazorpayPaymentLink(paymentLinkId);
  } catch (err) {
    logger.warn(
      `Razorpay payment-link fetch failed for ${paymentLinkId}: ${
        err?.message || err
      }`
    );
    return orderDoc.payment;
  }

  const linkStatus = String(link?.status || "").toLowerCase();
  if (!linkStatus) return orderDoc.payment;

  // Update QR snapshot status.
  orderDoc.payment.qr = {
    ...(orderDoc.payment.qr?.toObject?.() || orderDoc.payment.qr || {}),
    status: linkStatus,
  };

  // Mark paid only when Razorpay says it's paid/settled.
  if (["paid", "captured", "authorized"].includes(linkStatus)) {
    orderDoc.payment.status = "paid";
    await orderDoc.save();
  } else if (["expired", "cancelled", "canceled", "failed"].includes(linkStatus)) {
    orderDoc.payment.status = "failed";
    await orderDoc.save();
  }

  return orderDoc.payment;
}

export async function getPaymentStatus(orderId, deliveryPartnerId) {
  // Support both short orderId strings and MongoDB _ids.
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).select(
    "payment dispatch riderEarning platformProfit pricing"
  );
  if (!order) throw new NotFoundError("Order not found");
  if (
    order.dispatch?.deliveryPartnerId?.toString() !==
    deliveryPartnerId.toString()
  )
    throw new ForbiddenError("Not your order");

  // Auto-sync Razorpay QR payment status before returning.
  // syncRazorpayQrPayment calls Razorpay, updates order.payment.status, and saves.
  if (order.payment?.method === "razorpay_qr") {
    await syncRazorpayQrPayment(order);
  }

  const transaction = await FoodTransaction.findOne({ orderId: order._id }).lean();
  const latestHistory = (transaction?.history || []).sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;

  return {
    payment: {
      ...(order.payment?.toObject?.() || order.payment || {}),
      // Expose the effective status in a flat field for easy frontend reading
      status: order.payment?.status,
    },
    latestPaymentSnapshot: latestHistory,
    riderEarning: order.riderEarning ?? 0,
    platformProfit: order.platformProfit ?? 0,
    pricingTotal: order.pricing?.total ?? 0,
    transactionStatus: transaction?.status ?? null,
  };
}

// ----- Admin -----
export async function listOrdersAdmin(query, adminScope = {}) {
  const { page, limit, skip } = buildPaginationOptions(query);
  const parseDateBoundary = (raw, endOfDay = false) => {
    const value = String(raw || "").trim();
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (isDateOnly) {
      if (endOfDay) parsed.setHours(23, 59, 59, 999);
      else parsed.setHours(0, 0, 0, 0);
    }
    return parsed;
  };

  const filter = {
    $or: [
      { "payment.method": { $in: ["cash", "wallet"] } },
      { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
    ],
  };

  const rawStatus =
    typeof query.status === "string" ? query.status.trim().toLowerCase() : "";
  const cancelledBy =
    typeof query.cancelledBy === "string"
      ? query.cancelledBy.trim().toLowerCase()
      : "";
  const restaurantIdRaw =
    typeof query.restaurantId === "string" ? query.restaurantId.trim() : "";
  const startDateRaw =
    typeof query.startDate === "string" ? query.startDate.trim() : "";
  const endDateRaw =
    typeof query.endDate === "string" ? query.endDate.trim() : "";

  if (rawStatus && rawStatus !== "all") {
    switch (rawStatus) {
      case "pending":
        filter.orderStatus = { $in: ["created", "confirmed"] };
        break;
      case "accepted":
        filter.orderStatus = "confirmed";
        break;
      case "processing":
        filter.orderStatus = { $in: ["preparing", "ready_for_pickup"] };
        break;
      case "food-on-the-way":
        filter.orderStatus = "picked_up";
        break;
      case "delivered":
        filter.orderStatus = "delivered";
        break;
      case "canceled":
      case "cancelled":
        filter.orderStatus = {
          $in: [
            "cancelled_by_user",
            "cancelled_by_restaurant",
            "cancelled_by_user_unavailable",
            "cancelled_by_admin",
          ],
        };
        break;
      case "restaurant-cancelled":
        filter.orderStatus = { $in: ["cancelled_by_restaurant", "cancelled_by_user_unavailable"] };
        break;
      case "payment-failed":
        filter["payment.status"] = "failed";
        break;
      case "refunded":
        filter["payment.status"] = "refunded";
        break;
      case "offline-payments":
        filter["payment.method"] = "cash";
        filter.orderStatus = { $in: ["created", "confirmed", "delivered"] };
        break;
      case "scheduled":
        filter.scheduledAt = { $ne: null };
        break;
      default:
        break;
    }
  }

  if (cancelledBy) {
    if (cancelledBy === "restaurant") {
      filter.orderStatus = { $in: ["cancelled_by_restaurant", "cancelled_by_user_unavailable"] };
    } else if (cancelledBy === "user" || cancelledBy === "customer") {
      filter.orderStatus = "cancelled_by_user";
    }
  }

  if (restaurantIdRaw && mongoose.Types.ObjectId.isValid(restaurantIdRaw)) {
    filter.restaurantId = new mongoose.Types.ObjectId(restaurantIdRaw);
  }

  if (startDateRaw || endDateRaw) {
    const createdAt = {};
    const start = parseDateBoundary(startDateRaw, false);
    const end = parseDateBoundary(endDateRaw, true);
    if (start) {
      createdAt.$gte = start;
    }
    if (end) {
      createdAt.$lte = end;
    }
    if (Object.keys(createdAt).length > 0) {
      filter.createdAt = createdAt;
    }
  }

  const scope = normalizeAdminScope(adminScope);
  if (scope.isSubAdmin) {
    if (!scope.zoneIds.length) {
      const paginated = buildPaginatedResult({ docs: [], total: 0, page, limit });
      return { ...paginated, orders: [] };
    }
    filter.zoneId = { $in: scope.zoneIds };
  }

  const [docs, total] = await Promise.all([
    FoodOrder.find(filter)
      .populate("userId", "name phone email")
      .populate("restaurantId", "restaurantName area city ownerPhone")
      .populate("dispatch.deliveryPartnerId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FoodOrder.countDocuments(filter),
  ]);

  // Annotate delivery payout status from paid settlement batches.
  // Delivery report consumes orders API and expects per-order paid/unpaid state.
  const orderIds = docs
    .map((doc) => doc?._id)
    .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));
  let settledOrderIdSet = new Set();
  if (orderIds.length) {
    const settlementDocs = await FoodPayoutSettlement.find({
      beneficiaryType: 'delivery',
      status: 'paid',
      transactionIds: { $in: orderIds }
    })
      .select('transactionIds')
      .lean();

    settledOrderIdSet = new Set(
      settlementDocs
        .flatMap((doc) => (Array.isArray(doc?.transactionIds) ? doc.transactionIds : []))
        .map((id) => String(id))
    );
  }

  const noResponseMap = await buildNoResponseMetaMap(docs.map((d) => d?._id));
  const docsWithMeta = docs.map((doc) => {
    const base = withNoResponseMeta(doc, noResponseMap);
    const isDeliveryPayoutPaid = settledOrderIdSet.has(String(doc?._id));
    if (!isDeliveryPayoutPaid) return base;

    return {
      ...base,
      deliveryPayoutStatus: 'paid',
      deliverySettlementStatus: 'paid',
      settlement: {
        ...(base?.settlement || {}),
        deliveryStatus: 'paid'
      }
    };
  });
  const paginated = buildPaginatedResult({ docs: docsWithMeta, total, page, limit });
  return { ...paginated, orders: paginated.data };
}

export async function assignDeliveryPartnerAdmin(
  orderId,
  deliveryPartnerId,
  adminId,
  adminScope = {},
) {
  const assignmentEligibleStatuses = new Set(["confirmed", "preparing", "ready", "ready_for_pickup"]);
  const order = await FoodOrder.findById(orderId);
  if (!order) throw new NotFoundError("Order not found");
  const scope = normalizeAdminScope(adminScope);
  if (scope.isSubAdmin) {
    const orderZoneId = order?.zoneId ? String(order.zoneId) : "";
    const hasZoneAccess = scope.zoneIds.some((zid) => String(zid) === orderZoneId);
    if (!hasZoneAccess) throw new ForbiddenError("Sub-admin can only assign orders in assigned zones");
  }
  if (!assignmentEligibleStatuses.has(String(order.orderStatus || "").toLowerCase())) {
    throw new ValidationError("Only accepted/preparing/ready orders can be assigned to a delivery partner");
  }
  if (order.dispatch.status === "accepted")
    throw new ValidationError("Order already accepted by partner");

  const partner = await FoodDeliveryPartner.findById(deliveryPartnerId)
    .select("status zoneId")
    .lean();
  if (!partner || partner.status !== "approved")
    throw new ValidationError("Delivery partner not available");
  if (!partner.zoneId) {
    throw new ValidationError("Delivery partner is not mapped to any zone");
  }
  if (String(partner.zoneId) !== String(order.zoneId || "")) {
    throw new ValidationError("Delivery partner does not belong to this order zone");
  }

  const from = order.dispatch?.status || 'unassigned';
  order.dispatch.status = 'assigned';
  order.dispatch.deliveryPartnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
  order.dispatch.assignedAt = new Date();
  order.dispatch.acceptedAt = undefined;
  pushStatusHistory(order, { byRole: 'ADMIN', byId: adminId, from, to: 'assigned' });
  await order.save();

  await order.populate('dispatch.deliveryPartnerId', 'name phone zoneId');
  await notifyAssignedDeliveryPartner(order);
  enqueueOrderEvent('delivery_partner_assigned', {
      orderMongoId: order._id?.toString?.(),
      orderId: order.orderId,
      deliveryPartnerId,
      adminId
  });
  return order.toObject();
}

export async function resendAssignedDeliveryNotificationAdmin(orderId, adminId, adminScope = {}) {
  const assignmentEligibleStatuses = new Set(["confirmed", "preparing", "ready", "ready_for_pickup"]);
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity)
    .populate("dispatch.deliveryPartnerId", "name phone zoneId");
  if (!order) throw new NotFoundError("Order not found");
  const scope = normalizeAdminScope(adminScope);
  if (scope.isSubAdmin) {
    const orderZoneId = order?.zoneId ? String(order.zoneId) : "";
    const hasZoneAccess = scope.zoneIds.some((zid) => String(zid) === orderZoneId);
    if (!hasZoneAccess) throw new ForbiddenError("Sub-admin can only resend notifications in assigned zones");
  }
  if (!assignmentEligibleStatuses.has(String(order.orderStatus || "").toLowerCase())) {
    throw new ValidationError("Only accepted/preparing/ready orders can be resent to a delivery partner");
  }
  if (order.dispatch?.status !== "assigned" || !order.dispatch?.deliveryPartnerId) {
    throw new ValidationError("No assigned delivery partner found for resend");
  }

  await notifyAssignedDeliveryPartner(order);
  enqueueOrderEvent('delivery_partner_notification_resent', {
    orderMongoId: order._id?.toString?.(),
    orderId: order.orderId,
    deliveryPartnerId: order.dispatch.deliveryPartnerId?._id?.toString?.() || order.dispatch.deliveryPartnerId?.toString?.(),
    adminId,
  });

  return {
    success: true,
    order: order.toObject(),
  };
}

export async function deleteOrderAdmin(orderId, adminId, adminScope = {}) {
  const identity = buildOrderIdentityFilter(orderId);
  if (!identity) throw new ValidationError("Order id required");

  const order = await FoodOrder.findOne(identity).lean();
  if (!order) throw new NotFoundError("Order not found");
  const scope = normalizeAdminScope(adminScope);
  if (scope.isSubAdmin) {
    const orderZoneId = order?.zoneId ? String(order.zoneId) : "";
    const hasZoneAccess = scope.zoneIds.some((zid) => String(zid) === orderZoneId);
    if (!hasZoneAccess) throw new ForbiddenError("Sub-admin can only access assigned zones");
  }

  // Keep support tickets but detach deleted order reference.
  await Promise.all([
    FoodSupportTicket.updateMany(
      { orderId: order._id },
      { $set: { orderId: null } },
    ),
    FoodTransaction.deleteOne({
      $or: [{ orderId: order._id }, { orderReadableId: String(order.orderId) }],
    }),
    FoodOrder.deleteOne({ _id: order._id }),
  ]);

  // Remove realtime tracking node if present.
  try {
    const db = getFirebaseDB();
    if (db && order?.orderId) {
      await db.ref(`active_orders/${order.orderId}`).remove();
    }
  } catch (err) {
    logger.warn(`Delete order firebase cleanup failed: ${err?.message || err}`);
  }

  // Notify connected apps so stale UI entries can disappear without refresh.
  try {
    const io = getIO();
    if (io) {
      const payload = {
        orderMongoId: String(order._id),
        orderId: String(order.orderId || ""),
        deletedBy: "ADMIN",
        adminId: adminId ? String(adminId) : null,
      };

      if (order.userId) io.to(rooms.user(order.userId)).emit("order_deleted", payload);
      if (order.restaurantId) io.to(rooms.restaurant(order.restaurantId)).emit("order_deleted", payload);
      if (order.dispatch?.deliveryPartnerId) {
        io.to(rooms.delivery(order.dispatch.deliveryPartnerId)).emit("order_deleted", payload);
      }
    }
  } catch (err) {
    logger.warn(`Delete order socket emit failed: ${err?.message || err}`);
  }

  enqueueOrderEvent("order_deleted_by_admin", {
    orderMongoId: String(order._id),
    orderId: String(order.orderId || ""),
    adminId: adminId ? String(adminId) : null,
  });

  return {
    deleted: true,
    orderId: String(order.orderId || ""),
    orderMongoId: String(order._id),
  };
}



