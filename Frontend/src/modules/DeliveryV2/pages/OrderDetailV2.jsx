import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import {
  ArrowLeft,
  Clock3,
  MessageSquareText,
  Phone,
  RefreshCcw,
  Store,
  User,
} from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';

const INCOMING_ORDER_STORAGE_KEY = 'delivery_v2_incoming_order';
const ORDER_FOCUS_STORAGE_KEY = 'delivery_v2_order_focus';
const INCOMING_ORDER_TTL_MS = 2 * 60 * 1000;
const PASSED_ORDER_STORAGE_KEY = 'delivery_v2_last_passed_order_id';

const getOrderIdentity = (orderLike) =>
  String(
    orderLike?.orderMongoId ||
    orderLike?._id ||
    orderLike?.orderId ||
    orderLike?.id ||
    '',
  ).trim();

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeDialPhone = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const hasPlusPrefix = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return '';
  return hasPlusPrefix ? `+${digits}` : digits;
};

const getDisplayPhone = (value) =>
  String(value ?? '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getLocFromOrderRef = (ref, keysLat, keysLng) => {
  if (!ref) return null;
  if (ref.location) {
    if (Array.isArray(ref.location.coordinates) && ref.location.coordinates.length >= 2) {
      return {
        lat: ref.location.coordinates[1],
        lng: ref.location.coordinates[0],
      };
    }
    return {
      lat: ref.location.latitude || ref.location.lat,
      lng: ref.location.longitude || ref.location.lng,
    };
  }

  for (const key of keysLat) {
    if (ref[key] != null) {
      return {
        lat: ref[key],
        lng: ref[keysLng[keysLat.indexOf(key)]],
      };
    }
  }

  return null;
};

const hydrateDeliveryOrder = (rawOrder, fallbackOrderId) => {
  if (!rawOrder) return null;

  const restaurantLocation =
    rawOrder?.restaurantLocation ||
    getLocFromOrderRef(rawOrder?.restaurantId, ['latitude', 'lat'], ['longitude', 'lng']) ||
    getLocFromOrderRef(rawOrder, ['restaurant_lat', 'restaurantLat', 'latitude'], ['restaurant_lng', 'restaurantLng', 'longitude']);

  const customerLocation =
    rawOrder?.customerLocation ||
    getLocFromOrderRef(rawOrder?.deliveryAddress, ['latitude', 'lat'], ['longitude', 'lng']) ||
    getLocFromOrderRef(rawOrder, ['customer_lat', 'customerLat', 'latitude'], ['customer_lng', 'customerLng', 'longitude']);

  return {
    ...rawOrder,
    orderId: rawOrder?.orderId || fallbackOrderId || rawOrder?._id || rawOrder?.id,
    restaurantLocation,
    customerLocation,
  };
};

const deriveTripStatusFromOrder = (orderLike) => {
  const backendStatus = String(
    orderLike?.deliveryStatus ||
    orderLike?.orderState?.status ||
    orderLike?.orderStatus ||
    orderLike?.status ||
    '',
  ).toLowerCase();
  const currentPhase = String(orderLike?.deliveryState?.currentPhase || '').toLowerCase();

  if (['delivered', 'completed'].includes(backendStatus)) return 'COMPLETED';
  if (currentPhase === 'at_drop' || ['reached_drop', 'delivering', 'picked_up'].includes(backendStatus)) return 'PICKED_UP';
  if (currentPhase === 'at_pickup' || backendStatus === 'reached_pickup') return 'REACHED_PICKUP';
  return 'PICKING_UP';
};

const getRestaurantTitle = (order) =>
  order?.restaurantName ||
  order?.restaurantId?.restaurantName ||
  order?.restaurantId?.name ||
  'Restaurant order';

const getPaymentLabel = (order) => {
  const method = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase();
  if (method === 'cash' || method === 'cod') return 'Cash';
  if (method === 'wallet') return 'Wallet';
  if (!method) return 'Online';
  return `${method.charAt(0).toUpperCase()}${method.slice(1)}`;
};

const getOrderEventDate = (orderLike) =>
  orderLike?.cancelledAt ||
  orderLike?.deliveredAt ||
  orderLike?.updatedAt ||
  orderLike?.createdAt ||
  orderLike?.date ||
  null;

const getCustomerMeta = (order) => {
  const userObj = order?.user || order?.userId || order?.customer || order?.customerId || {};
  const deliveryAddress = order?.deliveryAddress || order?.address || {};
  const recipient = order?.recipient || order?.deliveryRecipient || {};

  const name = pickFirstText(
    order?.recipientName,
    recipient?.name,
    order?.customerName,
    deliveryAddress?.fullName,
    deliveryAddress?.name,
    deliveryAddress?.recipientName,
    deliveryAddress?.receiverName,
    deliveryAddress?.contactPersonName,
    order?.userName,
    userObj?.name,
    'Customer',
  );

  const phone = pickFirstText(
    order?.recipientPhone,
    recipient?.phone,
    order?.customerPhone,
    deliveryAddress?.phone,
    deliveryAddress?.recipientPhone,
    deliveryAddress?.receiverPhone,
    deliveryAddress?.contactPersonPhone,
    order?.userPhone,
    userObj?.phone,
    deliveryAddress?.contactNumber,
    deliveryAddress?.mobile,
  );

  return {
    name,
    phone,
    dialPhone: normalizeDialPhone(phone),
  };
};

const getAddressLabel = (address) =>
  pickFirstText(
    address?.fullAddress,
    address?.formattedAddress,
    address?.addressLine,
    address?.address,
    [
      address?.floor ? `Floor ${address.floor}` : '',
      address?.buildingName,
      address?.street,
      address?.additionalDetails,
      address?.landmark,
      address?.city,
      address?.state,
      address?.zipCode,
    ]
      .filter(Boolean)
      .join(', '),
    address?.street,
    address?.landmark,
    address?.label,
    'Address unavailable',
  );

const getAddressLabeledSegments = (address) => {
  if (!address || typeof address !== 'object') return [];

  const clean = (value) => String(value ?? '').trim();
  const label = clean(address?.label);
  const building = clean(address?.buildingName || address?.addressLine1);
  const floor = clean(address?.floor);
  const street = clean(address?.street || address?.addressLine2);
  const area = clean(address?.additionalDetails || address?.area);
  const landmark = clean(address?.landmark);
  const city = clean(address?.city);
  const state = clean(address?.state);
  const zipCode = clean(address?.zipCode || address?.postalCode || address?.pincode);
  const hasDistinctLandmark =
    landmark && (!area || landmark.toLowerCase() !== area.toLowerCase());

  const segments = [
    label ? { key: 'type', label: 'Type', value: label } : null,
    building ? { key: 'building', label: 'Building', value: building } : null,
    floor ? { key: 'floor', label: 'Floor/Flat', value: floor } : null,
    street ? { key: 'street', label: 'Street', value: street } : null,
    area ? { key: 'area', label: 'Area', value: area } : null,
    hasDistinctLandmark ? { key: 'landmark', label: 'Landmark', value: landmark } : null,
    city ? { key: 'city', label: 'City', value: city } : null,
    state ? { key: 'state', label: 'State', value: state } : null,
    zipCode ? { key: 'pincode', label: 'Pincode', value: zipCode } : null,
  ].filter(Boolean);

  if (segments.length > 0) return segments;

  const fallback = clean(getAddressLabel(address));
  return fallback && fallback !== 'Address unavailable'
    ? [{ key: 'address', label: 'Address', value: fallback }]
    : [];
};

const getDeliveryInstructions = (order) =>
  pickFirstText(
    order?.note,
    order?.instructions,
    order?.deliveryInstructions,
    order?.deliveryInstruction,
    order?.customerInstruction,
    order?.customerInstructions,
    order?.notes?.delivery,
    order?.notes?.customer,
    order?.deliveryAddress?.instructions,
    order?.deliveryAddress?.note,
  );

const getGoogleMapsHref = (location, addressText = '') => {
  const lat = Number(location?.lat);
  const lng = Number(location?.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  const query = String(addressText || '').trim();
  if (!query) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const getDispatchStatus = (order) =>
  String(order?.dispatch?.status || order?.queueStatus || '').toLowerCase();

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatMoney = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

const getPaymentMethodMeta = (orderLike) => {
  const method = String(orderLike?.payment?.method || orderLike?.paymentMethod || '').toLowerCase();
  if (method === 'cash' || method === 'cod') {
    return { label: 'Cash on Delivery', tone: 'amber' };
  }
  if (method === 'wallet') {
    return { label: 'Wallet', tone: 'emerald' };
  }
  if (!method) {
    return { label: 'Online', tone: 'blue' };
  }
  return { label: 'Online', tone: 'blue' };
};

const getPaymentStatusMeta = (orderLike) => {
  const status = String(orderLike?.payment?.status || '').toLowerCase();
  if (!status) return { label: 'Status Pending', tone: 'slate' };
  if (['paid', 'authorized', 'captured', 'settled'].includes(status)) {
    return { label: 'Paid', tone: 'emerald' };
  }
  if (status === 'failed') return { label: 'Payment Failed', tone: 'rose' };
  if (status === 'refunded') return { label: 'Refunded', tone: 'blue' };
  if (status === 'cod_pending' || status === 'created' || status === 'pending_qr') {
    return { label: 'Payment Pending', tone: 'amber' };
  }
  return { label: status.replace(/_/g, ' '), tone: 'slate' };
};

const getPickupContactMeta = (order) => {
  const restaurantObj = order?.restaurantId || {};
  const name = pickFirstText(
    order?.restaurantContactName,
    restaurantObj?.contactPersonName,
    restaurantObj?.ownerName,
    restaurantObj?.name,
    order?.restaurantName,
    'Restaurant',
  );
  const phone = pickFirstText(
    order?.restaurantPhone,
    restaurantObj?.phone,
    restaurantObj?.contactNumber,
    restaurantObj?.mobile,
  );

  return {
    name,
    phone,
    dialPhone: normalizeDialPhone(phone),
  };
};

const getItemVariantLabel = (item = {}) => {
  const parts = [
    item?.variantName,
    item?.selectedVariantName,
    item?.selectedVariant?.name,
    item?.variationName,
    item?.sizeName,
    item?.size?.name,
    item?.variant?.name,
    item?.portion,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const addons = Array.isArray(item?.addons)
    ? item.addons
        .map((addon) => String(addon?.name || addon?.title || addon?.addonName || '').trim())
        .filter(Boolean)
    : [];

  if (addons.length) parts.push(`Add-ons: ${addons.join(', ')}`);
  return parts.join(' | ');
};

const getItemQuantity = (item = {}) => Math.max(1, Number(item?.quantity || item?.qty || 1));

const getItemUnitPrice = (item = {}) =>
  toFiniteNumber(
    item?.unitPrice ??
    item?.price ??
    item?.variantPrice ??
    item?.selectedVariant?.price ??
    item?.variant?.price,
  ) || 0;

const getItemLineTotal = (item = {}) => {
  const directLineTotal = toFiniteNumber(item?.lineTotal ?? item?.totalPrice ?? item?.subtotal ?? item?.amount);
  if (directLineTotal != null) return directLineTotal;
  return getItemUnitPrice(item) * getItemQuantity(item);
};

const StatusPill = ({ tone = 'slate', children }) => {
  const tones = {
    brand: 'border-[#005128]/10 bg-[#005128]/5 text-[#005128]',
    blue: 'border-sky-100 bg-sky-50 text-sky-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    rose: 'border-rose-100 bg-rose-50 text-rose-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${tones[tone] || tones.slate}`}>
      {children}
    </span>
  );
};

const CompactSection = ({ title, icon: Icon, children, action }) => (
  <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-[#005128]">
          {Icon && <Icon className="h-4 w-4" />}
        </div>
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const ActionButton = ({ disabled, busy, onClick, children, variant = 'primary' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    className={`w-full rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.98] ${
      disabled || busy
        ? 'cursor-not-allowed bg-slate-100 text-slate-400'
        : variant === 'primary'
        ? 'bg-[#005128] text-white shadow-lg shadow-[#005128]/20'
        : 'bg-white border border-slate-200 text-slate-700'
    }`}
  >
    {busy ? (
      <div className="flex items-center justify-center gap-2">
        <RefreshCcw className="h-4 w-4 animate-spin" />
        <span>Updating...</span>
      </div>
    ) : (
      children
    )}
  </button>
);

const OrderDetailV2 = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { setActiveOrder, updateTripStatus, clearActiveOrder } = useDeliveryStore();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');

  const syncStoreWithOrder = useCallback((nextOrder) => {
    if (!nextOrder) return;
    const normalized = hydrateDeliveryOrder(nextOrder, getOrderIdentity(nextOrder));
    setActiveOrder(normalized);
    updateTripStatus(deriveTripStatusFromOrder(normalized));
  }, [setActiveOrder, updateTripStatus]);

  const applyResolvedOrder = useCallback((rawOrder) => {
    const hydratedOrder = hydrateDeliveryOrder(rawOrder, String(orderId || '').trim());
    if (!hydratedOrder) {
      setOrder(null);
      return null;
    }

    setOrder(hydratedOrder);
    const status = String(hydratedOrder?.status || hydratedOrder?.orderStatus || '').toLowerCase();
    if (!['cancelled', 'delivered', 'completed'].includes(status) || getDispatchStatus(hydratedOrder) === 'accepted') {
      syncStoreWithOrder(hydratedOrder);
    }
    if (['delivered', 'completed', 'cancelled'].includes(status)) {
      clearActiveOrder();
    }
    return hydratedOrder;
  }, [clearActiveOrder, orderId, syncStoreWithOrder]);

  const fetchOrderDetails = useCallback(async (silent = false) => {
    if (!orderId) return;

    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await deliveryAPI.getOrderDetails(orderId);
      const detailedOrder =
        response?.data?.data?.order ||
        response?.data?.data?.activeOrder ||
        response?.data?.data ||
        null;

      if (detailedOrder) {
        applyResolvedOrder(detailedOrder);
      } else if (!silent) {
        setOrder(null);
      }
    } catch (error) {
      console.warn('[OrderDetailV2] Failed to load order details:', error?.message || error);
      if (!silent) {
        toast.error('Failed to load order details');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applyResolvedOrder, orderId]);

  useEffect(() => {
    void fetchOrderDetails();
  }, [fetchOrderDetails]);

  useEffect(() => {
    const poller = window.setInterval(() => {
      if (!document.hidden) {
        void fetchOrderDetails(true);
      }
    }, 8000);

    return () => window.clearInterval(poller);
  }, [fetchOrderDetails]);

  const currentStatus = useMemo(() => {
    const rawStatus = String(order?.status || order?.orderStatus || '').toLowerCase();
    const phase = String(order?.deliveryState?.currentPhase || '').toLowerCase();
    const dispatchStatus = getDispatchStatus(order);

    if (rawStatus === 'cancelled') return { label: 'Cancelled', tone: 'rose' };
    if (['delivered', 'completed'].includes(rawStatus)) return { label: 'Delivered', tone: 'emerald' };
    if (phase === 'at_drop' || rawStatus === 'reached_drop') return { label: 'Reached customer', tone: 'blue' };
    if (['picked_up', 'delivering'].includes(rawStatus)) return { label: 'Picked', tone: 'blue' };
    if (phase === 'at_pickup' || rawStatus === 'reached_pickup') return { label: 'Arrived at pickup', tone: 'amber' };
    if (dispatchStatus === 'accepted') return { label: 'Accepted', tone: 'brand' };
    if (dispatchStatus === 'unassigned') return { label: 'Passed Task', tone: 'amber' };
    if (dispatchStatus) return { label: dispatchStatus.toUpperCase(), tone: 'amber' };
    return { label: 'New Request', tone: 'brand' };
  }, [order]);

  const customerMeta = useMemo(() => getCustomerMeta(order), [order]);
  const paymentMethodMeta = useMemo(() => getPaymentMethodMeta(order), [order]);
  const paymentStatusMeta = useMemo(() => getPaymentStatusMeta(order), [order]);
  const restaurantLocation = order?.restaurantLocation;
  const customerLocation = order?.customerLocation;
  const restaurantAddress = pickFirstText(
    order?.restaurantAddress,
    order?.restaurantId?.address,
    order?.restaurantId?.locationText,
    order?.restaurantId?.city,
    'Restaurant location unavailable',
  );
  const customerAddress = getAddressLabel(order?.deliveryAddress || order?.address || {});
  const customerAddressSegments = useMemo(
    () => getAddressLabeledSegments(order?.deliveryAddress || order?.address || {}),
    [order],
  );
  const deliveryInstructions = useMemo(() => getDeliveryInstructions(order), [order]);
  const dropMapHref = getGoogleMapsHref(customerLocation, customerAddress);
  const pickupMeta = useMemo(() => getPickupContactMeta(order), [order]);
  const pickupDisplayPhone = getDisplayPhone(pickupMeta.phone);
  const customerDisplayPhone = getDisplayPhone(customerMeta.phone);
  const orderItems = useMemo(
    () => (Array.isArray(order?.items) ? order.items : []),
    [order],
  );
  const subtotal = useMemo(() => {
    const directSubtotal = toFiniteNumber(
      order?.pricing?.subtotal ??
      order?.pricing?.itemsTotal ??
      order?.itemSubtotal ??
      order?.subtotal,
    );
    if (directSubtotal != null) return directSubtotal;
    return orderItems.reduce((sum, item) => sum + getItemLineTotal(item), 0);
  }, [order, orderItems]);
  const deliveryCharge = toFiniteNumber(
    order?.pricing?.deliveryFee ??
    order?.deliveryCharge ??
    order?.deliveryFee,
  ) || 0;
  const grandTotal = toFiniteNumber(
    order?.pricing?.total ??
    order?.totalAmount ??
    order?.total ??
    order?.amount,
  ) ?? Math.max(0, subtotal + deliveryCharge);

  const openOrderMapInApp = useCallback(() => {
    const targetOrderId = getOrderIdentity(order) || String(orderId || '').trim();
    if (!targetOrderId) return;
    try {
      localStorage.setItem(ORDER_FOCUS_STORAGE_KEY, targetOrderId);
    } catch {
      // Ignore storage errors.
    }
    if (order) syncStoreWithOrder(order);
    navigate('/food/delivery/feed');
  }, [navigate, order, orderId, syncStoreWithOrder]);

  const runAction = useCallback(async (actionKey, runner, successMessage, options = {}) => {
    const { skipRefresh = false, onSuccess } = options;
    if (!order) return;
    setBusyAction(actionKey);
    try {
      await runner();
      toast.success(successMessage);
      if (typeof onSuccess === 'function') {
        onSuccess();
      }
      if (!skipRefresh) {
        await fetchOrderDetails(true);
      }
    } catch (error) {
      toast.error('Status update failed');
    } finally {
      setBusyAction('');
    }
  }, [fetchOrderDetails, order]);

  const dispatchStatus = getDispatchStatus(order);
  const rawStatus = String(order?.status || order?.orderStatus || '').toLowerCase();
  const phase = String(order?.deliveryState?.currentPhase || '').toLowerCase();
  const isClosedOrder = ['cancelled', 'delivered', 'completed'].includes(rawStatus);
  const hasReachedPickup =
    phase === 'at_pickup' ||
    ['reached_pickup', 'picked_up', 'delivering', 'reached_drop', 'delivered', 'completed'].includes(rawStatus);
  const hasPickedOrder =
    ['picked_up', 'delivering', 'reached_drop', 'delivered', 'completed'].includes(rawStatus) ||
    phase === 'at_drop';
  const hasReachedDrop =
    rawStatus === 'reached_drop' ||
    phase === 'at_drop' ||
    ['delivered', 'completed'].includes(rawStatus);

  const handleAccept = useCallback(() => runAction(
    'accept',
    async () => {
      const response = await deliveryAPI.acceptOrder(orderId);
      const nextOrder = response?.data?.data?.order || order;
      syncStoreWithOrder(nextOrder);
    },
    'Order accepted',
  ), [order, orderId, runAction, syncStoreWithOrder]);

  const handlePassTask = useCallback(() => {
    const passedOrderId = getOrderIdentity(order) || String(orderId || '').trim();
    return runAction(
      'pass-task',
      async () => {
        await deliveryAPI.rejectOrder(orderId, { reasonType: 'passed' });
        clearActiveOrder();
      },
      'Task passed to admin',
      {
        skipRefresh: true,
        onSuccess: () => {
          try {
            if (passedOrderId) {
              sessionStorage.setItem(PASSED_ORDER_STORAGE_KEY, passedOrderId);
            }
          } catch {
            // Ignore storage errors.
          }
          try {
            localStorage.removeItem(INCOMING_ORDER_STORAGE_KEY);
            const focusedOrderId = localStorage.getItem(ORDER_FOCUS_STORAGE_KEY) || '';
            if (focusedOrderId === passedOrderId) {
              localStorage.removeItem(ORDER_FOCUS_STORAGE_KEY);
            }
          } catch {
            // Ignore storage errors.
          }
          navigate('/food/delivery/orders', { replace: true });
        },
      },
    );
  }, [clearActiveOrder, navigate, order, orderId, runAction]);

  const handlePicked = useCallback(() => runAction(
    'picked',
    async () => {
      // Keep backend transition valid: rider must reach pickup before marking picked.
      await deliveryAPI.confirmReachedPickup(orderId);
      await deliveryAPI.confirmOrderId(
        orderId,
        order?.displayOrderId || orderId,
        useDeliveryStore.getState().riderLocation || {},
        {},
      );
    },
    'Order marked as picked',
  ), [order, orderId, runAction]);

  const handleArriveDrop = useCallback(() => runAction(
    'drop-arrival',
    async () => {
      await deliveryAPI.confirmReachedDrop(orderId);
    },
    'Customer arrival updated',
  ), [orderId, runAction]);

  const handleDelivered = useCallback(() => runAction(
    'delivered',
    async () => {
      await deliveryAPI.completeDelivery(orderId, { rating: 5 });
      clearActiveOrder();
    },
    'Order delivered',
  ), [clearActiveOrder, orderId, runAction]);

  const handleReachedAndDelivered = useCallback(() => runAction(
    'reached-and-delivered',
    async () => {
      if (!hasReachedDrop) {
        await deliveryAPI.confirmReachedDrop(orderId);
      }
      await deliveryAPI.completeDelivery(orderId, { rating: 5 });
      clearActiveOrder();
    },
    'Reached location and delivered',
  ), [clearActiveOrder, hasReachedDrop, orderId, runAction]);
  const isPassedTaskFlow = dispatchStatus === 'unassigned' && !isClosedOrder;

  const canAccept = order && dispatchStatus === 'assigned' && !isClosedOrder;
  const isAcceptedFlow = dispatchStatus === 'accepted' && !isClosedOrder;

  const sliderStepConfig = useMemo(() => {
    if (!isAcceptedFlow || isPassedTaskFlow) return null;
    if (!hasPickedOrder) {
      return {
        key: 'picked',
        label: 'Slide to mark Picked Up',
        successLabel: 'Picked Up Done',
        run: handlePicked,
      };
    }
    return {
      key: 'reached-and-delivered',
      label: 'Slide to mark Reached Location & Delivered',
      successLabel: 'Reached & Delivered',
      run: handleReachedAndDelivered,
    };
  }, [
    handleReachedAndDelivered,
    handlePicked,
    hasPickedOrder,
    isAcceptedFlow,
    isPassedTaskFlow,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-4">
          <div className="h-48 w-full animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-24 w-full animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-24 w-full animate-pulse rounded-3xl bg-slate-100" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[32px] bg-white p-8 text-center shadow-sm border border-slate-100">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 text-slate-400">
            <Clock3 className="h-8 w-8" />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-slate-950">Order not found</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 px-4">
            Yeh order abhi available nahi hai ya shayad complete ho chuka hai.
          </p>
          <button
            type="button"
            onClick={() => navigate('/food/delivery/orders')}
            className="mt-8 w-full rounded-2xl bg-[#005128] py-4 text-sm font-semibold text-white"
          >
            Go back to orders list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 touch-pan-y">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="mx-auto max-w-lg flex items-center gap-3 px-5 h-16">
          <button
            type="button"
            onClick={() => navigate('/food/delivery/orders')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 active:scale-90 transition-transform"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>
          <div className="flex flex-col">
            <span className="text-base font-semibold tracking-tight text-slate-800">Order Detail</span>
            <span className="text-xs font-bold text-[#005128]">{order?.displayOrderId ? `#${order.displayOrderId}` : '--'}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-4 pt-4 space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900">{getRestaurantTitle(order)}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill tone={paymentMethodMeta.tone}>{paymentMethodMeta.label}</StatusPill>
                <StatusPill tone={paymentStatusMeta.tone}>{paymentStatusMeta.label}</StatusPill>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {getOrderEventDate(order) ? new Date(getOrderEventDate(order)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Order ID: {order?.displayOrderId ? `#${order.displayOrderId}` : String(orderId || '--')}
              </p>
            </div>
            <StatusPill tone={currentStatus.tone}>{currentStatus.label}</StatusPill>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-slate-500">Earning</p>
              <p className="mt-0.5 text-base font-extrabold text-slate-900">{formatMoney(order?.riderEarning || order?.deliveryEarning || 0)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-slate-500">Items</p>
              <p className="mt-0.5 text-base font-extrabold text-slate-900">{orderItems.length || Number(order?.itemCount || 0)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5">
              <p className="text-slate-500">Total</p>
              <p className="mt-0.5 text-base font-extrabold text-slate-900">{formatMoney(grandTotal)}</p>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          {canAccept && !isPassedTaskFlow && (
            <>
              <div className="grid grid-cols-1 gap-2">
                <ActionButton busy={busyAction === 'accept'} onClick={handleAccept}>
                  Accept Order
                </ActionButton>
              </div>
              <button
                type="button"
                onClick={handlePassTask}
                disabled={busyAction === 'pass-task'}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-60"
              >
                {busyAction === 'pass-task' ? 'Passing task...' : 'Pass this task'}
              </button>
            </>
          )}

          {isAcceptedFlow && !isPassedTaskFlow && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <ActionSlider
                key={sliderStepConfig?.key || 'status-slider'}
                label={busyAction ? 'Updating...' : sliderStepConfig?.label || 'Slide to update'}
                successLabel={sliderStepConfig?.successLabel || 'Done'}
                disabled={!sliderStepConfig || Boolean(busyAction)}
                onConfirm={async () => {
                  if (!sliderStepConfig?.run) return;
                  await sliderStepConfig.run();
                }}
                color="bg-[#005128]"
                containerStyle={{ backgroundColor: '#E8F3EE' }}
                style={{ background: 'linear-gradient(135deg, #005128 0%, #0A7A45 100%)' }}
              />
            </div>
          )}
          {isPassedTaskFlow && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
              This task has been passed to admin. Order details are hidden for this rider.
            </div>
          )}

        </section>

        {!isPassedTaskFlow && dropMapHref && !isClosedOrder && (
          <button
            type="button"
            onClick={openOrderMapInApp}
            className="w-full rounded-xl bg-[#16a34a] px-4 py-3 text-sm font-semibold text-white"
          >
            View in map
          </button>
        )}

        {!isPassedTaskFlow && (
          <>
            <CompactSection
              title="Pickup Address"
              icon={Store}
            >
              <p className="text-sm leading-5 text-slate-800">{restaurantAddress}</p>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600">
                <p>
                  <span className="mr-1 inline-flex items-center rounded-md bg-[#E6F4EC] px-1.5 py-0.5 text-[11px] font-bold text-[#005128]">Recipient</span>
                  <span className="font-semibold text-slate-900">{pickupMeta.name || '--'}</span>
                </p>
                <p className="flex items-center gap-2">
                  <span>
                    <span className="mr-1 inline-flex items-center rounded-md bg-[#E6F4EC] px-1.5 py-0.5 text-[11px] font-bold text-[#005128]">Number</span>
                    <span className="font-semibold text-slate-900">{pickupDisplayPhone || '--'}</span>
                  </span>
                  {pickupMeta.dialPhone && (
                    <a href={`tel:${pickupMeta.dialPhone}`} className="inline-flex items-center font-medium text-[#005128]">
                      <Phone className="mr-1 h-3.5 w-3.5" /> Call
                    </a>
                  )}
                </p>
              </div>
            </CompactSection>

            <CompactSection
              title="Delivered Address"
              icon={User}
            >
              <div className="mb-2 grid grid-cols-1 gap-1 text-xs text-slate-600">
                <p>
                  <span className="mr-1 inline-flex items-center rounded-md bg-[#E6F4EC] px-1.5 py-0.5 text-[11px] font-bold text-[#005128]">Recipient</span>
                  <span className="font-semibold text-slate-900">{customerMeta.name || '--'}</span>
                </p>
                <p className="flex items-center gap-2">
                  <span>
                    <span className="mr-1 inline-flex items-center rounded-md bg-[#E6F4EC] px-1.5 py-0.5 text-[11px] font-bold text-[#005128]">Number</span>
                    <span className="font-semibold text-slate-900">{customerDisplayPhone || '--'}</span>
                  </span>
                  {customerMeta.dialPhone && (
                    <a href={`tel:${customerMeta.dialPhone}`} className="inline-flex items-center font-medium text-[#005128]">
                      <Phone className="mr-1 h-3.5 w-3.5" /> Call
                    </a>
                  )}
                </p>
              </div>
              {customerAddressSegments.length > 0 ? (
                <div className="space-y-1.5">
                  {customerAddressSegments.map((segment) => (
                    <p key={segment.key} className="text-sm leading-5 text-slate-900">
                      <span className="mr-1.5 rounded-md bg-[#E6F4EC] px-1.5 py-0.5 text-xs font-bold text-[#005128]">
                        {segment.label}
                      </span>
                      <span className="font-semibold text-slate-900">{segment.value}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-5 text-slate-800">{customerAddress}</p>
              )}
            </CompactSection>

            {deliveryInstructions && (
              <CompactSection
                title="Delivery Instructions"
                icon={MessageSquareText}
              >
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3.5 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-700">
                    Customer note
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-slate-900">
                    "{deliveryInstructions}"
                  </p>
                </div>
              </CompactSection>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">Order Details</h3>
              {orderItems.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="w-20 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Qty</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Item</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderItems.map((item, index) => {
                        const itemName = pickFirstText(item?.name, item?.foodName, item?.title, `Item ${index + 1}`);
                        const qty = getItemQuantity(item);
                        const variantLabel = getItemVariantLabel(item);

                        return (
                          <tr key={`${itemName}-${index}`} className="align-top">
                            <td className="px-3 py-2.5 font-semibold text-slate-800">{qty}</td>
                            <td className="px-3 py-2.5">
                              <p className="break-words font-medium text-slate-900">
                                {itemName}
                                {variantLabel ? <span className="text-slate-600"> ({variantLabel})</span> : null}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Item details not available.</p>
              )}

              <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
                <div className="flex items-center justify-between font-semibold text-slate-900">
                  <span>Total Amount</span>
                  <span>{formatMoney(grandTotal)}</span>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderDetailV2;
