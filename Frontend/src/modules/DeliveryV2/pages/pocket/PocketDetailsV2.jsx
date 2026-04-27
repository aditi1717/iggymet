import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Download } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const asArray = (value) => (Array.isArray(value) ? value : []);

const getTripId = (trip) => String(trip?.orderId || trip?._id || trip?.id || '-');

const getTripEarning = (trip) =>
  Number(
    trip?.deliveryEarning ??
      trip?.earningAmount ??
      trip?.deliveryPayout ??
      trip?.payout ??
      trip?.estimatedEarnings?.totalEarning ??
      0,
  );

const getTripTotalAmount = (trip) =>
  Number(
    trip?.totalAmount ??
      trip?.pricing?.total ??
      trip?.pricing?.grandTotal ??
      trip?.payment?.amount ??
      trip?.payment?.amountDue ??
      trip?.amount ??
      0,
  );

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

const getAdminPaidStatus = (trip) => {
  const raw = [
    trip?.partnerPayoutStatus,
    trip?.payoutStatus,
    trip?.settlementStatus,
    trip?.paymentSettlementStatus,
    trip?.deliveryPayoutStatus,
    trip?.adminPayoutStatus,
    trip?.payout?.status,
    trip?.partnerSettlement?.status,
    trip?.isPartnerPaid ? 'paid' : '',
  ]
    .map(normalizeStatus)
    .find(Boolean);

  if (!raw) return 'Unpaid';
  if (['paid', 'completed', 'settled', 'processed', 'success', 'approved'].includes(raw)) return 'Paid';
  if (['pending', 'requested', 'processing', 'queued', 'in_progress'].includes(raw)) return 'Pending';
  if (['failed', 'rejected', 'denied'].includes(raw)) return 'Failed';
  if (['unpaid', 'hold', 'on_hold'].includes(raw)) return 'Unpaid';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const getCodToAdminStatus = (trip, adminPaidStatus) => {
  const method = String(
    trip?.paymentMethod ||
      trip?.payment?.method ||
      trip?.transaction?.paymentMethod ||
      '',
  )
    .trim()
    .toLowerCase();

  const isCash = ['cash', 'cod', 'cash_on_delivery'].includes(method);
  if (!isCash) return 'N/A (Online)';

  const raw = String(
    trip?.cashSubmittedToAdmin ||
      trip?.cashHandoverStatus ||
      trip?.paymentCollectionStatus ||
      trip?.dispatch?.cashCollectionStatus ||
      trip?.deliveryCashStatus ||
      '',
  )
    .trim()
    .toLowerCase();

  if (['yes', 'true', 'submitted', 'deposited', 'settled', 'paid', 'handed_over', 'collected'].includes(raw)) {
    return 'Submitted';
  }

  if (['no', 'false', 'pending', 'not_submitted', 'due'].includes(raw)) {
    return 'Pending';
  }

  return adminPaidStatus === 'Paid' ? 'Submitted' : 'Pending';
};

const getPaymentModeLabel = (trip) => {
  const method = String(
    trip?.paymentMethod ||
      trip?.payment?.method ||
      trip?.transaction?.paymentMethod ||
      '',
  )
    .trim()
    .toLowerCase();

  if (['cash', 'cod', 'cash_on_delivery'].includes(method)) return 'Cash';
  if (['wallet'].includes(method)) return 'Wallet';
  if (!method) return 'Online';
  return 'Online';
};

const getStatusBadgeClasses = (status) => {
  if (status === 'Paid') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'Failed') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const getCodStatusBadgeClasses = (status) => {
  if (status === 'Submitted') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'Pending') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'N/A (Online)') return 'bg-slate-50 text-slate-600 border-slate-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const pad = (n) => String(n).padStart(2, '0');
const toInputDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const htmlEscape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toStartOfDay = (dateString) => {
  const d = new Date(dateString);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toEndOfDay = (dateString) => {
  const d = new Date(dateString);
  d.setHours(23, 59, 59, 999);
  return d;
};

const formatUiDate = (value) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export const PocketDetailsV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState([]);
  const [filterMode, setFilterMode] = useState('one_day');
  const [selectedDate, setSelectedDate] = useState(toInputDate(new Date()));
  const [selectedWeekDate, setSelectedWeekDate] = useState(toInputDate(new Date()));
  const [rangeStart, setRangeStart] = useState(toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [rangeEnd, setRangeEnd] = useState(toInputDate(new Date()));
  const [paymentFilter, setPaymentFilter] = useState('all');

  useEffect(() => {
    const fetchDeliveredTrips = async () => {
      try {
        setLoading(true);
        // Backend does not support "period=all"; load monthly buckets and merge.
        const now = new Date();
        const monthsToLoad = 12;
        const monthAnchors = Array.from({ length: monthsToLoad }, (_, index) => {
          const d = new Date(now.getFullYear(), now.getMonth() - index, 15);
          return d.toISOString().split('T')[0];
        });

        const responses = await Promise.allSettled(
          monthAnchors.map((date) =>
            deliveryAPI.getTripHistory({
              status: 'Completed',
              period: 'monthly',
              date,
              limit: 1000,
            }),
          ),
        );

        const merged = [];
        for (const result of responses) {
          if (result.status !== 'fulfilled') continue;
          const items = asArray(result?.value?.data?.data?.trips);
          merged.push(...items);
        }

        const uniqueById = new Map();
        for (const trip of merged) {
          const id = getTripId(trip);
          if (!id || id === '-') continue;
          if (!uniqueById.has(id)) uniqueById.set(id, trip);
        }

        setTrips(Array.from(uniqueById.values()));
      } catch (error) {
        setTrips([]);
        toast.error('Failed to load delivered payout data');
      } finally {
        setLoading(false);
      }
    };

    fetchDeliveredTrips();
  }, []);

  const rows = useMemo(
    () =>
      asArray(trips)
        .map((trip) => {
          const adminPaidStatus = getAdminPaidStatus(trip);
          return {
            id: getTripId(trip),
            restaurant: trip?.restaurantName || trip?.restaurantId?.name || 'Restaurant',
            deliveredAt: trip?.deliveredAt || trip?.completedAt || trip?.createdAt || null,
            orderAmount: getTripTotalAmount(trip),
            earning: getTripEarning(trip),
            paymentMode: getPaymentModeLabel(trip),
            adminPaidStatus,
            codToAdminStatus: getCodToAdminStatus(trip, adminPaidStatus),
          };
        })
        .sort((a, b) => new Date(b.deliveredAt || 0).getTime() - new Date(a.deliveredAt || 0).getTime()),
    [trips],
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const delivered = row.deliveredAt ? new Date(row.deliveredAt) : null;
      if (!delivered || Number.isNaN(delivered.getTime())) return false;
      let inDateRange = false;

      if (filterMode === 'one_day') {
        inDateRange = delivered >= toStartOfDay(selectedDate) && delivered <= toEndOfDay(selectedDate);
      }

      if (filterMode === 'weekly') {
        const anchor = toStartOfDay(selectedWeekDate);
        const weekStart = new Date(anchor);
        weekStart.setDate(anchor.getDate() - anchor.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        inDateRange = delivered >= weekStart && delivered <= weekEnd;
      }

      if (filterMode === 'date_wise') {
        inDateRange = delivered >= toStartOfDay(rangeStart) && delivered <= toEndOfDay(rangeEnd);
      }

      if (!inDateRange) return false;

      if (paymentFilter === 'cod') return row.paymentMode === 'Cash';
      if (paymentFilter === 'online') return row.paymentMode !== 'Cash';
      return true;
    });
  }, [rows, filterMode, selectedDate, selectedWeekDate, rangeStart, rangeEnd, paymentFilter]);

  const weeklyRange = useMemo(() => {
    const anchor = toStartOfDay(selectedWeekDate);
    const weekStart = new Date(anchor);
    weekStart.setDate(anchor.getDate() - anchor.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
  }, [selectedWeekDate]);

  const handleDownloadExcel = () => {
    if (!filteredRows.length) {
      toast.error('No rows to export');
      return;
    }

    const body = filteredRows.map((row) => [
      row.id,
      row.restaurant,
      row.deliveredAt
        ? new Date(row.deliveredAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '--',
      row.paymentMode,
      row.orderAmount.toFixed(2),
      row.earning.toFixed(2),
      row.adminPaidStatus,
      row.codToAdminStatus,
    ]);

    const totals = filteredRows.reduce(
      (acc, row) => {
        acc.orderAmount += Number(row.orderAmount || 0);
        acc.earning += Number(row.earning || 0);
        return acc;
      },
      { orderAmount: 0, earning: 0 },
    );

    const bodyRowsHtml = body
      .map((line) => `
        <tr>
          <td>${htmlEscape(line[0])}</td>
          <td>${htmlEscape(line[1])}</td>
          <td>${htmlEscape(line[2])}</td>
          <td>${htmlEscape(line[3])}</td>
          <td class="num">${htmlEscape(line[4])}</td>
          <td class="num">${htmlEscape(line[5])}</td>
          <td>${htmlEscape(line[6])}</td>
          <td>${htmlEscape(line[7])}</td>
        </tr>
      `)
      .join('');

    const totalRowHtml = `
      <tr class="total-row">
        <td>TOTAL</td>
        <td></td>
        <td></td>
        <td></td>
        <td class="num">${htmlEscape(totals.orderAmount.toFixed(2))}</td>
        <td class="num">${htmlEscape(totals.earning.toFixed(2))}</td>
        <td></td>
        <td></td>
      </tr>
    `;

    const xlsHtml = `
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            table { border-collapse: collapse; width: 100%; font-family: Calibri, Arial, sans-serif; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px; }
            th { background: #f3f4f6; font-weight: 700; text-align: left; }
            td.num { text-align: right; }
            tr.total-row td { background: #fef3c7; font-weight: 700; color: #111827; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Restaurant</th>
                <th>Delivered At</th>
                <th>Payment</th>
                <th>Order Amount</th>
                <th>Earning</th>
                <th>Admin Paid</th>
                <th>COD To Admin</th>
              </tr>
            </thead>
            <tbody>
              ${bodyRowsHtml}
              ${totalRowHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const blob = new Blob([xlsHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `delivered-payout-${toInputDate(new Date())}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Excel sheet downloaded');
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-12">
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-30 shadow-sm gap-3">
        <button
          onClick={goBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Delivered Orders Payout</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setFilterMode('one_day')}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${filterMode === 'one_day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              One Day
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('weekly')}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${filterMode === 'weekly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('date_wise')}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${filterMode === 'date_wise' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'}`}
            >
              Date Wise
            </button>
          </div>

          {filterMode === 'one_day' && (
            <div>
              <label className="text-[11px] font-semibold text-gray-600">Select Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
              />
            </div>
          )}

          {filterMode === 'weekly' && (
            <div>
              <label className="text-[11px] font-semibold text-gray-600">Week Anchor Date</label>
              <input
                type="date"
                value={selectedWeekDate}
                onChange={(e) => setSelectedWeekDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
              />
              <p className="mt-2 text-[11px] font-medium text-gray-500">
                Weekly range: {formatUiDate(weeklyRange.weekStart)} to {formatUiDate(weeklyRange.weekEnd)}
              </p>
            </div>
          )}

          {filterMode === 'date_wise' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-gray-600">Start Date</label>
                <input
                  type="date"
                  value={rangeStart}
                  max={rangeEnd}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-gray-600">End Date</label>
                <input
                  type="date"
                  value={rangeEnd}
                  min={rangeStart}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">Filtered Rows: {filteredRows.length}</p>
            <button
              type="button"
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-700"
            >
              <Download className="w-3.5 h-3.5" />
              Download Excel
            </button>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-gray-600">Payment Filter</label>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
            >
              <option value="all">All Payments</option>
              <option value="cod">COD</option>
              <option value="online">Online</option>
            </select>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <p className="text-xs font-semibold text-gray-500">Loading delivered orders...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-gray-700">No delivered orders found for selected filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Order</th>
                    <th className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Restaurant</th>
                    <th className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Delivered</th>
                    <th className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Payment</th>
                    <th className="px-6 py-2.5 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider">Order Amount</th>
                    <th className="px-6 py-2.5 text-right text-[11px] font-bold text-gray-600 uppercase tracking-wider">Earning</th>
                    <th className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">Admin Paid</th>
                    <th className="px-6 py-2.5 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wider">COD To Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-6 py-2.5 font-semibold text-gray-900 whitespace-nowrap">#{row.id.slice(-8)}</td>
                      <td className="px-6 py-2.5 text-gray-700">{row.restaurant}</td>
                      <td className="px-6 py-2.5 text-gray-600">
                        {row.deliveredAt
                          ? new Date(row.deliveredAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '--'}
                      </td>
                      <td className="px-6 py-2.5 text-gray-700 font-medium">{row.paymentMode}</td>
                      <td className="px-6 py-2.5 text-right font-semibold text-gray-800">Rs {row.orderAmount.toFixed(2)}</td>
                      <td className="px-6 py-2.5 text-right font-bold text-gray-900">Rs {row.earning.toFixed(2)}</td>
                      <td className="px-6 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getStatusBadgeClasses(
                            row.adminPaidStatus,
                          )}`}
                        >
                          {row.adminPaidStatus}
                        </span>
                      </td>
                      <td className="px-6 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getCodStatusBadgeClasses(
                            row.codToAdminStatus,
                          )}`}
                        >
                          {row.codToAdminStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PocketDetailsV2;
