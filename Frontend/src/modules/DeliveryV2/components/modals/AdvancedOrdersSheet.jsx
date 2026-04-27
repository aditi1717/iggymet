import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  ChevronRight,
  Clock3,
  MapPin,
  Package2,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { BRAND_THEME } from '@/config/brandTheme';

const getOrderIdentity = (orderLike) =>
  String(
    orderLike?.orderMongoId ||
    orderLike?._id ||
    orderLike?.orderId ||
    orderLike?.id ||
    '',
  ).trim();

const toCurrency = (value) =>
  `\u20B9${Number(value || 0).toFixed(2)}`;

const getRestaurantName = (order) =>
  order?.restaurantName ||
  order?.restaurantId?.restaurantName ||
  order?.restaurantId?.name ||
  'Restaurant';

const getRestaurantAddress = (order) => {
  const restaurant = order?.restaurantId || {};
  const parts = [
    order?.restaurantAddress,
    restaurant?.addressLine1,
    restaurant?.area,
    restaurant?.city,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return parts.join(', ') || 'Address not available';
};

const getItemCount = (order) => Array.isArray(order?.items) ? order.items.length : 0;

const getQueueLabel = (order) => {
  const status = String(order?.dispatch?.status || order?.queueStatus || '').toLowerCase();
  return status === 'accepted' ? 'Up Next' : 'Advanced Order';
};

const getQueueTone = (order) => {
  const status = String(order?.dispatch?.status || order?.queueStatus || '').toLowerCase();
  return status === 'accepted'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : 'bg-amber-50 text-amber-700 border-amber-100';
};

const getPaymentMode = (order) => {
  const method = String(order?.payment?.method || order?.paymentMethod || '').toLowerCase();
  if (method === 'cash' || method === 'cod') return 'Cash';
  if (method === 'wallet') return 'Wallet';
  if (!method) return 'N/A';
  return 'Online';
};

const getEarnings = (order) =>
  Number(order?.riderEarning || order?.earnings || order?.deliveryEarning || 0);

const getDistance = (order) => {
  const value = Number(order?.pickupDistanceKm || order?.distanceKm || 0);
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} km` : 'Nearby';
};

const getEta = (order) => {
  const value = Number(order?.estimatedTime || order?.eta || order?.duration || 0);
  return Number.isFinite(value) && value > 0 ? `${Math.ceil(value)} min` : 'Fast';
};

function AdvancedOrderDetailModal({ order, onClose, onAccept, onReject }) {
  if (!order) return null;

  const queueStatus = String(order?.dispatch?.status || order?.queueStatus || '').toLowerCase();
  const itemCount = getItemCount(order);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[20] bg-slate-950/55 backdrop-blur-sm flex items-end"
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className="w-full rounded-t-[2rem] bg-white max-h-[86vh] overflow-y-auto"
      >
        <div
          className="px-5 pt-5 pb-4 text-white"
          style={{ background: BRAND_THEME.gradients.primary }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/70">
                Advanced Order
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight">{toCurrency(getEarnings(order))}</h3>
              <p className="mt-1 text-sm font-semibold text-white/80">
                {queueStatus === 'accepted' ? 'Already accepted and waiting in your queue' : 'Review and accept this add-on trip'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Pickup</p>
                <p className="mt-1 text-lg font-bold text-slate-950">{getRestaurantName(order)}</p>
                <p className="mt-1 text-sm text-slate-600">{getRestaurantAddress(order)}</p>
              </div>
              <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${getQueueTone(order)}`}>
                {getQueueLabel(order)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Items</p>
              <p className="mt-2 text-base font-bold text-slate-900">{itemCount || '--'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Distance</p>
              <p className="mt-2 text-base font-bold text-slate-900">{getDistance(order)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">ETA</p>
              <p className="mt-2 text-base font-bold text-slate-900">{getEta(order)}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              <ShoppingBag className="w-4 h-4" />
              <span>Order Snapshot</span>
            </div>
            <div className="mt-3 space-y-2">
              {(order?.items || []).slice(0, 4).map((item, index) => (
                <div key={`${item?.name || 'item'}-${index}`} className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {item?.quantity || item?.qty || 1}x {item?.name || item?.foodName || 'Item'}
                  </p>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{getPaymentMode(order)}</p>
                </div>
              ))}
              {itemCount > 4 && (
                <p className="text-xs font-semibold text-slate-500">+{itemCount - 4} more items</p>
              )}
            </div>
          </div>

          {queueStatus === 'assigned' ? (
            <div className="space-y-3 pt-2">
              <ActionSlider
                label="Slide to Accept Advanced Order"
                successLabel="Added To Queue"
                onConfirm={() => onAccept(order)}
                containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                style={{ background: BRAND_THEME.gradients.primary }}
              />
              <button
                type="button"
                onClick={() => onReject(order, 'passed')}
                className="w-full rounded-2xl border border-slate-200 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500"
              >
                Pass This Add-on
              </button>
            </div>
          ) : (
            <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              This order is already accepted. We’ll keep it in your queue and surface it as the next trip after the current delivery is finished.
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AdvancedOrdersSheet({
  isOpen,
  orders = [],
  freshOrderId = '',
  onClose,
  onAccept,
  onReject,
}) {
  const [selectedOrder, setSelectedOrder] = useState(null);

  const sections = useMemo(() => {
    const accepted = [];
    const assigned = [];

    for (const order of orders) {
      const dispatchStatus = String(order?.dispatch?.status || order?.queueStatus || '').toLowerCase();
      if (dispatchStatus === 'accepted') accepted.push(order);
      else assigned.push(order);
    }

    return { accepted, assigned };
  }, [orders]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[520] bg-black/30 backdrop-blur-[1px] flex items-start justify-center px-[14px] pt-[130px] pb-24"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="relative w-full max-w-[336px] rounded-[24px] bg-white shadow-[0_26px_60px_rgba(15,23,42,0.24)] overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="px-4 pt-4 pb-4 text-white"
              style={{ background: 'linear-gradient(180deg, #ff9f1a 0%, #f59e0b 100%)' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-white/85">
                    Order Queue
                  </div>
                  <h2 className="mt-2 text-[15px] leading-5 font-extrabold tracking-tight">Live plus queued</h2>
                  <p className="mt-2 text-[13px] leading-5 text-white/92 max-w-[248px]">
                    Open your current order or any advanced assignment below without losing track of the delivery flow.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-1 w-9 h-9 rounded-full bg-white/18 border border-white/15 flex items-center justify-center text-white shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[58vh] overflow-y-auto bg-white p-3">
              {sections.accepted.length > 0 && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 px-1">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">Up Next</h3>
                  </div>
                  {sections.accepted.map((order) => {
                    const orderId = getOrderIdentity(order);
                    return (
                      <button
                        type="button"
                        key={orderId}
                        onClick={() => setSelectedOrder(order)}
                        className="w-full rounded-[1.5rem] bg-white border border-emerald-100 shadow-sm p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                              Accepted Queue
                            </div>
                            <p className="mt-3 text-lg font-bold text-slate-950">{getRestaurantName(order)}</p>
                            <p className="mt-1 text-sm text-slate-500 line-clamp-2">{getRestaurantAddress(order)}</p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {sections.assigned.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Package2 className="w-4 h-4 text-amber-600" />
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">Review To Add</h3>
                  </div>
                  {sections.assigned.map((order) => {
                    const orderId = getOrderIdentity(order);
                    const isFresh = freshOrderId && freshOrderId === orderId;

                    return (
                      <button
                        type="button"
                        key={orderId}
                        onClick={() => setSelectedOrder(order)}
                        className={`w-full rounded-[1.5rem] bg-white border p-4 text-left shadow-sm ${
                          isFresh ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${getQueueTone(order)}`}>
                                {getQueueLabel(order)}
                              </span>
                              {isFresh && (
                                <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="mt-3 text-lg font-bold text-slate-950">{getRestaurantName(order)}</p>
                            <p className="mt-1 text-sm text-slate-500 line-clamp-2">{getRestaurantAddress(order)}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                <Clock3 className="w-3.5 h-3.5" />
                                {getEta(order)}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                <MapPin className="w-3.5 h-3.5" />
                                {getDistance(order)}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                                <ShoppingBag className="w-3.5 h-3.5" />
                                {getItemCount(order) || 0} items
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Extra Pay</p>
                            <p className="mt-1 text-lg font-black text-slate-950">{toCurrency(getEarnings(order))}</p>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{getPaymentMode(order)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {orders.length === 0 && (
                <div className="rounded-[22px] border border-slate-200 bg-[#fcfcfd] px-5 py-9 text-center min-h-[160px] flex flex-col items-center justify-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white border border-slate-100 text-amber-500 shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                    <BellRing className="w-5 h-5 stroke-[2.2]" />
                  </div>
                  <p className="mt-5 text-[15px] leading-5 font-bold text-slate-900">No live or queued orders right now</p>
                  <p className="mt-3 text-[12px] leading-6 text-slate-500 max-w-[250px]">
                    This bell stays visible so you can always check future slots as soon as they get assigned.
                  </p>
                </div>
              )}
            </div>

            <AnimatePresence>
              {selectedOrder && (
                <AdvancedOrderDetailModal
                  order={selectedOrder}
                  onClose={() => setSelectedOrder(null)}
                  onAccept={async (order) => {
                    await onAccept?.(order);
                    setSelectedOrder(null);
                  }}
                  onReject={(order, reasonType) => {
                    onReject?.(order, reasonType);
                    setSelectedOrder(null);
                  }}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default AdvancedOrdersSheet;
