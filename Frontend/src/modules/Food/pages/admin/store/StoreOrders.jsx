import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Package, Search, X } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import { AnimatePresence, motion } from "framer-motion";

const RUPEE = "\u20B9";

const STATUS_OPTIONS = ["pending", "confirmed", "dispatched", "delivered", "cancelled"];

const getStatusClasses = (status) => {
  const palette = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-sky-100 text-sky-700",
    dispatched: "bg-violet-100 text-violet-700",
    delivered: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-rose-100 text-rose-700",
  };

  return palette[String(status || "").toLowerCase()] || "bg-slate-100 text-slate-700";
};

const formatPartnerName = (partner) => {
  if (!partner) return "Unknown";
  return partner.name || [partner.firstName, partner.lastName].filter(Boolean).join(" ") || "Unknown";
};

function StoreOrderDetailsModal({ group, onClose }) {
  if (!group) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-base font-bold text-slate-900 line-clamp-1">
                Order #{group.groupKey.slice(-8).toUpperCase()}
              </h2>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Details Breakdown
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-50 p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Partner Information
                </p>
                <h3 className="text-sm font-bold text-slate-900">
                  {formatPartnerName(group.deliveryPartner)}
                </h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {group.deliveryPartner?.phone || "--"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Status & Payment
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-slate-500">Status</p>
                  <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${getStatusClasses(group.orderStatus)}`}>
                    {group.orderStatus}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-slate-500">Payment</p>
                  <p className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                    {group.paymentMethod || "online"} • <span className={group.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-amber-500'}>{group.paymentStatus || "pending"}</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                Items ({group.items.length})
              </p>

              <div className="space-y-3">
                {group.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {item.productImage ? (
                        <img src={item.productImage} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-[13px] font-bold text-slate-900">{item.productName}</h4>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {item.variantName} x {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-slate-900">
                        {RUPEE}{Number(item.totalAmount || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Total Amount</p>
                  <p className="text-lg font-black text-slate-900">
                    {RUPEE}{Number(group.totalAmount || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default function StoreOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getStoreOrdersAdmin({ limit: 100 });
      const orderList =
        response?.data?.data?.orders ||
        response?.data?.orders ||
        response?.data?.data ||
        response?.data ||
        [];

      setOrders(Array.isArray(orderList) ? orderList : []);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load store orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const groupedOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    const groups = new Map();

    list.forEach((order) => {
      // Use checkoutGroupId as priority for grouping bulk orders
      const groupKey = String(order?.checkoutGroupId || order?._id || "");
      const existingGroup = groups.get(groupKey);

      if (existingGroup) {
        existingGroup.items.push(order);
        existingGroup.totalAmount += Number(order?.totalAmount || 0);
        existingGroup.totalQuantity += Number(order?.quantity || 0);
        return;
      }

      groups.set(groupKey, {
        groupKey,
        mainOrder: order,
        items: [order],
        totalAmount: Number(order?.totalAmount || 0),
        totalQuantity: Number(order?.quantity || 0),
        createdAt: order?.createdAt,
        orderStatus: order?.orderStatus || "pending",
        deliveryPartner: order?.deliveryPartnerId,
        paymentMethod: order?.paymentMethod,
        paymentStatus: order?.paymentStatus,
      });
    });

    let groupList = Array.from(groups.values());

    // Status filtering
    if (statusFilter !== "all") {
      groupList = groupList.filter(group => 
        String(group.orderStatus || "pending").toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Search filtering
    const query = searchQuery.trim().toLowerCase();
    if (!query) return groupList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return groupList.filter((group) => {
      const partnerName = formatPartnerName(group.deliveryPartner).toLowerCase();
      const phone = String(group.deliveryPartner?.phone || "").toLowerCase();
      const productsMatch = group.items.some(item => 
        String(item.productName || "").toLowerCase().includes(query) ||
        String(item.variantName || "").toLowerCase().includes(query)
      );

      return partnerName.includes(query) || phone.includes(query) || productsMatch;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, searchQuery, statusFilter]);

  const handleStatusChange = async (orderGroup, newStatus) => {
    try {
      setUpdatingOrderId(orderGroup.groupKey);
      
      // Update each order in the group. Ideally there would be a group update API.
      // For now, we update them one by one or until the first failure.
      const updatePromises = orderGroup.items.map(item => 
        adminAPI.updateStoreOrderStatusAdmin(item._id, { orderStatus: newStatus })
      );
      
      await Promise.all(updatePromises);

      // Local update
      setOrders((previousOrders) =>
        previousOrders.map((order) => {
          const belongsToGroup = orderGroup.items.some(item => item._id === order._id) || 
                               (order.checkoutGroupId && order.checkoutGroupId === orderGroup.groupKey);
          if (belongsToGroup) {
            return { ...order, orderStatus: newStatus };
          }
          return order;
        })
      );

      toast.success("Order status updated for group");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update group status");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Store Orders</h1>
            <p className="mt-0.5 text-[13px] font-medium text-slate-500">
              Manage delivery partner purchases.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map(status => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500">Loading store orders...</p>
          </div>
        ) : groupedOrders.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-6 text-center">
            <Package className="h-12 w-12 text-slate-300" />
            <p className="text-lg font-semibold text-slate-700">No store orders found</p>
            <p className="text-sm text-slate-500">New store purchases will appear here.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-slate-200 bg-slate-50">
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Order Details
                </TableHead>
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Delivery Partner
                </TableHead>
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Amount
                </TableHead>
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Payment
                </TableHead>
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Date
                </TableHead>
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 text-center">
                  View
                </TableHead>
                <TableHead className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Update Group
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {groupedOrders.map((group) => (
                <TableRow key={group.groupKey} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                  <TableCell className="whitespace-normal px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <p className="text-[13px] font-bold text-slate-900">
                          #{group.groupKey.slice(-8).toUpperCase()}
                        </p>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider ${getStatusClasses(group.orderStatus)}`}
                          >
                            {group.orderStatus || "pending"}
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">
                            {group.items.length} Item{group.items.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-normal px-4 py-2">
                    <p className="text-[13px] font-bold text-slate-900">
                      {formatPartnerName(group.deliveryPartner)}
                    </p>
                    <p className="text-[11px] font-medium text-slate-500">
                      {group.deliveryPartner?.phone || "--"}
                    </p>
                  </TableCell>

                  <TableCell className="px-4 py-2">
                    <span className="text-[14px] font-bold text-slate-900">
                      {RUPEE}{Number(group.totalAmount || 0).toFixed(2)}
                    </span>
                  </TableCell>

                  <TableCell className="px-4 py-2">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
                        {group.paymentMethod || "online"}
                      </p>
                      <p className={`text-[9px] font-bold uppercase tracking-widest ${group.paymentStatus === 'PAID' ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {group.paymentStatus || "pending"}
                      </p>
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-normal px-4 py-2">
                    <p className="text-[12px] font-semibold text-slate-700">
                      {group.createdAt ? new Date(group.createdAt).toLocaleDateString("en-IN", { day: '2-digit', month: 'short' }) : "-"}
                    </p>
                    <p className="text-[10px] font-medium text-slate-500">
                      {group.createdAt ? new Date(group.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  </TableCell>

                  <TableCell className="px-4 py-2 text-center">
                    <button
                      onClick={() => setSelectedGroup(group)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400 transition hover:bg-white hover:text-blue-600 hover:shadow-sm active:scale-95"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </TableCell>

                  <TableCell className="px-4 py-2">
                    <select
                      value={String(group.orderStatus || "pending").toLowerCase()}
                      onChange={(event) => handleStatusChange(group, event.target.value)}
                      disabled={updatingOrderId === group.groupKey}
                      className="min-w-[130px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none transition focus:border-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <StoreOrderDetailsModal
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  );
}


