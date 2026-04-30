import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldCheck, DollarSign, CheckCircle2, 
  QrCode, Loader2, Info, X, RefreshCw
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { ActionSlider } from '@/modules/DeliveryV2/components/ui/ActionSlider';
import { BRAND_THEME } from '@/config/brandTheme';

const pickFirstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const getRecipientMeta = (order) => {
  const userObj = order?.user || order?.userId || order?.customer || order?.customerId || {};
  const deliveryAddress = order?.deliveryAddress || order?.address || {};
  const recipient = order?.recipient || order?.deliveryRecipient || {};

  return {
    name: pickFirstText(
      order?.recipientName,
      recipient?.name,
      order?.customerName,
      deliveryAddress?.fullName,
      deliveryAddress?.name,
      deliveryAddress?.recipientName,
      deliveryAddress?.receiverName,
      deliveryAddress?.contactPersonName,
      order?.userName,
      userObj?.name,
      'Customer',
    ),
    phone: pickFirstText(
      order?.recipientPhone,
      recipient?.phone,
      order?.customerPhone,
      deliveryAddress?.phone,
      deliveryAddress?.recipientPhone,
      deliveryAddress?.receiverPhone,
      deliveryAddress?.contactPersonPhone,
      order?.userPhone,
      userObj?.phone,
      deliveryAddress?.contactNumber,
      deliveryAddress?.mobile,
    ),
  };
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getDueAmount = (orderLike) => {
  const directCandidates = [
    orderLike?.pricing?.previousDue,
    orderLike?.previousDue,
    orderLike?.dueAmount,
    orderLike?.pricing?.dueAmount,
  ];

  for (const candidate of directCandidates) {
    const amount = toFiniteNumber(candidate);
    if (amount !== null && amount > 0) return amount;
  }

  const payableAmount = toFiniteNumber(orderLike?.payment?.amountDue);
  const baseTotal = toFiniteNumber(
    orderLike?.pricing?.total ??
      orderLike?.totalAmount ??
      orderLike?.total ??
      orderLike?.amountToCollect,
  );

  if (payableAmount !== null && baseTotal !== null && payableAmount > baseTotal) {
    return payableAmount - baseTotal;
  }

  return 0;
};

const getPayableAmount = (orderLike) => {
  const dueAmount = getDueAmount(orderLike);
  const payableCandidates = [
    orderLike?.payment?.amountDue,
    orderLike?.pricing?.amountDue,
    orderLike?.amountDue,
    orderLike?.amountToCollect,
  ];

  for (const candidate of payableCandidates) {
    const amount = toFiniteNumber(candidate);
    if (amount !== null && amount > 0) return amount;
  }

  const baseTotal =
    toFiniteNumber(
      orderLike?.pricing?.total ??
        orderLike?.totalAmount ??
        orderLike?.total,
    ) ?? 0;

  return baseTotal + dueAmount;
};

const Backdrop = ({ onClose }) => (
  <motion.div 
    initial={{ opacity: 0 }} 
    animate={{ opacity: 1 }} 
    exit={{ opacity: 0 }}
    className="absolute inset-0 -z-10 pointer-events-auto backdrop-blur-sm" 
    style={{ backgroundColor: BRAND_THEME.colors.brand.primary + '33' }}
    onClick={onClose}
  />
);

const OtpModal = ({ order, onVerified, onClose }) => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    const savedCode = order?.deliveryVerification?.dropOtp?.code;
    if (savedCode && String(savedCode).length === 4) {
      setOtp(String(savedCode).split(''));
    }
    const timer = setTimeout(() => {
      inputRefs[0].current?.focus();
    }, 500);
    return () => clearTimeout(timer);
  }, [order?.deliveryVerification?.dropOtp?.code]);

  const orderId = order.orderId || order._id || 'ORD';

  const handleOtpChange = (index, value) => {
    if (value && !/^\d+$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);
    if (value && index < 3) inputRefs[index + 1].current?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) inputRefs[index - 1].current?.focus();
  };

  const verifyOtp = async () => {
    const otpString = otp.join('');
    if (otpString.length < 4) return;
    setIsVerifyingOtp(true);
    try {
      const res = await deliveryAPI.verifyDropOtp(orderId, otpString);
      if (res?.data?.success) {
        setIsOtpVerified(true);
        // toast.success("OTP Verified Successfully");
        setTimeout(() => onVerified(otpString), 600);
      }
    } catch (err) {
      toast.error("Invalid OTP entered");
      throw err;
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const isAlreadyVerified = order?.deliveryVerification?.dropOtp?.verified;

  return (
    <div className="absolute inset-x-0 bottom-0 z-120 p-0 sm:p-4 h-full flex items-end justify-center pointer-events-none">
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        className="w-full bg-white rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] p-5 pb-8 pointer-events-auto max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
        <div className="flex justify-between items-center mb-4">
           <div className="flex items-center gap-3">
            <div 
              className={`w-10 h-10 rounded-xl flex items-center justify-center`}
              style={isOtpVerified ? { backgroundColor: BRAND_THEME.colors.semantic.successSoft, color: BRAND_THEME.colors.semantic.success } : { backgroundColor: '#F3F4F6', color: '#9CA3AF' }}
            >
              <ShieldCheck className="w-6 h-6" />
            </div>
             <div>
               <h2 className="text-lg font-black text-gray-900 leading-none">Handover Code</h2>
               <p className="text-[10px] font-bold uppercase tracking-tight text-gray-400 mt-1">Enter OTP to verify</p>
             </div>
           </div>
           <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
        </div>

        <div className="flex justify-center gap-2 mb-6">
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="number"
              disabled={isOtpVerified}
              value={digit}
              onChange={(e) => handleOtpChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`w-12 h-16 bg-gray-50 border-2 rounded-2xl text-center text-3xl font-medium transition-all ${
                isOtpVerified ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 focus:border-green-600 text-gray-700'
              }`}
            />
          ))}
        </div>

        <ActionSlider 
          key="action-otp"
          label={isVerifyingOtp ? "Verifying..." : isAlreadyVerified ? "Code already verified ✓" : "Slide to Verify OTP"} 
          successLabel="Verified!"
          disabled={otp.some(d => !d) || isVerifyingOtp || isOtpVerified || isAlreadyVerified}
          onConfirm={verifyOtp}
          containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
          style={{ background: BRAND_THEME.gradients.primary }}
        />
      </motion.div>
    </div>
  );
};

const PaymentModal = ({ order, otpString, onComplete, onClose }) => {
  const [showQrModal, setShowQrModal] = useState(false);
  const [collectQrLink, setCollectQrLink] = useState(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const isInitialPaid = ['paid', 'captured', 'authorized'].includes(String(order.payment?.status || "").toLowerCase());
  const [paymentStatus, setPaymentStatus] = useState(isInitialPaid ? 'paid' : 'idle');
  const [isSyncing, setIsSyncing] = useState(false);
  const pollingRef = useRef(null);

  const orderId = order.orderId || order._id || 'ORD';
  const amountToCollect = getPayableAmount(order);

  const checkPaymentSync = useCallback(async () => {
    try {
      const res = await deliveryAPI.getPaymentStatus(orderId);
      const data = res?.data?.data || res?.data || {};
      const status = String(data?.payment?.status || "").toLowerCase();
      if (['paid', 'captured', 'authorized'].includes(status)) {
        setPaymentStatus('paid');
        if (pollingRef.current) clearInterval(pollingRef.current);
        // toast.success("Payment Received Successfully!");
        setShowQrModal(false);
      }
    } catch (e) {}
  }, [orderId]);

  const handleManualCheck = async () => {
    setIsSyncing(true);
    await checkPaymentSync();
    setTimeout(() => setIsSyncing(false), 800);
  };

  useEffect(() => {
    if (paymentStatus === 'pending' || (amountToCollect > 0 && paymentStatus !== 'paid')) {
      pollingRef.current = setInterval(checkPaymentSync, 5000);
    }
    return () => clearInterval(pollingRef.current);
  }, [paymentStatus, amountToCollect, checkPaymentSync]);

  const generateQr = async () => {
    setIsGeneratingQr(true);
    try {
      const recipient = getRecipientMeta(order);
      const res = await deliveryAPI.createCollectQr(orderId, {
        name: recipient.name || 'Customer',
        phone: recipient.phone || '',
      });
      const link = res?.data?.data?.shortUrl || res?.data?.shortUrl || null;
      if (link) {
        setCollectQrLink(link);
        setPaymentStatus('pending');
        setShowQrModal(true);
      } else {
        toast.error("Could not generate QR code");
      }
    } catch (e) {
      toast.error("QR Generation failed");
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const isPaid = paymentStatus === 'paid';

  return (
    <>
      <div className="absolute inset-x-0 bottom-0 z-120 p-0 sm:p-4 h-full flex items-end justify-center pointer-events-none">
        <motion.div 
          initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          className="w-full bg-white rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] p-5 pb-8 pointer-events-auto max-w-lg max-h-[90vh] overflow-y-auto"
        >
          <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
          <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-3">
               <div 
                 className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={isPaid ? { backgroundColor: BRAND_THEME.colors.semantic.successSoft, color: BRAND_THEME.colors.semantic.success } : { backgroundColor: BRAND_THEME.colors.brand.primarySoft, color: BRAND_THEME.colors.brand.primary }}
               >
                 <DollarSign className="w-5 h-5" />
               </div>
               <div>
                 <h2 className="text-lg font-black text-gray-900 leading-none">Collect Payment</h2>
                 <p className="text-[10px] font-bold uppercase tracking-tight text-gray-400 mt-1">Order total to receive</p>
               </div>
             </div>
             <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
          </div>

          <div className="bg-amber-50 rounded-[2rem] p-5 border border-amber-100 mb-6">
             <div className="flex justify-between items-center mb-4">
               <div>
                 <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: BRAND_THEME.colors.brand.primary }}>
                    {isPaid ? "Amount Paid Online" : "Cash to Collect"}
                 </p>
                 <p className="text-gray-900 text-3xl font-black">₹{amountToCollect.toFixed(2)}</p>
               </div>
               {isPaid && <div className="text-white px-3 py-1.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: BRAND_THEME.colors.semantic.success }}>PAID ✓</div>}
             </div>

             {!isPaid && (
               <div className="space-y-3">
                 <button 
                   onClick={generateQr}
                   disabled={isGeneratingQr}
                   className="w-full py-3.5 bg-white border-2 border-amber-200 text-amber-800 rounded-2xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95"
                 >
                   {isGeneratingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-5 h-5" />}
                   Show Payment QR
                 </button>
               </div>
             )}
          </div>

           <ActionSlider 
            key="action-payment"
            label="Slide to Complete Order" 
            successLabel="Delivered! ✓"
            disabled={!isPaid && paymentStatus === 'pending'} 
            onConfirm={async () => {
                try { await onComplete(otpString); } catch (e) { throw e; }
            }}
            containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
            style={{ background: BRAND_THEME.gradients.primary }}
          />
        </motion.div>
      </div>

      <AnimatePresence>
        {showQrModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-200 flex items-center justify-center p-6 pointer-events-auto backdrop-blur-md"
            style={{ backgroundColor: BRAND_THEME.colors.brand.primary + 'CC' }}
            onClick={() => setShowQrModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm rounded-[2rem] p-7 flex flex-col items-center text-center shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-gray-950 font-extrabold text-xl mb-1">Scan to Pay</h3>
              <p className="text-gray-500 text-xs mb-6 font-medium">Order Total: ₹{amountToCollect.toFixed(2)}</p>
              
              <div className="relative p-5 bg-gray-50 rounded-2xl border-2 border-gray-100 mb-6">
                 <img 
                   src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(collectQrLink || '')}`} 
                   alt="Payment QR"
                   className="w-48 h-48"
                 />
                 <button 
                    onClick={handleManualCheck}
                    disabled={isSyncing}
                    className="absolute -top-3 -right-3 flex gap-1.5 items-center bg-green-500 text-white px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                 >
                    {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} 
                    I have Paid
                 </button>
              </div>

              <button 
                onClick={() => setShowQrModal(false)}
                className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl font-bold text-xs uppercase tracking-widest"
              >
                Go Back
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export const DeliveryVerificationModal = ({ order, onComplete, onClose }) => {
  const alreadyVerified = !!order?.deliveryVerification?.dropOtp?.verified;
  const paymentMethod = (
    order?.paymentMethod ||
    order?.payment?.method ||
    order?.transaction?.payment?.method ||
    order?.transaction?.paymentMethod ||
    'cod'
  ).toLowerCase();
  const isCod = ['cash', 'cod', 'cash_on_delivery', 'razorpay_qr'].includes(paymentMethod);

  const [step, setStep] = useState(() => {
    if (alreadyVerified) return isCod ? 'payment' : 'complete';
    return 'otp';
  });
  const [verifiedOtp, setVerifiedOtp] = useState(alreadyVerified ? (order?.deliveryVerification?.dropOtp?.code || '') : '');

  const handleOtpVerified = (otpValue) => {
    setVerifiedOtp(otpValue);
    setStep(isCod ? 'payment' : 'complete');
  };

  useEffect(() => {
    if (step === 'complete' && !isCod) {
      onComplete(verifiedOtp);
    }
  }, [step, isCod, verifiedOtp, onComplete]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-[500] pointer-events-none">
      <Backdrop onClose={onClose} />
      <AnimatePresence mode="wait">
        {step === 'otp' && (
          <OtpModal 
            key="otp-modal" 
            order={order} 
            onVerified={handleOtpVerified} 
            onClose={onClose} 
          />
        )}
        {step === 'payment' && (
          <PaymentModal 
            key="payment-modal" 
            order={order} 
            otpString={verifiedOtp} 
            onComplete={onComplete} 
            onClose={onClose} 
          />
        )}
        {step === 'complete' && (
          <div className="absolute inset-x-0 bottom-0 z-120 p-0 sm:p-4 h-full flex items-end justify-center pointer-events-none">
            <motion.div 
              key="complete-modal"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="w-full bg-white rounded-t-[2.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.3)] p-5 pb-8 pointer-events-auto max-w-lg"
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center gap-3 mb-6">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BRAND_THEME.colors.semantic.successSoft, color: BRAND_THEME.colors.semantic.success }}
                >
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900 leading-none">OTP Verified</h2>
                  <p className="text-[10px] font-bold uppercase tracking-tight text-green-600 mt-1">Ready to complete delivery</p>
                </div>
              </div>
              <ActionSlider 
                key="action-complete"
                label="Slide to Complete Delivery" 
                successLabel="Delivered! ✓"
                onConfirm={() => onComplete(verifiedOtp)}
                containerStyle={{ backgroundColor: BRAND_THEME.colors.brand.primarySoft }}
                style={{ background: BRAND_THEME.gradients.primary }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
