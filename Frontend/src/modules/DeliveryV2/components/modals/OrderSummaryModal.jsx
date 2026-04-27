import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, Wallet, History, Star } from 'lucide-react';
import { BRAND_THEME } from '@/config/brandTheme';

/**
 * OrderSummaryModal - Ported to Original White/Green Theme.
 * Post-delivery success screen.
 */
export const OrderSummaryModal = ({ order, onDone }) => {
  const earnings = order?.earnings || order?.riderEarning || (order?.orderAmount * 0.1) || 0;

  return (
    <div className="fixed inset-0 z-[160] overflow-y-auto backdrop-blur-md" style={{ background: BRAND_THEME.gradients.primary + 'EE' }}>
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-[320px]"
        >
          {/* Success Icon */}
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-5 shadow-2xl">
            <CheckCircle className="w-9 h-9" style={{ color: BRAND_THEME.colors.semantic.success }} />
          </div>
          
          <h1 className="text-gray-950 text-xl font-bold mb-1 tracking-tight">Well Done!</h1>
          <p className="text-gray-800 text-xs mb-4">Trip completed successfully.</p>

          <div className="bg-white rounded-3xl p-4 pb-5 mb-8 shadow-2xl text-gray-900 border border-white/20">
            <div className="flex items-center justify-center gap-1.5 mb-2 opacity-60">
              <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
              <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">Earnings Added</p>
              <Star className="w-3 h-3 text-orange-400 fill-orange-400" />
            </div>
            
            <p className="text-gray-950 text-3xl font-black mb-4 tracking-tighter">₹{Number(earnings).toFixed(2)}</p>
            
            <div 
              className="flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-[11px] font-bold border"
              style={{ backgroundColor: BRAND_THEME.colors.semantic.successSoft, color: BRAND_THEME.colors.semantic.success, borderColor: BRAND_THEME.colors.semantic.success + '22' }}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Transferred to Wallet</span>
            </div>
          </div>

          <button 
            onClick={onDone}
            className="w-full h-12 bg-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-gray-50 active:scale-95 transition-all shadow-xl shadow-black/10"
            style={{ color: BRAND_THEME.colors.brand.primary }}
          >
            Go Back Home <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-gray-800 text-[9px] font-bold uppercase tracking-widest mt-8">
            ID: {order?.orderId || order?.displayOrderId || 'FOD-1234'}
          </p>
        </motion.div>
      </div>
    </div>
  );
};
