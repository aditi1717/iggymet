import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, Clock, TrendingUp, Wallet, Download } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';

const pad = (n) => String(n).padStart(2, '0');

const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const getTripDate = (trip) => {
  const raw = trip?.date || trip?.deliveredAt || trip?.createdAt || trip?.updatedAt;
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

const getTripIdentity = (trip) =>
  String(
    trip?.orderMongoId ||
      trip?._id ||
      trip?.orderId ||
      trip?.id ||
      '',
  ).trim();

const getStatusStyle = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'delivered') return { text: 'text-green-600', bg: 'bg-green-50', label: 'Completed' };
  if (s === 'cancelled' || s === 'rejected') return { text: 'text-red-500', bg: 'bg-red-50', label: 'Cancelled' };
  return { text: 'text-orange-500', bg: 'bg-orange-50', label: status || 'Pending' };
};

const formatTripTime = (trip) => {
  const d = getTripDate(trip);
  if (!d) return '--';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const isCashLike = (trip) => ['cash', 'cod'].includes(String(trip?.paymentMethod || '').toLowerCase());
const isCompletedTrip = (trip) => ['completed', 'delivered'].includes(String(trip?.status || '').toLowerCase());
const isUserUnavailableTrip = (trip) => {
  const rawStatus = String(trip?.rawOrderStatus || trip?.orderStatus || trip?.status || '')
    .trim()
    .toLowerCase();

  return Boolean(
    trip?.codExempt ||
      trip?.isCompensatedCancellation ||
      trip?.noResponseMeta?.isUserUnavailable ||
      rawStatus === 'cancelled_by_user_unavailable',
  );
};
const isEarningEligibleTrip = (trip) => isCompletedTrip(trip) || isUserUnavailableTrip(trip);
const getTripEarning = (trip) => {
  if (!isEarningEligibleTrip(trip)) return 0;
  return Number(trip?.deliveryEarning || trip?.earningAmount || trip?.amount || 0);
};
const htmlEscape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const HistoryV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const navigate = useNavigate();

  const today = new Date();
  const todayDateStr = toDateStr(today);

  const [dateFilterMode, setDateFilterMode] = useState('one_day');
  const [singleDate, setSingleDate] = useState(todayDateStr);
  const [selectedWeekDate, setSelectedWeekDate] = useState(todayDateStr);
  const [selectedMonth, setSelectedMonth] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  const [rangeStart, setRangeStart] = useState(toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [rangeEnd, setRangeEnd] = useState(todayDateStr);
  const [selectedTripType, setSelectedTripType] = useState('ALL TRIPS');

  const [allTrips, setAllTrips] = useState([]);
  const [loading, setLoading] = useState(false);

  const tripTypes = ['ALL TRIPS', 'Completed', 'Cancelled', 'Pending'];

  useEffect(() => {
    const fetchTrips = async () => {
      setLoading(true);
      try {
        // Load last 12 months so One Day / Weekly / Monthly / Date Wise / All filters work from one dataset.
        const monthAnchors = Array.from({ length: 12 }, (_, index) => {
          const d = new Date(today.getFullYear(), today.getMonth() - index, 15);
          return toDateStr(d);
        });
        const statuses = ['Completed', 'Cancelled', 'Pending'];

        const requests = monthAnchors.flatMap((date) =>
          statuses.map((status) => deliveryAPI.getTripHistory({ status, period: 'monthly', date, limit: 1000 })),
        );

        const responses = await Promise.allSettled(requests);

        const merged = [];
        for (const result of responses) {
          if (result.status !== 'fulfilled') continue;
          const trips = result?.value?.data?.data?.trips || [];
          if (Array.isArray(trips)) merged.push(...trips);
        }

        const unique = new Map();
        for (const trip of merged) {
          const id = getTripIdentity(trip) || String(trip?._id || trip?.id || '');
          if (!id) continue;
          if (!unique.has(id)) unique.set(id, trip);
        }
        setAllTrips(Array.from(unique.values()));
      } catch {
        toast.error('Failed to load history');
        setAllTrips([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTrips();
  }, []);

  const filteredTrips = useMemo(() => {
    const startOfDay = (dateStr) => {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const endOfDay = (dateStr) => {
      const d = new Date(dateStr);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    return allTrips
      .filter((trip) => {
        const tripDate = getTripDate(trip);
        if (!tripDate) return false;

        if (selectedTripType !== 'ALL TRIPS') {
          const normalized = String(trip?.status || '').toLowerCase();
          if (selectedTripType === 'Completed' && !['completed', 'delivered'].includes(normalized)) return false;
          if (selectedTripType === 'Cancelled' && !['cancelled', 'rejected'].includes(normalized)) return false;
          if (selectedTripType === 'Pending' && ['completed', 'delivered', 'cancelled', 'rejected'].includes(normalized)) return false;
        }

        if (dateFilterMode === 'all') return true;

        if (dateFilterMode === 'one_day') {
          const singleStart = startOfDay(singleDate);
          const singleEnd = endOfDay(singleDate);
          return tripDate >= singleStart && tripDate <= singleEnd;
        }

        if (dateFilterMode === 'weekly') {
          const anchor = startOfDay(selectedWeekDate);
          const weekStart = new Date(anchor);
          weekStart.setDate(anchor.getDate() - anchor.getDay());
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          return tripDate >= weekStart && tripDate <= weekEnd;
        }

        if (dateFilterMode === 'monthly') {
          const [yearRaw, monthRaw] = String(selectedMonth || '').split('-');
          const year = Number(yearRaw);
          const monthIndex = Number(monthRaw) - 1;
          if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return false;
          return tripDate.getFullYear() === year && tripDate.getMonth() === monthIndex;
        }

        if (dateFilterMode === 'date_wise') {
          if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return false;
          const rangeStartDate = startOfDay(rangeStart);
          const rangeEndDate = endOfDay(rangeEnd);
          return tripDate >= rangeStartDate && tripDate <= rangeEndDate;
        }

        return false;
      })
      .sort((a, b) => {
        const left = getTripDate(a)?.getTime() || 0;
        const right = getTripDate(b)?.getTime() || 0;
        return right - left;
      });
  }, [allTrips, dateFilterMode, singleDate, selectedWeekDate, selectedMonth, rangeStart, rangeEnd, selectedTripType]);

  const metrics = useMemo(() => {
    return filteredTrips.reduce(
      (acc, trip) => {
        const status = String(trip?.status || '').toLowerCase();
        const earning = getTripEarning(trip);
        const codAmt = isCashLike(trip) ? Number(trip?.codCollectedAmount || 0) : 0;

        if (isEarningEligibleTrip(trip)) {
          acc.earnings += earning;
        }
        if (['completed', 'delivered'].includes(status)) {
          acc.completed += 1;
        }
        if (['cancelled', 'rejected'].includes(status)) acc.cancelled += 1;

        acc.cod += codAmt;
        return acc;
      },
      { earnings: 0, cod: 0, completed: 0, cancelled: 0 },
    );
  }, [filteredTrips]);

  const openOrder = (trip) => {
    const orderId = getTripIdentity(trip);
    if (!orderId) {
      toast.error('Order ID not available');
      return;
    }
    navigate(`/food/delivery/orders/${orderId}`);
  };

  const handleDownloadExcel = () => {
    if (!filteredTrips.length) {
      toast.error('No rows to export');
      return;
    }

    const rows = filteredTrips.map((trip) => {
      const id = getTripIdentity(trip);
      const status = getStatusStyle(trip?.status).label;
      const cod = isCashLike(trip) ? Number(trip?.codCollectedAmount || 0).toFixed(2) : '0.00';
      const earning = getTripEarning(trip).toFixed(2);
      const payment = isCashLike(trip) ? 'COD' : 'Online';
      return [
        id,
        formatTripTime(trip),
        trip?.restaurant || trip?.restaurantName || '-',
        status,
        payment,
        cod,
        earning,
      ];
    });

    const bodyRowsHtml = rows
      .map((row) => `
        <tr>
          <td>${htmlEscape(row[0])}</td>
          <td>${htmlEscape(row[1])}</td>
          <td>${htmlEscape(row[2])}</td>
          <td>${htmlEscape(row[3])}</td>
          <td>${htmlEscape(row[4])}</td>
          <td class="num">${htmlEscape(row[5])}</td>
          <td class="num">${htmlEscape(row[6])}</td>
        </tr>
      `)
      .join('');

    const totalRowHtml = `
      <tr class="total-row">
        <td>TOTAL</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td class="num">${htmlEscape(metrics.cod.toFixed(2))}</td>
        <td class="num">${htmlEscape(metrics.earnings.toFixed(2))}</td>
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
                <th>Date Time</th>
                <th>Restaurant</th>
                <th>Status</th>
                <th>Payment</th>
                <th>COD</th>
                <th>Earning</th>
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
    const stamp = toDateStr(new Date());
    link.href = url;
    link.download = `delivery-history-${stamp}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Excel sheet downloaded');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between sticky top-0 z-[100]">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 active:scale-90 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-gray-900">Trip History</h1>
            <p className="text-[10px] text-gray-500 font-medium">Filter by date and open order details</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownloadExcel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] font-semibold text-gray-700"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      </div>

      <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-3 sticky top-[66px] z-[90]">
        <div>
          <label className="text-[11px] font-semibold text-gray-600">Date Filter</label>
          <div className="mt-1 flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'one_day', label: 'One Day' },
              { key: 'weekly', label: 'Weekly' },
              { key: 'monthly', label: 'Monthly' },
              { key: 'date_wise', label: 'Date Wise' },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDateFilterMode(opt.key)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${
                  dateFilterMode === opt.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {dateFilterMode === 'one_day' && (
          <div>
            <label className="text-[11px] font-semibold text-gray-600">Select Date</label>
            <input
              type="date"
              value={singleDate}
              max={todayDateStr}
              onChange={(e) => setSingleDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
            />
          </div>
        )}

        {dateFilterMode === 'weekly' && (
          <div>
            <label className="text-[11px] font-semibold text-gray-600">Select Week (Pick Any Day)</label>
            <input
              type="date"
              value={selectedWeekDate}
              max={todayDateStr}
              onChange={(e) => setSelectedWeekDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
            />
          </div>
        )}

        {dateFilterMode === 'monthly' && (
          <div>
            <label className="text-[11px] font-semibold text-gray-600">Select Month</label>
            <input
              type="month"
              value={selectedMonth}
              max={`${today.getFullYear()}-${pad(today.getMonth() + 1)}`}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
            />
          </div>
        )}

        {dateFilterMode === 'date_wise' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-gray-600">Start Date</label>
              <input
                type="date"
                value={rangeStart}
                max={todayDateStr}
                onChange={(e) => setRangeStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600">End Date</label>
              <input
                type="date"
                value={rangeEnd}
                max={todayDateStr}
                onChange={(e) => setRangeEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-[11px] font-semibold text-gray-600">Trip Status</label>
          <select
            value={selectedTripType}
            onChange={(e) => setSelectedTripType(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
          >
            {tripTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-orange-500" />
              </div>
              <p className="text-xs font-semibold text-gray-700">COD Collected</p>
            </div>
            <p className="text-xl font-bold text-gray-900">Rs {metrics.cod.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" />
              </div>
              <p className="text-xs font-semibold text-gray-700">Earnings</p>
            </div>
            <p className="text-xl font-bold text-gray-900">Rs {metrics.earnings.toFixed(2)}</p>
          </div>
        </div>

        {!loading && filteredTrips.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-medium text-gray-500">
            <span>{filteredTrips.length} trips</span>
            {metrics.completed > 0 && <span className="text-green-600">- {metrics.completed} completed</span>}
            {metrics.cancelled > 0 && <span className="text-red-500">- {metrics.cancelled} cancelled</span>}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
            <p className="text-gray-500 text-xs font-medium">Fetching trips...</p>
          </div>
        ) : filteredTrips.length > 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[780px] w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Order ID</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Date/Time</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Restaurant</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-600">Payment</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600">COD</th>
                    <th className="text-right px-4 py-3 text-xs font-bold text-gray-600">Earning</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip, idx) => {
                    const id = getTripIdentity(trip) || `row-${idx}`;
                    const statusStyle = getStatusStyle(trip?.status);
                    const cod = isCashLike(trip) ? Number(trip?.codCollectedAmount || 0) : 0;
                    const earning = getTripEarning(trip);
                    return (
                      <tr
                        key={id}
                        onClick={() => openOrder(trip)}
                        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-4 py-3 font-semibold text-gray-900">#{id.slice(-10)}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatTripTime(trip)}</td>
                        <td className="px-4 py-3 text-gray-700">{trip?.restaurant || trip?.restaurantName || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{isCashLike(trip) ? 'COD' : 'Online'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">Rs {cod.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-green-600">Rs {earning.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">Tap any row to open that order detail.</p>
          </div>
        ) : (
          <div className="py-16 text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <Clock className="w-7 h-7 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">No Trips Found</p>
              <p className="text-xs text-gray-400 mt-0.5">No trips for current filters. Try changing date range or trip status.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistoryV2;
