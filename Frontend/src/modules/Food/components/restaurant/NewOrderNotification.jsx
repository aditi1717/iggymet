import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ShoppingBag, MapPin, Clock, IndianRupee } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getDueAmount = (orderLike) => {
  const directCandidates = [
    orderLike?.pricing?.previousDue,
    orderLike?.previousDue,
    orderLike?.dueAmount,
    orderLike?.pricing?.dueAmount,
  ];

  for (const candidate of directCandidates) {
    const amount = toFiniteNumber(candidate);
    if (amount !== null && amount > 0) return amount;
  }

  const payableAmount = toFiniteNumber(orderLike?.payment?.amountDue);
  const baseTotal = toFiniteNumber(
    orderLike?.pricing?.total ??
      orderLike?.totalAmount ??
      orderLike?.total,
  );

  if (payableAmount !== null && baseTotal !== null && payableAmount > baseTotal) {
    return payableAmount - baseTotal;
  }

  return 0;
};

const getPayableAmount = (orderLike) => {
  const dueAmount = getDueAmount(orderLike);
  const payableCandidates = [
    orderLike?.payment?.amountDue,
    orderLike?.pricing?.amountDue,
    orderLike?.amountDue,
    orderLike?.totalAmount,
    orderLike?.total,
  ];

  for (const candidate of payableCandidates) {
    const amount = toFiniteNumber(candidate);
    if (amount !== null && amount > 0) return amount;
  }

  return dueAmount;
};

/**
 * New Order Notification Component
 * Displays a notification popup when a new order is received
 */
export default function NewOrderNotification({ order, onClose, onViewOrder }) {
  const navigate = useNavigate();
  const dueAmount = getDueAmount(order);
  const payableAmount = getPayableAmount(order);

  const handleViewOrder = () => {
    if (onViewOrder && order) {
      onViewOrder(order);
    } else if (order) {
      navigate(`/restaurant/orders/${order.orderMongoId || order.orderId}`);
    }
    if (onClose) onClose();
  };

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-md"
        >
          <div className="overflow-hidden rounded-2xl border-2 border-green-500 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-green-500 to-green-600 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                  <Bell className="h-6 w-6 animate-pulse text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">New Order!</h3>
                  <p className="text-sm text-white/90">Order #{order.orderId}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl bg-green-50 p-4">
                  <div className="flex items-center gap-2">
                    <IndianRupee className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-gray-600">Total Amount</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">
                    Rs {payableAmount.toFixed(2)}
                  </span>
                </div>

                {dueAmount > 0 && (
                  <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <span className="text-sm font-medium text-orange-800">Penalty / Previous Due</span>
                    <span className="text-sm font-bold text-orange-800">Rs {dueAmount.toFixed(2)}</span>
                  </div>
                )}

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-700">Items:</h4>
                  <div className="space-y-2">
                    {order.items?.slice(0, 3).map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">
                          {item.name} x {item.quantity}
                        </span>
                        <span className="font-medium text-gray-800">
                          Rs {(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {order.items?.length > 3 && (
                      <p className="mt-2 text-xs text-gray-500">
                        +{order.items.length - 3} more items
                      </p>
                    )}
                  </div>
                </div>

                {order.customerAddress && (
                  <div className="flex items-start gap-2 rounded-lg bg-gray-50 p-3">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500" />
                    <div className="flex-1">
                      <p className="mb-1 text-xs text-gray-500">Delivery Address</p>
                      <p className="text-sm text-gray-800">
                        {order.customerAddress.street || order.customerAddress.label || 'Address'}
                        {order.customerAddress.city ? `, ${order.customerAddress.city}` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {order.estimatedDeliveryTime && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="h-4 w-4" />
                    <span>Est. delivery: {order.estimatedDeliveryTime} mins</span>
                  </div>
                )}

                {(order.restaurantNote || order.note) && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                    <p className="mb-1 text-xs font-medium text-yellow-800">Restaurant Note:</p>
                    <p className="text-sm text-yellow-900">{order.restaurantNote || order.note}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleViewOrder}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-green-700"
                >
                  <ShoppingBag className="h-5 w-5" />
                  View Order
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
