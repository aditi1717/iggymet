import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { formatCurrency } from '@food/utils/currency';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import BRAND_THEME from '@/config/brandTheme';

const toNumber = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

export const PocketBalanceV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalEarning: 0,
    adminPaid: 0,
    adminDue: 0,
    cashInHand: 0,
    cashSubmittedToAdmin: 0,
  });

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        setLoading(true);
        const walletRes = await deliveryAPI.getWallet();
        const wallet = walletRes?.data?.data?.wallet || {};

        const totalEarned = toNumber(wallet.totalEarned, wallet.totalEarning, wallet.totalBalance);
        const totalBonus = toNumber(wallet.totalBonus);
        const totalWithdrawn = toNumber(wallet.totalWithdrawn, wallet.paidAmount);
        const grossBalance = toNumber(wallet.totalBalance, totalEarned + totalBonus);

        const cashInHand = toNumber(wallet.cashInHand);
        const cashSubmittedToAdmin = toNumber(
          wallet.cashSubmittedToAdmin,
          wallet.totalSubmittedToAdmin,
          0,
        );

        setSummary({
          totalEarning: totalEarned,
          adminPaid: totalWithdrawn,
          adminDue: Math.max(0, grossBalance - totalWithdrawn),
          cashInHand,
          cashSubmittedToAdmin,
        });
      } catch (error) {
        toast.error('Failed to load pocket summary');
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, []);

  const InfoCard = ({ label, value, className = '' }) => (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-8">
      <div className="bg-white border-b border-gray-200 px-4 py-4 safe-top flex items-center gap-4">
        <button onClick={goBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-bold text-gray-900 leading-none">Pocket Summary</h1>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND_THEME.colors.brand.primary }} />
          <p className="text-gray-500 text-sm font-semibold">Loading...</p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-4">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 mb-2">Delivery Earnings Settlement</p>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="Total Earnings" value={formatCurrency(summary.totalEarning)} />
              <InfoCard label="Paid By Admin" value={formatCurrency(summary.adminPaid)} />
              <InfoCard label="Pending From Admin" value={formatCurrency(summary.adminDue)} className="col-span-2" />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-2">Cash Handling</p>
            <div className="grid grid-cols-2 gap-3">
              <InfoCard label="Cash In Hand" value={formatCurrency(summary.cashInHand)} />
              <InfoCard label="Cash Submitted To Admin" value={formatCurrency(summary.cashSubmittedToAdmin)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PocketBalanceV2;
