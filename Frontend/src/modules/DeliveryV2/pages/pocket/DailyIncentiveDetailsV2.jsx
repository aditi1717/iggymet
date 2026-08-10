import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Trophy,
  CheckCircle2,
  Clock,
  Lock,
  Calendar,
  Loader2,
  Sparkles,
  Check,
  ShieldCheck,
  IndianRupee
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { formatCurrency } from '@food/utils/currency';
import BRAND_THEME from '@/config/brandTheme';

const formatCleanRupee = (val) => {
  const num = Number(val) || 0;
  return `₹${Number.isInteger(num) ? num : num.toFixed(2)}`;
};

export const DailyIncentiveDetailsV2 = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [incentiveData, setIncentiveData] = useState(null);

  const loadIncentiveDetails = async () => {
    try {
      setLoading(true);
      const res = await deliveryAPI.getDailyIncentive().catch(() => ({ data: null }));
      const data = res?.data?.data || res?.data || null;
      setIncentiveData(data);
    } catch (err) {
      toast.error('Failed to load incentive details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncentiveDetails();
  }, []);

  const campaign = incentiveData?.campaign || null;
  const completedTrips = Number(incentiveData?.completedTrips) || 0;
  const eligibleSlabs = Array.isArray(incentiveData?.eligibleSlabs) ? incentiveData.eligibleSlabs : [];
  const creditedSlabs = Array.isArray(incentiveData?.creditedSlabs) ? incentiveData.creditedSlabs : [];
  const paidRewardAmount = Number(incentiveData?.paidReward) || 0;
  const unpaidRewardAmount = Number(incentiveData?.unpaidReward) || Math.max(0, (Number(incentiveData?.totalReward) || 0) - paidRewardAmount);
  const slabs = Array.isArray(campaign?.slabs) && campaign.slabs.length > 0
    ? campaign.slabs
    : [
        { trips: 14, amount: 110 },
        { trips: 17, amount: 145 },
        { trips: 23, amount: 210 },
        { trips: 27, amount: 285 },
      ];

  const highestAchievedSlab = eligibleSlabs.length > 0 ? eligibleSlabs[eligibleSlabs.length - 1] : null;
  const earnedRewardAmount = Number(incentiveData?.totalReward) || (highestAchievedSlab ? Number(highestAchievedSlab.amount) : 0);
  const creditByTrips = new Map(
    creditedSlabs.map((record) => [String(record?.slabTrips || ''), record]),
  );
  const isPaid = earnedRewardAmount > 0 && unpaidRewardAmount <= 0;

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-slate-50 font-poppins pb-16">
      {/* Header Bar */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/food/delivery/pocket')}
            className="p-1.5 rounded-full hover:bg-slate-100 transition-all text-slate-700"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">Daily Incentive Status</h1>
            <p className="text-[11px] font-medium text-slate-500">{todayFormatted}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
          <Trophy className="w-3.5 h-3.5 text-amber-600" />
          <span>{formatCleanRupee(earnedRewardAmount)} Earned</span>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600" style={{ color: BRAND_THEME.colors.brand.primary }} />
          <p className="text-xs font-medium text-slate-500">Loading Daily Incentive Status...</p>
        </div>
      ) : (
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {/* Main Status Overview Card */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">
                  Active Campaign
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">
                  {campaign?.title || 'Daily Trip Incentive'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {campaign?.description || 'Complete trips today to unlock extra cash rewards!'}
                </p>
              </div>

              {/* Status Pill: Paid vs Pending */}
              <div>
                {isPaid ? (
                  <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold shadow-2xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Paid / Credited</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>In Progress</span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Completed Trips Today</p>
                <p className="text-xl font-extrabold text-slate-900 mt-0.5">{completedTrips} Trips</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Total Incentive Earned</p>
                <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{formatCleanRupee(earnedRewardAmount)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Paid</p>
                <p className="text-xl font-extrabold text-emerald-600 mt-0.5">{formatCleanRupee(paidRewardAmount)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">Pending</p>
                <p className="text-xl font-extrabold text-amber-600 mt-0.5">{formatCleanRupee(unpaidRewardAmount)}</p>
              </div>
            </div>
          </div>

          {/* Slabs & Milestones Detailed List */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Today's Milestones & Payment Status
            </h3>

            <div className="space-y-2.5">
              {slabs.map((slab) => {
                const reached = completedTrips >= Number(slab.trips);
                const tripsRemaining = Math.max(0, Number(slab.trips) - completedTrips);

                return (
                  <div
                    key={`slab-detail-${slab.trips}`}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                      reached
                        ? 'bg-emerald-50/60 border-emerald-200'
                        : 'bg-slate-50/80 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                          reached
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-300 text-slate-700'
                        }`}
                      >
                        {reached ? <Check className="w-4 h-4 stroke-[3]" /> : <Lock className="w-4 h-4 text-slate-600" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-extrabold text-slate-900">{slab.trips} Trips Target</p>
                          <span className="text-xs font-bold text-slate-700">({formatCleanRupee(slab.amount)})</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500">
                          {reached
                            ? 'Milestone Achieved!'
                            : `${tripsRemaining} more ${tripsRemaining === 1 ? 'trip' : 'trips'} needed`}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div>
                    {reached ? (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-2xs border ${creditByTrips.get(String(slab.trips))?.status === 'paid' ? 'text-emerald-700 bg-white border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          {creditByTrips.get(String(slab.trips))?.status === 'paid' ? 'Paid to Wallet' : 'Pending'}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500 bg-slate-200/60 px-2.5 py-1 rounded-full">
                          Locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historical Credit Log Card */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-600" />
              Incentive Date & Payment Records
            </h3>

            <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100">
              <div className="p-3 bg-slate-50/70 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Incentive Date</span>
                <span>Trips</span>
                <span>Reward</span>
                <span>Status</span>
              </div>

              <div className="p-3 flex items-center justify-between text-xs font-medium text-slate-800">
                <span className="font-semibold text-slate-900">{todayFormatted}</span>
                <span>{completedTrips}</span>
                <span className="font-bold text-emerald-600">{formatCleanRupee(earnedRewardAmount)}</span>
                <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] ${isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {isPaid ? 'Paid' : 'Pending'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyIncentiveDetailsV2;
