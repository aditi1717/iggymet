import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';

function toTwoDigitYearString(dateObj) {
    const y = String(dateObj.getFullYear());
    return y.slice(-2);
}

function monthShort(monthIndex) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthIndex] || 'Jan';
}

function getFixedCurrentCycleWindow(now = new Date()) {
    const startDay = 15;
    
    let year = now.getFullYear();
    let month = now.getMonth();

    // If before start day, settlement belongs to previous month cycle.
    if (now.getDate() < startDay) {
        month = month - 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }

    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    // End should be either fixed 21 or now, let's make it more inclusive for "Current Cycle"
    // Users want to see their active earnings, so we extend it to 'now'
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return {
        start,
        end,
        startMeta: { day: String(startDay), month: monthShort(month), year: toTwoDigitYearString(new Date(year, month, startDay)) },
        endMeta: { day: String(now.getDate()), month: monthShort(now.getMonth()), year: toTwoDigitYearString(now) }
    };
}

function parseISODateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseISODateParamEnd(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d;
}

function buildRestaurantFinanceTransactionEligibility() {
    return {
        $or: [
            { status: { $in: ['captured', 'authorized'] } },
            // Legacy fallback: older no-response transactions may have been marked failed.
            { status: 'failed', history: { $elemMatch: { kind: 'cancelled_by_delivery_no_response' } } }
        ]
    };
}

function toValidDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getOrderEffectiveDeliveredAt(order = {}) {
    return toValidDate(
        order?.deliveryState?.deliveredAt ||
        order?.deliveredAt ||
        order?.completedAt ||
        order?.updatedAt ||
        order?.createdAt
    );
}

function isDeliveredOrder(order = {}) {
    const status = String(order?.orderStatus || '').toLowerCase();
    return status === 'delivered' || status === 'cancelled_by_user_unavailable';
}

function mapTransactionToFinanceOrder(tx, effectiveDateOverride = null) {
    const order = tx?.orderId || {};
    const items = Array.isArray(order.items) ? order.items : [];
    const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
    const orderTotalExclTax = Math.max(
        0,
        Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
    );
    const payout = Number(tx?.amounts?.restaurantShare || 0);
    const isSettled = Boolean(tx?.settlement?.isRestaurantSettled === true);

    return {
        orderId: order?.orderId || tx?.orderReadableId,
        createdAt: effectiveDateOverride || tx?.createdAt,
        items,
        foodNames,
        orderTotal: orderTotalExclTax,
        totalAmount: tx?.amounts?.totalCustomerPaid || 0,
        payout,
        commission: tx?.amounts?.restaurantCommission || 0,
        paymentMethod: tx?.paymentMethod || order?.payment?.method,
        orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status,
        status: tx?.status,
        isSettled,
        settledAt: tx?.settlement?.restaurantSettledAt || null,
        paidAmount: isSettled ? payout : 0,
        unpaidAmount: isSettled ? 0 : payout,
        pricing: {
            subtotal: order?.pricing?.subtotal || 0,
            packagingFee: order?.pricing?.packagingFee || 0,
            couponByAdmin: order?.pricing?.couponByAdmin || 0,
            couponByRestaurant: order?.pricing?.couponByRestaurant || 0,
            offerByRestaurant: order?.pricing?.offerByRestaurant || 0,
            tax: order?.pricing?.tax || 0,
            deliveryFee: order?.pricing?.deliveryFee || 0,
            platformFee: order?.pricing?.platformFee || 0,
            total: order?.pricing?.total || 0,
            restaurantCommission: tx?.amounts?.restaurantCommission || 0
        }
    };
}

export async function getRestaurantFinance(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    // Fetch restaurant profile for header display.
    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName addressLine1 addressLine2 area city state pincode location')
        .lean();

    const address =
        restaurant?.location?.formattedAddress ||
        (restaurant?.addressLine1
            ? [restaurant.addressLine1, restaurant.addressLine2, restaurant.area].filter(Boolean).join(', ')
            : restaurant?.addressLine1 || '');

    const nowWindow = getFixedCurrentCycleWindow(new Date());

    // Current cycle: sum ledger payouts in the fixed window.
    const currentTransactionsRaw = await FoodTransaction.find({
        restaurantId: rid,
        ...buildRestaurantFinanceTransactionEligibility(),
    })
        .populate('orderId', 'orderId createdAt updatedAt completedAt deliveredAt items pricing deliveryState orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const currentCycleOrders = currentTransactionsRaw
        .filter((tx) => {
            const order = tx?.orderId || {};
            if (!isDeliveredOrder(order)) return false;
            const effectiveDeliveredAt = getOrderEffectiveDeliveredAt(order);
            return effectiveDeliveredAt && effectiveDeliveredAt >= nowWindow.start && effectiveDeliveredAt <= nowWindow.end;
        })
        .map((tx) => {
            const effectiveDate = getOrderEffectiveDeliveredAt(tx?.orderId || {}) || tx.createdAt;
            return {
                ...mapTransactionToFinanceOrder(tx, effectiveDate),
                recoveredFromDue: false
            };
        });

    const currentCycleEstimatedPayout = currentCycleOrders.reduce(
        (sum, o) => sum + (Number(o.payout) || 0),
        0
    );

    // Calculate global estimated payout (all unsettled transactions)
    const allUnsettledTransactionsRaw = await FoodTransaction.find({
        restaurantId: rid,
        ...buildRestaurantFinanceTransactionEligibility(),
        'settlement.isRestaurantSettled': { $ne: true }
    })
        .populate('orderId', 'orderStatus createdAt updatedAt completedAt deliveredAt deliveryState.deliveredAt')
        .select('amounts.restaurantShare orderId')
        .lean();

    const allUnsettledTransactions = allUnsettledTransactionsRaw.filter((tx) =>
        isDeliveredOrder(tx?.orderId || {})
    );

    const globalEstimatedPayout = allUnsettledTransactions.reduce(
        (sum, tx) => sum + (Number(tx.amounts?.restaurantShare) || 0),
        0
    );

    // Block only pending withdrawals from available balance.
    // Approved/rejected requests are processed records and should not keep locking payout.
    const pendingWithdrawalsAgg = await FoodRestaurantWithdrawal.aggregate([
        {
            $match: {
                restaurantId: rid,
                $expr: {
                    $eq: [{ $toLower: { $trim: { input: '$status' } } }, 'pending']
                }
            }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalPendingWithdrawals = Number(pendingWithdrawalsAgg?.[0]?.total || 0);
    const availableBalance = Math.max(0, globalEstimatedPayout - totalPendingWithdrawals);

    const currentCycle = {
        start: { ...nowWindow.startMeta },
        end: { ...nowWindow.endMeta },
        totalEarnings: currentCycleEstimatedPayout, // We still show current cycle earnings label
        totalWithdrawn: totalPendingWithdrawals,
        estimatedPayout: availableBalance, // This is what UI shows as "Estimated Payout" (Available Balance)
        totalOrders: currentCycleOrders.length,
        payoutDate: null,
        orders: currentCycleOrders
    };

    // Invoice Summary (derived from current cycle or broader if needed)
    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
    };

    // Past cycles: build from provided startDate/endDate query.
    const startDate = parseISODateParam(query.startDate);
    const endDate = parseISODateParamEnd(query.endDate);

    let pastCyclesResult = { orders: [], totalOrders: 0 };
    if (startDate && endDate) {
        const pastTransactions = await FoodTransaction.find({
            restaurantId: rid,
            ...buildRestaurantFinanceTransactionEligibility(),
        })
            .populate('orderId', 'orderId createdAt updatedAt completedAt deliveredAt items pricing deliveryState orderStatus')
            .sort({ createdAt: -1 })
            .lean();

        const pastCycleOrders = pastTransactions
            .filter((tx) => {
                const order = tx?.orderId || {};
                if (!isDeliveredOrder(order)) return false;
                const effectiveDeliveredAt = getOrderEffectiveDeliveredAt(order);
                return effectiveDeliveredAt && effectiveDeliveredAt >= startDate && effectiveDeliveredAt <= endDate;
            })
            .map((tx) => {
                const effectiveDate = getOrderEffectiveDeliveredAt(tx?.orderId || {}) || tx.createdAt;
                return mapTransactionToFinanceOrder(tx, effectiveDate);
            });

        pastCyclesResult = {
            orders: pastCycleOrders,
            totalOrders: pastCycleOrders.length
        };
    }

    return {
        restaurant: {
            name: restaurant?.restaurantName || '',
            restaurantId: restaurant?._id ? `REST${restaurant._id.toString().slice(-6).padStart(6, '0')}` : 'N/A',
            address
        },
        currentCycle,
        invoiceSummary,
        pastCycles: pastCyclesResult
    };
}


