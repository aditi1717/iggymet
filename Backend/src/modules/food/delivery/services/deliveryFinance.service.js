import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodDeliveryWithdrawal } from '../models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { FoodDeliveryWallet } from '../models/deliveryWallet.model.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { FoodDailyIncentiveCampaign } from '../../admin/models/dailyIncentiveCampaign.model.js';
import { FoodDailyIncentiveCredit } from '../../admin/models/dailyIncentiveCredit.model.js';
import { FoodPayoutSettlement } from '../../admin/models/foodPayoutSettlement.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { createRazorpayOrder, getRazorpayKeyId, isRazorpayConfigured, verifyPaymentSignature } from '../../orders/helpers/razorpay.helper.js';

const PAYABLE_DELIVERY_STATUSES = ['delivered', 'cancelled_by_user_unavailable'];
const COD_CASH_METHODS = ['cash', 'cod', 'cash_on_delivery'];
const DEFAULT_INCENTIVE_TIMEZONE = 'Asia/Kolkata';

const getDayKeyInTimeZone = (date = new Date(), timeZone = DEFAULT_INCENTIVE_TIMEZONE) => {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date).reduce((acc, part) => {
            if (part.type !== 'literal') acc[part.type] = String(part.value).padStart(2, '0');
            return acc;
        }, {});
        return `${parts.year}-${parts.month}-${parts.day}`;
    } catch {
        return new Date(date).toISOString().slice(0, 10);
    }
};

const getTimeZoneDayRange = (date = new Date(), timeZone = DEFAULT_INCENTIVE_TIMEZONE) => {
    const dayKey = getDayKeyInTimeZone(date, timeZone);
    const [year, month, day] = dayKey.split('-').map((part) => Number(part));
    const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

    let offsetMs = 0;
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).formatToParts(utcNoon).reduce((acc, part) => {
            if (part.type !== 'literal') acc[part.type] = Number(part.value);
            return acc;
        }, {});

        const utcAsIfLocal = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second
        );
        offsetMs = utcAsIfLocal - utcNoon.getTime();
    } catch {
        offsetMs = 0;
    }

    const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs);
    const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);
    return { dayKey, start, end };
};

const normalizeSlabs = (slabs = []) => (
    Array.isArray(slabs)
        ? slabs
            .map((slab) => ({
                trips: Math.max(1, Number(slab?.trips) || 0),
                amount: Math.max(0, Number(slab?.amount) || 0),
                label: String(slab?.label || '').trim()
            }))
            .filter((slab) => slab.trips > 0)
            .sort((a, b) => a.trips - b.trips)
        : []
);

const buildIncentiveTransactionId = ({ partnerId, dayKey, slabTrips }) => {
    const suffix = String(partnerId || '').slice(-8).toUpperCase();
    const safeDay = String(dayKey || '').replace(/[^0-9A-Z]/gi, '');
    return `INC-${safeDay}-${suffix}-${String(slabTrips).padStart(3, '0')}`;
};

const findApplicableCampaign = async ({ zoneId = null } = {}) => {
    const campaign = await FoodDailyIncentiveCampaign.findOne({
        status: 'active',
        resetType: 'daily'
    })
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();

    if (!campaign) return null;

    const campaignZoneIds = Array.isArray(campaign?.zoneIds)
        ? campaign.zoneIds.map((z) => String(z))
        : [];
    const zoneMatches =
        campaign?.isAllZones === true ||
        (zoneId && campaignZoneIds.includes(String(zoneId)));
    if (!zoneMatches) return null;
    return Array.isArray(campaign?.slabs) && campaign.slabs.length > 0 ? campaign : null;
};

export const getDailyIncentiveSnapshot = async (deliveryPartnerId, atDate = new Date()) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const campaign = await findApplicableCampaign({
        zoneId: partner?.zoneId || null,
        atDate
    });

    if (!campaign) {
        return {
            campaign: null,
            dayKey: getDayKeyInTimeZone(atDate),
            incentiveDate: new Date(atDate),
            completedTrips: 0,
            eligibleSlabs: [],
            creditedSlabs: [],
            nextSlab: null,
            totalReward: 0
        };
    }

    const timeZone = campaign.timezone || DEFAULT_INCENTIVE_TIMEZONE;
    const { dayKey, start, end } = getTimeZoneDayRange(atDate, timeZone);
    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const completedTrips = await FoodOrder.countDocuments({
        'dispatch.deliveryPartnerId': partnerId,
        orderStatus: 'delivered',
        'deliveryState.deliveredAt': { $gte: start, $lte: end }
    });

    const slabs = normalizeSlabs(campaign.slabs);
    const eligibleSlabs = slabs.filter((slab) => completedTrips >= slab.trips);
    const nextSlab = slabs.find((slab) => completedTrips < slab.trips) || null;
    const incentiveDate = start;
    const creditedSlabs = await FoodDailyIncentiveCredit.find({
        deliveryPartnerId: partnerId,
        campaignId: campaign._id,
        incentiveDate,
        status: { $in: ['credited', 'pending', 'paid'] }
    })
        .sort({ slabTrips: 1 })
        .lean();

    const creditedRewardTotal = creditedSlabs.reduce((sum, row) => sum + Number(row?.rewardAmount || 0), 0);
    const paidRewardTotal = creditedSlabs.reduce((sum, row) => sum + (String(row?.status || '') === 'paid' ? Number(row?.rewardAmount || 0) : 0), 0);
    const unpaidRewardTotal = Math.max(0, creditedRewardTotal - paidRewardTotal);

    return {
        campaign,
        dayKey,
        incentiveDate,
        completedTrips,
        eligibleSlabs,
        creditedSlabs,
        nextSlab,
        totalReward: creditedRewardTotal,
        paidReward: paidRewardTotal,
        unpaidReward: unpaidRewardTotal,
        timeZone
    };
};

export const awardDailyIncentiveForDeliveryPartner = async (deliveryPartnerId, atDate = new Date(), adminUserId = null) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        return { awarded: [], snapshot: null };
    }

    const snapshot = await getDailyIncentiveSnapshot(deliveryPartnerId, atDate);
    const campaign = snapshot?.campaign;
    if (!campaign || !Array.isArray(snapshot?.eligibleSlabs) || snapshot.eligibleSlabs.length === 0) {
        return { awarded: [], snapshot };
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const incentiveDate = snapshot.incentiveDate;
    const existingRewardTotal = (snapshot.creditedSlabs || []).reduce((sum, row) => sum + Number(row?.rewardAmount || 0), 0);
    const targetSlab = snapshot.eligibleSlabs[snapshot.eligibleSlabs.length - 1] || null;
    const targetRewardTotal = Number(targetSlab?.amount || 0);
    const deltaAmount = Math.max(0, targetRewardTotal - existingRewardTotal);
    const awarded = [];
    if (!targetSlab || deltaAmount <= 0) {
        return { awarded, snapshot };
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const zoneId = campaign?.isAllZones
            ? null
            : (Array.isArray(campaign.zoneIds) && campaign.zoneIds.length ? campaign.zoneIds[0] : null);

        const transactionId = buildIncentiveTransactionId({
            partnerId,
            dayKey: snapshot.dayKey,
            slabTrips: targetSlab.trips
        });

        const reference = campaign?.title
            ? `Daily incentive: ${campaign.title} (${targetSlab.trips} trips)`
            : `Daily incentive (${targetSlab.trips} trips)`;

        const createdTx = await DeliveryBonusTransaction.findOneAndUpdate(
            { transactionId },
            {
                $setOnInsert: {
                    deliveryPartnerId: partnerId,
                    transactionId,
                    kind: 'incentive',
                    amount: deltaAmount,
                    reference,
                    status: 'pending',
                    createdByAdminId: adminUserId || null
                }
            },
            { upsert: true, new: true, session, setDefaultsOnInsert: true }
        );

        await FoodDailyIncentiveCredit.findOneAndUpdate(
            {
                deliveryPartnerId: partnerId,
                campaignId: campaign._id,
                incentiveDate,
                slabTrips: targetSlab.trips
            },
            {
                $set: {
                    zoneId,
                    rewardAmount: deltaAmount,
                    completedTrips: snapshot.completedTrips,
                    status: 'pending',
                    walletTransactionId: createdTx?._id || null,
                    walletTransactionType: 'incentive',
                    creditedAt: new Date(),
                    paidAt: null,
                    paidByAdminId: null,
                    settlementBatchId: null,
                    createdByAdminId: adminUserId || null
                },
                $setOnInsert: {
                    deliveryPartnerId: partnerId,
                    campaignId: campaign._id,
                    incentiveDate,
                    slabTrips: targetSlab.trips
                }
            },
            { upsert: true, new: true, session, setDefaultsOnInsert: true }
        );

        awarded.push({
            slabTrips: targetSlab.trips,
            amount: deltaAmount,
            transactionId
        });

        await session.commitTransaction();
        return { awarded, snapshot };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Enhanced wallet fetch for delivery partners.
 * Integrates:
 * 1. Historical orders (earnings)
 * 2. Admin bonuses
 * 3. Withdrawals (pending/payout)
 * 4. Cash collected vs limit
 */
export const getDeliveryPartnerWalletEnhanced = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const partner = await FoodDeliveryPartner.findById(partnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const [cashLimitSettings, earningsAgg, cashCollectedAgg, bonusAgg, withdrawalAgg, payoutAgg, depositAgg, withdrawalsList, depositList] = await Promise.all([
        getDeliveryCashLimitSettings({ zoneId: partner?.zoneId, deliveryPartnerId }),
        // 1. Total Earnings from Delivered Orders
        FoodOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, orderStatus: { $in: PAYABLE_DELIVERY_STATUSES } } },
            { $group: { _id: null, totalEarned: { $sum: { $ifNull: ['$riderEarning', 0] } } } }
        ]),
        // 2. Gross cash collected (COD orders)
        FoodOrder.aggregate([
            { 
                $match: { 
                    'dispatch.deliveryPartnerId': partnerId, 
                    orderStatus: 'delivered', 
                    'payment.method': { $in: COD_CASH_METHODS }
                } 
            },
            {
                $group: {
                    _id: null,
                    cashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } },
                    codOrderIds: { $addToSet: '$_id' }
                }
            }
        ]),
        // 3. Admin Bonuses
        DeliveryBonusTransaction.aggregate([
            { $match: { deliveryPartnerId: partnerId, status: { $ne: 'pending' } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 4. Withdrawal Aggregates (Approved vs Pending)
        FoodDeliveryWithdrawal.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { 
                $group: { 
                    _id: null, 
                    totalWithdrawn: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } },
                    pendingWithdrawals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                } 
            }
        ]),
        // 5. Payout settlements (new "mark all paid" flow)
        FoodPayoutSettlement.aggregate([
            {
                $match: {
                    beneficiaryType: 'delivery',
                    beneficiaryId: partnerId,
                    status: 'paid'
                }
            },
            {
                $group: {
                    _id: null,
                    totalPaid: { $sum: { $ifNull: ['$paidAmount', 0] } }
                }
            }
        ]),
        FoodDeliveryCashDeposit.aggregate([
            {
                $match: {
                    deliveryPartnerId: partnerId,
                    status: 'Completed'
                }
            },
            {
                $group: {
                    _id: null,
                    depositedCash: { $sum: { $ifNull: ['$amount', 0] } }
                }
            }
        ]),
        // 6. Recent Withdrawals for History
        FoodDeliveryWithdrawal.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        // 7. Recent COD deposits for History
        FoodDeliveryCashDeposit.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean()
    ]);

    const totalEarned = Number(earningsAgg?.[0]?.totalEarned) || 0;
    const grossCashCollected = Number(cashCollectedAgg?.[0]?.cashCollected) || 0;
    const codOrderIds = (cashCollectedAgg?.[0]?.codOrderIds || [])
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
    const cashSettledAgg = codOrderIds.length
        ? await FoodPayoutSettlement.aggregate([
            {
                $match: {
                    beneficiaryType: 'delivery',
                    beneficiaryId: partnerId,
                    status: 'paid',
                    codPaidAmount: { $gt: 0 },
                    transactionIds: { $in: codOrderIds }
                }
            },
            { $group: { _id: null, depositedCash: { $sum: { $ifNull: ['$codPaidAmount', 0] } } } }
        ])
        : [];
    const rawPayoutDepositedCash = Number(cashSettledAgg?.[0]?.depositedCash) || 0;
    const rawDirectDepositedCash = Number(depositAgg?.[0]?.depositedCash) || 0;
    const rawDepositedCash = rawPayoutDepositedCash + rawDirectDepositedCash;
    const totalDepositedCash = Math.max(0, Math.min(rawDepositedCash, grossCashCollected));
    const cashInHand = Math.max(0, grossCashCollected - totalDepositedCash);
    const totalBonus = Number(bonusAgg?.[0]?.total) || 0;
    const legacyApprovedWithdrawn = Number(withdrawalAgg?.[0]?.totalWithdrawn) || 0;
    const settlementPaid = Number(payoutAgg?.[0]?.totalPaid) || 0;
    // Prefer new payout-settlement totals when available; fallback to legacy withdrawal totals.
    const totalWithdrawn = settlementPaid > 0 ? settlementPaid : legacyApprovedWithdrawn;
    const pendingWithdrawals = Number(withdrawalAgg?.[0]?.pendingWithdrawals) || 0;

    const totalCashLimit = Number(
        cashLimitSettings.effectiveDeliveryCashLimit ?? cashLimitSettings.deliveryCashLimit,
    ) || 0;
    const deliveryWithdrawalLimit = 0;

    // Pocket Balance = (Earnings + Bonus) - Total Withdrawn (approved) - Pending Withdrawals
    // Wait, usually pocket balance subtracts pending too so user knows how much is "left" to request.
    const pocketBalance = Math.max(0, (totalEarned + totalBonus) - (totalWithdrawn + pendingWithdrawals));

    // Fetch transactions for UI (Orders, Bonuses, Withdrawals)
    const [ordersTx] = await Promise.all([
        FoodOrder.find({ 'dispatch.deliveryPartnerId': partnerId, orderStatus: { $in: PAYABLE_DELIVERY_STATUSES } })
            .sort({ createdAt: -1 })
            .select('orderId riderEarning payment orderStatus createdAt updatedAt')
            .limit(20)
            .lean(),
    ]);

    const transactions = [
        ...(ordersTx || []).map(o => ({
            id: o._id,
            type: 'payment',
            amount: o.riderEarning || 0,
            status: 'Completed',
            date: o.createdAt,
            description: o.payment?.method === 'cash' ? 'COD delivery earning' : 'Online delivery earning',
            orderId: o.orderId
        })),
        ...(withdrawalsList || []).map(w => ({
            id: w._id,
            type: 'withdrawal',
            amount: w.amount,
            status: w.status === 'pending' ? 'Pending' : (w.status === 'approved' ? 'Completed' : 'Rejected'),
            date: w.createdAt,
            description: `Withdrawal Request - ${w.paymentMethod}`,
            payoutMethod: w.paymentMethod
        })),
        ...(depositList || []).map(d => ({
            id: d._id,
            type: 'deposit',
            amount: d.amount,
            status: d.status || 'Pending',
            date: d.createdAt,
            description: 'Cash limit settlement',
            paymentMethod: d.paymentMethod || 'cash',
            razorpayPaymentId: d.razorpayPaymentId || '',
            razorpayOrderId: d.razorpayOrderId || ''
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
        totalBalance: totalEarned + totalBonus, // Gross lifetime earnings
        pocketBalance, // Available to withdraw
        cashInHand, // COD to be deposited/deducted
        totalCashCollected: grossCashCollected,
        cashSubmittedToAdmin: totalDepositedCash,
        totalWithdrawn, // Actually paid out
        pendingWithdrawals, // In process
        totalEarned,
        totalBonus,
        totalCashLimit,
        availableCashLimit: Math.max(0, totalCashLimit - cashInHand),
        cashLimitZoneId: String(cashLimitSettings.zoneId || partner?.zoneId || ''),
        deliveryWithdrawalLimit,
        transactions: transactions.slice(0, 50)
    };
};

/**
 * Submits a new withdrawal request for a delivery partner.
 */
export const requestDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
    const { amount, bankDetails, paymentMethod = 'bank_transfer' } = payload;

    if (!amount || amount < 1) throw new ValidationError('Invalid amount');

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount < wallet.deliveryWithdrawalLimit) {
        throw new ValidationError(`Minimum withdrawal amount is ₹${wallet.deliveryWithdrawalLimit}`);
    }
    if (amount > wallet.pocketBalance) {
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const withdrawal = await FoodDeliveryWithdrawal.create({
        deliveryPartnerId,
        amount,
        paymentMethod,
        bankDetails: bankDetails || {
            accountNumber: partner.bankAccountNumber,
            ifscCode: partner.bankIfscCode,
            bankName: partner.bankName,
            accountHolderName: partner.bankAccountHolderName
        },
        upiId: partner.upiId,
        upiQrCode: partner.upiQrCode,
        status: 'pending'
    });

    return withdrawal;
};

export const createDeliveryCashDepositOrder = async (deliveryPartnerId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount < 1) {
        throw new ValidationError('Amount must be at least ₹1');
    }
    if (amount > 500000) {
        throw new ValidationError('Maximum deposit is ₹5,00,000');
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    const amountPaise = Math.round(amount * 100);
    const receipt = `cash_deposit_${String(deliveryPartnerId).slice(-8)}_${Date.now()}`;

    if (!isRazorpayConfigured()) {
        return {
            razorpay: {
                key: getRazorpayKeyId() || 'rzp_test_dummy',
                orderId: `order_dev_${Date.now()}`,
                amount: amountPaise,
                currency: 'INR'
            }
        };
    }

    const order = await createRazorpayOrder(amountPaise, 'INR', receipt);
    return {
        razorpay: {
            key: getRazorpayKeyId(),
            orderId: String(order.id),
            amount: Number(order.amount) || amountPaise,
            currency: order.currency || 'INR'
        }
    };
};

export const verifyDeliveryCashDepositPayment = async (deliveryPartnerId, payload = {}) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    const amount = Number(payload?.amount);

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');
    if (!Number.isFinite(amount) || amount < 1) throw new ValidationError('amount is required');

    const existing = await FoodDeliveryCashDeposit.findOne({
        deliveryPartnerId,
        $or: [
            { razorpayPaymentId: paymentId },
            { razorpayOrderId: orderId }
        ]
    }).lean();

    if (existing?.status === 'Completed') {
        return { deposit: existing, wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId) };
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    const isValid = isRazorpayConfigured()
        ? verifyPaymentSignature(orderId, paymentId, signature)
        : true;

    if (!isValid) {
        throw new ValidationError('Payment verification failed');
    }

    const deposit = existing
        ? await FoodDeliveryCashDeposit.findByIdAndUpdate(
            existing._id,
            {
                $set: {
                    amount,
                    paymentMethod: isRazorpayConfigured() ? 'razorpay' : 'cash',
                    status: 'Completed',
                    razorpayOrderId: orderId,
                    razorpayPaymentId: paymentId
                }
            },
            { new: true }
        )
        : await FoodDeliveryCashDeposit.create({
            deliveryPartnerId,
            amount,
            paymentMethod: isRazorpayConfigured() ? 'razorpay' : 'cash',
            status: 'Completed',
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId
        });

    return {
        deposit,
        wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId)
    };
};
