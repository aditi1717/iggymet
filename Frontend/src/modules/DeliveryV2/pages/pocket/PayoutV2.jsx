import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  IndianRupee
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import BRAND_THEME from '@/config/brandTheme';

export const PayoutV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch withdrawal transactions
        const response = await deliveryAPI.getWalletTransactions({ 
          type: 'withdrawal', 
          limit: 100 
        });
        
        if (response?.data?.success) {
          const transactions = response.data.data.transactions || [];
          setWithdrawals(transactions.map(t => ({
            id: t._id || t.id,
            amount: t.amount || 0,
            status: t.status || 'Pending',
            date: new Date(t.date || t.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }),
            processedAt: t.processedAt ? new Date(t.processedAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : null,
            failureReason: t.failureReason || null
          })));
        }
      } catch (err) {
        toast.error('Failed to load payout history');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getStatusInfo = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'approved':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'pending':
        return {
          icon: Clock,
          color: 'text-brand-600',
          bgColor: 'bg-brand-50',
          borderColor: 'border-brand-200'
        };
      case 'denied':
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-poppins pb-24">
      {/* Header (Standard Compact Style) */}
      <div className="bg-white border-b border-gray-100 flex items-center px-4 py-3 sticky top-0 z-30 shadow-sm gap-3">
        <button
          onClick={goBack}
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Withdrawal History</h1>
      </div>

      {/* Main Content */}
      <div className="px-3 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <p className="text-gray-500 text-xs font-semibold">Loading history...</p>
          </div>
        ) : withdrawals.length > 0 ? (
          <div className="space-y-2.5">
            {withdrawals.map((withdrawal, index) => {
              const statusInfo = getStatusInfo(withdrawal.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div
                  key={withdrawal.id || index}
                  className="bg-white rounded-xl p-3.5 shadow-sm border border-gray-100 transition-all hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                       <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${statusInfo.bgColor} ${statusInfo.borderColor}`}>
                          <IndianRupee className={`w-4 h-4 ${statusInfo.color}`} />
                       </div>
                       <div>
                          <p className="text-gray-900 text-sm font-black mb-0.5">
                            ₹{withdrawal.amount}
                          </p>
                          <p className="text-gray-400 text-[10px] font-semibold">
                            Req: {withdrawal.date}
                          </p>
                          {withdrawal.processedAt && (
                            <p className="text-gray-500 text-[10px] font-semibold mt-0.5">
                              Proc: {withdrawal.processedAt}
                            </p>
                          )}
                          {withdrawal.failureReason && (
                            <p className="text-red-500 text-[10px] mt-1 font-bold bg-red-50 px-1.5 py-0.5 rounded leading-tight">
                              Fail: {withdrawal.failureReason}
                            </p>
                          )}
                       </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                      <div className={`flex items-center gap-1.5 px-2 py-[3px] rounded-md border ${statusInfo.bgColor} ${statusInfo.borderColor}`}>
                        <StatusIcon className={`w-3 h-3 ${statusInfo.color}`} />
                        <span className={`text-[9px] uppercase tracking-wider font-bold ${statusInfo.color}`}>
                          {withdrawal.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-12 h-12 bg-white shadow-sm border border-gray-200 rounded-2xl flex items-center justify-center mb-4">
              <Clock className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-900 text-sm font-bold mb-1">No withdrawals</p>
            <p className="text-gray-500 text-[11px] font-medium leading-relaxed max-w-[200px]">
              You haven't requested any payouts yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
