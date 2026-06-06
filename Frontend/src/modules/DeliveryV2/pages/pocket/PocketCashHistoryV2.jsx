import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Receipt } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import { formatCurrency } from '@food/utils/currency';
import BRAND_THEME from '@/config/brandTheme';

const formatDateTime = (value) => {
  if (!value) return '--';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const getStatusBadgeClasses = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'completed') return 'bg-green-50 text-green-700 border-green-200';
  if (normalizedStatus === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
};

const getStatusLabel = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();
  if (normalizedStatus === 'completed') return 'Paid';
  if (normalizedStatus === 'failed') return 'Failed';
  if (normalizedStatus === 'pending') return 'Pending';
  return status || 'Pending';
};

export const PocketCashHistoryV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [cashSummary, setCashSummary] = useState({ cashInHand: 0, cashSubmittedToAdmin: 0 });
  const [depositHistory, setDepositHistory] = useState([]);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true);
        const [walletRes, depositRes] = await Promise.all([
          deliveryAPI.getWallet(),
          deliveryAPI.getWalletTransactions({ type: 'deposit', limit: 100 }),
        ]);
        const wallet = walletRes?.data?.data?.wallet || {};
        setCashSummary({
          cashInHand: Number(wallet?.cashInHand) || 0,
          cashSubmittedToAdmin: Number(wallet?.cashSubmittedToAdmin ?? wallet?.totalSubmittedToAdmin) || 0,
        });
        setDepositHistory(Array.isArray(depositRes?.data?.data?.transactions) ? depositRes.data.data.transactions : []);
      } catch (error) {
        toast.error('Failed to load cash payout history');
        setDepositHistory([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Cash Payout History</h1>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <p className="text-sm font-bold text-gray-900">Cash To Admin Summary</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Cash In Hand</p>
              <p className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(cashSummary.cashInHand)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Paid To Admin</p>
              <p className="mt-2 text-lg font-bold text-gray-900">{formatCurrency(cashSummary.cashSubmittedToAdmin)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-bold text-gray-900">History</p>
            <p className="text-[11px] text-gray-500">All Razorpay cash-to-admin payment records.</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" style={{ color: BRAND_THEME.colors.brand.primary }} />
              <p className="text-sm font-medium text-gray-500">Loading history...</p>
            </div>
          ) : depositHistory.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-semibold text-gray-700">No cash payout history yet.</p>
              <p className="mt-1 text-xs text-gray-500">Once you pay cash to admin, it will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {depositHistory.map((item) => (
                <div key={item.id || item._id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.amount)}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatDateTime(item.date || item.createdAt)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Payment Method: {item.paymentMethod ? String(item.paymentMethod).toUpperCase() : '--'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusBadgeClasses(item.status)}`}>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                  {item.razorpayPaymentId ? (
                    <p className="mt-2 break-all text-[11px] text-gray-400">Razorpay: {item.razorpayPaymentId}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PocketCashHistoryV2;
