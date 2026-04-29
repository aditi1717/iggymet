import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { useProximityCheck } from '@/modules/DeliveryV2/hooks/useProximityCheck';
import { useOrderManager } from '@/modules/DeliveryV2/hooks/useOrderManager';
import { useDeliveryNotifications } from '@food/hooks/useDeliveryNotifications';
import { writeOrderTracking } from '@food/realtimeTracking';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { BRAND_THEME } from '@/config/brandTheme';
import { useNavigate } from 'react-router-dom';

// Components
import LiveMap from '@/modules/DeliveryV2/components/map/LiveMap';

// Sub Pages
import PocketV2 from '@/modules/DeliveryV2/pages/PocketV2';
import HistoryV2 from '@/modules/DeliveryV2/pages/HistoryV2';
import ProfileV2 from '@/modules/DeliveryV2/pages/ProfileV2';
import ExploreV2 from '@/modules/DeliveryV2/pages/ExploreV2';

// Utils
import { getHaversineDistance, calculateETA, calculateHeading } from '@/modules/DeliveryV2/utils/geo';
import { useCompanyName } from "@food/hooks/useCompanyName";

// Icons
import {
  HelpCircle, AlertTriangle,
  Wallet, History, User as UserIcon, LayoutGrid,
  Plus, Minus, Navigation2, Target, Play, Clock,
  Contact, Package, RefreshCcw
} from 'lucide-react';

const INCOMING_ORDER_STORAGE_KEY = 'delivery_v2_incoming_order';
const INCOMING_ORDER_TTL_MS = 2 * 60 * 1000;
const ORDER_FOCUS_STORAGE_KEY = 'delivery_v2_order_focus';
const PASSED_ORDER_STORAGE_KEY = 'delivery_v2_last_passed_order_id';
const ORDER_SYNC_POLL_CONNECTED_MS = 12000;
const ORDER_SYNC_POLL_DISCONNECTED_MS = 8000;

const getOrderIdentity = (orderLike) =>
  String(
    orderLike?.orderMongoId ||
    orderLike?._id ||
    orderLike?.orderId ||
    orderLike?.id ||
    '',
  ).trim();

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

const getClosedOrderStatusMeta = (statusLike) => {
  const normalizedStatus = String(statusLike || '').toLowerCase();

  if (normalizedStatus === 'user_unavailable_review') {
    return {
      label: 'Awaiting Admin Review',
      toneClass: 'border-amber-100 bg-amber-50 text-amber-700',
    };
  }

  if (normalizedStatus === 'cancelled_by_user_unavailable') {
    return {
      label: 'User Unavailable',
      toneClass: 'border-rose-100 bg-rose-50 text-rose-700',
    };
  }

  if (
    normalizedStatus === 'cancelled' ||
    normalizedStatus === 'rejected' ||
    normalizedStatus === 'deleted' ||
    normalizedStatus.startsWith('cancelled_by_')
  ) {
    return {
      label: 'Cancelled',
      toneClass: 'border-rose-100 bg-rose-50 text-rose-700',
    };
  }

  return {
    label: 'Delivered',
    toneClass: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  };
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
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const getOrderDisplayId = (orderLike) =>
  String(
    orderLike?.displayOrderId ||
    orderLike?.orderCode ||
    orderLike?.orderNumber ||
    orderLike?.orderId ||
    orderLike?._id ||
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

const getOrderItemsList = (orderLike) => {
  if (Array.isArray(orderLike?.items) && orderLike.items.length) return orderLike.items;
  if (Array.isArray(orderLike?.orderItems) && orderLike.orderItems.length) return orderLike.orderItems;
  if (Array.isArray(orderLike?.cartItems) && orderLike.cartItems.length) return orderLike.cartItems;
  if (Array.isArray(orderLike?.products) && orderLike.products.length) return orderLike.products;
  return [];
};

const getOrderItemSummary = (orderLike, maxItems = 2) => {
  const items = getOrderItemsList(orderLike);
  if (!items.length) return '';

  const chunks = items.slice(0, maxItems).map((item, index) => {
    const qty = Math.max(1, Number(item?.quantity || item?.qty || 1));
    const itemName = pickFirstText(item?.name, item?.foodName, item?.title, item?.productName, `Item ${index + 1}`);
    return `${qty}x ${itemName}`;
  });

  if (items.length > maxItems) chunks.push(`+${items.length - maxItems} more`);
  return chunks.join(' + ');
};

const isSameCalendarDay = (leftDate, rightDate = new Date()) => {
  const left = new Date(leftDate);
  const right = new Date(rightDate);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

const getOrderEventDate = (orderLike) =>
  orderLike?.cancelledAt ||
  orderLike?.deliveredAt ||
  orderLike?.updatedAt ||
  orderLike?.createdAt ||
  orderLike?.date ||
  null;

const isClosedOrderLike = (orderLike) => {
  const status = String(
    orderLike?.status ||
    orderLike?.orderStatus ||
    orderLike?.deliveryStatus ||
    '',
  ).toLowerCase();
  return (
    [
      'delivered',
      'completed',
      'cancelled',
      'deleted',
      'rejected',
      'user_unavailable_review',
      'cancelled_by_user_unavailable',
    ].includes(status) ||
    status.startsWith('cancelled_by_')
  );
};

const normalizeQueueStatus = (orderLike) =>
  String(orderLike?.dispatch?.status || orderLike?.queueStatus || '').toLowerCase();

const getOrderProgressLabel = (orderLike) => {
  const backendStatus = String(
    orderLike?.deliveryStatus ||
    orderLike?.orderState?.status ||
    orderLike?.orderStatus ||
    orderLike?.status ||
    '',
  ).toLowerCase();
  const phase = String(orderLike?.deliveryState?.currentPhase || '').toLowerCase();

  if (['delivered', 'completed'].includes(backendStatus)) return 'Delivered';
  if (backendStatus === 'user_unavailable_review') return 'Awaiting admin review';
  if (backendStatus === 'cancelled_by_user_unavailable') return 'User unavailable';
  if (['cancelled', 'rejected'].includes(backendStatus) || backendStatus.startsWith('cancelled_by_')) return 'Cancelled';
  if (phase === 'at_drop' || backendStatus === 'reached_drop') return 'Arrived at delivery location';
  if (['picked_up', 'delivering'].includes(backendStatus)) return 'Picked up';
  if (phase === 'at_pickup' || backendStatus === 'reached_pickup') return 'Arrived at pickup';
  if (backendStatus === 'accepted') return 'Accepted';
  if (backendStatus === 'assigned') return 'Assigned';
  return 'Picking up';
};

const isSameQueueSnapshot = (left = [], right = []) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftOrder = left[index];
    const rightOrder = right[index];
    if (getOrderIdentity(leftOrder) !== getOrderIdentity(rightOrder)) return false;
    if (normalizeQueueStatus(leftOrder) !== normalizeQueueStatus(rightOrder)) return false;
  }
  return true;
};

function OrdersTabV2({
  activeOrder,
  incomingOrder,
  advancedOrders,
  todayHistoryOrders,
  onRefreshOrders,
  onOpenOrderDetail,
  onAcceptQueuedOrder,
  onPassQueuedOrder,
  actionBusyOrderId,
  actionBusyType,
}) {
  const currentActiveOrder = activeOrder && !isClosedOrderLike(activeOrder) && isSameCalendarDay(getOrderEventDate(activeOrder)) ? activeOrder : null;
  const currentIncomingOrder = incomingOrder && isSameCalendarDay(getOrderEventDate(incomingOrder)) ? incomingOrder : null;
  const currentQueuedOrders = advancedOrders.filter((order) => isSameCalendarDay(getOrderEventDate(order)));
  const currentOrderId = getOrderIdentity(currentActiveOrder);
  const currentIncomingOrderId = getOrderIdentity(currentIncomingOrder);
  const dedupedQueuedOrders = currentQueuedOrders.filter((order) => {
    const orderId = getOrderIdentity(order);
    if (!orderId) return false;
    if (orderId === currentOrderId) return false;
    if (currentIncomingOrderId && orderId === currentIncomingOrderId) return false;
    return true;
  });
  const incomingOrders = useMemo(() => {
    const list = [];
    if (currentIncomingOrder && normalizeQueueStatus(currentIncomingOrder) === 'assigned') {
      list.push(currentIncomingOrder);
    }
    dedupedQueuedOrders.forEach((order) => {
      if (normalizeQueueStatus(order) === 'assigned') list.push(order);
    });
    const seen = new Set();
    return list.filter((order) => {
      const orderId = getOrderIdentity(order);
      if (!orderId || seen.has(orderId)) return false;
      seen.add(orderId);
      return true;
    });
  }, [currentIncomingOrder, dedupedQueuedOrders]);
  const liveOrders = useMemo(
    () => dedupedQueuedOrders.filter((order) => normalizeQueueStatus(order) === 'accepted'),
    [dedupedQueuedOrders],
  );
  const totalVisibleOrders = (currentActiveOrder ? 1 : 0) + incomingOrders.length + liveOrders.length;
  const todayHistoryCount = Array.isArray(todayHistoryOrders) ? todayHistoryOrders.length : 0;
  const [ordersViewTab, setOrdersViewTab] = useState('live');

  const Card = ({
    title,
    subtitle,
    itemLine,
    amount,
    badge,
    orderDisplayId,
    tone = 'slate',
    statusLabel,
    statusTone = 'emerald',
    onClick,
    actionText,
  }) => {
    const toneClasses = {
      emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
      amber: 'border-amber-100 bg-amber-50 text-amber-700',
      slate: 'border-slate-200 bg-white text-slate-700',
      blue: 'border-sky-100 bg-sky-50 text-sky-700',
    };

    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.045)] text-left active:scale-[0.99] transition-all"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {badge && (
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${toneClasses[tone] || toneClasses.slate}`}>
                {badge}
              </span>
            )}
            {orderDisplayId ? (
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950 truncate">
                Order #{orderDisplayId}
              </p>
            ) : null}
            <p className="mt-1.5 text-[14px] font-bold leading-5 text-slate-950 truncate">{title}</p>
            {statusLabel ? (
              <span
                className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                  statusTone === 'amber'
                    ? 'border-amber-100 bg-amber-50 text-amber-700'
                    : statusTone === 'blue'
                      ? 'border-sky-100 bg-sky-50 text-sky-700'
                      : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                }`}
              >
                {statusLabel}
              </span>
            ) : null}
            {itemLine ? <p className="mt-1 text-[11px] leading-4 text-slate-600 truncate">{itemLine}</p> : null}
            <p className="mt-1 text-[11px] leading-4 text-slate-500 line-clamp-1">{subtitle}</p>
          </div>
          {amount ? <p className="text-[11px] font-black text-slate-950 shrink-0">{amount}</p> : null}
        </div>
        {actionText ? (
          <div className="mt-2.5 flex justify-end">
            <span className="inline-flex rounded-full bg-slate-950 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white">
              {actionText}
            </span>
          </div>
        ) : null}
      </button>
    );
  };

  const QueueRequestCard = ({ order, badge = '', tone = 'blue', subtitle }) => {
    const orderId = getOrderIdentity(order);
    const orderDisplayId = getOrderDisplayId(order);
    const itemLine = getOrderItemSummary(order);
    const isAcceptBusy = actionBusyOrderId === orderId && actionBusyType === 'accept';
    const isPassBusy = actionBusyOrderId === orderId && actionBusyType === 'pass';
    const isBusy = isAcceptBusy || isPassBusy;

    return (
      <div className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.045)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {badge ? (
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
                  tone === 'blue'
                    ? 'border-sky-100 bg-sky-50 text-sky-700'
                    : 'border-amber-100 bg-amber-50 text-amber-700'
                }`}
              >
                {badge}
              </span>
            ) : null}
            {orderDisplayId ? (
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950 truncate">
                Order #{orderDisplayId}
              </p>
            ) : null}
            <p className="mt-1.5 text-[14px] font-bold leading-5 text-slate-950 truncate">{getRestaurantTitle(order)}</p>
            {itemLine ? <p className="mt-1 text-[11px] leading-4 text-slate-600 truncate">{itemLine}</p> : null}
            <p className="mt-1 text-[11px] leading-4 text-slate-500 line-clamp-1">{subtitle}</p>
          </div>
          <p className="text-[11px] font-black text-slate-950 shrink-0">
            ₹{Number(order?.riderEarning || order?.deliveryEarning || 0).toFixed(2)}
          </p>
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onAcceptQueuedOrder?.(order)}
            disabled={isBusy}
            className="rounded-xl bg-[#005128] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-60"
          >
            {isAcceptBusy ? 'Accepting...' : 'Accept'}
          </button>
          <button
            type="button"
            onClick={() => onPassQueuedOrder?.(order)}
            disabled={isBusy}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 disabled:opacity-60"
          >
            {isPassBusy ? 'Passing...' : 'Pass this task'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenOrderDetail(order)}
          className="mt-2 text-[11px] font-semibold text-slate-500 underline underline-offset-2"
        >
          Open Detail
        </button>
      </div>
    );
  };

  const HistoryCard = ({ order }) => {
    const rawStatus = String(order?.status || '').toLowerCase();
    const { label: statusLabel, toneClass } = getClosedOrderStatusMeta(rawStatus);
    const eventDate = getOrderEventDate(order);
    const timeLabel = eventDate
      ? new Date(eventDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      : '--';
    const amount = Number(order?.deliveryEarning || order?.earningAmount || order?.amount || 0);

    return (
      <button
        type="button"
        onClick={() => onOpenOrderDetail(order)}
        className="w-full rounded-[18px] border border-slate-200 bg-white px-3.5 py-3 text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-all active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${toneClass}`}>
              {statusLabel}
            </span>
            <p className="mt-2 text-[15px] font-bold leading-5 text-slate-950 truncate">{getRestaurantTitle(order)}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{statusLabel} today at {timeLabel}</p>
          </div>
          {amount > 0 ? <p className="text-xs font-black text-slate-950 shrink-0">₹{amount.toFixed(2)}</p> : null}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-full bg-[#f7f8fc] px-3 pb-24 pt-3">
      <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-brand-600">Orders</p>
          <h1 className="mt-1 text-xl leading-6 font-black text-slate-950">Manage trips</h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Incoming and live requests stay here.
          </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefreshOrders}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 active:scale-[0.98] transition-all"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <div className="rounded-[16px] bg-slate-50 px-3 py-2 shadow-sm border border-slate-200">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Visible</p>
              <p className="mt-1 text-lg font-black text-slate-950">{totalVisibleOrders}</p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 border border-sky-100">Incoming {incomingOrders.length}</span>
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-100">Live {(currentActiveOrder ? 1 : 0) + liveOrders.length}</span>
          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 border border-slate-200">Done Today {todayHistoryCount}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setOrdersViewTab('live')}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${ordersViewTab === 'live' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Incoming / Live
          </button>
          <button
            type="button"
            onClick={() => setOrdersViewTab('history')}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition ${ordersViewTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Delivered / Cancelled
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {ordersViewTab === 'live' && (
          <>
            {incomingOrders.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-2 h-2 rounded-full bg-sky-500" />
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Incoming</p>
                </div>
                {incomingOrders.map((order) => (
                  <QueueRequestCard
                    key={getOrderIdentity(order)}
                    order={order}
                    tone="blue"
                    subtitle={`${getPaymentLabel(order)} payment - Accept or pass this task`}
                  />
                ))}
              </div>
            )}

            {(currentActiveOrder || liveOrders.length > 0) && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Live</p>
                </div>
                {currentActiveOrder && (
                  <Card
                    title={getRestaurantTitle(currentActiveOrder)}
                    orderDisplayId={getOrderDisplayId(currentActiveOrder)}
                    itemLine={getOrderItemSummary(currentActiveOrder)}
                    subtitle="Open detail page to continue status updates."
                    amount={`Rs ${Number(currentActiveOrder?.riderEarning || currentActiveOrder?.deliveryEarning || 0).toFixed(2)}`}
                    statusLabel={getOrderProgressLabel(currentActiveOrder)}
                    statusTone="emerald"
                    actionText="Open Detail"
                    onClick={() => onOpenOrderDetail(currentActiveOrder)}
                  />
                )}
                {liveOrders.map((order) => (
                  <Card
                    key={getOrderIdentity(order)}
                    title={getRestaurantTitle(order)}
                    orderDisplayId={getOrderDisplayId(order)}
                    itemLine={getOrderItemSummary(order)}
                    subtitle="Open detail page to continue status updates."
                    amount={`Rs ${Number(order?.riderEarning || order?.deliveryEarning || 0).toFixed(2)}`}
                    statusLabel={getOrderProgressLabel(order)}
                    statusTone="emerald"
                    actionText="Open Detail"
                    onClick={() => onOpenOrderDetail(order)}
                  />
                ))}
              </div>
            )}

            {!currentActiveOrder && incomingOrders.length === 0 && liveOrders.length === 0 && (
              <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-8 text-center shadow-sm">
                <div className="mx-auto h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center">
                  <Package className="w-5 h-5 text-brand-600" />
                </div>
                <p className="mt-4 text-base font-bold text-slate-950">No current orders today</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Incoming and active orders will appear here.
                </p>
              </div>
            )}
          </>
        )}

        {ordersViewTab === 'history' && (
        <div className="pt-2 space-y-2">
          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-slate-500" />
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Delivered / Cancelled Orders</p>
          </div>
          {todayHistoryCount > 0 ? (
            todayHistoryOrders.map((order, index) => (
              <HistoryCard
                key={`${getOrderIdentity(order) || order?.id || order?.orderId || 'history'}-${order?.status || 'status'}-${index}`}
                order={order}
              />
            ))
          ) : (
            <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-6 text-center shadow-sm">
              <p className="text-sm font-bold text-slate-950">No delivered or cancelled orders today</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Sirf aaj ke delivered aur cancelled orders yahan show honge.</p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

/** Minimal bottom-sheet popup (Restored from legacy FeedNavbar) */
/**
 * DeliveryHomeV2 - Premium 1:1 Match with Original App UI.
 * Featuring logical tab switching for Feed, Pocket, History, and Profile.
 */
export default function DeliveryHomeV2({ tab = 'feed' }) {
  const navigate = useNavigate();
  const { isOnline, toggleOnline, activeOrder, tripStatus, setRiderLocation, setActiveOrder, updateTripStatus, clearActiveOrder } = useDeliveryStore();
  const { distanceToTarget } = useProximityCheck();
  const { acceptOrder, rejectOrder, resetTrip } = useOrderManager();
  const { newOrder, clearNewOrder, orderStatusUpdate, clearOrderStatusUpdate, isConnected: isSocketConnected, emitLocation, playNotificationSound } = useDeliveryNotifications();
  const companyName = useCompanyName();

  const [incomingOrder, setIncomingOrder] = useState(null);
  const [advancedOrders, setAdvancedOrders] = useState([]);
  const [todayHistoryOrders, setTodayHistoryOrders] = useState([]);
  const [focusedOrderId, setFocusedOrderId] = useState(() => {
    try {
      return localStorage.getItem(ORDER_FOCUS_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [currentTab, setCurrentTab] = useState(tab);
  const [orderActionBusy, setOrderActionBusy] = useState({ orderId: '', type: '' });
  const [ordersRefreshTick, setOrdersRefreshTick] = useState(0);

  // Track URL changes (Prop changes) to update sub-page content
  useEffect(() => {
    setCurrentTab(tab);
  }, [tab]);

  const [profileImage, setProfileImage] = useState(null);

  const [eta, setEta] = useState(null);
  const lastLocationSentAt = useRef(0);
  const lastCoordRef = useRef(null);
  const rollingSpeedRef = useRef([]);

  const [zoom, setZoom] = useState(14);
  const [isSimMode, setIsSimMode] = useState(false);
  const [simPath, setSimPath] = useState([]);
  const [simIndex, setSimIndex] = useState(0);
  const [simProgress, setSimProgress] = useState(0); // 0 to 1 between points
  const [activePolyline, setActivePolyline] = useState(null);
  const mapRef = useRef(null);
  const lastAnnouncedOrderIdRef = useRef('');
  const lastIncomingToastOrderIdRef = useRef('');
  const queueSyncInFlightRef = useRef(false);

  const isLoggingOut = useRef(false);

  const handleOrdersRefresh = useCallback(() => {
    setOrdersRefreshTick((prev) => prev + 1);
  }, []);

  const persistIncomingOrder = useCallback((orderLike) => {
    const orderId = getOrderIdentity(orderLike);
    if (!orderId) return;
    try {
      localStorage.setItem(
        INCOMING_ORDER_STORAGE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          order: orderLike,
        }),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [getOrderIdentity]);

  const activeOrderId = getOrderIdentity(activeOrder);

  const upsertAdvancedOrder = useCallback((orderLike) => {
    const hydratedOrder = hydrateDeliveryOrder(orderLike, getOrderIdentity(orderLike));
    const nextOrderId = getOrderIdentity(hydratedOrder);
    if (!nextOrderId || nextOrderId === activeOrderId) return hydratedOrder;

    setAdvancedOrders((prev) => {
      const withoutCurrent = prev.filter((item) => getOrderIdentity(item) !== nextOrderId);
      const merged = [hydratedOrder, ...withoutCurrent];
      return merged.sort((left, right) => {
        const leftAccepted = String(left?.dispatch?.status || left?.queueStatus || '').toLowerCase() === 'accepted';
        const rightAccepted = String(right?.dispatch?.status || right?.queueStatus || '').toLowerCase() === 'accepted';
        if (leftAccepted !== rightAccepted) return leftAccepted ? -1 : 1;
        return Number(right?.updatedAt || right?.createdAt || 0) - Number(left?.updatedAt || left?.createdAt || 0);
      });
    });

    return hydratedOrder;
  }, [activeOrderId]);

  const removeAdvancedOrder = useCallback((orderLike) => {
    const orderId = getOrderIdentity(orderLike);
    if (!orderId) return;

    setAdvancedOrders((prev) => prev.filter((item) => getOrderIdentity(item) !== orderId));
  }, []);

  const promoteNextAcceptedOrder = useCallback((ordersOverride) => {
    const queue = Array.isArray(ordersOverride) ? ordersOverride : advancedOrders;
    const nextAccepted = queue.find((order) => {
      const dispatchStatus = String(order?.dispatch?.status || order?.queueStatus || '').toLowerCase();
      return dispatchStatus === 'accepted';
    });

    if (!nextAccepted) return false;

    const hydratedNextOrder = hydrateDeliveryOrder(nextAccepted, getOrderIdentity(nextAccepted));
    setActiveOrder(hydratedNextOrder);
    updateTripStatus(deriveTripStatusFromOrder(hydratedNextOrder));
    setAdvancedOrders((prev) => prev.filter((item) => getOrderIdentity(item) !== getOrderIdentity(hydratedNextOrder)));
    toast.success('Advanced order ready', {
      description: 'Your next queued trip is now live.',
    });
    return true;
  }, [advancedOrders, setActiveOrder, updateTripStatus]);

  const advancedOrderCount = advancedOrders.length;

  const clearPersistedIncomingOrder = useCallback(() => {
    try {
      localStorage.removeItem(INCOMING_ORDER_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const persistFocusedOrder = useCallback((orderId) => {
    const nextValue = String(orderId || '').trim();
    setFocusedOrderId(nextValue);
    try {
      if (nextValue) localStorage.setItem(ORDER_FOCUS_STORAGE_KEY, nextValue);
      else localStorage.removeItem(ORDER_FOCUS_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const announceIncomingRequest = useCallback((orderLike) => {
    const orderId = getOrderIdentity(orderLike);
    if (!orderId || lastAnnouncedOrderIdRef.current === orderId) return;
    lastAnnouncedOrderIdRef.current = orderId;
    void playNotificationSound(orderLike);
  }, [playNotificationSound]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INCOMING_ORDER_STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed?.savedAt || 0);
      const savedOrder = parsed?.order || null;
      if (!savedOrder || Date.now() - savedAt > INCOMING_ORDER_TTL_MS) {
        clearPersistedIncomingOrder();
        return;
      }

      if (!activeOrder) {
        setIncomingOrder(savedOrder);
      }
    } catch {
      clearPersistedIncomingOrder();
    }
  }, [activeOrder, clearPersistedIncomingOrder]);

  useEffect(() => {
    let passedOrderId = '';
    try {
      passedOrderId = String(sessionStorage.getItem(PASSED_ORDER_STORAGE_KEY) || '').trim();
      if (!passedOrderId) return;
      sessionStorage.removeItem(PASSED_ORDER_STORAGE_KEY);
    } catch {
      return;
    }

    removeAdvancedOrder({ orderId: passedOrderId });
    setIncomingOrder((prev) => {
      if (getOrderIdentity(prev) !== passedOrderId) return prev;
      clearPersistedIncomingOrder();
      return null;
    });
    if (focusedOrderId === passedOrderId) {
      persistFocusedOrder('');
    }
    if (activeOrderId === passedOrderId) {
      clearActiveOrder();
      resetTrip();
    }
  }, [
    activeOrderId,
    clearActiveOrder,
    clearPersistedIncomingOrder,
    focusedOrderId,
    persistFocusedOrder,
    removeAdvancedOrder,
    resetTrip,
  ]);

  const handleLogout = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    // 1. Clear tokens and state
    localStorage.removeItem('delivery_accessToken');
    localStorage.removeItem('delivery_refreshToken');
    localStorage.removeItem('delivery_authenticated');
    localStorage.removeItem('delivery_user');
    localStorage.removeItem(INCOMING_ORDER_STORAGE_KEY);

    // 2. Alert user and redirect
    toast.error("Session Expired", { description: "Please log in again." });
    navigate("/food/delivery/login", { replace: true });

    // Optional: Full refresh after delay ONLY if we're not already on login
    setTimeout(() => {
      if (!window.location.pathname.includes('/login')) {
        window.location.reload();
      }
    }, 1500);
  }, [navigate]);

  useEffect(() => {
    const onAuthFailure = (e) => {
      if (e.detail?.module === 'delivery') {
        handleLogout();
      }
    };
    window.addEventListener('authRefreshFailed', onAuthFailure);
    return () => window.removeEventListener('authRefreshFailed', onAuthFailure);
  }, [handleLogout]);

  // 0. Auto-Simulation Effect (High-Precision Smooth Glide)
  const lastSimUpdateSentAt = useRef(0);
  useEffect(() => {
    let interval;
    if (isSimMode && simPath.length > 1 && simIndex < simPath.length - 1) {
      console.log('[SimAuto] Glide Active √');

      interval = setInterval(() => {
        setSimProgress(prev => {
          const nextProgress = prev + 0.08; // 8% movement per tick

          if (nextProgress >= 1) {
            setSimIndex(idx => idx + 1);
            return 0; // Move to next segment
          }

          const currentPoint = simPath[simIndex];
          const nextPoint = simPath[simIndex + 1];

          if (currentPoint && nextPoint) {
            // Linear Interpolation (LERP)
            const lat = currentPoint.lat + (nextPoint.lat - currentPoint.lat) * nextProgress;
            const lng = currentPoint.lng + (nextPoint.lng - currentPoint.lng) * nextProgress;
            const heading = calculateHeading(currentPoint.lat, currentPoint.lng, nextPoint.lat, nextPoint.lng);

            setRiderLocation({ lat, lng, heading });

            if (mapRef.current) {
              mapRef.current.panTo({ lat, lng });
            }

            // Sync with backend every 2.5 seconds during simulation so customer sees it
            const now = Date.now();
            if (now - lastSimUpdateSentAt.current >= 2000) { // Reduced to 2s to match backend throttle
              lastSimUpdateSentAt.current = now;
              const payload = {
                lat,
                lng,
                heading,
                orderId: activeOrder?.orderId || activeOrder?._id,
                status: 'on_the_way',
                polyline: activePolyline // Include polyline in every stream update for resilience
              };
              // A. HTTP Backup
              deliveryAPI.updateLocation(lat, lng, true, { heading }).catch(() => { });

              // B. SOCKET LIVE (SILKY SMOOTH)
              if (payload.orderId) emitLocation(payload);

              // C. FIREBASE REALTIME DB (Persistent Route for Customer Map)
              if (payload.orderId) {
                writeOrderTracking(payload.orderId, {
                  lat,
                  lng,
                  heading,
                  polyline: activePolyline,
                  status: tripStatus,
                  eta: eta // Publish live ETA to Firebase
                }).catch(() => { });
              }
            }
          }
          return nextProgress;
        });
      }, 50); // 20 FPS movement
    }
    return () => clearInterval(interval);
  }, [isSimMode, simPath, simIndex, activeOrder, emitLocation, activePolyline, eta, tripStatus]);

  // Fetch profile data for header
  useEffect(() => {
    (async () => {
      try {
        const profileRes = await deliveryAPI.getProfile();
        if (profileRes?.data?.success && profileRes.data.data?.profile) {
          const profile = profileRes.data.data.profile;
          setProfileImage(profile.profileImage?.url || profile.documents?.photo || null);
        }
      } catch (err) { console.warn('Navbar Data Fetch Error:', err); }
    })();
  }, []);

  // Reset simulation when path, order or mode changes
  useEffect(() => {
    if (isSimMode) {
      console.log('[SimAuto] Resetting simulation playhead...');
      setSimIndex(0);
      setSimProgress(0);
    }
  }, [simPath, tripStatus, isSimMode]);

  // 1. Initial Sync (Force sync with server to avoid 'stuck' persistent state)
  useEffect(() => {
    const syncWithServer = async () => {
      try {
        const response = await deliveryAPI.getCurrentDelivery();
        const rawData = response?.data?.data?.activeOrder || response?.data?.data;
        const serverData = (rawData && (rawData._id || rawData.orderId)) ? rawData : null;

        if (serverData) {
          // Robust location mapping (Same as acceptOrder logic)
          const syncedOrder = hydrateDeliveryOrder(serverData);
          setActiveOrder(syncedOrder);
          updateTripStatus(deriveTripStatusFromOrder(serverData));
        } else {
          clearActiveOrder();
        }
      } catch (err) {
        console.error('Order Sync Failed:', err);
        clearActiveOrder();
      }
    };
    syncWithServer();
  }, []); // Only on mount to stabilize state

  // If a specific order was opened from detail page, force map context to that order.
  useEffect(() => {
    const targetOrderId = String(focusedOrderId || '').trim();
    if (!targetOrderId) return;

    let cancelled = false;
    deliveryAPI
      .getOrderDetails(targetOrderId)
      .then((response) => {
        if (cancelled) return;
        const detailedOrder =
          response?.data?.data?.order ||
          response?.data?.data?.activeOrder ||
          response?.data?.data ||
          null;
        if (!detailedOrder) return;

        const mappedOrder = hydrateDeliveryOrder(detailedOrder, targetOrderId);
        setActiveOrder(mappedOrder);
        updateTripStatus(deriveTripStatusFromOrder(mappedOrder));
      })
      .catch((error) => {
        console.warn('[DeliveryHomeV2] Focused order map context failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [focusedOrderId, setActiveOrder, updateTripStatus]);

  // 1.5 Professional Unified ETA Calculation Hook
  useEffect(() => {
    // If we have distance, calculate ETA. Fallback to 8m/s (28km/h) avg if GPS speed is unknown.
    if (distanceToTarget != null && distanceToTarget !== Infinity) {
      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : 8;

      setEta(calculateETA(distanceToTarget, avgSpeed));
    } else {
      setEta(null);
    }
  }, [distanceToTarget]);

  // 2. Online/Offline Status Sync (Low Frequency)
  useEffect(() => {
    deliveryAPI.updateOnlineStatus(isOnline).catch(() => { });
  }, [isOnline]);

  // 3. Location logic (Smart Frequency Tracking)
  useEffect(() => {
    if (!isOnline) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition((pos) => {
      // CRITICAL: In Simulation Mode, we disable actual GPS to prevent overwriting our test position
      if (isSimMode) return;

      const { latitude: lat, longitude: lng, heading, speed } = pos.coords;
      const now = Date.now();

      const currentRiderPos = { lat, lng, heading: heading || 0 };
      setRiderLocation(currentRiderPos);

      // Calculate Rolling Average Speed for Smart ETA
      if (speed && speed > 0) {
        rollingSpeedRef.current = [...rollingSpeedRef.current.slice(-4), speed]; // keep last 5 points
      }

      const avgSpeed = rollingSpeedRef.current.length > 0
        ? rollingSpeedRef.current.reduce((a, b) => a + b, 0) / rollingSpeedRef.current.length
        : speed || 0;

      // ETA update is now handled by a separate globally-synchronized effect

      // Check threshold for Sync (distance-based or 7s time-based)
      const distMoved = lastCoordRef.current
        ? getHaversineDistance(lat, lng, lastCoordRef.current.lat, lastCoordRef.current.lng)
        : 1000; // assume huge distance if first update

      if (distMoved >= 25 || (now - lastLocationSentAt.current >= 7000)) {
        lastLocationSentAt.current = now;
        lastCoordRef.current = { lat, lng };

        const payload = {
          lat,
          lng,
          heading: heading || 0,
          speed: speed || 0,
          accuracy: pos.coords.accuracy,
          orderId: activeOrder?.orderId || activeOrder?._id,
          status: 'on_the_way',
          polyline: activePolyline
        };

        // A. HTTP Backup
        deliveryAPI.updateLocation(lat, lng, true, {
          heading: heading || 0,
          speed: speed || 0,
          accuracy: pos.coords.accuracy
        }).catch(() => { });

        // B. SOCKET LIVE (SILKY SMOOTH)
        if (payload.orderId) emitLocation(payload);

        // C. FIREBASE REALTIME DB (Persistent)
        if (payload.orderId) {
          writeOrderTracking(payload.orderId, {
            lat,
            lng,
            heading: heading || 0,
            polyline: activePolyline,
            status: tripStatus,
            eta: eta // Publish live ETA to Firebase for customer
          }).catch(() => { });
        }
      }
    }, () => toast.error('GPS Needed!'), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, setRiderLocation, isSimMode]);

  // 3.5. Background Ping / Heartbeat
  // If watchPosition stops firing (e.g. app in background or device stationary),
  // this ensures we ping the backend periodically. This keeps the token fresh (via 401 interceptor)
  // and keeps the Delivery Partner "online" in the backend.
  useEffect(() => {
    if (!isOnline) return;

    const pingInterval = setInterval(() => {
      const now = Date.now();
      // If no natural GPS update happened in the last 15 seconds, force a ping
      if (now - lastLocationSentAt.current >= 15000 && lastCoordRef.current) {
        lastLocationSentAt.current = now;
        deliveryAPI.updateLocation(
          lastCoordRef.current.lat,
          lastCoordRef.current.lng,
          true,
          { heading: 0, speed: 0, accuracy: null }
        ).catch(() => { });
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(pingInterval);
  }, [isOnline]);

  useEffect(() => {
    if (!newOrder) return;
    const newOrderId = getOrderIdentity(newOrder);
    const isDuplicateIncomingToast = Boolean(newOrderId) && lastIncomingToastOrderIdRef.current === newOrderId;

    if (activeOrder) {
      announceIncomingRequest(newOrder);
      upsertAdvancedOrder({
        ...newOrder,
        isAdvancedOrder: true,
        queueStatus: newOrder?.queueStatus || newOrder?.dispatch?.status || 'assigned',
      });
      clearNewOrder();
      if (!isDuplicateIncomingToast) {
        toast.success('Advanced order incoming', {
          description: 'A back-to-back trip has been added to your queue review.',
        });
      }
      if (newOrderId) lastIncomingToastOrderIdRef.current = newOrderId;
      return;
    }

    announceIncomingRequest(newOrder);
    setIncomingOrder(newOrder);
    persistIncomingOrder(newOrder);
    if (!isDuplicateIncomingToast) {
      toast.success('New order received', {
        description: 'Open the Orders tab to review it.',
      });
    }
    if (newOrderId) lastIncomingToastOrderIdRef.current = newOrderId;
  }, [activeOrder, announceIncomingRequest, clearNewOrder, newOrder, persistIncomingOrder, upsertAdvancedOrder]);

  useEffect(() => {
    if (activeOrder && incomingOrder) {
      setIncomingOrder(null);
      clearPersistedIncomingOrder();
    }
  }, [activeOrder, incomingOrder, clearPersistedIncomingOrder]);

  useEffect(() => {
    if (!isOnline) return;
    // Queue API is only needed on Orders tab. Feed tab uses socket/live state.
    if (currentTab !== 'orders') return;

    let cancelled = false;

    const syncDeliveryFeedState = async () => {
      if (queueSyncInFlightRef.current) return;
      queueSyncInFlightRef.current = true;
      try {
        const queueResponse = await deliveryAPI.getOrderQueue();
        const queuePayload = queueResponse?.data?.data || {};
        const serverCurrentOrder = queuePayload?.currentOrder ? hydrateDeliveryOrder(queuePayload.currentOrder) : null;
        const queuedOrders = Array.isArray(queuePayload?.queue)
          ? queuePayload.queue
            .map((order) => hydrateDeliveryOrder(order))
            .filter(Boolean)
            .filter((order) => getOrderIdentity(order) !== getOrderIdentity(serverCurrentOrder))
          : [];

        if (cancelled) return;

        if (serverCurrentOrder && isClosedOrderLike(serverCurrentOrder)) {
          clearActiveOrder();
        } else if (serverCurrentOrder && getOrderIdentity(serverCurrentOrder) !== activeOrderId) {
          setActiveOrder(serverCurrentOrder);
          updateTripStatus(deriveTripStatusFromOrder(serverCurrentOrder));
        }

        setAdvancedOrders((prev) => (isSameQueueSnapshot(prev, queuedOrders) ? prev : queuedOrders));

        if (serverCurrentOrder) {
          setIncomingOrder(null);
          clearPersistedIncomingOrder();
          return;
        }

        const availableResponse = await deliveryAPI.getOrders({ limit: 20, page: 1 });
        const availablePayload =
          availableResponse?.data?.data ||
          availableResponse?.data ||
          {};
        const availableOrders = Array.isArray(availablePayload?.docs)
          ? availablePayload.docs
          : Array.isArray(availablePayload?.items)
            ? availablePayload.items
            : Array.isArray(availablePayload)
              ? availablePayload
              : [];

        const queuedOrderIds = new Set(queuedOrders.map((order) => getOrderIdentity(order)).filter(Boolean));
        const nextIncomingOrder = availableOrders.find((order) => {
          const orderId = getOrderIdentity(order);
          const dispatchStatus = String(order?.dispatch?.status || '').toLowerCase();
          const orderStatus = String(order?.orderStatus || order?.status || '').toLowerCase();
          return (
            orderId &&
            !queuedOrderIds.has(orderId) &&
            orderId !== activeOrderId &&
            ['unassigned', 'assigned'].includes(dispatchStatus) &&
            ['confirmed', 'preparing', 'ready_for_pickup'].includes(orderStatus)
          );
        });

        if (!cancelled && nextIncomingOrder) {
          const nextIncomingOrderId = getOrderIdentity(nextIncomingOrder);
          persistIncomingOrder(nextIncomingOrder);
          setIncomingOrder((prev) => {
            const prevId = prev?.orderId || prev?._id || prev?.orderMongoId;
            const nextId =
              nextIncomingOrder?.orderId ||
              nextIncomingOrder?._id ||
              nextIncomingOrder?.orderMongoId;
            return prevId === nextId && prev ? prev : nextIncomingOrder;
          });
          if (nextIncomingOrderId && nextIncomingOrderId !== getOrderIdentity(incomingOrder)) {
            announceIncomingRequest(nextIncomingOrder);
          }
        } else if (!cancelled && !activeOrderId) {
          setIncomingOrder(null);
          clearPersistedIncomingOrder();
        }
      } catch (error) {
        console.warn('[DeliveryHomeV2] Delivery feed sync failed:', error?.message || error);
      } finally {
        queueSyncInFlightRef.current = false;
      }
    };

    const triggerSyncNow = () => {
      if (document.hidden) return;
      void syncDeliveryFeedState();
    };

    void syncDeliveryFeedState();
    window.addEventListener('focus', triggerSyncNow);
    document.addEventListener('visibilitychange', triggerSyncNow);
    const poller = window.setInterval(() => {
      if (!document.hidden) {
        void syncDeliveryFeedState();
      }
    }, isSocketConnected ? ORDER_SYNC_POLL_CONNECTED_MS : ORDER_SYNC_POLL_DISCONNECTED_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poller);
      window.removeEventListener('focus', triggerSyncNow);
      document.removeEventListener('visibilitychange', triggerSyncNow);
    };
  }, [activeOrderId, announceIncomingRequest, clearPersistedIncomingOrder, currentTab, incomingOrder, isOnline, isSocketConnected, ordersRefreshTick, persistIncomingOrder, setActiveOrder, updateTripStatus]);

  useEffect(() => {
    if (currentTab !== 'orders') return;

    let cancelled = false;

    const fetchTodayHistoryOrders = async () => {
      try {
        const response = await deliveryAPI.getTripHistory({
          period: 'daily',
          date: new Date().toISOString().slice(0, 10),
          limit: 200,
        });
        const trips = response?.data?.data?.trips || [];
        const filtered = trips
          .filter((trip) => {
            const status = String(trip?.status || '').toLowerCase();
            return (
              [
                'completed',
                'delivered',
                'cancelled',
                'rejected',
                'user_unavailable_review',
                'cancelled_by_user_unavailable',
              ].includes(status) ||
              status.startsWith('cancelled_by_')
            );
          })
          .filter((trip) => isSameCalendarDay(getOrderEventDate(trip)))
          .sort((left, right) => new Date(getOrderEventDate(right) || 0) - new Date(getOrderEventDate(left) || 0));

        if (!cancelled) {
          setTodayHistoryOrders(filtered);
        }
      } catch {
        if (!cancelled) {
          setTodayHistoryOrders([]);
        }
      }
    };

    void fetchTodayHistoryOrders();
    const poller = window.setInterval(() => {
      void fetchTodayHistoryOrders();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(poller);
    };
  }, [currentTab, ordersRefreshTick]);

  useEffect(() => {
    if (orderStatusUpdate) {
      const eventStatus = String(
        orderStatusUpdate.orderStatus ||
        orderStatusUpdate.status ||
        orderStatusUpdate.deliveryStatus ||
        '',
      ).toLowerCase();
      const eventOrderId = getOrderIdentity(orderStatusUpdate);
      const isActiveOrderUpdate = eventOrderId && eventOrderId === activeOrderId;
      const isIncomingOrderUpdate = eventOrderId && eventOrderId === getOrderIdentity(incomingOrder);
      const isCancelledEvent = eventStatus.includes('cancel') || eventStatus === 'deleted';
      const isDeliveredEvent = ['delivered', 'completed'].includes(eventStatus);
      const isReviewEvent = eventStatus === 'user_unavailable_review';
      const isClosedTransitionEvent = isCancelledEvent || isDeliveredEvent || isReviewEvent;

      const applyRealtimeStatus = (orderLike) => {
        if (!orderLike || getOrderIdentity(orderLike) !== eventOrderId) return orderLike;
        return {
          ...orderLike,
          orderStatus: eventStatus || orderLike.orderStatus,
          status: eventStatus || orderLike.status,
          deliveryStatus: eventStatus || orderLike.deliveryStatus,
        };
      };

      if (eventOrderId && eventStatus) {
        setIncomingOrder((prev) => applyRealtimeStatus(prev));
        setAdvancedOrders((prev) => prev.map((item) => applyRealtimeStatus(item)));

        if (isActiveOrderUpdate && activeOrder) {
          const nextActiveOrder = applyRealtimeStatus(activeOrder);
          setActiveOrder(nextActiveOrder);
          updateTripStatus(deriveTripStatusFromOrder(nextActiveOrder));
        }
      }

      if (isClosedTransitionEvent) {
        if (isIncomingOrderUpdate) {
          persistFocusedOrder('');
          setIncomingOrder(null);
          clearPersistedIncomingOrder();
        }

        if (eventOrderId) {
          removeAdvancedOrder(orderStatusUpdate);
        }

        if (isActiveOrderUpdate) {
          if (isReviewEvent) {
            toast.success('Order moved to admin review');
          } else if (isCancelledEvent) {
            toast.error('Current order cancelled');
          }
          if (!promoteNextAcceptedOrder()) {
            resetTrip();
          }
        } else if (isCancelledEvent) {
          toast.error('Queued order removed');
        }
      }
      if (currentTab === 'orders') {
        setOrdersRefreshTick((prev) => prev + 1);
      }
      clearOrderStatusUpdate();
    }
  }, [activeOrder, activeOrderId, clearOrderStatusUpdate, clearPersistedIncomingOrder, currentTab, incomingOrder, orderStatusUpdate, persistFocusedOrder, promoteNextAcceptedOrder, removeAdvancedOrder, resetTrip, setActiveOrder, updateTripStatus]);

  const handleAdvancedOrderAccept = useCallback(async (order) => {
    const acceptedOrder = await acceptOrder(order, { keepCurrentActive: Boolean(activeOrder) });
    const nextQueuedOrder = {
      ...acceptedOrder,
      queueStatus: 'accepted',
      dispatch: {
        ...(acceptedOrder?.dispatch || order?.dispatch || {}),
        status: 'accepted',
      },
      isAdvancedOrder: true,
    };
    upsertAdvancedOrder(nextQueuedOrder);
    toast.success('Added to queue', {
      description: activeOrder ? 'Finish the current trip first, then this one becomes active.' : 'Order accepted successfully.',
    });
  }, [acceptOrder, activeOrder, upsertAdvancedOrder]);

  const handleOrdersTabDirectAccept = useCallback(async (order) => {
    const queuedOrderId = getOrderIdentity(order);
    if (!queuedOrderId) return;

    setOrderActionBusy({ orderId: queuedOrderId, type: 'accept' });
    try {
      if (activeOrder) {
        await handleAdvancedOrderAccept(order);
      } else {
        const accepted = await acceptOrder(order, { keepCurrentActive: false });
        removeAdvancedOrder(order);
        setIncomingOrder((prev) => (getOrderIdentity(prev) === queuedOrderId ? null : prev));
        clearPersistedIncomingOrder();
        persistFocusedOrder(getOrderIdentity(accepted) || queuedOrderId);
        toast.success('Order accepted');
      }
    } catch {
      // Errors already surfaced by API helpers/toasts.
    } finally {
      setOrderActionBusy({ orderId: '', type: '' });
    }
  }, [
    acceptOrder,
    activeOrder,
    clearPersistedIncomingOrder,
    handleAdvancedOrderAccept,
    persistFocusedOrder,
    removeAdvancedOrder,
  ]);

  const handleOrdersTabDirectPass = useCallback(async (order) => {
    const queuedOrderId = getOrderIdentity(order);
    if (!queuedOrderId) return;

    setOrderActionBusy({ orderId: queuedOrderId, type: 'pass' });
    try {
      await rejectOrder(order, 'passed');
      removeAdvancedOrder(order);
      if (getOrderIdentity(incomingOrder) === queuedOrderId) {
        setIncomingOrder(null);
        clearPersistedIncomingOrder();
      }
      if (focusedOrderId === queuedOrderId) {
        persistFocusedOrder('');
      }
      toast.success('Task passed to admin');
    } finally {
      setOrderActionBusy({ orderId: '', type: '' });
    }
  }, [
    clearPersistedIncomingOrder,
    focusedOrderId,
    incomingOrder,
    persistFocusedOrder,
    rejectOrder,
    removeAdvancedOrder,
  ]);

  const handleCenterMap = () => {
    if (mapRef.current && useDeliveryStore.getState().riderLocation) {
      const loc = useDeliveryStore.getState().riderLocation;
      mapRef.current.panTo({
        lat: parseFloat(loc.lat || loc.latitude),
        lng: parseFloat(loc.lng || loc.longitude)
      });
    }
  };

  const handleMapClick = () => {};

  return (
    <div className="relative h-screen w-full bg-white text-gray-900 overflow-hidden flex flex-col">
      {/* ─── 1. TOP HEADER (Neat & Clean) ─── */}
      {currentTab !== 'history' && (
        <div className="absolute top-0 inset-x-0 bg-white/95 backdrop-blur-md z-[200] safe-top border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <div
                onClick={() => navigate('/food/delivery/profile')}
                className="w-10 h-10 rounded-full border border-gray-200 overflow-hidden bg-gray-50 cursor-pointer active:bg-gray-100 transition-colors shrink-0"
              >
                <img src={profileImage || "https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png"} alt="Profile" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={async () => {
                  const nextState = !isOnline;
                  toggleOnline(); 
                  if (nextState) {
                    navigator.geolocation.getCurrentPosition((pos) => {
                      deliveryAPI.updateLocation(pos.coords.latitude, pos.coords.longitude, true).catch(() => { });
                    }, (err) => console.warn('Online sync pos failed', err), { enableHighAccuracy: true });
                  } else {
                    deliveryAPI.updateOnlineStatus(false).catch(() => { });
                  }
                }}
                className={`relative w-[86px] h-8 rounded-full p-1 transition-all duration-300 flex items-center shadow-sm border ${isOnline ? 'border-green-500 bg-green-500' : 'border-gray-200 bg-gray-100'}`}
              >
                <div className={`flex items-center justify-between w-full px-2 text-[9px] font-bold uppercase tracking-wider ${isOnline ? 'text-white' : 'text-gray-500'}`}>
                  <span>{isOnline ? 'On' : ''}</span>
                  <span>{!isOnline ? 'Off' : ''}</span>
                </div>
                <motion.div animate={{ x: isOnline ? 54 : 0 }} className="absolute left-1 w-6 h-6 bg-white rounded-full shadow-sm" />
              </button>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/food/delivery/help/tickets')} className="w-[38px] h-[38px] rounded-full bg-red-50 flex items-center justify-center text-red-500 active:bg-red-100 transition-colors border border-red-100"><AlertTriangle className="w-[18px] h-[18px]" /></button>
              <button onClick={() => navigate('/food/delivery/help/id-card')} className="w-[38px] h-[38px] rounded-full bg-brand-50 flex items-center justify-center text-brand-600 active:bg-brand-100 transition-colors border border-brand-100"><Contact className="w-[18px] h-[18px]" /></button>
            </div>
          </div>

          {/* ─── LIVE STATUS / PROGRESS BADGE (MATCHED PRO) ─── */}
          <AnimatePresence>
            {currentTab === 'feed' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="px-4 mt-1"
              >
                {activeOrder ? (
                  <div className="space-y-3 w-full">
                    <div className="grid grid-cols-2 gap-3 w-full">
                    {/* LEFT: DISTANCE (Vibrant Orange Card) */}
                    <div
                      className="rounded-lg p-2 shadow-md flex items-center justify-between"
                      style={{ background: BRAND_THEME.gradients.primary }}
                    >
                      <div className="flex flex-col z-10">
                        <span className="text-[8px] text-white/70 font-bold uppercase tracking-widest mb-0.5">Distance</span>
                        <div className="flex items-end gap-1">
                          <span className="text-xl font-bold text-white leading-none tracking-tight">
                            {distanceToTarget && distanceToTarget !== Infinity ? (distanceToTarget / 1000).toFixed(1) : '--'}
                          </span>
                          <span className="text-[10px] text-white/80 font-medium mb-0.5">KM</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                        <Navigation2 className="w-3.5 h-3.5 rotate-45 text-white" />
                      </div>
                    </div>

                    {/* RIGHT: TIME (Emerald PRO Content) */}
                    <div
                      className="rounded-lg p-2 shadow-md flex items-center justify-between"
                      style={{ backgroundColor: BRAND_THEME.colors.semantic.success }}
                    >
                      <div className="flex flex-col z-10">
                        <span className="text-[8px] text-white/70 font-bold uppercase tracking-widest mb-0.5">Arrival</span>
                        <div className="flex items-end gap-1">
                          <span className="text-xl font-bold text-white leading-none tracking-tight">
                            {eta ? String(eta) : '--'}
                          </span>
                          <span className="text-[10px] text-white/80 font-medium mb-0.5">MIN</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center z-10">
                        <Clock className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── 2. MAIN CONTENT ─── */}
      <div className={`flex-1 relative overflow-y-auto ${currentTab === 'feed' ? 'pt-[76px]' : currentTab === 'history' ? 'pt-0' : 'pt-[64px]'}`}>
        {currentTab === 'feed' ? (
          <div className="absolute inset-0 top-[-76px]">
            <LiveMap
              onMapLoad={(m) => mapRef.current = m}
              onMapClick={handleMapClick}
              onPathReceived={setSimPath}
              onPolylineReceived={(poly) => {
                setActivePolyline(poly);
                // If we have an order, push the INITIAL polyline to Firebase immediately for the customer
                const orderId = activeOrder?.orderId || activeOrder?._id;
                if (orderId && poly) {
                  writeOrderTracking(orderId, { polyline: poly, status: tripStatus, eta: eta }).catch(() => { });
                }
              }}
              zoom={zoom}
            />

            {/* SIMULATION INDICATOR */}
            {isSimMode && (
              <div className="absolute top-[180px] left-4 right-4 z-[100] bg-[#005128]/70 backdrop-blur-md rounded-xl p-4 border border-white/20 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center animate-pulse">
                    <Play className="w-4 h-4 text-white fill-current" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-orange-500 text-[10px] font-bold uppercase tracking-widest">Auto Navigation Active</span>
                    <span className="text-white text-[11px] font-medium">Following actual road path...</span>
                  </div>
                </div>
                <button onClick={() => setIsSimMode(false)} className="bg-white/10 text-white/50 hover:text-white px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10">Stop</button>
              </div>
            )}

            <div className="absolute right-4 bottom-28 md:bottom-32 flex flex-col gap-4 z-[120]">
              <div className="flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                <button onClick={() => setZoom(z => Math.min(22, z + 1))} className="p-3 hover:bg-gray-50 border-b border-gray-100 text-gray-900 active:scale-90 transition-all" aria-label="Zoom in"><Plus className="w-5 h-5 stroke-[2.75]" /></button>
                <button onClick={() => setZoom(z => Math.max(8, z - 1))} className="p-3 hover:bg-gray-50 text-gray-900 active:scale-90 transition-all" aria-label="Zoom out"><Minus className="w-5 h-5 stroke-[2.75]" /></button>
              </div>
              <button
                onClick={() => {
                  const nextSimState = !isSimMode;
                  setIsSimMode(nextSimState);

                  if (nextSimState) {
                    toast.warning('Simulation Mode Active');
                    // Initialize position if null
                    if (!useDeliveryStore.getState().riderLocation && activeOrder) {
                      const target = activeOrder.restaurantLocation || activeOrder.customerLocation;
                      if (target) {
                        setRiderLocation({
                          lat: parseFloat(target.lat || target.latitude) + 0.001,
                          lng: parseFloat(target.lng || target.longitude) + 0.001,
                          heading: 0
                        });
                      }
                    }
                  }
                }}
                className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center border border-gray-100 transition-all ${isSimMode ? 'bg-orange-500 text-white' : 'bg-white text-green-500'}`}
              >
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${isSimMode ? 'border-white' : 'border-green-500'}`}>
                  <Play className={`w-4 h-4 fill-current ml-0.5 ${isSimMode ? 'animate-pulse' : ''}`} />
                </div>
              </button>
              <button
                onClick={() => mapRef.current?.setOptions({ gestureHandling: 'greedy' })}
                className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-brand-600 border border-gray-100 active:scale-90 transition-all"
              >
                <div className="w-8 h-8 rounded-full border-2 border-brand-600 flex items-center justify-center"><Navigation2 className="w-4 h-4" /></div>
              </button>
              <button
                onClick={handleCenterMap}
                className="w-14 h-14 bg-white rounded-full shadow-2xl flex items-center justify-center text-gray-900 border border-gray-100 group active:scale-90 transition-all"
              >
                <Target className="w-7 h-7" />
              </button>
            </div>
          </div>
        ) : currentTab === 'orders' ? (
          <OrdersTabV2
            activeOrder={activeOrder}
            incomingOrder={incomingOrder}
            advancedOrders={advancedOrders}
            todayHistoryOrders={todayHistoryOrders}
            onRefreshOrders={handleOrdersRefresh}
            onAcceptQueuedOrder={handleOrdersTabDirectAccept}
            onPassQueuedOrder={handleOrdersTabDirectPass}
            actionBusyOrderId={orderActionBusy.orderId}
            actionBusyType={orderActionBusy.type}
            onOpenOrderDetail={(order) => {
              const targetOrderId = getOrderIdentity(order);
              if (!targetOrderId) return;
              navigate(`/food/delivery/orders/${targetOrderId}`);
            }}
          />
        ) : currentTab === 'pocket' ? (
          <PocketV2 />
        ) : currentTab === 'history' ? (
          <HistoryV2 />
        ) : (
          <ProfileV2 />
        )}

      </div>







      {/* ─── 3. BOTTOM NAV (Clean & Uniform) ─── */}
      <div className="bg-white border-t border-gray-100 flex justify-between items-center z-[200] safe-bottom shadow-sm">
        <button onClick={() => navigate('/food/delivery/feed')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'feed' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <LayoutGrid className="w-5 h-5" /><span className="text-[10px] font-semibold">Feed</span>
        </button>
        <button onClick={() => navigate('/food/delivery/orders')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'orders' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <Package className="w-5 h-5" /><span className="text-[10px] font-semibold">Orders</span>
        </button>
        <button onClick={() => navigate('/food/delivery/pocket')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'pocket' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <Wallet className="w-5 h-5" /><span className="text-[10px] font-semibold">Pocket</span>
        </button>
        <button onClick={() => navigate('/food/delivery/history')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'history' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <History className="w-5 h-5" /><span className="text-[10px] font-semibold">History</span>
        </button>

        <button onClick={() => navigate('/food/delivery/profile')} className={`flex flex-col items-center justify-center gap-1 pt-3 pb-2 transition-all flex-1 ${currentTab === 'profile' ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'}`}>
          <UserIcon className="w-5 h-5" /><span className="text-[10px] font-semibold">Profile</span>
        </button>
      </div>
    </div>
  );
}




