import mongoose from 'mongoose';
import { FoodOrder } from '../models/order.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodFeeSettings } from '../../admin/models/feeSettings.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { RestaurantOffer } from '../../restaurant/models/restaurantOffer.model.js';
import { RestaurantOfferUsage } from '../../restaurant/models/restaurantOfferUsage.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

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
  console.log('🔍 Finding restaurant offer:', {
    restaurantId,
    itemCount: items.length,
    userId: userId || 'NOT PROVIDED',
    userIdType: typeof userId
  });
  
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
    ) {
      continue;
    }

    if (userId && Number(offer?.perUserLimit) > 0) {
      const usage = await RestaurantOfferUsage.findOne({
        offerId: offer._id,
        userId,
      }).lean();
      
      console.log('🔍 Checking offer usage:', {
        offerTitle: offer.title,
        offerId: offer._id,
        userId,
        perUserLimit: offer.perUserLimit,
        currentUsage: usage?.count || 0,
        shouldSkip: usage && Number(usage.count) >= Number(offer.perUserLimit)
      });
      
      if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
        console.log('⏭️  Skipping offer - user already used it');
        // Don't show this offer at all - return null immediately
        return null;
      }
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

export async function calculateOrderPricing(userId, dto) {
  const restaurant = await FoodRestaurant.findById(dto.restaurantId)
    .select("status")
    .lean();
  if (!restaurant) throw new ValidationError("Restaurant not found");
  if (restaurant.status !== "approved")
    throw new ValidationError("Restaurant not available");

  const items = Array.isArray(dto.items) ? dto.items : [];
  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 1),
    0,
  );

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

  const packagingFee = 0;
  const platformFee = Number(feeSettings.platformFee || 0);

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
        ) {
          continue;
        }
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
        if (offer) {
            const approvalOk = (offer.approvalStatus || 'approved') === 'approved';
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
      ) {
        usageOk = false;
      }

      let perUserOk = true;
      if (userId && Number(offer.perUserLimit) > 0) {
        const usage = await FoodOfferUsage.findOne({
          offerId: offer._id,
          userId,
        }).lean();
        if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
          perUserOk = false;
        }
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

  const autoOfferMatch = await findApplicableRestaurantAutoOffer(dto.restaurantId, items, userId);
  let autoOfferFeedback = null;
  
  // If user has applied a coupon, don't apply auto-offer (one discount at a time)
  const hasCouponApplied = codeRaw && appliedCoupon;
  
  if (!hasCouponApplied && autoOfferMatch?.offer && !autoOfferMatch?.invalidReason) {
    autoOfferDiscount = autoOfferMatch.discount;
    autoAppliedOffer = {
      code: null,
      title: autoOfferMatch.offer.title || 'Restaurant offer',
      discount: autoOfferDiscount,
      type: 'restaurant-auto-offer',
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
  } else if (hasCouponApplied && autoOfferMatch?.offer) {
    // Coupon applied, so offer is suppressed
    autoOfferFeedback = {
      type: 'restaurant-auto-offer',
      reason: 'coupon_applied',
      title: autoOfferMatch.offer?.title || 'Restaurant offer',
      offerId: String(autoOfferMatch.offer?._id || ''),
      discount: autoOfferMatch.discount || 0,
      message: 'Remove coupon to use restaurant offer',
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
      total,
      currency: "INR",
      couponCode: appliedCoupon?.code || codeRaw || null,
      appliedCoupon,
      autoAppliedOffer,
      autoOfferFeedback,
    },
  };
}
