import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ShieldCheck,
  Loader2,
  LayoutGrid,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import BRAND_THEME from '@/config/brandTheme';
import { formatCurrency } from '@food/utils/currency';
import { initRazorpayPayment } from '@food/utils/razorpay';

const toNumber = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
};

export const PocketV2 = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [walletState, setWalletState] = useState({
    weeklyEarnings: 0,
    weeklyOrders: 0,
    bankDetailsFilled: false,
    totalEarning: 0,
    adminPaid: 0,
    adminDue: 0,
    cashInHand: 0,
    cashSubmittedToAdmin: 0,
    availableCashLimit: 0,
  });
  const [profileState, setProfileState] = useState({ name: '', phone: '', email: '' });
  const [depositAmount, setDepositAmount] = useState('');
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [isPreparingDeposit, setIsPreparingDeposit] = useState(false);
  const [isVerifyingDeposit, setIsVerifyingDeposit] = useState(false);

  const loadPocketData = async () => {
    const [profileRes, earningsRes, walletRes] = await Promise.all([
      deliveryAPI.getProfile(),
      deliveryAPI.getEarnings({ period: 'week' }),
      deliveryAPI.getWallet(),
    ]);

    const profile = profileRes?.data?.data?.profile || {};
    const summary = earningsRes?.data?.data?.summary || {};
    const wallet = walletRes?.data?.data?.wallet || {};
    const bankDetails = profile?.documents?.bankDetails;
    const isFilled = !!bankDetails?.accountNumber;

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
    const availableCashLimit = toNumber(wallet.availableCashLimit, 0);

    setProfileState({
      name: profile?.name || '',
      phone: profile?.phone || '',
      email: profile?.email || '',
    });
    setWalletState({
      weeklyEarnings: Number(summary.totalEarnings) || 0,
      weeklyOrders: Number(summary.totalOrders) || 0,
      bankDetailsFilled: isFilled,
      totalEarning: totalEarned,
      adminPaid: totalWithdrawn,
      adminDue: Math.max(0, grossBalance - totalWithdrawn),
      cashInHand,
      cashSubmittedToAdmin,
      availableCashLimit,
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await loadPocketData();
      } catch (err) {
        toast.error('Failed to load wallet data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handlePayToAdmin = async () => {
    const amount = Math.max(0, Number(depositAmount) || 0);
    if (!Number.isFinite(amount) || amount < 1) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount > walletState.cashInHand) {
      toast.error('Amount cannot exceed cash in hand');
      return;
    }

    try {
      setIsPreparingDeposit(true);
      const orderRes = await deliveryAPI.createDepositOrder(amount);
      const razorpay = orderRes?.data?.data?.razorpay || {};
      if (!razorpay?.orderId || !razorpay?.key) {
        throw new Error('Failed to initialize Razorpay payment');
      }

      await initRazorpayPayment({
        key: razorpay.key,
        amount: razorpay.amount,
        currency: razorpay.currency || 'INR',
        order_id: razorpay.orderId,
        name: 'IggymetFood',
        description: `Pay to Admin - ${formatCurrency(amount)}`,
        prefill: {
          name: profileState.name,
          email: profileState.email,
          contact: profileState.phone,
        },
        handler: async (response) => {
          try {
            setIsVerifyingDeposit(true);
            await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount,
            });
            toast.success('Cash in hand paid to admin successfully');
            setDepositAmount('');
            setShowDepositForm(false);
            await loadPocketData();
          } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Failed to verify payment');
          } finally {
            setIsVerifyingDeposit(false);
          }
        },
        onError: (error) => {
          toast.error(error?.description || error?.message || 'Payment failed');
        },
      });
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to start payment');
    } finally {
      setIsPreparingDeposit(false);
    }
  };

  const InfoCard = ({ label, value, className = '' }) => (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center font-poppins gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" style={{ color: BRAND_THEME.colors.brand.primary }} />
        <p className="text-xs font-medium text-gray-500">Loading Pocket...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24">
      {!walletState.bankDetailsFilled && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-red-800">Add Bank Details</p>
              <p className="text-[10px] text-red-600 font-medium">Required for payouts</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/food/delivery/profile/details')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-red-600 border border-red-200 shadow-sm active:bg-gray-50"
          >
            Submit
          </button>
        </div>
      )}

      <div className="p-4 space-y-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 mb-2">Delivery Earnings Settlement</p>
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="Total Earnings" value={formatCurrency(walletState.totalEarning)} />
            <InfoCard label="Paid By Admin" value={formatCurrency(walletState.adminPaid)} />
            <InfoCard label="Pending From Admin" value={formatCurrency(walletState.adminDue)} className="col-span-2" />
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 mb-2">Cash Handling</p>
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="Cash In Hand" value={formatCurrency(walletState.cashInHand)} />
            <InfoCard label="Cash Submitted To Admin" value={formatCurrency(walletState.cashSubmittedToAdmin)} />
            <InfoCard label="Remaining COD Limit" value={formatCurrency(walletState.availableCashLimit)} className="col-span-2 border-emerald-100/60" />
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDepositForm((prev) => !prev)}
                className="rounded-xl px-4 py-2.5 text-xs font-bold text-white"
                style={{ background: BRAND_THEME.colors.brand.primary }}
              >
                Pay To Admin
              </button>
              <button
                type="button"
                onClick={() => navigate('/food/delivery/pocket/cash-history')}
                className="rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-xs font-bold text-emerald-700"
              >
                View Cash History
              </button>
            </div>

            {showDepositForm && (
              <div className="rounded-xl border border-emerald-200 bg-white p-3 space-y-3">
                <div>
                  <p className="text-xs font-bold text-slate-800">Pay cash in hand to admin via Razorpay</p>
                  <p className="text-[11px] text-slate-500">Enter the amount you are handing over to admin.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={Math.max(0, Math.floor(walletState.cashInHand))}
                    value={depositAmount}
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      if (rawValue === '') {
                        setDepositAmount('');
                        return;
                      }
                      const numericValue = Math.max(0, Number(rawValue) || 0);
                      const cappedValue = Math.min(numericValue, Math.max(0, walletState.cashInHand));
                      setDepositAmount(String(cappedValue));
                    }}
                    placeholder="Enter amount"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
                    disabled={isPreparingDeposit || isVerifyingDeposit}
                  />
                  <button
                    type="button"
                    onClick={handlePayToAdmin}
                    disabled={isPreparingDeposit || isVerifyingDeposit}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {isPreparingDeposit || isVerifyingDeposit ? 'Processing...' : 'Pay'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Amount cannot be greater than cash in hand: {formatCurrency(walletState.cashInHand)}
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          onClick={() => navigate('/food/delivery/pocket/details')}
          className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 active:bg-gray-50 cursor-pointer flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 border border-brand-100">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Delivered Orders Payout</p>
              <p className="text-[11px] text-gray-500 font-medium">View earnings and admin payment status</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </div>
  );
};

export default PocketV2;
