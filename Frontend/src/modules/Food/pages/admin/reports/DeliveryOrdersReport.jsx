import React, { useEffect, useMemo, useState } from "react";
import { adminAPI } from "@food/api";
import { RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

const toNumber = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

const toCurrency = (value) =>
  `\u20B9${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toDateValue = (input) => {
  const d = input ? new Date(input) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentRangeFromPeriod = (period) => {
  const now = new Date();
  const today = toDateValue(now);

  if (period === "today") {
    return { startDate: today, endDate: today };
  }

  if (period === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    return { startDate: toDateValue(start), endDate: today };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: toDateValue(start), endDate: today };
  }

  return { startDate: "", endDate: "" };
};

const isCashMode = (method) => {
  const m = String(method || "").toLowerCase();
  return m === "cash" || m === "cod";
};

const getPaymentMode = (order) => {
  const method = String(order?.payment?.method || order?.paymentMethod || "").toLowerCase();
  if (isCashMode(method)) return "Cash";
  if (method === "wallet") return "Wallet";
  if (!method) return "N/A";
  return "Online";
};

const getPayoutStatus = (order) => {
  const raw = String(
    order?.deliveryPayoutStatus ||
      order?.deliveryPartnerPayoutStatus ||
      order?.deliverySettlementStatus ||
      order?.settlement?.deliveryStatus ||
      order?.deliverySettlement?.status ||
      order?.paymentCollectionStatus ||
      ""
  )
    .trim()
    .toLowerCase();

  if (["paid", "settled", "completed", "done", "processed"].includes(raw)) return "Paid";
  if (["unpaid", "pending", "due", "not_paid", "open"].includes(raw)) return "Unpaid";
  return "Unpaid";
};

const getCashHandover = (order, payoutStatus) => {
  if (getPaymentMode(order) !== "Cash") return "-";

  const raw = String(
    order?.cashSubmittedToAdmin ||
      order?.cashHandoverStatus ||
      order?.paymentCollectionStatus ||
      order?.dispatch?.cashCollectionStatus ||
      order?.deliveryCashStatus ||
      ""
  )
    .trim()
    .toLowerCase();

  if (["yes", "true", "submitted", "deposited", "settled", "paid", "handed_over", "collected"].includes(raw)) {
    return "Yes";
  }
  if (["no", "false", "pending", "not_submitted", "due"].includes(raw)) {
    return "No";
  }

  return payoutStatus === "Paid" ? "Yes" : "No";
};

export default function DeliveryOrdersReport() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadData = async (nextPeriod = period, nextStart = startDate, nextEnd = endDate) => {
    setLoading(true);
    try {
      const params = {
        page: 1,
        limit: 500,
        status: "delivered",
      };

      if (nextStart) params.startDate = nextStart;
      if (nextEnd) params.endDate = nextEnd;

      const response = await adminAPI.getOrders(params);
      const payload = response?.data?.data || {};
      const orders = payload?.orders || payload?.docs || payload?.data || [];
      const list = Array.isArray(orders) ? orders : [];

      const mapped = list.map((order, index) => {
        const payoutStatus = getPayoutStatus(order);
        const paymentMode = getPaymentMode(order);
        const orderAmount = toNumber(order?.pricing?.total, order?.totalAmount, order?.total);
        const earning = toNumber(order?.riderEarning, order?.deliveryPartnerSettlement, order?.pricing?.deliveryFee);

        return {
          id: order?._id || order?.id || `${order?.orderId || "order"}-${index}`,
          orderId: order?.orderId || order?.id || "-",
          createdAt: order?.createdAt || null,
          deliveryBoy:
            order?.deliveryPartnerName ||
            order?.dispatch?.deliveryPartnerId?.name ||
            "-",
          deliveryBoyPhone:
            order?.deliveryPartnerPhone ||
            order?.dispatch?.deliveryPartnerId?.phone ||
            "-",
          paymentMode,
          orderAmount,
          earning,
          payoutStatus,
          cashToAdmin: getCashHandover(order, payoutStatus),
          orderStatus: order?.orderStatus || "-",
        };
      });

      setRows(mapped);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to load delivery order report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [
        row.orderId,
        row.deliveryBoy,
        row.deliveryBoyPhone,
        row.paymentMode,
        row.payoutStatus,
        row.cashToAdmin,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.totalOrders += 1;
        acc.totalOrderAmount += toNumber(row.orderAmount);
        acc.totalEarnings += toNumber(row.earning);
        if (row.payoutStatus === "Paid") acc.paidCount += 1;
        if (row.payoutStatus === "Unpaid") acc.unpaidCount += 1;
        if (row.paymentMode === "Cash") acc.cashOrders += 1;
        return acc;
      },
      {
        totalOrders: 0,
        totalOrderAmount: 0,
        totalEarnings: 0,
        paidCount: 0,
        unpaidCount: 0,
        cashOrders: 0,
      }
    );
  }, [filteredRows]);

  const applyPeriod = (nextPeriod) => {
    const range = getCurrentRangeFromPeriod(nextPeriod);
    setPeriod(nextPeriod);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    loadData(nextPeriod, range.startDate, range.endDate);
  };

  const applyDateFilter = () => {
    if (startDate && endDate && startDate > endDate) {
      toast.error("Start date cannot be after end date");
      return;
    }
    loadData(period, startDate, endDate);
  };

  const resetFilters = () => {
    setSearch("");
    setPeriod("all");
    setStartDate("");
    setEndDate("");
    loadData("all", "", "");
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Delivery Orders Report</h1>
        <p className="text-sm text-slate-600 mt-1">
          Order-wise delivery report with payment type, order amount, rider earning, paid/unpaid payout, and cash handover status.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={period}
            onChange={(e) => applyPeriod(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
          />

          <button
            onClick={applyDateFilter}
            className="h-11 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Apply Date Filter
          </button>

          <button
            onClick={resetFilters}
            className="h-11 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        <div className="mt-3 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID, delivery boy, phone, payment..."
            className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-slate-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Total Orders</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summary.totalOrders}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Order Amount</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{toCurrency(summary.totalOrderAmount)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Rider Earning</p>
          <p className="text-xl font-bold text-emerald-700 mt-1">{toCurrency(summary.totalEarnings)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Paid / Unpaid</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summary.paidCount} / {summary.unpaidCount}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs text-slate-500">Cash Orders</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{summary.cashOrders}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Order ID</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Delivery Boy</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Payment</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Order Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Earning</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Payout</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Cash To Admin</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-700 uppercase tracking-wider">Order Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500 font-medium">
                    Loading report...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500 font-medium">
                    No delivery orders found for selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-sm text-slate-700">{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{row.orderId}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString("en-IN") : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{row.deliveryBoy}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{row.deliveryBoyPhone}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.paymentMode}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{toCurrency(row.orderAmount)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-emerald-700">{toCurrency(row.earning)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          row.payoutStatus === "Paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.payoutStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.cashToAdmin}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.orderStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
