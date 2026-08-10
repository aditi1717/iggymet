import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  ShieldCheck,
  Loader2,
  LayoutGrid,
  Target,
  Trophy,
  Lock,
  Check,
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

const DAILY_INCENTIVE_FALLBACK = {
  campaign: null,
  completedTrips: 0,
  eligibleSlabs: [],
  creditedSlabs: [],
  nextSlab: null,
  totalReward: 0,
};

const DEFAULT_SLABS = [
  { trips: 14, amount: 110 },
  { trips: 17, amount: 145 },
  { trips: 23, amount: 210 },
  { trips: 27, amount: 285 },
];

const formatCleanRupee = (val) => {
  const num = Number(val) || 0;
  return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
};

const DeliveryScooter = ({ className = "w-5 h-5 xs:w-6 xs:h-6 sm:w-7 sm:h-7 drop-shadow-xs" }) => (
  <svg className={className} viewBox="0 0 36 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="17" cy="7" r="4" fill="#f87171" stroke="#991b1b" strokeWidth="1.2" />
    <path d="M17 4.5C19 4.5 20.5 6 20.5 8H13.5C13.5 6 15 4.5 17 4.5Z" fill="#1e293b" />
    <rect x="3" y="8" width="9" height="9" rx="1.5" fill="#ef4444" stroke="#b91c1c" strokeWidth="1" />
    <rect x="5" y="10" width="5" height="1" fill="#fef2f2" />
    <path d="M11 18H25L28 12H22" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 18L15 23H25L27 18" fill="#cbd5e1" stroke="#334155" strokeWidth="1.5" />
    <path d="M26 10L28 15" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
    <circle cx="10" cy="24" r="4" fill="#334155" stroke="#0f172a" strokeWidth="1.5" />
    <circle cx="10" cy="24" r="1.5" fill="#f8fafc" />
    <circle cx="27" cy="24" r="4" fill="#334155" stroke="#0f172a" strokeWidth="1.5" />
    <circle cx="27" cy="24" r="1.5" fill="#f8fafc" />
  </svg>
);

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
  const [dailyIncentive, setDailyIncentive] = useState(DAILY_INCENTIVE_FALLBACK);

  const loadPocketData = async () => {
    const [profileRes, earningsRes, walletRes, incentiveRes] = await Promise.all([
      deliveryAPI.getProfile(),
      deliveryAPI.getEarnings({ period: 'week' }),
      deliveryAPI.getWallet(),
      deliveryAPI.getDailyIncentive().catch(() => ({ data: null })),
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
    const incentive = incentiveRes?.data?.data || incentiveRes?.data || DAILY_INCENTIVE_FALLBACK;
    const eligibleSlabs = Array.isArray(incentive?.eligibleSlabs) ? incentive.eligibleSlabs : [];
    const nextSlab = incentive?.nextSlab || null;
    const completedTrips = Number(incentive?.completedTrips) || 0;
    const totalReward = toNumber(incentive?.totalReward);

    setProfileState({
      name: profile?.name || '',
      phone: profile?.phone || '',
      email: profile?.email || '',
    });
    setWalletState({
      weeklyEarnings: Number(summary.totalEarnings) || 0,
      weeklyOrders: Number(summary.totalOrders) || 0,
      bankDetailsFilled: isFilled,
      totalEarning: grossBalance,
      adminPaid: totalWithdrawn,
      adminDue: Math.max(0, grossBalance - totalWithdrawn),
      cashInHand,
      cashSubmittedToAdmin,
      availableCashLimit,
    });
    setDailyIncentive({
      ...DAILY_INCENTIVE_FALLBACK,
      ...incentive,
      eligibleSlabs,
      nextSlab,
      completedTrips,
      totalReward,
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

  const campaignSlabs = Array.isArray(dailyIncentive.campaign?.slabs)
    ? dailyIncentive.campaign.slabs
    : [];
  const incentiveSlabs = campaignSlabs.length
    ? campaignSlabs
    : Array.isArray(dailyIncentive.eligibleSlabs) && dailyIncentive.eligibleSlabs.length
      ? dailyIncentive.eligibleSlabs
      : [];
  const rewardTrack = incentiveSlabs.length
    ? incentiveSlabs
    : campaignSlabs.length
      ? campaignSlabs
      : DEFAULT_SLABS;
  const rewardTrackSize = rewardTrack.length;

  const incentiveMaxReward = Math.max(
    ...rewardTrack.map((slab) => Number(slab?.amount) || 0),
    285
  );

  const calculateScooterProgress = (completedTrips, slabs) => {
    if (!slabs || slabs.length === 0) return 0;
    const N = slabs.length;
    const milestones = slabs.map((s) => Number(s?.trips) || 0);
    const completed = Number(completedTrips) || 0;
    const centers = milestones.map((_, i) => ((i + 0.5) / N) * 100);

    if (completed <= 0) return 0;
    if (completed >= milestones[N - 1]) return centers[N - 1];

    if (completed < milestones[0]) {
      const ratio = completed / (milestones[0] || 1);
      return ratio * centers[0];
    }

    for (let i = 0; i < N - 1; i++) {
      if (completed >= milestones[i] && completed <= milestones[i + 1]) {
        const segStart = milestones[i];
        const segEnd = milestones[i + 1];
        const ratio = (completed - segStart) / (segEnd - segStart || 1);
        return centers[i] + ratio * (centers[i + 1] - centers[i]);
      }
    }
    return centers[N - 1];
  };

  const scooterLeftPercent = calculateScooterProgress(
    dailyIncentive.completedTrips,
    rewardTrack
  );

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

        <div
          className="space-y-1.5 cursor-pointer group"
          onClick={() => navigate('/food/delivery/pocket/incentives')}
        >
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-base sm:text-xl font-bold text-slate-800 tracking-tight">
                Earn up to {formatCleanRupee(incentiveMaxReward)} extra
              </p>
              <p className="text-xs font-bold text-emerald-700">
                Total Incentive Earned: {formatCleanRupee(dailyIncentive?.totalReward || (incentiveSlabs.length > 0 && Number(dailyIncentive.completedTrips) >= Number(incentiveSlabs[0].trips) ? (incentiveSlabs.filter(s => Number(dailyIncentive.completedTrips) >= Number(s.trips)).pop()?.amount || 0) : 0))}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-brand-600 bg-white border border-brand-200 shadow-2xs px-2.5 py-1 rounded-full group-hover:bg-brand-50 transition-all">
              <span>View Status</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-[#f4f5f7] overflow-hidden shadow-xs">
            <div className="grid grid-cols-[76px_1fr] sm:grid-cols-[108px_1fr]">
              {/* Left sidebar label column */}
              <div className="bg-[#ededed] border-r border-slate-300/80 flex flex-col justify-between py-2 sm:py-3.5 px-1.5 sm:px-3">
                <div className="h-8 sm:h-10 flex items-center justify-start text-[11px] sm:text-base font-bold text-slate-800 leading-tight">
                  Incentive
                </div>
                <div className="h-8 sm:h-10 flex items-center justify-start text-[11px] sm:text-base font-bold text-slate-800 leading-tight">
                  Trips Count
                </div>
              </div>

              {/* Right milestone track area */}
              <div className="py-2 sm:py-3.5 px-1.5 sm:px-4 flex flex-col justify-between bg-[#f5f5f7]">
                {/* Top Row: Incentive amounts */}
                <div
                  className="grid h-8 sm:h-10 items-center"
                  style={{ gridTemplateColumns: `repeat(${Math.max(rewardTrackSize, 1)}, minmax(0, 1fr))` }}
                >
                  {rewardTrack.map((slab) => (
                    <div key={`reward-${slab?.trips}-${slab?.amount}`} className="text-center">
                      <span className="text-xs sm:text-2xl font-extrabold text-slate-900">
                        {formatCleanRupee(slab?.amount || 0)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Middle Row: Progress track line, Delivery Scooter, Lock/Check milestone badges */}
                <div className="relative my-1 py-0.5 sm:my-2 sm:py-1 flex items-center">
                  {/* Gray background track line */}
                  <div className="absolute left-0 right-0 top-1/2 h-[2px] sm:h-[3px] -translate-y-1/2 bg-slate-300" />

                  {/* Green active progress bar line */}
                  <div
                    className="absolute left-0 top-1/2 h-[2px] sm:h-[3px] -translate-y-1/2 bg-emerald-500 transition-all duration-500"
                    style={{ width: `${scooterLeftPercent}%` }}
                  />

                  {/* Delivery scooter icon rider */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 z-20 transition-all duration-500 pointer-events-none"
                    style={{
                      left: `${scooterLeftPercent}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <DeliveryScooter />
                  </div>

                  {/* Milestone circle node icons */}
                  <div
                    className="relative z-10 grid w-full"
                    style={{ gridTemplateColumns: `repeat(${Math.max(rewardTrackSize, 1)}, minmax(0, 1fr))` }}
                  >
                    {rewardTrack.map((slab) => {
                      const reached = Number(dailyIncentive.completedTrips) >= Number(slab?.trips || 0);
                      return (
                        <div key={`icon-${slab?.trips}-${slab?.amount}`} className="flex justify-center">
                          {reached ? (
                            <div className="h-6 w-6 sm:h-9 sm:w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                              <Check className="h-3 w-3 sm:h-4 sm:w-4 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="h-6 w-6 sm:h-9 sm:w-9 rounded-full bg-[#6c757d] text-white flex items-center justify-center shadow-xs">
                              <Lock className="h-3 w-3 sm:h-4 sm:w-4 text-white fill-white/20" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Row: Trip count numbers */}
                <div
                  className="grid h-8 sm:h-10 items-center"
                  style={{ gridTemplateColumns: `repeat(${Math.max(rewardTrackSize, 1)}, minmax(0, 1fr))` }}
                >
                  {rewardTrack.map((slab) => (
                    <div key={`trips-${slab?.trips}-${slab?.amount}`} className="text-center">
                      <span className="text-xs sm:text-lg font-bold text-slate-800">
                        {slab?.trips}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
