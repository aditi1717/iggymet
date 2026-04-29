import mongoose from 'mongoose';
import { ValidationError, ForbiddenError } from '../../../../core/auth/errors.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { DeliverySupportTicket } from '../../delivery/models/supportTicket.model.js';
import { FoodZone } from '../models/zone.model.js';
import { FoodCategory } from '../models/category.model.js';
import { FoodItem } from '../models/food.model.js';
import { FoodOffer } from '../models/offer.model.js';
import { FoodOfferUsage } from '../models/offerUsage.model.js';
import { DeliveryBonusTransaction } from '../models/deliveryBonusTransaction.model.js';
import { FoodEarningAddon } from '../models/earningAddon.model.js';
import { FoodEarningAddonHistory } from '../models/earningAddonHistory.model.js';
import { FoodRestaurantCommission } from '../models/restaurantCommission.model.js';
import { FoodDeliveryCommissionRule } from '../models/deliveryCommissionRule.model.js';
import { FoodFeeSettings } from '../models/feeSettings.model.js';
import { FeedbackExperience } from '../models/feedbackExperience.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRefreshToken } from '../../../../core/refreshTokens/refreshToken.model.js';
import { FoodDeliveryCashLimit } from '../models/deliveryCashLimit.model.js';
import { FoodDeliveryEmergencyHelp } from '../models/deliveryEmergencyHelp.model.js';
import { FoodReferralSettings } from '../models/referralSettings.model.js';
import { FoodReferralLog } from '../models/referralLog.model.js';
import { FoodSafetyEmergencyReport } from '../models/safetyEmergencyReport.model.js';
import { FoodAddon } from '../../restaurant/models/foodAddon.model.js';
import { FoodSupportTicket } from '../../user/models/supportTicket.model.js';
import { FoodRestaurantSupportTicket } from '../../restaurant/models/supportTicket.model.js';
import { RestaurantOffer } from '../../restaurant/models/restaurantOffer.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodUserDebt } from '../../orders/models/userDebt.model.js';
import { StoreProduct } from '../models/storeProduct.model.js';
import { StoreOrder } from '../models/storeOrder.model.js';
import { FoodRestaurantWithdrawal } from '../../restaurant/models/foodRestaurantWithdrawal.model.js';
import { FoodDeliveryWithdrawal } from '../../delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryWallet } from '../../delivery/models/deliveryWallet.model.js';
import { FoodDeliveryCashDeposit } from '../../delivery/models/foodDeliveryCashDeposit.model.js';
import { FoodPayoutSettlement } from '../models/foodPayoutSettlement.model.js';
import {
    backfillLegacyCategoryWorkflow,
    categoryAllowsFoodType,
    normalizeCategoryVisibilityTime,
    normalizeCategoryFoodTypeScope,
    serializeCategoryForResponse
} from '../../shared/categoryWorkflow.js';
import {
    extractRawFoodVariants,
    getFoodDisplayPrice,
    hasFoodVariants,
    normalizeFoodVariantsInput,
    serializeFoodVariants
} from './foodVariant.service.js';
import { normalizeAdminPermissions } from '../constants/adminPermissions.js';

const parseBooleanLike = (value, fieldName) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on', 'active'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off', 'inactive'].includes(normalized)) return false;
    }
    throw new ValidationError(`${fieldName} must be a boolean`);
};

const normalizeAdminScope = (adminScope = {}) => {
    const adminType = String(adminScope?.adminType || 'SUPER_ADMIN').toUpperCase();
    const zoneIds = Array.isArray(adminScope?.zoneIds)
        ? adminScope.zoneIds
            .map((id) => (id ? String(id).trim() : ''))
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id))
        : [];
    return {
        adminType,
        isSuperAdmin: adminType === 'SUPER_ADMIN',
        isSubAdmin: adminType === 'SUB_ADMIN',
        zoneIds,
    };
};

const assertZoneAccess = (adminScope = {}, zoneIdLike) => {
    const scope = normalizeAdminScope(adminScope);
    if (!scope.isSubAdmin) return;
    const rawZoneId = zoneIdLike ? String(zoneIdLike).trim() : '';
    if (!rawZoneId || !mongoose.Types.ObjectId.isValid(rawZoneId)) {
        throw new ForbiddenError('Sub-admin can only access assigned zones');
    }
    const hasZone = scope.zoneIds.some((zoneId) => String(zoneId) === rawZoneId);
    if (!hasZone) {
        throw new ForbiddenError('Sub-admin can only access assigned zones');
    }
};

const applyZoneConstraint = (filter = {}, adminScope = {}, fieldName = 'zoneId') => {
    const scope = normalizeAdminScope(adminScope);
    if (!scope.isSubAdmin) return filter;
    if (!scope.zoneIds.length) {
        filter._id = { $in: [] };
        return filter;
    }
    filter[fieldName] = { $in: scope.zoneIds };
    return filter;
};

const toFiniteNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(num) ? num : null;
};

const normalizeDateString = (value) => String(value || '').trim();
const normalizeTimeString = (value, fallback) => {
    const raw = String(value ?? fallback ?? '').trim();
    if (!raw) return fallback;
    const match = raw.match(/^(\d{2}):(\d{2})$/);
    if (!match) throw new ValidationError('Time must be in HH:mm format');
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        throw new ValidationError('Time must be in HH:mm format');
    }
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const toLocalDateTime = (dateRaw, timeRaw, endOfMinute = false) => {
    const seconds = endOfMinute ? '59.999' : '00.000';
    const d = new Date(`${dateRaw}T${timeRaw}:${seconds}`);
    return Number.isNaN(d.getTime()) ? null : d;
};

const pad2 = (num) => String(num).padStart(2, '0');

const toLocalYmd = (dateObj) => `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
const toLocalHm = (dateObj) => `${pad2(dateObj.getHours())}:${pad2(dateObj.getMinutes())}`;

const startOfTodayLocal = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};

const RESTAURANT_EFFECTIVE_DELIVERED_AT_EXPR = {
    $ifNull: [
        '$deliveryState.deliveredAt',
        { $ifNull: ['$deliveredAt', { $ifNull: ['$completedAt', { $ifNull: ['$updatedAt', '$createdAt'] }] }] }
    ]
};

const toValidDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const PAYABLE_SETTLEMENT_ORDER_STATUSES = ['delivered', 'cancelled_by_user_unavailable'];
const isPayableSettlementOrderStatus = (value) =>
    PAYABLE_SETTLEMENT_ORDER_STATUSES.includes(String(value || '').toLowerCase());

const getOrderEffectiveDeliveredAt = (order = {}) =>
    toValidDate(
        order?.deliveryState?.deliveredAt ||
        order?.deliveredAt ||
        order?.completedAt ||
        order?.updatedAt ||
        order?.createdAt
    );

const isOrderDeliveredForSettlement = (order = {}) =>
    isPayableSettlementOrderStatus(order?.orderStatus);

const isDateWithinRange = (date, start, end) => {
    if (!date) return false;
    const time = date.getTime();
    if (start && time < start.getTime()) return false;
    if (end && time > end.getTime()) return false;
    return true;
};

const loadPendingRestaurantSettlementTransactions = async ({
    start,
    end,
    scopedRestaurantIds = null,
}) => {
    const txFilter = {
        status: 'captured',
        'settlement.isRestaurantSettled': { $ne: true }
    };
    if (Array.isArray(scopedRestaurantIds)) {
        txFilter.restaurantId = { $in: scopedRestaurantIds };
    }

    const pendingTransactions = await FoodTransaction.find(txFilter)
        .select('_id restaurantId amounts.restaurantShare orderId')
        .populate('orderId', 'orderStatus createdAt updatedAt completedAt deliveredAt deliveryState.deliveredAt')
        .lean();

    return pendingTransactions.filter((tx) => {
        const order = tx?.orderId || {};
        if (!isOrderDeliveredForSettlement(order)) return false;
        const effectiveDeliveredAt = getOrderEffectiveDeliveredAt(order);
        return isDateWithinRange(effectiveDeliveredAt, start, end);
    });
};

const resolveAutoDateRange = async (beneficiaryType = 'restaurant') => {
    const now = new Date();
    const latest = await FoodPayoutSettlement.findOne({ beneficiaryType, status: 'paid' })
        .sort({ toAt: -1, paidAt: -1, createdAt: -1 })
        .select('toAt paidAt')
        .lean();

    const boundary = latest?.toAt || latest?.paidAt || null;
    let start = boundary ? new Date(new Date(boundary).getTime() + 1000) : startOfTodayLocal();
    if (beneficiaryType === 'restaurant') {
        const boundaryPlusOneSecond = boundary ? new Date(new Date(boundary).getTime() + 1000) : null;
        const earliestUnsettledOrder = await FoodOrder.aggregate([
            {
                $match: {
                    orderStatus: { $in: PAYABLE_SETTLEMENT_ORDER_STATUSES },
                    restaurantId: { $exists: true, $ne: null }
                }
            },
            {
                $lookup: {
                    from: FoodTransaction.collection.name,
                    localField: '_id',
                    foreignField: 'orderId',
                    as: 'pendingTransactions'
                }
            },
            {
                $match: {
                    pendingTransactions: {
                        $elemMatch: {
                            status: 'captured',
                            'settlement.isRestaurantSettled': { $ne: true }
                        }
                    }
                }
            },
            {
                $addFields: {
                    effectiveDeliveredAt: RESTAURANT_EFFECTIVE_DELIVERED_AT_EXPR
                }
            },
            ...(boundaryPlusOneSecond ? [{ $match: { effectiveDeliveredAt: { $gt: boundaryPlusOneSecond } } }] : []),
            { $sort: { effectiveDeliveredAt: 1 } },
            { $limit: 1 },
            { $project: { effectiveDeliveredAt: 1 } }
        ]);

        if (earliestUnsettledOrder?.[0]?.effectiveDeliveredAt) {
            start = new Date(earliestUnsettledOrder[0].effectiveDeliveredAt);
        }
    }
    const safeStart = start > now ? new Date(now.getTime() - 1000) : start;
    const end = now;
    return {
        start: safeStart,
        end,
        fromRaw: toLocalYmd(safeStart),
        toRaw: toLocalYmd(end),
        fromTimeRaw: toLocalHm(safeStart),
        toTimeRaw: toLocalHm(end),
        auto: true
    };
};

const resolveDeliveryAutoDateRange = async () => {
    const now = new Date();
    const latest = await FoodPayoutSettlement.findOne({ beneficiaryType: 'delivery', status: 'paid' })
        .sort({ toAt: -1, paidAt: -1, createdAt: -1 })
        .select('toAt paidAt')
        .lean();

    const boundary = latest?.toAt || latest?.paidAt || null;
    const boundaryPlusOneSecond = boundary ? new Date(new Date(boundary).getTime() + 1000) : null;
    const deliveryOrderBaseMatch = {
        orderStatus: { $in: PAYABLE_SETTLEMENT_ORDER_STATUSES },
        'dispatch.deliveryPartnerId': { $exists: true, $ne: null }
    };

    const earliestUnsettledOrder = await FoodOrder.aggregate([
        { $match: deliveryOrderBaseMatch },
        {
            $addFields: {
                effectiveDeliveredAt: {
                    $ifNull: [
                        '$deliveryState.deliveredAt',
                        { $ifNull: ['$deliveredAt', { $ifNull: ['$completedAt', { $ifNull: ['$updatedAt', '$createdAt'] }] }] }
                    ]
                }
            }
        },
        ...(boundaryPlusOneSecond ? [{ $match: { effectiveDeliveredAt: { $gt: boundaryPlusOneSecond } } }] : []),
        { $sort: { effectiveDeliveredAt: 1 } },
        { $limit: 1 },
        { $project: { effectiveDeliveredAt: 1 } }
    ]);

    let start = earliestUnsettledOrder?.[0]?.effectiveDeliveredAt
        ? new Date(earliestUnsettledOrder[0].effectiveDeliveredAt)
        : (boundary ? new Date(new Date(boundary).getTime() + 1000) : null);

    if (!start || Number.isNaN(start.getTime())) {
        const firstDeliveryOrder = await FoodOrder.aggregate([
            { $match: deliveryOrderBaseMatch },
            {
                $addFields: {
                    effectiveDeliveredAt: {
                        $ifNull: [
                            '$deliveryState.deliveredAt',
                            { $ifNull: ['$deliveredAt', { $ifNull: ['$completedAt', { $ifNull: ['$updatedAt', '$createdAt'] }] }] }
                        ]
                    }
                }
            },
            { $sort: { effectiveDeliveredAt: 1 } },
            { $limit: 1 },
            { $project: { effectiveDeliveredAt: 1 } }
        ]);
        start = firstDeliveryOrder?.[0]?.effectiveDeliveredAt ? new Date(firstDeliveryOrder[0].effectiveDeliveredAt) : startOfTodayLocal();
    }

    const safeStart = start > now ? new Date(now.getTime() - 1000) : start;
    const end = now;
    return {
        start: safeStart,
        end,
        fromRaw: toLocalYmd(safeStart),
        toRaw: toLocalYmd(end),
        fromTimeRaw: toLocalHm(safeStart),
        toTimeRaw: toLocalHm(end),
        auto: true
    };
};

const normalizeDateRangeOrThrow = (fromDate, toDate, fromTime, toTime) => {
    const fromRaw = normalizeDateString(fromDate);
    const toRaw = normalizeDateString(toDate);
    const fromTimeRaw = normalizeTimeString(fromTime, '00:00');
    const toTimeRaw = normalizeTimeString(toTime, '23:59');
    const start = toLocalDateTime(fromRaw, fromTimeRaw, false);
    const end = toLocalDateTime(toRaw, toTimeRaw, true);
    if (!start || !end) {
        throw new ValidationError('Valid fromDate and toDate are required in YYYY-MM-DD format');
    }
    if (start > end) {
        throw new ValidationError('fromDate/fromTime cannot be after toDate/toTime');
    }

    // Compare only calendar day (not current time) so "today" is always allowed.
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (fromRaw > todayYmd || toRaw > todayYmd) {
        throw new ValidationError('Future dates are not allowed for settlement');
    }
    return { start, end, fromRaw, toRaw, fromTimeRaw, toTimeRaw, auto: false };
};

const normalizeRestaurantTime = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const toHHMM = (hour, minute) => {
        const h = Number(hour);
        const m = Number(minute);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
        if (h < 0 || h > 23 || m < 0 || m > 59) return '';
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) return toHHMM(hhmm[1], hhmm[2]);

    const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
    if (ampm) {
        let hour = Number(ampm[1]);
        const minute = Number(ampm[2]);
        const period = ampm[3].toUpperCase();
        if (!Number.isFinite(hour) || !Number.isFinite(minute)) return '';
        if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return '';
        if (period === 'AM') hour = hour === 12 ? 0 : hour;
        if (period === 'PM') hour = hour === 12 ? 12 : hour + 12;
        return toHHMM(hour, minute);
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return toHHMM(parsed.getHours(), parsed.getMinutes());
    }

    return '';
};

const timeToMinutes = (value) => {
    const normalized = normalizeRestaurantTime(value);
    if (!normalized) return null;
    const [h, m] = normalized.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
};

const validateOpeningClosingTimes = (openingTime, closingTime) => {
    const open = timeToMinutes(openingTime);
    const close = timeToMinutes(closingTime);
    if (open === null || close === null) return;
    if (open === close) {
        throw new ValidationError('Opening time and closing time cannot be same');
    }
    if (close < open) {
        throw new ValidationError('Closing time cannot be less than opening time');
    }
};

export async function getRestaurantComplaints(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { type: 'order' };
    if (query.status && query.status !== 'all') filter.status = query.status;
    if (query.complaintType && query.complaintType !== 'all') filter.issueType = query.complaintType;
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(query.restaurantId)) {
        filter.restaurantId = new mongoose.Types.ObjectId(query.restaurantId);
    }
    if (query.search) {
        const searchRegex = { $regex: query.search, $options: 'i' };
        const restaurantIds = await FoodRestaurant.find({ restaurantName: searchRegex }).select('_id').lean();
        const userIds = await FoodUser.find({ name: searchRegex }).select('_id').lean();
        const orderIds = await FoodOrder.find({ orderId: searchRegex }).select('_id').lean();

        filter.$or = [
            { restaurantId: { $in: restaurantIds.map(r => r._id) } },
            { userId: { $in: userIds.map(u => u._id) } },
            { orderId: { $in: orderIds.map(o => o._id) } },
            { description: searchRegex },
            { issueType: searchRegex }
        ];
    }
    const fromDate = query.fromDate || query.startDate;
    const toDate = query.toDate || query.endDate;
    if (fromDate && toDate) {
        filter.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };
    }

    const [complaints, total] = await Promise.all([
        FoodSupportTicket.find(filter)
            .populate('userId', 'name phone profileImage')
            .populate('restaurantId', 'restaurantName profileImage area city')
            .populate('orderId', 'orderId orderStatus pricing createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodSupportTicket.countDocuments(filter)
    ]);

    return { complaints, total, page, limit };
}

export async function globalSearch(query = '') {
    const term = String(query).trim();
    if (!term) return [];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };

    const [orders, users, restaurants, items, categories, addons] = await Promise.all([
        FoodOrder.find({
            $or: [{ orderId: regex }, { orderStatus: regex }]
        })
            .limit(5)
            .select('orderId orderStatus createdAt')
            .lean(),
        FoodUser.find({
            $or: [{ name: regex }, { email: regex }, { phone: regex }],
            role: 'USER'
        })
            .limit(5)
            .select('name email phone')
            .lean(),
        FoodRestaurant.find({
            $or: [{ restaurantName: regex }, { ownerName: regex }, { city: regex }]
        })
            .limit(5)
            .select('restaurantName city area status')
            .lean(),
        FoodItem.find({
            $or: [{ name: regex }, { description: regex }]
        })
            .limit(5)
            .select('name description price')
            .lean(),
        FoodCategory.find({ name: regex })
            .limit(3)
            .select('name image')
            .lean(),
        FoodAddon.find({ name: regex })
            .limit(3)
            .select('name price')
            .lean()
    ]);

    const results = [];

    orders.forEach(o => results.push({
        id: o._id,
        type: 'Order',
        title: `#${o.orderId}`,
        description: `Status: ${o.orderStatus}`,
        path: `/admin/food/orders/all?orderId=${o._id}`
    }));

    users.forEach(u => results.push({
        id: u._id,
        type: 'User',
        title: u.name || 'Unnamed',
        description: `${u.email || u.phone || ''}`,
        path: `/admin/food/customers?userId=${u._id}`
    }));

    restaurants.forEach(r => results.push({
        id: r._id,
        type: 'Restaurant',
        title: r.restaurantName,
        description: `${r.area || ''}, ${r.city || ''} (${r.status})`,
        path: `/admin/food/restaurants?restaurantId=${r._id}`
    }));

    items.forEach(i => results.push({
        id: i._id,
        type: 'Product',
        title: i.name,
        description: `Price: ₹${i.price}`,
        path: `/admin/food/foods?productId=${i._id}`
    }));

    categories.forEach(c => results.push({
        id: c._id,
        type: 'Category',
        title: c.name,
        description: 'Menu Category',
        path: `/admin/food/categories`
    }));

    addons.forEach(a => results.push({
        id: a._id,
        type: 'Addon',
        title: a.name,
        description: `Price: ₹${a.price}`,
        path: `/admin/food/addons`
    }));

    return results;
}

export async function updateRestaurantComplaint(id, updateData) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid complaint ID');
    }
    const update = {};
    if (updateData.status) update.status = updateData.status;
    if (updateData.adminResponse !== undefined) update.adminResponse = updateData.adminResponse;

    const updated = await FoodSupportTicket.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true }
    ).lean();

    if (!updated) throw new ValidationError('Complaint not found');
    return updated;
}

export async function getRestaurants(query, adminScope = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const status = query.status;
    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        filter.status = status;
    }
    applyZoneConstraint(filter, adminScope, 'zoneId');
    const [restaurants, total] = await Promise.all([
        FoodRestaurant.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('restaurantName location area city profileImage coverImages menuImages status ownerName ownerPhone zoneId')
            .populate('zoneId', 'name zoneName')
            .lean(),
        FoodRestaurant.countDocuments(filter)
    ]);
    return { restaurants, total, page, limit };
}

const CANCELLED_ORDER_STATUSES = ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'];
const PENDING_ORDER_STATUSES = ['created', 'confirmed', 'preparing', 'ready_for_pickup', 'picked_up'];

const getDateRangeByPeriod = (periodRaw) => {
    const period = String(periodRaw || 'overall').trim().toLowerCase();
    if (!period || period === 'overall' || period === 'all') return null;

    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    if (period === 'today') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    if (period === 'week') {
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - start.getDay());
        end.setTime(start.getTime());
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }

    if (period === 'month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start: monthStart, end: monthEnd };
    }

    if (period === 'year') {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { start: yearStart, end: yearEnd };
    }

    return null;
};

const formatMonthShort = (year, monthIndex) =>
    new Date(year, monthIndex, 1).toLocaleString('en-IN', { month: 'short' });

export async function getDashboardStats(query = {}, adminScope = {}) {
    const periodRange = getDateRangeByPeriod(query.period);
    const scope = normalizeAdminScope(adminScope);
    const requestedZoneId = query.zoneId && mongoose.Types.ObjectId.isValid(query.zoneId)
        ? new mongoose.Types.ObjectId(query.zoneId)
        : null;
    const zoneId = scope.isSubAdmin
        ? (requestedZoneId && scope.zoneIds.some((zid) => String(zid) === String(requestedZoneId))
            ? requestedZoneId
            : (scope.zoneIds[0] || null))
        : requestedZoneId;

    const orderMatch = {
        $or: [
            { "payment.method": { $in: ["cash", "wallet"] } },
            { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
        ],
    };
    if (periodRange) {
        orderMatch.createdAt = { $gte: periodRange.start, $lte: periodRange.end };
    }
    if (zoneId) {
        orderMatch.zoneId = zoneId;
    }

    const restaurantMatch = {};
    if (zoneId) {
        restaurantMatch.zoneId = zoneId;
    }

    const zoneRestaurantIds = zoneId
        ? await FoodRestaurant.find({ zoneId }).distinct('_id')
        : null;
    const zoneScopedRestaurantMatch = zoneId
        ? { restaurantId: { $in: zoneRestaurantIds || [] } }
        : {};

    const [
        orderTotalsAgg,
        monthlyAgg,
        restaurantsTotal,
        restaurantsPending,
        deliveryTotal,
        deliveryPending,
        foodsTotal,
        addonsTotal,
        customersTotal,
        recentPendingRestaurants,
        recentPendingDelivery,
        recentPendingOrders,
        recentDeliveredOrders,
        recentCancelledOrders,
        recentCustomers
    ] = await Promise.all([
        FoodOrder.aggregate([
            { $match: orderMatch },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    delivered: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] } },
                    cancelled: {
                        $sum: {
                            $cond: [{ $in: ['$orderStatus', CANCELLED_ORDER_STATUSES] }, 1, 0]
                        }
                    },
                    pending: {
                        $sum: {
                            $cond: [{ $in: ['$orderStatus', PENDING_ORDER_STATUSES] }, 1, 0]
                        }
                    },
                    revenueTotal: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.total', 0] }, 0] 
                        } 
                    },
                    commissionTotal: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.restaurantCommission', 0] }, 0] 
                        } 
                    },
                    platformFeeTotal: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.platformFee', 0] }, 0] 
                        } 
                    },
                    deliveryFeeTotal: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.deliveryFee', 0] }, 0] 
                        } 
                    },
                    gstTotal: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.tax', 0] }, 0] 
                        } 
                    },
                    adminNetProfit: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$platformProfit', 0] }, 0] 
                        } 
                    }
                }
            }
        ]),
        FoodOrder.aggregate([
            {
                $match: {
                    ...orderMatch,
                    createdAt: {
                        $gte: new Date(new Date().getFullYear(), new Date().getMonth() - 11, 1),
                        $lte: new Date()
                    }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    orders: { $sum: 1 },
                    revenue: { 
                        $sum: { 
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.total', 0] }, 0] 
                        } 
                    },
                    commission: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$platformProfit', { $ifNull: ['$pricing.platformFee', 0] }] },
                                0
                            ]
                        }
                    }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]),
        FoodRestaurant.countDocuments({ ...restaurantMatch, status: 'approved' }),
        FoodRestaurant.countDocuments({ ...restaurantMatch, status: 'pending' }),
        FoodDeliveryPartner.countDocuments({ status: 'approved' }),
        FoodDeliveryPartner.countDocuments({ status: 'pending' }),
        FoodItem.countDocuments({ approvalStatus: 'approved', ...zoneScopedRestaurantMatch }),
        FoodAddon.countDocuments({ approvalStatus: 'approved', isDeleted: { $ne: true }, ...zoneScopedRestaurantMatch }),
        zoneId
            ? FoodOrder.distinct('userId', { ...orderMatch, userId: { $ne: null } }).then((ids) => ids.length)
            : FoodUser.countDocuments({}),
        FoodRestaurant.find({ ...restaurantMatch, status: 'pending' }).sort({ createdAt: -1 }).limit(5).select('restaurantName createdAt').lean(),
        FoodDeliveryPartner.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).select('name createdAt').lean(),
        FoodOrder.find({ 
            ...orderMatch,
            orderStatus: { $in: PENDING_ORDER_STATUSES },
        }).sort({ createdAt: -1 }).limit(5).select('orderId createdAt').lean(),
        FoodOrder.find({ ...orderMatch, orderStatus: 'delivered' }).sort({ updatedAt: -1 }).limit(5).select('orderId updatedAt').lean(),
        FoodOrder.find({ 
            ...orderMatch,
            orderStatus: { $in: CANCELLED_ORDER_STATUSES },
        }).sort({ updatedAt: -1 }).limit(5).select('orderId updatedAt').lean(),
        zoneId
            ? FoodOrder.aggregate([
                { $match: { ...orderMatch, userId: { $ne: null } } },
                { $sort: { createdAt: -1 } },
                {
                    $group: {
                        _id: '$userId',
                        createdAt: { $first: '$createdAt' }
                    }
                },
                { $sort: { createdAt: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'food_users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'user'
                    }
                },
                { $unwind: '$user' },
                {
                    $project: {
                        _id: '$user._id',
                        name: '$user.name',
                        createdAt: 1
                    }
                }
            ])
            : FoodUser.find({}).sort({ createdAt: -1 }).limit(5).select('name createdAt').lean()
    ]);

    const liveSignals = [];
    
    (recentPendingRestaurants || []).forEach(r => {
        liveSignals.push({
            type: 'restaurant',
            title: 'New Restaurant Request',
            detail: `${r.restaurantName} is waiting for approval`,
            time: formatTimeAgo(r.createdAt),
            timestamp: r.createdAt
        });
    });

    (recentPendingDelivery || []).forEach(d => {
        liveSignals.push({
            type: 'delivery',
            title: 'New Delivery Partner',
            detail: `${d.name} requested to join`,
            time: formatTimeAgo(d.createdAt),
            timestamp: d.createdAt
        });
    });

    (recentPendingOrders || []).forEach(o => {
        liveSignals.push({
            type: 'order_pending',
            title: 'New Order Received',
            detail: `Order #${o.orderId} is pending`,
            time: formatTimeAgo(o.createdAt),
            timestamp: o.createdAt
        });
    });

    (recentDeliveredOrders || []).forEach(o => {
        liveSignals.push({
            type: 'order_delivered',
            title: 'Order Delivered',
            detail: `Order #${o.orderId} was successful`,
            time: formatTimeAgo(o.updatedAt),
            timestamp: o.updatedAt
        });
    });

    (recentCancelledOrders || []).forEach(o => {
        liveSignals.push({
            type: 'order_cancelled',
            title: 'Order Cancelled',
            detail: `Order #${o.orderId} was cancelled`,
            time: formatTimeAgo(o.updatedAt),
            timestamp: o.updatedAt
        });
    });

    (recentCustomers || []).forEach(c => {
        liveSignals.push({
            type: 'customer',
            title: 'New Customer',
            detail: `${c.name} just registered`,
            time: formatTimeAgo(c.createdAt),
            timestamp: c.createdAt
        });
    });

    // Sort by timestamp and take top 15
    liveSignals.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const finalLiveSignals = liveSignals.slice(0, 15);

    const totals = orderTotalsAgg?.[0] || {};

    const now = new Date();
    const monthlyMap = new Map(
        (monthlyAgg || []).map((row) => {
            const key = `${row._id?.year}-${row._id?.month}`;
            return [key, row];
        })
    );

    const monthlyData = [];
    for (let i = 11; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const key = `${year}-${month}`;
        const row = monthlyMap.get(key);
        monthlyData.push({
            month: formatMonthShort(year, month - 1),
            orders: Number(row?.orders || 0),
            revenue: Number(row?.revenue || 0),
            commission: Number(row?.commission || 0)
        });
    }

    return {
        orders: {
            total: Number(totals.totalOrders || 0),
            byStatus: {
                delivered: Number(totals.delivered || 0),
                cancelled: Number(totals.cancelled || 0),
                pending: Number(totals.pending || 0)
            }
        },
        revenue: { total: Number(totals.revenueTotal || 0) },
        commission: { total: Number(totals.commissionTotal || 0) },
        platformFee: { total: Number(totals.platformFeeTotal || 0) },
        deliveryFee: { total: Number(totals.deliveryFeeTotal || 0) },
        gst: { total: Number(totals.gstTotal || 0) },
        totalAdminEarnings: Number(totals.adminNetProfit || 0) + Number(totals.gstTotal || 0),
        deliveryProfit: Number(totals.adminNetProfit || 0) - Number(totals.commissionTotal || 0) - Number(totals.platformFeeTotal || 0),
        restaurants: {
            total: Number(restaurantsTotal || 0),
            pendingRequests: Number(restaurantsPending || 0)
        },
        deliveryBoys: {
            total: Number(deliveryTotal || 0),
            pendingRequests: Number(deliveryPending || 0)
        },
        foods: { total: Number(foodsTotal || 0) },
        addons: { total: Number(addonsTotal || 0) },
        customers: { total: Number(customersTotal || 0) },
        orderStats: {
            pending: Number(totals.pending || 0),
            completed: Number(totals.delivered || 0)
        },
        monthlyData,
        liveSignals: finalLiveSignals
    };
}

function formatTimeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    return Math.floor(seconds) + ' seconds ago';
}


export async function getTransactionReport(query = {}) {
    const { fromDate, toDate, zone, restaurant, search } = query;
    const match = {};

    if (fromDate && toDate) {
        match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };
    }

    if (search) {
        const searchRegex = new RegExp(String(search).trim(), "i");
        const matchingOrders = await FoodOrder.find({ orderId: { $regex: searchRegex } })
            .select('_id')
            .lean();

        match.$or = [
            { orderReadableId: { $regex: searchRegex } },
            { orderId: { $in: matchingOrders.map((order) => order._id) } }
        ];
    }

    let restaurantIds = null;
    if (zone || restaurant) {
        const restFilter = {};
        if (zone) restFilter.zoneId = zone; // Assuming zone is an ID or we need to lookup
        if (restaurant && restaurant !== 'All restaurants') {
            const restDoc = await mongoose.model('FoodRestaurant').findOne({ restaurantName: restaurant }).lean();
            if (restDoc) restFilter._id = restDoc._id;
        }
        
        if (Object.keys(restFilter).length > 0) {
            const restaurantsList = await mongoose.model('FoodRestaurant').find(restFilter).select('_id').lean();
            restaurantIds = restaurantsList.map(r => r._id);
            match.restaurantId = { $in: restaurantIds };
        }
    }

    // Include only resolved transactions for reports (or all to match orders)
    // We will query the FoodTransaction table directly as it is the ledger
    const transactionRows = await FoodTransaction.find(match)
        .populate('orderId')
        .populate('userId', 'name')
        .populate('restaurantId', 'restaurantName')
        .sort({ createdAt: -1 })
        .lean();

    const orderIds = transactionRows
        .map((tx) => tx?.orderId?._id || tx?.orderId)
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    const noResponseDebts = orderIds.length
        ? await FoodUserDebt.find({
            reasonType: 'user_unavailable',
            $or: [
                { failedOrderId: { $in: orderIds } },
                { settledOrderId: { $in: orderIds } },
            ],
        })
            .select('failedOrderId amount status settledOrderId settledAt')
            .lean()
        : [];

    const noResponseMap = new Map(
        noResponseDebts.map((row) => [String(row?.failedOrderId), row]),
    );
    const recoveredPenaltyMap = new Map(
        noResponseDebts
            .filter((row) =>
                row?.settledOrderId &&
                String(row?.status || '').toLowerCase() === 'paid',
            )
            .map((row) => [String(row?.settledOrderId), row]),
    );

    const transactions = transactionRows.map((tx) => {
        const order = tx.orderId || {};
        const pricing = order.pricing || {};
        const subtotal = Number(pricing.subtotal || 0) || 0;
        const packagingFee = Number(pricing.packagingFee || 0) || 0;
        const deliveryFee = Number(pricing.deliveryFee || 0) || 0;
        const tax = Number(pricing.tax || 0) || 0;
        const discount = Number(pricing.discount || 0) || 0;
        const total = Number(pricing.total || 0) || 0;

        // "Platform fee" should come from pricing.platformFee when available.
        // For older orders where pricing.platformFee isn't stored, derive it from the pricing equation:
        // total = subtotal + packagingFee + deliveryFee + platformFee + tax - discount
        const platformFeeDerived = Math.max(
            0,
            total - subtotal - packagingFee - deliveryFee - tax + discount
        );
        const platformFee =
            pricing.platformFee !== undefined && pricing.platformFee !== null
                ? Number(pricing.platformFee || 0) || 0
                : platformFeeDerived;

        const orderIdForMeta = order?._id ? String(order._id) : '';
        const debt = orderIdForMeta ? noResponseMap.get(orderIdForMeta) : null;
        const recoveredDebt = orderIdForMeta
            ? recoveredPenaltyMap.get(orderIdForMeta)
            : null;
        let displayStatus = tx.status || order?.orderStatus || 'N/A';
        if (String(order?.orderStatus || '').toLowerCase() === 'cancelled_by_user_unavailable') {
            displayStatus =
                String(debt?.status || '').toLowerCase() === 'paid'
                    ? 'user_unavailable_recovered'
                    : 'user_unavailable_due_pending';
        }

        return {
            id: tx._id,
            orderId: tx.orderReadableId || order.orderId || 'N/A',
            restaurant: tx.restaurantId?.restaurantName || 'N/A',
            customerName: tx.userId?.name || 'Guest',
            totalItemAmount: subtotal,
            itemDiscount: pricing.offerByRestaurant || 0,
            couponDiscount: (pricing.couponByAdmin || 0) + (pricing.couponByRestaurant || 0),
            couponByAdmin: pricing.couponByAdmin || 0,
            couponByRestaurant: pricing.couponByRestaurant || 0,
            offerByRestaurant: pricing.offerByRestaurant || 0,
            referralDiscount: 0, // Placeholder
            discountedAmount: Math.max(0, (pricing.subtotal || 0) - (pricing.discount || 0)),
            vatTax: tx.amounts?.taxAmount || pricing.tax || 0,
            deliveryCharge: pricing.deliveryFee || 0,
            platformFee,
            orderAmount: tx.amounts?.totalCustomerPaid || pricing.total || 0,
            penaltyAmount:
                recoveredDebt
                    ? Number(recoveredDebt?.amount || 0)
                    : String(debt?.status || '').toLowerCase() === 'unpaid'
                        ? Number(debt?.amount || 0)
                        : 0,
            status: tx.status,
            orderStatus: order?.orderStatus || '',
            displayStatus,
            noResponseMeta: debt
                ? {
                    isUserUnavailable: true,
                    dueAmount: Number(debt?.amount || 0),
                    dueStatus: debt?.status || 'unpaid',
                    settledOrderId: debt?.settledOrderId || null,
                    settledAt: debt?.settledAt || null,
                }
                : null,
        };
    });

    const isNoResponseCompensatedTx = (tx) => {
        const orderStatus = String(tx?.orderId?.orderStatus || '').toLowerCase();
        const historyKinds = Array.isArray(tx?.history)
            ? tx.history.map((h) => String(h?.kind || '').toLowerCase())
            : [];
        return historyKinds.includes('cancelled_by_delivery_no_response');
    };

    const isNoResponseDuePendingTx = (tx) => {
        const orderMongoId = String(tx?.orderId?._id || tx?.orderId || '').trim();
        if (!orderMongoId) return false;
        const debt = noResponseMap.get(orderMongoId);
        if (!debt) return false;
        return String(debt?.status || '').toLowerCase() === 'unpaid';
    };

    const isCompletedLikeTx = (tx) => {
        const txStatus = String(tx?.status || '').toLowerCase();
        const orderStatus = String(tx?.orderId?.orderStatus || '').toLowerCase();
        const isPendingDueNoResponse =
            isNoResponseCompensatedTx(tx) && isNoResponseDuePendingTx(tx);
        if (isPendingDueNoResponse) return false;
        return (
            ['captured', 'settled', 'authorized'].includes(txStatus) ||
            orderStatus === 'delivered' ||
            isNoResponseCompensatedTx(tx)
        );
    };

    const isPendingDueNoResponseTx = (tx) =>
        isNoResponseCompensatedTx(tx) && isNoResponseDuePendingTx(tx);

    let completedTransaction = 0;
    let refundedTransaction = 0;
    let adminEarning = 0;
    let restaurantEarning = 0;
    let deliverymanEarning = 0;
    const userDueOutstanding = (noResponseDebts || []).reduce((sum, debt) => {
        if (String(debt?.status || '').toLowerCase() !== 'unpaid') return sum;
        return sum + (Number(debt?.amount || 0) || 0);
    }, 0);

    for (const tx of transactionRows) {
        // Calculate Summary
        if (isCompletedLikeTx(tx)) {
            completedTransaction += tx.amounts?.totalCustomerPaid || 0;
            adminEarning += tx.amounts?.platformNetProfit || 0;
            restaurantEarning += tx.amounts?.restaurantShare || 0;
            deliverymanEarning += tx.amounts?.riderShare || 0;
        } else if (isPendingDueNoResponseTx(tx)) {
            // Business rule: when user due is still unpaid, hold completed/admin numbers
            // but keep restaurant and rider earnings visible.
            restaurantEarning += tx.amounts?.restaurantShare || 0;
            deliverymanEarning += tx.amounts?.riderShare || 0;
        }
        if (tx.status === 'refunded' || (tx.orderId && tx.orderId.orderStatus === 'cancelled_by_admin')) {
            // Count number of refunded transactions according to old logic or sum them
            refundedTransaction += tx.amounts?.totalCustomerPaid || 0;
        }
    }

    const summary = {
        completedTransaction,
        refundedTransaction, // Returning amount instead of count for consistency, frontend might expect count though
        adminEarning,
        restaurantEarning,
        deliverymanEarning,
        userDueOutstanding,
    };

    return { transactions, summary };
}

export async function getRestaurantReport(query = {}) {
    const parseTimeRange = (timeLabel) => {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);

        const value = String(timeLabel || '').trim().toLowerCase();
        if (!value || value === 'all time') return null;

        if (value === 'today') {
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { $gte: start, $lte: end };
        }

        if (value === 'this week') {
            const day = start.getDay(); // 0=Sun
            const diffToMonday = day === 0 ? 6 : day - 1;
            start.setDate(start.getDate() - diffToMonday);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { $gte: start, $lte: end };
        }

        if (value === 'this month') {
            start.setDate(1);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { $gte: start, $lte: end };
        }

        if (value === 'this year') {
            start.setMonth(0, 1);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            return { $gte: start, $lte: end };
        }

        return null;
    };

    const formatCurrency = (value) => `\u20B9${Number(value || 0).toFixed(2)}`;
    const parseDateBoundary = (value, endOfDay = false) => {
        const raw = String(value || '').trim();
        if (!raw) return null;
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        if (endOfDay) parsed.setHours(23, 59, 59, 999);
        else parsed.setHours(0, 0, 0, 0);
        return parsed;
    };

    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 1000, 1), 5000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const restaurantFilter = {};
    const allFilter = String(query.all || '').trim().toLowerCase();
    if (allFilter === 'active') {
        restaurantFilter.status = 'approved';
    } else if (allFilter === 'inactive') {
        restaurantFilter.status = { $ne: 'approved' };
    }

    const zoneRaw = String(query.zone || '').trim();
    if (zoneRaw) {
        if (mongoose.Types.ObjectId.isValid(zoneRaw)) {
            restaurantFilter.zoneId = new mongoose.Types.ObjectId(zoneRaw);
        } else {
            const matchedZone = await FoodZone.findOne({
                $or: [{ name: zoneRaw }, { zoneName: zoneRaw }]
            })
                .select('_id')
                .lean();
            if (matchedZone?._id) {
                restaurantFilter.zoneId = matchedZone._id;
            } else {
                return { restaurants: [], total: 0, page, limit };
            }
        }
    }

    const searchRaw = String(query.search || '').trim();
    if (searchRaw) {
        const escaped = searchRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        restaurantFilter.$or = [
            { restaurantName: { $regex: escaped, $options: 'i' } },
            { ownerName: { $regex: escaped, $options: 'i' } },
            { ownerPhone: { $regex: escaped, $options: 'i' } },
            { city: { $regex: escaped, $options: 'i' } },
            { area: { $regex: escaped, $options: 'i' } }
        ];
    }

    const [restaurantDocs, total] = await Promise.all([
        FoodRestaurant.find(restaurantFilter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('restaurantName profileImage rating totalRatings status zoneId')
            .populate('zoneId', 'name zoneName')
            .lean(),
        FoodRestaurant.countDocuments(restaurantFilter)
    ]);

    const restaurantIds = restaurantDocs.map((r) => r._id).filter(Boolean);
    if (!restaurantIds.length) {
        return { restaurants: [], total, page, limit };
    }

    const orderCreatedAtFilter = parseTimeRange(query.time);
    const orderMatch = {
        restaurantId: { $in: restaurantIds },
        $or: [
            { "payment.method": { $in: ["cash", "wallet"] } },
            { "payment.status": { $in: ["paid", "authorized", "captured", "settled", "refunded"] } },
        ],
    };
    const fromDate = parseDateBoundary(query.fromDate || query.startDate, false);
    const toDate = parseDateBoundary(query.toDate || query.endDate, true);
    if (fromDate || toDate) {
        orderMatch.createdAt = {};
        if (fromDate) orderMatch.createdAt.$gte = fromDate;
        if (toDate) orderMatch.createdAt.$lte = toDate;
    } else if (orderCreatedAtFilter) {
        orderMatch.createdAt = orderCreatedAtFilter;
    }

    const transactionMatch = {
        restaurantId: { $in: restaurantIds },
        status: { $nin: ['failed', 'refunded'] }
    };
    if (fromDate || toDate) {
        transactionMatch.createdAt = {};
        if (fromDate) transactionMatch.createdAt.$gte = fromDate;
        if (toDate) transactionMatch.createdAt.$lte = toDate;
    } else if (orderCreatedAtFilter) {
        transactionMatch.createdAt = orderCreatedAtFilter;
    }

    const [foodsAgg, ordersAgg, earningsAgg] = await Promise.all([
        FoodItem.aggregate([
            {
                $match: {
                    restaurantId: { $in: restaurantIds },
                    approvalStatus: 'approved'
                }
            },
            {
                $group: {
                    _id: '$restaurantId',
                    totalFood: { $sum: 1 }
                }
            }
        ]),
        FoodOrder.aggregate([
            { $match: orderMatch },
            {
                $group: {
                    _id: '$restaurantId',
                    totalOrder: {
                        $sum: {
                            $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0]
                        }
                    },
                    totalOrderAmount: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.total', 0] },
                                0
                            ]
                        }
                    },
                    totalDiscountGiven: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.discount', 0] },
                                0
                            ]
                        }
                    },
                    // Discount breakdown
                    totalCouponByAdmin: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.couponByAdmin', 0] },
                                0
                            ]
                        }
                    },
                    totalCouponByRestaurant: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.couponByRestaurant', 0] },
                                0
                            ]
                        }
                    },
                    totalOfferByRestaurant: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.offerByRestaurant', 0] },
                                0
                            ]
                        }
                    },
                    // Commission and payout
                    totalAdminCommission: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.restaurantCommission', 0] },
                                0
                            ]
                        }
                    },
                    totalSubtotal: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.subtotal', 0] },
                                0
                            ]
                        }
                    },
                    totalPackagingFee: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.packagingFee', 0] },
                                0
                            ]
                        }
                    },
                    totalVATTAX: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.tax', 0] },
                                0
                            ]
                        }
                    },
                    totalDeliveryCharge: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.deliveryFee', 0] },
                                0
                            ]
                        }
                    },
                    totalPlatformFee: {
                        $sum: {
                            $cond: [
                                { $eq: ['$orderStatus', 'delivered'] },
                                { $ifNull: ['$pricing.platformFee', 0] },
                                0
                            ]
                        }
                    }
                }
            }
        ]),
        FoodTransaction.aggregate([
            { $match: transactionMatch },
            {
                $lookup: {
                    from: 'food_orders',
                    localField: 'orderId',
                    foreignField: '_id',
                    as: 'order'
                }
            },
            { $unwind: { path: '$order', preserveNullAndEmptyArrays: false } },
            { $match: { 'order.orderStatus': 'delivered' } },
            {
                $group: {
                    _id: '$restaurantId',
                    totalRestaurantEarning: { $sum: { $ifNull: ['$amounts.restaurantShare', 0] } },
                    paidRestaurantEarning: {
                        $sum: {
                            $cond: [
                                { $eq: ['$settlement.isRestaurantSettled', true] },
                                { $ifNull: ['$amounts.restaurantShare', 0] },
                                0
                            ]
                        }
                    },
                    unpaidRestaurantEarning: {
                        $sum: {
                            $cond: [
                                { $ne: ['$settlement.isRestaurantSettled', true] },
                                { $ifNull: ['$amounts.restaurantShare', 0] },
                                0
                            ]
                        }
                    }
                }
            }
        ])
    ]);

    const foodMap = new Map(foodsAgg.map((x) => [String(x._id), Number(x.totalFood || 0)]));
    const earningsMap = new Map(
        earningsAgg.map((x) => [
            String(x._id),
            {
                totalRestaurantEarning: Number(x.totalRestaurantEarning || 0),
                paidRestaurantEarning: Number(x.paidRestaurantEarning || 0),
                unpaidRestaurantEarning: Number(x.unpaidRestaurantEarning || 0)
            }
        ])
    );
    const orderMap = new Map(
        ordersAgg.map((x) => {
            const totalSubtotal = Number(x.totalSubtotal || 0);
            const totalPackagingFee = Number(x.totalPackagingFee || 0);
            const totalAdminCommission = Number(x.totalAdminCommission || 0);
            const totalCouponByRestaurant = Number(x.totalCouponByRestaurant || 0);
            const totalOfferByRestaurant = Number(x.totalOfferByRestaurant || 0);
            
            // Calculate restaurant payout
            // Payout = Subtotal + Packaging - Commission - Restaurant-funded discounts
            const restaurantPayout = totalSubtotal + totalPackagingFee - totalAdminCommission - totalCouponByRestaurant - totalOfferByRestaurant;
            
            return [
                String(x._id),
                {
                    totalOrder: Number(x.totalOrder || 0),
                    totalOrderAmount: Number(x.totalOrderAmount || 0),
                    totalDiscountGiven: Number(x.totalDiscountGiven || 0),
                    totalCouponByAdmin: Number(x.totalCouponByAdmin || 0),
                    totalCouponByRestaurant,
                    totalOfferByRestaurant,
                    totalVATTAX: Number(x.totalVATTAX || 0),
                    totalDeliveryCharge: Number(x.totalDeliveryCharge || 0),
                    totalPlatformFee: Number(x.totalPlatformFee || 0),
                    totalAdminCommission,
                    restaurantPayout
                }
            ];
        })
    );

    const restaurants = restaurantDocs.map((restaurant, index) => {
        const key = String(restaurant._id);
        const counts = orderMap.get(key) || {
            totalOrder: 0,
            totalOrderAmount: 0,
            totalDiscountGiven: 0,
            totalCouponByAdmin: 0,
            totalCouponByRestaurant: 0,
            totalOfferByRestaurant: 0,
            totalVATTAX: 0,
            totalDeliveryCharge: 0,
            totalPlatformFee: 0,
            totalAdminCommission: 0,
            restaurantPayout: 0
        };
        const earnings = earningsMap.get(key) || {
            totalRestaurantEarning: 0,
            paidRestaurantEarning: 0,
            unpaidRestaurantEarning: 0
        };

        return {
            _id: restaurant._id,
            sl: skip + index + 1,
            icon: restaurant.profileImage || '',
            restaurantName: restaurant.restaurantName || '',
            totalFood: foodMap.get(key) || 0,
            totalOrder: counts.totalOrder,
            totalOrderAmount: formatCurrency(counts.totalOrderAmount),
            totalDiscountGiven: formatCurrency(counts.totalDiscountGiven),
            totalCouponByAdmin: formatCurrency(counts.totalCouponByAdmin),
            totalCouponByRestaurant: formatCurrency(counts.totalCouponByRestaurant),
            totalOfferByRestaurant: formatCurrency(counts.totalOfferByRestaurant),
            totalAdminCommission: formatCurrency(counts.totalAdminCommission),
            restaurantPayout: formatCurrency(counts.restaurantPayout),
            totalRestaurantEarning: formatCurrency(earnings.totalRestaurantEarning),
            paidRestaurantEarning: formatCurrency(earnings.paidRestaurantEarning),
            unpaidRestaurantEarning: formatCurrency(earnings.unpaidRestaurantEarning),
            totalDeliveryCharge: formatCurrency(counts.totalDeliveryCharge),
            totalPlatformFee: formatCurrency(counts.totalPlatformFee),
            totalGST: formatCurrency(counts.totalVATTAX),
            totalVATTAX: formatCurrency(counts.totalVATTAX),
            averageRatings: Number(restaurant.rating || 0),
            reviews: Number(restaurant.totalRatings || 0),
            status: restaurant.status || 'pending',
            zoneName: restaurant.zoneId?.name || restaurant.zoneId?.zoneName || ''
        };
    });

    return { restaurants, total, page, limit };
}

export async function getTaxReport(query = {}) {
    const { fromDate, toDate, search } = query;
    const match = {
        orderStatus: 'delivered' // Typically tax is reported on delivered/completed orders
    };

    if (fromDate && toDate) {
        match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };
    }

    if (search) {
        // Search by order ID if provided
        match.orderId = { $regex: search, $options: 'i' };
    }

    // Aggregate tax by income source (Restaurants, Delivery, Platform)
    // For now, we'll group by Restaurant as the primary income source
    const taxData = await FoodOrder.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$restaurantId',
                totalIncome: { $sum: { $ifNull: ['$pricing.total', 0] } },
                totalTax: { $sum: { $ifNull: ['$pricing.tax', 0] } },
                orderCount: { $sum: 1 }
            }
        },
        {
            $lookup: {
                from: 'food_restaurants',
                localField: '_id',
                foreignField: '_id',
                as: 'restaurant'
            }
        },
        { $unwind: { path: '$restaurant', preserveNullAndEmptyArrays: true } },
        {
            $project: {
                incomeSource: { $ifNull: ['$restaurant.restaurantName', 'Unknown Restaurant'] },
                totalIncome: 1,
                totalTax: 1,
                orderCount: 1
            }
        },
        { $sort: { totalTax: -1 } }
    ]);

    const stats = {
        totalIncome: 0,
        totalTax: 0
    };

    const reports = taxData.map((item, index) => {
        stats.totalIncome += item.totalIncome;
        stats.totalTax += item.totalTax;
        return {
            sl: index + 1,
            id: item._id,
            incomeSource: item.incomeSource,
            totalIncome: `\u20B9${item.totalIncome.toFixed(2)}`,
            totalTax: `\u20B9${item.totalTax.toFixed(2)}`,
            orderCount: item.orderCount
        };
    });

    return {
        reports,
        stats: {
            totalIncome: `\u20B9${stats.totalIncome.toFixed(2)}`,
            totalTax: `\u20B9${stats.totalTax.toFixed(2)}`
        }
    };
}

export async function getTaxReportDetail(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new ValidationError('Invalid restaurant ID');
    }

    const { fromDate, toDate } = query;
    const match = {
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        orderStatus: 'delivered'
    };

    if (fromDate && toDate) {
        match.createdAt = { $gte: new Date(fromDate), $lte: new Date(toDate) };
    }

    const orders = await FoodOrder.find(match)
        .select('orderId pricing createdAt orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const restaurant = await FoodRestaurant.findById(restaurantId).select('restaurantName').lean();

    return {
        restaurantName: restaurant?.restaurantName || 'Unknown Restaurant',
        orders: orders.map(o => ({
            id: o._id,
            orderId: o.orderId,
            totalAmount: `\u20B9${(o.pricing?.total || 0).toFixed(2)}`,
            taxAmount: `\u20B9${(o.pricing?.tax || 0).toFixed(2)}`,
            date: o.createdAt
        }))
    };
}

// ----- Customers / Users (admin) -----
export async function getCustomers(query = {}, adminScope = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { role: 'USER' };

    if (query.status) {
        if (String(query.status) === 'active') filter.isActive = true;
        if (String(query.status) === 'inactive') filter.isActive = false;
    }

    if (query.joiningDate && String(query.joiningDate).trim()) {
        const d = new Date(String(query.joiningDate));
        if (!Number.isNaN(d.getTime())) {
            const start = new Date(d);
            start.setHours(0, 0, 0, 0);
            const end = new Date(d);
            end.setHours(23, 59, 59, 999);
            filter.createdAt = { $gte: start, $lte: end };
        }
    }

    if (query.search && String(query.search).trim()) {
        const raw = String(query.search).trim().slice(0, 80);
        const term = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { email: { $regex: term, $options: 'i' } },
            { phone: { $regex: term, $options: 'i' } }
        ];
    }

    const sort = {};
    const sortBy = String(query.sortBy || '').trim();
    if (sortBy === 'name-asc') sort.name = 1;
    else if (sortBy === 'name-desc') sort.name = -1;
    else sort.createdAt = -1;

    const scope = normalizeAdminScope(adminScope);
    if (scope.isSubAdmin) {
        if (!scope.zoneIds.length) {
            return { customers: [], total: 0, page, limit };
        }
        const scopedUserIds = await FoodOrder.distinct('userId', { zoneId: { $in: scope.zoneIds } });
        filter._id = { $in: scopedUserIds };
    }

    const [docs, total] = await Promise.all([
        FoodUser.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .select('name email phone countryCode isVerified isActive createdAt profileImage')
            .lean(),
        FoodUser.countDocuments(filter)
    ]);

    const sanitizeUrl = (s) => {
        if (!s) return '';
        const str = String(s).trim();
        return str.replace(/^`+|`+$/g, '').trim();
    };

    const userIds = docs.map((u) => u._id).filter(Boolean);
    const orderStats = userIds.length > 0
        ? await FoodOrder.aggregate([
            { $match: { userId: { $in: userIds } } },
            {
                $group: {
                    _id: '$userId',
                    totalOrder: { $sum: 1 },
                    totalOrderAmount: { $sum: { $ifNull: ['$pricing.total', 0] } }
                }
            }
        ])
        : [];

    const orderStatsMap = new Map(
        orderStats.map((x) => [
            String(x._id),
            {
                totalOrder: Number(x.totalOrder || 0),
                totalOrderAmount: Number(x.totalOrderAmount || 0)
            }
        ])
    );

    let customers = docs.map((u) => {
        const stats = orderStatsMap.get(String(u._id)) || { totalOrder: 0, totalOrderAmount: 0 };
        return ({
        id: u._id,
        _id: u._id,
        name: u.name || 'Unnamed',
        email: u.email || '',
        phone: u.phone || '',
        profileImage: sanitizeUrl(u.profileImage || ''),
        countryCode: u.countryCode || '+91',
        status: u.isActive !== false,
        isActive: u.isActive !== false,
        isVerified: u.isVerified === true,
        totalOrder: stats.totalOrder,
        totalOrderAmount: stats.totalOrderAmount,
        joiningDate: u.createdAt,
        createdAt: u.createdAt
        });
    });

    const chooseFirst = parseInt(query.chooseFirst, 10);
    if (Number.isFinite(chooseFirst) && chooseFirst > 0) {
        customers = customers.slice(0, chooseFirst);
    }

    return { customers, total, page, limit };
}

export async function getCustomerById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const u = await FoodUser.findById(id).select('-__v').lean();
    if (!u) return null;
    const customerObjectId = new mongoose.Types.ObjectId(id);
    const orderStats = await FoodOrder.aggregate([
        { $match: { userId: customerObjectId } },
        {
            $group: {
                _id: '$userId',
                totalOrders: { $sum: 1 },
                totalOrderAmount: { $sum: { $ifNull: ['$pricing.total', 0] } }
            }
        }
    ]);
    const stats = orderStats?.[0] || {};
    const sanitizeUrl = (s) => {
        if (!s) return '';
        const str = String(s).trim();
        return str.replace(/^`+|`+$/g, '').trim();
    };
    return {
        id: u._id,
        _id: u._id,
        name: u.name || 'Unnamed',
        email: u.email || '',
        phone: u.phone || '',
        profileImage: sanitizeUrl(u.profileImage || ''),
        countryCode: u.countryCode || '+91',
        status: u.isActive !== false,
        isActive: u.isActive !== false,
        isVerified: u.isVerified === true,
        totalOrders: Number(stats.totalOrders || 0),
        totalOrder: Number(stats.totalOrders || 0),
        totalOrderAmount: Number(stats.totalOrderAmount || 0),
        joiningDate: u.createdAt,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt
    };
}

export async function updateCustomerStatus(id, isActive) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updatedDoc = await FoodUser.findByIdAndUpdate(
        id,
        { $set: { isActive: Boolean(isActive) } },
        { new: true }
    );
    if (!updatedDoc) return null;
    const updated = updatedDoc.toObject();
    if (updated.isActive === false) {
        await FoodRefreshToken.deleteMany({ userId: updated._id });
    }
    return updated;
}

export async function getSupportTickets(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const source = String(query.source || 'all').toLowerCase();
    const search = String(query.search || '').trim();

    const userFilter = {};
    const restaurantFilter = {};
    if (query.status && ['open', 'in-progress', 'resolved'].includes(String(query.status))) {
        userFilter.status = String(query.status);
        restaurantFilter.status = String(query.status);
    }
    if (query.type && ['order', 'restaurant', 'other'].includes(String(query.type))) {
        userFilter.type = String(query.type);
    }
    if (query.category && ['orders', 'payments', 'menu', 'restaurant', 'technical', 'other'].includes(String(query.category))) {
        restaurantFilter.category = String(query.category);
    }

    const userSearchOr = [];
    const restaurantSearchOr = [];
    if (search) {
        const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        userSearchOr.push(
            { issueType: searchRegex },
            { description: searchRegex }
        );
        restaurantSearchOr.push(
            { issueType: searchRegex },
            { subject: searchRegex },
            { description: searchRegex },
            { orderRef: searchRegex }
        );
        const [restaurantIds, userIds, orderIds] = await Promise.all([
            FoodRestaurant.find({ restaurantName: searchRegex }).select('_id').lean(),
            FoodUser.find({ name: searchRegex }).select('_id').lean(),
            FoodOrder.find({ orderId: searchRegex }).select('_id').lean()
        ]);
        if (restaurantIds.length) {
            const ids = restaurantIds.map((r) => r._id);
            userSearchOr.push({ restaurantId: { $in: ids } });
            restaurantSearchOr.push({ restaurantId: { $in: ids } });
        }
        if (userIds.length) {
            userSearchOr.push({ userId: { $in: userIds.map((u) => u._id) } });
        }
        if (orderIds.length) {
            userSearchOr.push({ orderId: { $in: orderIds.map((o) => o._id) } });
        }
    }
    if (userSearchOr.length) userFilter.$or = userSearchOr;
    if (restaurantSearchOr.length) restaurantFilter.$or = restaurantSearchOr;

    const shouldFetchUser = source === 'all' || source === 'user';
    const shouldFetchRestaurant = source === 'all' || source === 'restaurant';

    const [userList, userTotal, restaurantList, restaurantTotal] = await Promise.all([
        shouldFetchUser
            ? FoodSupportTicket.find(userFilter)
                  .sort({ createdAt: -1 })
                  .skip(source === 'all' ? 0 : skip)
                  .limit(source === 'all' ? limit * page : limit)
                  .populate('userId', 'name phone email')
                  .populate('restaurantId', 'restaurantName city area')
                  .populate({
                      path: 'orderId',
                      select: 'orderId displayOrderId restaurantId',
                      populate: { path: 'restaurantId', select: 'restaurantName city area' }
                  })
                  .lean()
            : Promise.resolve([]),
        shouldFetchUser ? FoodSupportTicket.countDocuments(userFilter) : Promise.resolve(0),
        shouldFetchRestaurant
            ? FoodRestaurantSupportTicket.find(restaurantFilter)
                  .sort({ createdAt: -1 })
                  .skip(source === 'all' ? 0 : skip)
                  .limit(source === 'all' ? limit * page : limit)
                  .populate('restaurantId', 'restaurantName city area')
                  .lean()
            : Promise.resolve([]),
        shouldFetchRestaurant ? FoodRestaurantSupportTicket.countDocuments(restaurantFilter) : Promise.resolve(0)
    ]);

    const mappedUserTickets = userList.map((t) => {
        const user =
            t.userId && typeof t.userId === 'object' && t.userId !== null
                ? {
                      _id: t.userId._id,
                      name: t.userId.name || '',
                      phone: t.userId.phone || '',
                      email: t.userId.email || ''
                  }
                : null;
        const userId =
            t.userId && typeof t.userId === 'object' && t.userId !== null ? String(t.userId._id) : String(t.userId);

        let restaurantDoc = null;
        if (t.restaurantId && typeof t.restaurantId === 'object' && t.restaurantId !== null) {
            restaurantDoc = t.restaurantId;
        } else if (t.orderId && typeof t.orderId === 'object' && t.orderId !== null) {
            const rid = t.orderId.restaurantId;
            if (rid && typeof rid === 'object' && rid !== null) {
                restaurantDoc = rid;
            }
        }

        const restaurant =
            restaurantDoc && typeof restaurantDoc === 'object'
                ? {
                      _id: restaurantDoc._id,
                      name: restaurantDoc.restaurantName || '',
                      city: restaurantDoc.city || '',
                      area: restaurantDoc.area || ''
                  }
                : null;

        const restaurantId =
            restaurant && restaurant._id
                ? String(restaurant._id)
                : t.restaurantId
                ? String(t.restaurantId)
                : t.orderId && typeof t.orderId === 'object' && t.orderId !== null && t.orderId.restaurantId
                ? String(t.orderId.restaurantId)
                : null;

        const restaurantName = restaurant ? restaurant.name : '';

        return {
            _id: t._id,
            source: 'user',
            userId,
            type: t.type,
            orderId: t.orderId || null,
            orderRef:
                t.orderId && typeof t.orderId === 'object' && t.orderId !== null
                    ? t.orderId.displayOrderId || t.orderId.orderId || String(t.orderId._id || '').slice(-6)
                    : '',
            restaurantId,
            issueType: t.issueType,
            description: t.description,
            status: t.status,
            adminResponse: t.adminResponse,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            user,
            restaurant,
            restaurantName
        };
    });

    const mappedRestaurantTickets = restaurantList.map((t) => {
        const restaurant =
            t.restaurantId && typeof t.restaurantId === 'object'
                ? {
                      _id: t.restaurantId._id,
                      name: t.restaurantId.restaurantName || '',
                      city: t.restaurantId.city || '',
                      area: t.restaurantId.area || ''
                  }
                : null;
        const restaurantId =
            restaurant && restaurant._id ? String(restaurant._id) : t.restaurantId ? String(t.restaurantId) : null;
        return {
            _id: t._id,
            source: 'restaurant',
            userId: null,
            type: 'restaurant-support',
            category: t.category || 'other',
            orderId: null,
            orderRef: t.orderRef || '',
            restaurantId,
            issueType: t.issueType,
            subject: t.subject || '',
            description: t.description,
            priority: t.priority || 'medium',
            status: t.status,
            adminResponse: t.adminResponse,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            user: null,
            restaurant,
            restaurantName: restaurant ? restaurant.name : ''
        };
    });

    let tickets = [];
    let total = 0;
    if (source === 'user') {
        tickets = mappedUserTickets;
        total = userTotal;
    } else if (source === 'restaurant') {
        tickets = mappedRestaurantTickets;
        total = restaurantTotal;
    } else {
        const merged = [...mappedUserTickets, ...mappedRestaurantTickets].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        tickets = merged.slice(skip, skip + limit);
        total = userTotal + restaurantTotal;
    }

    return { tickets, total, page, limit };
}

export async function updateSupportTicket(id, body = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const source = String(body.source || 'user').toLowerCase();
    const set = {};
    if (body.status && ['open', 'in-progress', 'resolved'].includes(String(body.status))) {
        set.status = String(body.status);
    }
    if (typeof body.adminResponse === 'string') {
        set.adminResponse = body.adminResponse;
    }
    if (!Object.keys(set).length) return null;
    const model = source === 'restaurant' ? FoodRestaurantSupportTicket : FoodSupportTicket;
    const updated = await model.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
    return updated || null;
}

// ----- Restaurant Commission (admin) -----
export async function getRestaurantCommissions() {
    const list = await FoodRestaurantCommission.find({})
        .sort({ createdAt: -1 })
        .populate({ path: 'restaurantId', select: 'restaurantName' })
        .lean();

    const commissions = list.map((c, index) => ({
        _id: c._id,
        sl: index + 1,
        restaurantId: c.restaurantId?._id ? String(c.restaurantId._id) : String(c.restaurantId),
        restaurantName: c.restaurantId?.restaurantName || '',
        restaurant: c.restaurantId?._id ? { _id: c.restaurantId._id, name: c.restaurantId.restaurantName } : null,
        defaultCommission: c.defaultCommission || { type: 'percentage', value: 0 },
        notes: c.notes || '',
        status: c.status !== false
    }));

    return { commissions };
}

export async function getRestaurantCommissionBootstrap() {
    const [commissionsData, restaurantsData] = await Promise.all([
        getRestaurantCommissions(),
        getRestaurants({ status: 'approved', limit: 1000, page: 1 })
    ]);

    const commissionByRestaurantId = new Set(
        (commissionsData.commissions || []).map((c) => String(c.restaurantId))
    );

    const restaurants = (restaurantsData.restaurants || []).map((r) => ({
        _id: r._id,
        name: r.restaurantName || r.name || '',
        restaurantId: r._id ? `REST${r._id.toString().slice(-6).padStart(6, '0')}` : '',
        ownerName: r.ownerName || '',
        hasCommissionSetup: commissionByRestaurantId.has(String(r._id))
    }));

    return { commissions: commissionsData.commissions || [], restaurants };
}

export async function getRestaurantCommissionById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodRestaurantCommission.findById(id)
        .populate({ path: 'restaurantId', select: 'restaurantName' })
        .lean();
    if (!doc) return null;
    return {
        _id: doc._id,
        restaurantId: doc.restaurantId?._id ? String(doc.restaurantId._id) : String(doc.restaurantId),
        restaurant: doc.restaurantId?._id ? { _id: doc.restaurantId._id, name: doc.restaurantId.restaurantName } : null,
        restaurantName: doc.restaurantId?.restaurantName || '',
        defaultCommission: doc.defaultCommission || { type: 'percentage', value: 0 },
        notes: doc.notes || '',
        status: doc.status !== false
    };
}

export async function createRestaurantCommission(body) {
    const exists = await FoodRestaurantCommission.findOne({ restaurantId: body.restaurantId }).lean();
    if (exists) {
        throw new ValidationError('Commission already exists for this restaurant');
    }
    const created = await FoodRestaurantCommission.create({
        restaurantId: body.restaurantId,
        defaultCommission: body.defaultCommission,
        notes: body.notes || '',
        status: true
    });
    return created.toObject();
}

export async function updateRestaurantCommission(id, body) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodRestaurantCommission.findByIdAndUpdate(
        id,
        { $set: { defaultCommission: body.defaultCommission, notes: body.notes || '' } },
        { new: true }
    ).lean();
    return updated;
}

export async function deleteRestaurantCommission(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const deleted = await FoodRestaurantCommission.findByIdAndDelete(id).lean();
    return deleted ? { id } : null;
}

export async function toggleRestaurantCommissionStatus(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodRestaurantCommission.findById(id);
    if (!doc) return null;
    doc.status = !Boolean(doc.status);
    await doc.save();
    return doc.toObject();
}

// ----- Delivery Boy Commission Rule (admin) -----
export async function getDeliveryCommissionRules() {
    const list = await FoodDeliveryCommissionRule.find({}).sort({ createdAt: -1 }).lean();
    const commissions = list.map((r, index) => ({
        _id: r._id,
        sl: index + 1,
        name: r.name || '',
        minDistance: r.minDistance,
        maxDistance: r.maxDistance ?? null,
        commissionPerKm: r.commissionPerKm,
        basePayout: r.basePayout,
        status: r.status !== false
    }));
    return { commissions };
}

function validateCommissionRuleSet(rules) {
    const active = (rules || []).filter((r) => r && r.status !== false);
    if (!active.length) {
        throw new ValidationError('A base slab with minDistance = 0 is required');
    }
    const baseRules = active.filter((r) => Number(r.minDistance || 0) === 0);
    if (baseRules.length !== 1) {
        throw new ValidationError('A base slab with minDistance = 0 is required');
    }
    const sorted = [...active].sort((a, b) => Number(a.minDistance || 0) - Number(b.minDistance || 0));
    for (let i = 0; i < sorted.length; i += 1) {
        const current = sorted[i];
        const min = Number(current.minDistance || 0);
        const max = current.maxDistance == null ? null : Number(current.maxDistance);
        if (max != null && max <= min) {
            throw new ValidationError('maxDistance must be greater than minDistance');
        }
        if (i > 0) {
            const prev = sorted[i - 1];
            const prevMin = Number(prev.minDistance || 0);
            const prevMax = prev.maxDistance == null ? null : Number(prev.maxDistance);
            const effectivePrevMax = prevMax == null ? Infinity : prevMax;
            if (min < effectivePrevMax) {
                throw new ValidationError('Distance slabs must not overlap');
            }
            if (min === prevMin) {
                throw new ValidationError('Distance slabs must not share the same minDistance');
            }
        }
    }
}

export async function createDeliveryCommissionRule(body) {
    const existing = await FoodDeliveryCommissionRule.find({}).lean();
    const candidate = [
        ...existing,
        {
            minDistance: body.minDistance,
            maxDistance: body.maxDistance ?? null,
            commissionPerKm: body.commissionPerKm,
            basePayout: body.basePayout,
            status: body.status ?? true
        }
    ];
    validateCommissionRuleSet(candidate);
    const created = await FoodDeliveryCommissionRule.create({
        name: body.name || '',
        minDistance: body.minDistance,
        maxDistance: body.maxDistance ?? null,
        commissionPerKm: body.commissionPerKm,
        basePayout: body.basePayout,
        status: body.status ?? true
    });
    return created.toObject();
}

export async function updateDeliveryCommissionRule(id, body) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const existing = await FoodDeliveryCommissionRule.find({}).lean();
    const candidate = existing.map((r) =>
        String(r._id) === String(id)
            ? {
                  ...r,
                  minDistance: body.minDistance,
                  maxDistance: body.maxDistance ?? null,
                  commissionPerKm: body.commissionPerKm,
                  basePayout: body.basePayout,
                  status: r.status !== false
              }
            : r
    );
    validateCommissionRuleSet(candidate);
    const updated = await FoodDeliveryCommissionRule.findByIdAndUpdate(
        id,
        {
            $set: {
                name: body.name || '',
                minDistance: body.minDistance,
                maxDistance: body.maxDistance ?? null,
                commissionPerKm: body.commissionPerKm,
                basePayout: body.basePayout
            }
        },
        { new: true }
    ).lean();
    return updated;
}

export async function deleteDeliveryCommissionRule(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const deleted = await FoodDeliveryCommissionRule.findByIdAndDelete(id).lean();
    return deleted ? { id } : null;
}

export async function toggleDeliveryCommissionRuleStatus(id, status) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodDeliveryCommissionRule.findByIdAndUpdate(
        id,
        { $set: { status: Boolean(status) } },
        { new: true }
    ).lean();
    return updated;
}

// ----- Fee Settings (admin) -----
export async function getFeeSettings() {
    const doc = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    // If not configured yet, return null so UI does not show defaults automatically.
    return { feeSettings: doc || null };
}

export async function upsertFeeSettings(body) {
    // Single active doc pattern: keep only one active record.
    const existing = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (existing) {
        const $set = {};
        const $unset = {};

        if (body.deliveryFee === null) $unset.deliveryFee = 1;
        else if (body.deliveryFee !== undefined) $set.deliveryFee = body.deliveryFee;

        if (body.deliveryFeeRanges !== undefined) $set.deliveryFeeRanges = body.deliveryFeeRanges;

        if (body.freeDeliveryThreshold === null) $unset.freeDeliveryThreshold = 1;
        else if (body.freeDeliveryThreshold !== undefined) $set.freeDeliveryThreshold = body.freeDeliveryThreshold;

        if (body.platformFee === null) $unset.platformFee = 1;
        else if (body.platformFee !== undefined) $set.platformFee = body.platformFee;

        if (body.gstRate === null) $unset.gstRate = 1;
        else if (body.gstRate !== undefined) $set.gstRate = body.gstRate;

        if (body.isActive !== undefined) $set.isActive = body.isActive;

        const update = {};
        if (Object.keys($set).length) update.$set = $set;
        if (Object.keys($unset).length) update.$unset = $unset;
        if (!Object.keys(update).length) return existing.toObject();

        const updated = await FoodFeeSettings.findByIdAndUpdate(existing._id, update, { new: true }).lean();
        return updated;
    }

    const payload = {
        deliveryFeeRanges: body.deliveryFeeRanges ?? [],
        isActive: body.isActive !== false
    };
    if (body.deliveryFee !== undefined && body.deliveryFee !== null) payload.deliveryFee = body.deliveryFee;
    if (body.freeDeliveryThreshold !== undefined && body.freeDeliveryThreshold !== null) payload.freeDeliveryThreshold = body.freeDeliveryThreshold;
    if (body.platformFee !== undefined && body.platformFee !== null) payload.platformFee = body.platformFee;
    if (body.gstRate !== undefined && body.gstRate !== null) payload.gstRate = body.gstRate;

    const created = await FoodFeeSettings.create(payload);
    return created.toObject();
}

// ----- Referral Settings (admin) -----
export async function getReferralSettings() {
    const doc = await FoodReferralSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    return { referralSettings: doc || null };
}

export async function upsertReferralSettings(body = {}) {
    const existing = await FoodReferralSettings.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (existing) {
        const $set = {};

        if (body.referralRewardUser !== undefined) $set.referralRewardUser = Math.max(0, Number(body.referralRewardUser) || 0);
        if (body.referralRewardDelivery !== undefined) $set.referralRewardDelivery = Math.max(0, Number(body.referralRewardDelivery) || 0);
        if (body.referralLimitUser !== undefined) $set.referralLimitUser = Math.max(0, Number(body.referralLimitUser) || 0);
        if (body.referralLimitDelivery !== undefined) $set.referralLimitDelivery = Math.max(0, Number(body.referralLimitDelivery) || 0);
        if (body.isActive !== undefined) $set.isActive = Boolean(body.isActive);

        if (!Object.keys($set).length) return existing.toObject();
        const updated = await FoodReferralSettings.findByIdAndUpdate(existing._id, { $set }, { new: true }).lean();
        return updated;
    }

    const created = await FoodReferralSettings.create({
        referralRewardUser: Math.max(0, Number(body.referralRewardUser) || 0),
        referralRewardDelivery: Math.max(0, Number(body.referralRewardDelivery) || 0),
        referralLimitUser: Math.max(0, Number(body.referralLimitUser) || 0),
        referralLimitDelivery: Math.max(0, Number(body.referralLimitDelivery) || 0),
        isActive: body.isActive !== false
    });
    return created.toObject();
}

// ----- Safety / Emergency Reports (admin) -----
export async function getSafetyEmergencyReports(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.status && ['unread', 'read', 'urgent', 'resolved'].includes(String(query.status))) {
        filter.status = String(query.status);
    }
    if (query.priority && ['low', 'medium', 'high', 'critical'].includes(String(query.priority))) {
        filter.priority = String(query.priority);
    }
    if (query.search && String(query.search).trim()) {
        const raw = String(query.search).trim().slice(0, 120);
        const term = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
            { userName: { $regex: term, $options: 'i' } },
            { userEmail: { $regex: term, $options: 'i' } },
            { message: { $regex: term, $options: 'i' } }
        ];
    }

    const [list, total] = await Promise.all([
        FoodSafetyEmergencyReport.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'name email phone')
            .lean(),
        FoodSafetyEmergencyReport.countDocuments(filter)
    ]);

    const safetyEmergencies = (list || []).map((doc) => {
        const user = doc?.userId && typeof doc.userId === 'object' ? doc.userId : {};
        return {
            ...doc,
            userName: doc?.userName || user?.name || '',
            userEmail: doc?.userEmail || user?.email || '',
            userPhone: doc?.userPhone || user?.phone || ''
        };
    });

    return {
        safetyEmergencies,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 }
    };
}

export async function updateSafetyEmergencyStatus(id, status) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid report id');
    const next = String(status);
    if (!['unread', 'read', 'urgent', 'resolved'].includes(next)) throw new ValidationError('Invalid status');
    const updated = await FoodSafetyEmergencyReport.findByIdAndUpdate(
        id,
        { $set: { status: next } },
        { new: true }
    ).lean();
    return updated;
}

export async function updateSafetyEmergencyPriority(id, priority) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid report id');
    const next = String(priority);
    if (!['low', 'medium', 'high', 'critical'].includes(next)) throw new ValidationError('Invalid priority');
    const updated = await FoodSafetyEmergencyReport.findByIdAndUpdate(
        id,
        { $set: { priority: next } },
        { new: true }
    ).lean();
    return updated;
}

export async function deleteSafetyEmergencyReport(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid report id');
    const deleted = await FoodSafetyEmergencyReport.findByIdAndDelete(id).lean();
    return deleted;
}

export async function getContactMessages(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    // Fix old records with 'User' instead of 'FoodUser' for population to work
    await FeedbackExperience.updateMany({ userModel: 'User' }, { $set: { userModel: 'FoodUser' } });

    const filter = {};
    if (query.rating !== undefined && query.rating !== null && query.rating !== '' && !isNaN(query.rating)) {
        filter.rating = parseInt(query.rating, 10);
    }

    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(term, 'i');
        
        const [users, restaurants, partners] = await Promise.all([
            FoodUser.find({
                $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }]
            }).select('_id').lean(),
            FoodRestaurant.find({
                $or: [{ restaurantName: searchRegex }, { ownerEmail: searchRegex }, { ownerPhone: searchRegex }]
            }).select('_id').lean(),
            FoodDeliveryPartner.find({
                $or: [{ name: searchRegex }, { email: searchRegex }, { phone: searchRegex }]
            }).select('_id').lean()
        ]);

        filter.$or = [
            { comment: searchRegex },
            { userId: { $in: [...users.map(u => u._id), ...restaurants.map(r => r._id), ...partners.map(p => p._id)] } }
        ];
    }

    const [list, total] = await Promise.all([
        FeedbackExperience.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId')
            .lean(),
        FeedbackExperience.countDocuments(filter)
    ]);

    const reviews = list.map((doc) => {
        const user = (doc.userId && typeof doc.userId === 'object') ? doc.userId : {};
        return {
            _id: doc._id,
            customer: {
                name: user.name || user.restaurantName || 'Unknown',
                email: user.email || user.ownerEmail || 'N/A',
                phone: user.phone || user.ownerPhone || 'N/A'
            },
            comment: doc.comment || '',
            rating: doc.rating || 0,
            submittedAt: doc.createdAt,
            module: doc.module
        };
    });

    return {
        reviews,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit) || 1
        }
    };
}

// ----- Delivery Cash Limit (admin) -----
export async function getDeliveryCashLimitSettings() {
    const doc = await FoodDeliveryCashLimit.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    const settings = doc || { deliveryCashLimit: 0, deliveryWithdrawalLimit: 100, isActive: true };
    return {
        deliveryCashLimit: Number(settings.deliveryCashLimit) || 0,
        deliveryWithdrawalLimit: Number(settings.deliveryWithdrawalLimit) || 100
    };
}

export async function upsertDeliveryCashLimitSettings(body = {}) {
    const existing = await FoodDeliveryCashLimit.findOne({ isActive: true }).sort({ createdAt: -1 });
    const nextCashLimit = body.deliveryCashLimit;
    const nextWithdrawalLimit = body.deliveryWithdrawalLimit;

    if (existing) {
        if (nextCashLimit !== undefined) existing.deliveryCashLimit = Math.max(0, Number(nextCashLimit) || 0);
        if (nextWithdrawalLimit !== undefined) existing.deliveryWithdrawalLimit = Math.max(0, Number(nextWithdrawalLimit) || 0);
        await existing.save();
        return {
            deliveryCashLimit: existing.deliveryCashLimit,
            deliveryWithdrawalLimit: existing.deliveryWithdrawalLimit
        };
    }

    const created = await FoodDeliveryCashLimit.create({
        deliveryCashLimit: nextCashLimit !== undefined ? Math.max(0, Number(nextCashLimit) || 0) : 0,
        deliveryWithdrawalLimit: nextWithdrawalLimit !== undefined ? Math.max(0, Number(nextWithdrawalLimit) || 0) : 100,
        isActive: true
    });

    return {
        deliveryCashLimit: created.deliveryCashLimit,
        deliveryWithdrawalLimit: created.deliveryWithdrawalLimit
    };
}

// ----- Delivery Emergency Help (admin) -----
export async function getDeliveryEmergencyHelp() {
    const doc = await FoodDeliveryEmergencyHelp.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
    const data = doc || {
        medicalEmergency: '',
        accidentHelpline: '',
        contactPolice: '',
        insurance: '',
        isActive: true
    };
    return {
        medicalEmergency: data.medicalEmergency || '',
        accidentHelpline: data.accidentHelpline || '',
        contactPolice: data.contactPolice || '',
        insurance: data.insurance || ''
    };
}

export async function upsertDeliveryEmergencyHelp(body = {}) {
    const existing = await FoodDeliveryEmergencyHelp.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (existing) {
        if (body.medicalEmergency !== undefined) existing.medicalEmergency = String(body.medicalEmergency || '').trim();
        if (body.accidentHelpline !== undefined) existing.accidentHelpline = String(body.accidentHelpline || '').trim();
        if (body.contactPolice !== undefined) existing.contactPolice = String(body.contactPolice || '').trim();
        if (body.insurance !== undefined) existing.insurance = String(body.insurance || '').trim();
        await existing.save();
        return {
            medicalEmergency: existing.medicalEmergency || '',
            accidentHelpline: existing.accidentHelpline || '',
            contactPolice: existing.contactPolice || '',
            insurance: existing.insurance || ''
        };
    }
    const created = await FoodDeliveryEmergencyHelp.create({
        medicalEmergency: String(body.medicalEmergency || '').trim(),
        accidentHelpline: String(body.accidentHelpline || '').trim(),
        contactPolice: String(body.contactPolice || '').trim(),
        insurance: String(body.insurance || '').trim(),
        isActive: true
    });
    return {
        medicalEmergency: created.medicalEmergency || '',
        accidentHelpline: created.accidentHelpline || '',
        contactPolice: created.contactPolice || '',
        insurance: created.insurance || ''
    };
}

export async function getRestaurantReviews(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {
        'ratings.restaurant.rating': { $exists: true, $ne: null }
    };

    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(term, 'i');
        
        const restaurants = await FoodRestaurant.find({
            $or: [{ restaurantName: searchRegex }]
        }).select('_id').lean();
        
        const customers = await FoodUser.find({
            $or: [{ name: searchRegex }, { email: searchRegex }]
        }).select('_id').lean();

        filter.$or = [
            { orderId: searchRegex },
            { 'ratings.restaurant.comment': searchRegex },
            { restaurantId: { $in: restaurants.map(r => r._id) } },
            { userId: { $in: customers.map(c => c._id) } }
        ];
    }

    const [docs, total] = await Promise.all([
        FoodOrder.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'name email phone')
            .populate('restaurantId', 'restaurantName')
            .select('orderId userId restaurantId ratings.restaurant createdAt')
            .lean(),
        FoodOrder.countDocuments(filter)
    ]);

    const reviews = docs.map((doc, index) => ({
        sl: skip + index + 1,
        orderId: doc.orderId,
        restaurant: doc.restaurantId?.restaurantName || 'Unknown',
        restaurantId: doc.restaurantId?._id || 'N/A',
        customer: doc.userId?.name || 'Unknown',
        customerId: doc.userId?._id || 'N/A',
        review: doc.ratings?.restaurant?.comment || '',
        rating: doc.ratings?.restaurant?.rating || 0,
        submittedAt: doc.createdAt
    }));

    return { reviews, total, page, limit };
}

export async function getRestaurantById(id, adminScope = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const restaurant = await FoodRestaurant.findById(id)
        .select('-__v')
        .populate('zoneId', 'name zoneName serviceLocation isActive')
        .lean();
    if (!restaurant) return null;
    if (normalizeAdminScope(adminScope).isSubAdmin) {
        assertZoneAccess(adminScope, restaurant.zoneId?._id || restaurant.zoneId);
    }
    return restaurant;
}

export async function getRestaurantAnalytics(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rId = new mongoose.Types.ObjectId(restaurantId);

    const [restaurant, commissionDoc, orders, txRows] = await Promise.all([
        FoodRestaurant.findById(rId).lean(),
        FoodRestaurantCommission.findOne({ restaurantId: rId, status: { $ne: false } }).lean(),
        FoodOrder.find({ restaurantId: rId }).lean(),
        FoodTransaction.find({ restaurantId: rId })
            .populate('orderId', 'orderStatus createdAt pricing')
            .sort({ createdAt: -1 })
            .lean(),
    ]);

    if (!restaurant) return null;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const completedOrders = orders.filter(o => o.orderStatus === 'delivered');
    const cancelledOrders = orders.filter(o => ['cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'].includes(o.orderStatus));

    // Money metrics should come from the ledger (FoodTransaction), not FoodOrder.
    const completedTx = (txRows || []).filter((tx) => {
        const orderStatus = String(tx?.orderId?.orderStatus || '').toLowerCase();
        const txStatus = String(tx?.status || '').toLowerCase();
        const historyKinds = Array.isArray(tx?.history)
            ? tx.history.map((h) => String(h?.kind || '').toLowerCase())
            : [];
        const isNoResponseCompensated = historyKinds.includes('cancelled_by_delivery_no_response');
        if (orderStatus) return orderStatus === 'delivered' || isNoResponseCompensated;
        return ['captured', 'authorized', 'settled'].includes(txStatus) || isNoResponseCompensated;
    });

    const sum = (arr, pick) => (arr || []).reduce((s, it) => s + (Number(pick(it)) || 0), 0);

    // 1) Total order value (gross customer paid)
    const totalRevenue = sum(completedTx, (tx) => tx?.amounts?.totalCustomerPaid ?? tx?.pricing?.total ?? tx?.orderId?.pricing?.total);

    // 2) Restaurant share (payout to restaurant)
    const restaurantEarning = sum(completedTx, (tx) => tx?.amounts?.restaurantShare);

    // 3) Restaurant commission paid to admin
    const totalCommission = sum(completedTx, (tx) => tx?.amounts?.restaurantCommission ?? tx?.pricing?.restaurantCommission);

    // 4) Restaurant profit (in this system, equals restaurant share)
    const restaurantProfit = restaurantEarning;

    const monthlyOrdersList = orders.filter(o => {
        const d = new Date(o.createdAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthlyCompletedTx = completedTx.filter((tx) => {
        const d = new Date(tx?.createdAt || tx?.orderId?.createdAt || 0);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const monthlyProfit = sum(monthlyCompletedTx, (tx) => tx?.amounts?.restaurantShare);

    const yearlyOrdersList = orders.filter(o => {
        const d = new Date(o.createdAt);
        return d.getFullYear() === currentYear;
    });
    const yearlyCompletedTx = completedTx.filter((tx) => {
        const d = new Date(tx?.createdAt || tx?.orderId?.createdAt || 0);
        return d.getFullYear() === currentYear;
    });
    const yearlyProfit = sum(yearlyCompletedTx, (tx) => tx?.amounts?.restaurantShare);

    const totalOrdersCount = orders.length;
    const avgOrderValue = completedTx.length > 0 ? totalRevenue / completedTx.length : 0;

    const uniqueCustomers = new Set(orders.map(o => String(o.userId))).size;
    const customerOrderCounts = orders.reduce((acc, o) => {
        const uid = String(o.userId);
        acc[uid] = (acc[uid] || 0) + 1;
        return acc;
    }, {});
    const repeatCustomers = Object.values(customerOrderCounts).filter(count => count > 1).length;

    // 5) Restaurant commission percent
    const commissionType = commissionDoc?.defaultCommission?.type || 'percentage';
    const commissionValue = Number(commissionDoc?.defaultCommission?.value || 0) || 0;
    const completedSubtotal = sum(completedTx, (tx) => tx?.pricing?.subtotal ?? tx?.orderId?.pricing?.subtotal);
    const computedCommissionPercent =
        commissionType === 'percentage'
            ? commissionValue
            : (completedSubtotal > 0 ? (totalCommission / completedSubtotal) * 100 : 0);

    const analytics = {
        totalOrders: totalOrdersCount,
        cancelledOrders: cancelledOrders.length,
        completedOrders: completedOrders.length,
        averageRating: Number(restaurant.rating || 0),
        totalRatings: Number(restaurant.totalRatings || 0),
        commissionPercentage: computedCommissionPercent,
        monthlyProfit,
        yearlyProfit,
        averageOrderValue: avgOrderValue,
        totalRevenue,
        totalCommission,
        restaurantEarning, // restaurant share
        restaurantProfit,
        monthlyOrders: monthlyOrdersList.length,
        yearlyOrders: yearlyOrdersList.length,
        averageMonthlyProfit: monthlyProfit, // Placeholder: can be improved if historical data exists
        averageYearlyProfit: yearlyProfit,   // Placeholder: can be improved if historical data exists
        status: restaurant.status === 'approved' ? 'active' : 'inactive',
        joinDate: restaurant.createdAt,
        totalCustomers: uniqueCustomers,
        repeatCustomers,
        cancellationRate: totalOrdersCount > 0 ? (cancelledOrders.length / totalOrdersCount) * 100 : 0,
        completionRate: totalOrdersCount > 0 ? (completedOrders.length / totalOrdersCount) * 100 : 0
    };

    const paymentSummary = {
        // Pricing (what customer paid components)
        subtotal: sum(completedTx, (tx) => tx?.pricing?.subtotal ?? tx?.orderId?.pricing?.subtotal),
        tax: sum(completedTx, (tx) => tx?.pricing?.tax ?? tx?.amounts?.taxAmount ?? tx?.orderId?.pricing?.tax),
        packagingFee: sum(completedTx, (tx) => tx?.pricing?.packagingFee ?? tx?.orderId?.pricing?.packagingFee),
        deliveryFee: sum(completedTx, (tx) => tx?.pricing?.deliveryFee ?? tx?.orderId?.pricing?.deliveryFee),
        platformFee: sum(completedTx, (tx) => tx?.pricing?.platformFee ?? tx?.orderId?.pricing?.platformFee),
        discount: sum(completedTx, (tx) => tx?.pricing?.discount ?? tx?.orderId?.pricing?.discount),
        total: totalRevenue,
        currency: 'INR',

        // Split (who got what)
        restaurantShare: restaurantEarning,
        restaurantCommission: totalCommission,
        riderShare: sum(completedTx, (tx) => tx?.amounts?.riderShare),
        platformNetProfit: sum(completedTx, (tx) => tx?.amounts?.platformNetProfit),
    };

    return { restaurant, analytics, paymentSummary };
}

export async function getRestaurantMenuById(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodRestaurant.findById(id).select('menu').lean();
    if (!doc) return null;
    return doc.menu || { sections: [] };
}

export async function updateRestaurantMenuById(id, menu) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodRestaurant.findById(id);
    if (!doc) return null;
    const sections = Array.isArray(menu?.sections) ? menu.sections : [];
    doc.menu = { sections };
    await doc.save();
    return doc.menu || { sections: [] };
}

export async function getPendingRestaurants() {
    const restaurants = await FoodRestaurant.find({ status: { $in: ['pending', 'rejected'] } })
        .populate('zoneId', 'name zoneName serviceLocation')
        .sort({ createdAt: -1 })
        .lean();
    return restaurants.map((r, i) => ({
        ...r,
        sl: i + 1,
        zone: r.zoneId?.serviceLocation || r.zoneId?.zoneName || r.zoneId?.name || null,
    }));
}

export async function updateRestaurantById(id, body = {}, adminScope = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodRestaurant.findById(id);
    if (!doc) return null;
    assertZoneAccess(adminScope, doc.zoneId);

    const toStr = (v) => (v != null ? String(v).trim() : '');
    const toFinite = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };

    if (body.name !== undefined || body.restaurantName !== undefined) {
        const name = toStr(body.name !== undefined ? body.name : body.restaurantName);
        if (!name) throw new ValidationError('Restaurant name cannot be empty');
        doc.restaurantName = name;
    }

    if (body.ownerName !== undefined) doc.ownerName = toStr(body.ownerName);
    if (body.ownerEmail !== undefined) doc.ownerEmail = toStr(body.ownerEmail).toLowerCase();
    if (body.ownerPhone !== undefined) doc.ownerPhone = toStr(body.ownerPhone);
    if (body.primaryContactNumber !== undefined) doc.primaryContactNumber = toStr(body.primaryContactNumber);

    if (body.pureVegRestaurant !== undefined) {
        doc.pureVegRestaurant = parseBooleanLike(body.pureVegRestaurant, 'pureVegRestaurant');
    }

    if (body.isAcceptingOrders !== undefined) {
        doc.isAcceptingOrders = parseBooleanLike(body.isAcceptingOrders, 'isAcceptingOrders');
    }

    if (body.cuisines !== undefined) {
        if (Array.isArray(body.cuisines)) {
            doc.cuisines = body.cuisines
                .map((c) => toStr(c))
                .filter(Boolean)
                .slice(0, 50);
        } else if (typeof body.cuisines === 'string') {
            doc.cuisines = body.cuisines
                .split(',')
                .map((c) => toStr(c))
                .filter(Boolean)
                .slice(0, 50);
        } else {
            throw new ValidationError('cuisines must be an array or comma-separated string');
        }
    }

    if (body.openingTime !== undefined) doc.openingTime = normalizeRestaurantTime(body.openingTime) || '';
    if (body.closingTime !== undefined) doc.closingTime = normalizeRestaurantTime(body.closingTime) || '';
    validateOpeningClosingTimes(doc.openingTime, doc.closingTime);
    if (body.openDays !== undefined && Array.isArray(body.openDays)) {
        doc.openDays = body.openDays.map(d => toStr(d)).filter(Boolean);
    }
    if (body.offer !== undefined) doc.offer = toStr(body.offer);

    if (body.estimatedDeliveryTime !== undefined) {
        doc.estimatedDeliveryTime = toStr(body.estimatedDeliveryTime);
    }
    if (body.estimatedDeliveryTimeMinutes !== undefined) {
        const minutes = toFiniteNumber(body.estimatedDeliveryTimeMinutes);
        if (minutes === null) {
            doc.estimatedDeliveryTimeMinutes = undefined;
        } else if (minutes < 0) {
            throw new ValidationError('estimatedDeliveryTimeMinutes must be >= 0');
        } else {
            doc.estimatedDeliveryTimeMinutes = Math.round(minutes);
        }
    }

    // Business & Docs
    if (body.panNumber !== undefined) doc.panNumber = toStr(body.panNumber);
    if (body.nameOnPan !== undefined) doc.nameOnPan = toStr(body.nameOnPan);
    if (body.gstRegistered !== undefined) doc.gstRegistered = parseBooleanLike(body.gstRegistered, 'gstRegistered');
    if (body.gstNumber !== undefined) doc.gstNumber = toStr(body.gstNumber);
    if (body.gstLegalName !== undefined) doc.gstLegalName = toStr(body.gstLegalName);
    if (body.gstAddress !== undefined) doc.gstAddress = toStr(body.gstAddress);
    if (body.fssaiNumber !== undefined) doc.fssaiNumber = toStr(body.fssaiNumber);
    if (body.fssaiExpiry !== undefined) doc.fssaiExpiry = body.fssaiExpiry ? new Date(body.fssaiExpiry) : undefined;

    // Bank Details
    if (body.accountNumber !== undefined) doc.accountNumber = toStr(body.accountNumber);
    if (body.ifscCode !== undefined) doc.ifscCode = toStr(body.ifscCode);
    if (body.accountHolderName !== undefined) doc.accountHolderName = toStr(body.accountHolderName);
    if (body.accountType !== undefined) doc.accountType = toStr(body.accountType);

    // Featured Info
    if (body.featuredDish !== undefined) doc.featuredDish = toStr(body.featuredDish);
    if (body.featuredPrice !== undefined) doc.featuredPrice = toFinite(body.featuredPrice);

    // Images
    const getUrl = (v) => (v && typeof v === 'object' ? v.url : v);
    if (body.profileImage !== undefined) doc.profileImage = toStr(getUrl(body.profileImage)) || undefined;
    if (body.panImage !== undefined) doc.panImage = toStr(getUrl(body.panImage)) || undefined;
    if (body.gstImage !== undefined) doc.gstImage = toStr(getUrl(body.gstImage)) || undefined;
    if (body.fssaiImage !== undefined) doc.fssaiImage = toStr(getUrl(body.fssaiImage)) || undefined;

    if (body.menuImages !== undefined) {
        if (Array.isArray(body.menuImages)) {
            doc.menuImages = body.menuImages.map(m => toStr(getUrl(m))).filter(Boolean);
        } else {
            doc.menuImages = [toStr(getUrl(body.menuImages))].filter(Boolean);
        }
    }

    await doc.save();
    return FoodRestaurant.findById(id).select('-__v').populate('zoneId', 'name zoneName serviceLocation isActive').lean();
}

export async function updateRestaurantStatus(id, body = {}, adminScope = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const existing = await FoodRestaurant.findById(id).select('zoneId').lean();
    if (!existing) return null;
    assertZoneAccess(adminScope, existing.zoneId);
    const raw = body.status !== undefined ? body.status : body.isActive;
    const isActive = parseBooleanLike(raw, 'status');
    const status = isActive ? 'approved' : 'rejected';

    return FoodRestaurant.findByIdAndUpdate(
        id,
        {
            $set: {
                status,
                approvedAt: isActive ? new Date() : undefined,
                rejectedAt: isActive ? undefined : new Date(),
                rejectionReason: isActive ? undefined : 'Disabled by admin'
            }
        },
        { new: true, runValidators: false }
    ).lean();
}

export async function updateRestaurantLocation(id, body = {}, adminScope = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodRestaurant.findById(id);
    if (!doc) return null;
    assertZoneAccess(adminScope, doc.zoneId);

    const source = (body.location && typeof body.location === 'object') ? body.location : body;
    const toStr = (v) => (v != null ? String(v).trim() : '');

    const coordinates = Array.isArray(source.coordinates) ? source.coordinates : [];
    const lngFromCoordinates = toFiniteNumber(coordinates[0]);
    const latFromCoordinates = toFiniteNumber(coordinates[1]);
    const latitude = toFiniteNumber(source.latitude ?? latFromCoordinates);
    const longitude = toFiniteNumber(source.longitude ?? lngFromCoordinates);

    const addressLine1 = toStr(source.addressLine1 || source.formattedAddress || source.address);
    const addressLine2 = toStr(source.addressLine2);
    const area = toStr(source.area);
    const city = toStr(source.city);
    const state = toStr(source.state);
    const pincode = toStr(source.pincode || source.zipCode || source.postalCode);
    const landmark = toStr(source.landmark);
    const formattedAddress = toStr(source.formattedAddress || source.address || addressLine1);

    if (!doc.location || typeof doc.location !== 'object') {
        doc.location = { type: 'Point' };
    }
    doc.location.type = 'Point';
    if (latitude !== null && longitude !== null) {
        doc.location.latitude = latitude;
        doc.location.longitude = longitude;
        doc.location.coordinates = [longitude, latitude];
    }
    doc.location.formattedAddress = formattedAddress;
    doc.location.address = toStr(source.address || formattedAddress);
    doc.location.addressLine1 = addressLine1;
    doc.location.addressLine2 = addressLine2;
    doc.location.area = area;
    doc.location.city = city;
    doc.location.state = state;
    doc.location.pincode = pincode;
    doc.location.landmark = landmark;

    // Keep flat fields in sync for legacy readers.
    doc.addressLine1 = addressLine1;
    doc.addressLine2 = addressLine2;
    doc.area = area;
    doc.city = city;
    doc.state = state;
    doc.pincode = pincode;
    doc.landmark = landmark;

    if (body.zoneId !== undefined) {
        const zoneId = String(body.zoneId || '').trim();
        if (!zoneId) {
            doc.zoneId = undefined;
        } else if (!mongoose.Types.ObjectId.isValid(zoneId)) {
            throw new ValidationError('Invalid zoneId');
        } else {
            assertZoneAccess(adminScope, zoneId);
            doc.zoneId = new mongoose.Types.ObjectId(zoneId);
        }
    }

    await doc.save();
    return FoodRestaurant.findById(id).select('-__v').populate('zoneId', 'name zoneName serviceLocation isActive').lean();
}

// ----- Categories -----
export async function getCategories(query) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim();
        filter.$or = [{ name: { $regex: term, $options: 'i' } }];
    }
    // Optional zone filter for admin list.
    // - zoneId=global => only global categories (zoneId missing)
    // - zoneId=<ObjectId> => only categories bound to that zone
    if (query.zoneId && String(query.zoneId).trim()) {
        const zid = String(query.zoneId).trim();
        if (zid === 'global') {
            filter.$or = [...(filter.$or || []), { zoneId: { $exists: false } }, { zoneId: null }];
        } else if (mongoose.Types.ObjectId.isValid(zid)) {
            filter.zoneId = new mongoose.Types.ObjectId(zid);
        }
    }
    if (query.approvalStatus) {
        const approvalStatus = String(query.approvalStatus);
        if (approvalStatus === 'pending') {
            filter.$and = [...(filter.$and || []), {
                $or: [
                    { approvalStatus: 'pending' },
                    { approvalStatus: { $exists: false }, isApproved: false }
                ]
            }];
        } else {
            filter.approvalStatus = approvalStatus;
        }
    } else if (query.isApproved !== undefined) {
        if (query.isApproved === true) {
            filter.$and = [...(filter.$and || []), {
                $or: [
                    { approvalStatus: 'approved' },
                    { approvalStatus: { $exists: false }, isApproved: { $ne: false } }
                ]
            }];
        } else {
            filter.$and = [...(filter.$and || []), {
                $or: [
                    { approvalStatus: 'pending' },
                    { approvalStatus: { $exists: false }, isApproved: false }
                ]
            }];
        }
    }

    const [list, total] = await Promise.all([
        FoodCategory.find(filter)
            .sort({ sortOrder: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodCategory.countDocuments(filter)
    ]);

    const statsById = await backfillLegacyCategoryWorkflow(list);
    const restaurantIds = Array.from(
        new Set(
            list
                .flatMap((category) => [category?.restaurantId, category?.createdByRestaurantId])
                .map((value) => (value ? String(value) : ''))
                .filter(Boolean)
        )
    );
    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } })
            .select('restaurantName ownerName ownerPhone')
            .lean()
        : [];
    const restaurantMap = new Map(restaurants.map((restaurant) => [String(restaurant._id), restaurant]));

    const hydratedList = list.map((category) => ({
        ...category,
        restaurantId: category?.restaurantId ? restaurantMap.get(String(category.restaurantId)) || category.restaurantId : category.restaurantId,
        createdByRestaurantId: category?.createdByRestaurantId ? restaurantMap.get(String(category.createdByRestaurantId)) || category.createdByRestaurantId : category.createdByRestaurantId
    }));
    const categories = hydratedList.map((category) => serializeCategoryForResponse(category, { includeCounts: true, statsById }));

    return { categories, total, page, limit };
}

export async function createCategory(body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new ValidationError('Category name is required');
    const doc = new FoodCategory({
        name,
        image: typeof body.image === 'string' ? body.image.trim() : '',
        type: typeof body.type === 'string' ? body.type.trim() : '',
        foodTypeScope: normalizeCategoryFoodTypeScope(body.foodTypeScope, 'Both'),
        zoneId:
            body.zoneId && String(body.zoneId).trim()
                ? (() => {
                    const zid = String(body.zoneId).trim();
                    if (zid === 'global') return undefined;
                    if (!mongoose.Types.ObjectId.isValid(zid)) throw new ValidationError('Invalid zoneId');
                    return new mongoose.Types.ObjectId(zid);
                })()
                : undefined,
        isActive: body.isActive !== false,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0,
        visibilityStartTime: normalizeCategoryVisibilityTime(body.visibilityStartTime),
        visibilityEndTime: normalizeCategoryVisibilityTime(body.visibilityEndTime),
        // Admin-created categories are globally available immediately.
        approvalStatus: 'approved',
        isApproved: true,
        approvedAt: new Date(),
        rejectionReason: '',
        restaurantId: undefined,
        createdByRestaurantId: undefined
    });
    await doc.save();
    return doc.toObject();
}

export async function approveCategory(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodCategory.findById(id);
    if (!doc) return null;

    if (!doc.createdByRestaurantId && doc.restaurantId) {
        doc.createdByRestaurantId = doc.restaurantId;
    }
    doc.approvalStatus = 'approved';
    doc.isApproved = true;
    doc.approvedAt = new Date();
    doc.rejectedAt = undefined;
    doc.rejectionReason = '';
    await doc.save();
    return doc.toObject();
}

export async function rejectCategory(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodCategory.findById(id);
    if (!doc) return null;
    if (!doc.restaurantId && !doc.createdByRestaurantId) {
        throw new ValidationError('Only restaurant-created categories can be rejected');
    }

    if (!doc.createdByRestaurantId && doc.restaurantId) {
        doc.createdByRestaurantId = doc.restaurantId;
    }
    doc.approvalStatus = 'rejected';
    doc.isApproved = false;
    doc.rejectionReason = String(reason || '').trim();
    doc.rejectedAt = new Date();
    doc.approvedAt = undefined;
    await doc.save();
    return doc.toObject();
}

export async function makeCategoryGlobal(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodCategory.findById(id);
    if (!doc) return null;

    if (!doc.restaurantId && !doc.createdByRestaurantId) {
        return doc.toObject();
    }
    if (String(doc.approvalStatus || '') !== 'approved' && doc.isApproved !== true) {
        throw new ValidationError('Only approved categories can be made global');
    }

    doc.createdByRestaurantId = doc.createdByRestaurantId || doc.restaurantId;
    doc.restaurantId = undefined;
    doc.zoneId = undefined;
    doc.approvalStatus = 'approved';
    doc.isApproved = true;
    doc.rejectionReason = '';
    doc.globalizedAt = new Date();
    doc.approvedAt = doc.approvedAt || new Date();
    await doc.save();
    return doc.toObject();
}

export async function updateCategory(id, body) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodCategory.findById(id);
    if (!doc) return null;

    const nextFoodTypeScope = body.foodTypeScope !== undefined
        ? normalizeCategoryFoodTypeScope(body.foodTypeScope, doc.foodTypeScope || 'Both')
        : normalizeCategoryFoodTypeScope(doc.foodTypeScope, 'Both');

    if (body.foodTypeScope !== undefined && nextFoodTypeScope !== 'Both') {
        const incompatibleFoods = await FoodItem.countDocuments({
            categoryId: doc._id,
            foodType: nextFoodTypeScope === 'Veg' ? 'Non-Veg' : 'Veg'
        });
        if (incompatibleFoods > 0) {
            throw new ValidationError(`This category already has ${incompatibleFoods} food item(s) outside the selected diet scope`);
        }
    }

    if (body.name !== undefined) doc.name = String(body.name || '').trim();
    if (body.image !== undefined) doc.image = String(body.image || '').trim();
    if (body.type !== undefined) doc.type = String(body.type || '').trim();
    if (body.foodTypeScope !== undefined) doc.foodTypeScope = nextFoodTypeScope;
    if (!doc.restaurantId && doc.createdByRestaurantId) {
        doc.zoneId = undefined;
    } else if (body.zoneId !== undefined) {
        const raw = String(body.zoneId || '').trim();
        if (!raw || raw === 'global') {
            doc.zoneId = undefined;
        } else {
            if (!mongoose.Types.ObjectId.isValid(raw)) throw new ValidationError('Invalid zoneId');
            doc.zoneId = new mongoose.Types.ObjectId(raw);
        }
    }
    if (body.isActive !== undefined) doc.isActive = body.isActive !== false;
    if (body.sortOrder !== undefined) doc.sortOrder = Number(body.sortOrder) || 0;
    if (body.visibilityStartTime !== undefined) {
        doc.visibilityStartTime = normalizeCategoryVisibilityTime(body.visibilityStartTime);
    }
    if (body.visibilityEndTime !== undefined) {
        doc.visibilityEndTime = normalizeCategoryVisibilityTime(body.visibilityEndTime);
    }
    if (!doc.createdByRestaurantId && doc.restaurantId) {
        doc.createdByRestaurantId = doc.restaurantId;
    }
    await doc.save();
    return doc.toObject();
}

export async function deleteCategory(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const inUse = await FoodItem.countDocuments({ categoryId: id });
    if (inUse > 0) {
        throw new ValidationError('Cannot delete category while it has items');
    }
    const deleted = await FoodCategory.findByIdAndDelete(id).lean();
    return deleted ? { id } : null;
}

export async function toggleCategoryStatus(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodCategory.findById(id);
    if (!doc) return null;
    doc.isActive = !doc.isActive;
    if (!doc.createdByRestaurantId && doc.restaurantId) {
        doc.createdByRestaurantId = doc.restaurantId;
    }
    await doc.save();
    return doc.toObject();
}

// ----- Restaurant Add-ons approval (admin) -----
export async function getRestaurantAddonsAdmin(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = { isDeleted: { $ne: true } };

    const approvalStatus = String(query.approvalStatus || '').trim();
    if (approvalStatus && ['pending', 'approved', 'rejected'].includes(approvalStatus)) {
        filter.approvalStatus = approvalStatus;
    }

    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) {
        filter.restaurantId = new mongoose.Types.ObjectId(String(query.restaurantId));
    }

    if (query.search && String(query.search).trim()) {
        const raw = String(query.search).trim().slice(0, 80);
        const term = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const matchingRestaurantIds = await FoodRestaurant.find({
            restaurantName: { $regex: term, $options: 'i' }
        })
            .select('_id')
            .lean();

        filter.$or = [
            { 'draft.name': { $regex: term, $options: 'i' } },
            { restaurantId: { $in: matchingRestaurantIds.map((restaurant) => restaurant._id) } }
        ];
    }

    const [list, total] = await Promise.all([
        FoodAddon.find(filter)
            .sort({ requestedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('restaurantId', 'restaurantName ownerName ownerPhone')
            .lean(),
        FoodAddon.countDocuments(filter)
    ]);

    const addons = list.map((a) => ({
        id: a._id,
        _id: a._id,
        restaurantId: a.restaurantId?._id ? String(a.restaurantId._id) : String(a.restaurantId),
        restaurant: a.restaurantId?._id
            ? {
                _id: a.restaurantId._id,
                name: a.restaurantId.restaurantName || '',
                ownerName: a.restaurantId.ownerName || '',
                ownerPhone: a.restaurantId.ownerPhone || ''
            }
            : null,
        approvalStatus: a.approvalStatus || 'pending',
        rejectionReason: a.rejectionReason || '',
        requestedAt: a.requestedAt,
        approvedAt: a.approvedAt,
        rejectedAt: a.rejectedAt,
        isAvailable: a.isAvailable !== false,
        draft: a.draft || null,
        published: a.published || null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt
    }));

    return { addons, total, page, limit };
}

export async function updateRestaurantAddonAdmin(addonId, body) {
    if (!addonId || !mongoose.Types.ObjectId.isValid(String(addonId))) return null;
    const _id = new mongoose.Types.ObjectId(String(addonId));
    
    const addon = await FoodAddon.findOne({ _id, isDeleted: { $ne: true } });
    if (!addon) return null;

    const updatePayload = {};
    if (body.name !== undefined) updatePayload.name = String(body.name || '').trim();
    if (body.description !== undefined) updatePayload.description = String(body.description || '').trim();
    if (body.price !== undefined) {
        const p = Number(body.price);
        if (!Number.isFinite(p) || p < 0) throw new ValidationError('Price must be a valid positive number');
        updatePayload.price = p;
    }
    if (body.image !== undefined) updatePayload.image = String(body.image || '').trim();
    if (body.images !== undefined && Array.isArray(body.images)) {
        updatePayload.images = body.images.map(img => typeof img === 'string' ? img : img?.url).filter(Boolean);
    } else if (updatePayload.image) {
        updatePayload.images = [updatePayload.image];
    }

    // Update draft fields
    if (addon.draft) {
        Object.assign(addon.draft, updatePayload);
    } else {
        addon.draft = updatePayload;
    }

    // If already approved, update published state as well
    if (addon.approvalStatus === 'approved') {
        if (addon.published) {
            Object.assign(addon.published, updatePayload);
        } else {
            addon.published = updatePayload;
        }
    }

    if (body.isAvailable !== undefined) {
        addon.isAvailable = body.isAvailable === true;
    }

    await addon.save();
    return addon.toObject();
}

export async function approveRestaurantAddon(addonId) {
    if (!addonId || !mongoose.Types.ObjectId.isValid(String(addonId))) return null;
    const _id = new mongoose.Types.ObjectId(String(addonId));

    // Use update pipeline to copy draft -> published atomically.
    const updated = await FoodAddon.findOneAndUpdate(
        { _id, isDeleted: { $ne: true } },
        [
            {
                $set: {
                    published: '$draft',
                    approvalStatus: 'approved',
                    approvedAt: '$$NOW',
                    rejectedAt: null,
                    rejectionReason: ''
                }
            }
        ],
        { new: true }
    ).lean();

    if (updated?.restaurantId) {
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated.restaurantId }],
                {
                    title: 'Addon Approved! âœ…',
                    body: `Your addon "${updated.published?.name || 'New Addon'}" has been approved and is now live.`,
                    image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'addon_approved',
                        addonId: String(updated._id),
                        restaurantId: String(updated.restaurantId)
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send addon approval notification:', e);
        }
    }

    return updated || null;
}

export async function rejectRestaurantAddon(addonId, reason) {
    if (!addonId || !mongoose.Types.ObjectId.isValid(String(addonId))) return null;
    const _id = new mongoose.Types.ObjectId(String(addonId));
    const rejectionReason = String(reason || '').trim();
    if (!rejectionReason) {
        throw new ValidationError('Rejection reason is required');
    }
    const updated = await FoodAddon.findOneAndUpdate(
        { _id, isDeleted: { $ne: true } },
        {
            $set: {
                approvalStatus: 'rejected',
                rejectionReason,
                rejectedAt: new Date()
            }
        },
        { new: true }
    ).lean();

    if (updated?.restaurantId) {
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated.restaurantId }],
                {
                    title: 'Addon Rejected âŒ',
                    body: `Your addon request for "${updated.draft?.name || 'New Addon'}" was rejected. Reason: ${rejectionReason}`,
                    image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'addon_rejected',
                        addonId: String(updated._id),
                        restaurantId: String(updated.restaurantId),
                        reason: rejectionReason
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send addon rejection notification:', e);
        }
    }

    return updated || null;
}

// ----- Foods (separate collection) -----
export async function getFoods(query) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = {};

    if (query.restaurantId && mongoose.Types.ObjectId.isValid(query.restaurantId)) {
        filter.restaurantId = query.restaurantId;
    }
    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim();
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { categoryName: { $regex: term, $options: 'i' } }
        ];
    }
    if (query.approvalStatus && ['pending', 'approved', 'rejected'].includes(String(query.approvalStatus))) {
        filter.approvalStatus = String(query.approvalStatus);
    }

    const [list, total] = await Promise.all([
        FoodItem.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodItem.countDocuments(filter)
    ]);

    const restaurantIds = Array.from(new Set(list.map((f) => String(f.restaurantId)).filter(Boolean)));
    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } }).select('restaurantName').lean()
        : [];
    const restaurantMap = new Map(restaurants.map((r) => [String(r._id), r.restaurantName]));

    const foods = list.map((f) => ({
        id: f._id,
        _id: f._id,
        restaurantId: f.restaurantId,
        restaurantName: restaurantMap.get(String(f.restaurantId)) || 'Unknown Restaurant',
        categoryId: f.categoryId || null,
        categoryName: f.categoryName || '',
        name: f.name,
        description: f.description || '',
        price: getFoodDisplayPrice(f),
        variants: serializeFoodVariants(f.variants),
        variations: serializeFoodVariants(f.variants),
        image: f.image || '',
        foodType: f.foodType || 'Non-Veg',
        isAvailable: f.isAvailable !== false,
        preparationTime: f.preparationTime || '',
        approvalStatus: f.approvalStatus || 'approved',
        createdAt: f.createdAt,
        updatedAt: f.updatedAt
    }));

    return { foods, total, page, limit };
}

const resolveAdminFoodCategory = async ({ categoryId, categoryName, foodType, pureVegRestaurant }) => {
    let resolvedCategoryId = null;
    let resolvedCategoryName = typeof categoryName === 'string' ? categoryName.trim() : '';
    let categoryDoc = null;

    if (categoryId) {
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            throw new ValidationError('Invalid category id');
        }
        categoryDoc = await FoodCategory.findById(categoryId)
            .select('name foodTypeScope')
            .lean();
        if (!categoryDoc?._id) {
            throw new ValidationError('Category not found');
        }
        resolvedCategoryId = categoryDoc._id;
        resolvedCategoryName = categoryDoc.name || resolvedCategoryName;
    }

    if (!resolvedCategoryName) {
        throw new ValidationError('Category is required');
    }

    if (categoryDoc?.foodTypeScope) {
        if (pureVegRestaurant && String(categoryDoc.foodTypeScope || '') !== 'Veg') {
            throw new ValidationError('Pure veg restaurants can only use veg categories');
        }
        if (!categoryAllowsFoodType(categoryDoc.foodTypeScope, foodType)) {
            throw new ValidationError(`This ${categoryDoc.foodTypeScope} category cannot accept ${foodType} food`);
        }
    }

    return {
        categoryId: resolvedCategoryId,
        categoryName: resolvedCategoryName
    };
};

const getAdminFoodCreatePricing = (body = {}) => {
    const variants = normalizeFoodVariantsInput(extractRawFoodVariants(body));
    if (variants.length > 0) {
        return {
            price: getFoodDisplayPrice({ variants }),
            variants
        };
    }

    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) throw new ValidationError('Price must be greater than 0');
    return {
        price,
        variants: []
    };
};

const getAdminFoodUpdatedPricing = (existing = {}, body = {}) => {
    const variantsTouched = body.variants !== undefined || body.variations !== undefined;
    const existingHasVariants = hasFoodVariants(existing);
    const update = {};

    if (variantsTouched) {
        const variants = normalizeFoodVariantsInput(extractRawFoodVariants(body));
        update.variants = variants;

        if (variants.length > 0) {
            update.price = getFoodDisplayPrice({ variants });
            return update;
        }

        const nextBasePrice = body.price !== undefined ? Number(body.price) : Number(existingHasVariants ? NaN : existing.price);
        if (!Number.isFinite(nextBasePrice) || nextBasePrice <= 0) {
            throw new ValidationError('Base price must be greater than 0 when variants are removed');
        }
        update.price = nextBasePrice;
        return update;
    }

    if (body.price !== undefined) {
        if (existingHasVariants) {
            throw new ValidationError('Update variants instead of base price for foods with variants');
        }
        const price = Number(body.price);
        if (!Number.isFinite(price) || price <= 0) throw new ValidationError('Price must be greater than 0');
        update.price = price;
    }

    return update;
};

export async function createFood(body) {
    const restaurantId = body.restaurantId;
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
        throw new ValidationError('Valid restaurantId is required');
    }
    const restaurant = await FoodRestaurant.findById(restaurantId)
        .select('pureVegRestaurant')
        .lean();
    if (!restaurant?._id) {
        throw new ValidationError('Restaurant not found');
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new ValidationError('Food name is required');
    const foodType = body.foodType === 'Veg' ? 'Veg' : 'Non-Veg';
    if (restaurant.pureVegRestaurant === true && foodType !== 'Veg') {
        throw new ValidationError('Pure veg restaurants can only use veg foods');
    }
    const { price, variants } = getAdminFoodCreatePricing(body);

    let categoryName = typeof body.categoryName === 'string' ? body.categoryName.trim() : '';
    if (!categoryName && typeof body.category === 'string') categoryName = body.category.trim();
    const { categoryId, categoryName: resolvedCategoryName } = await resolveAdminFoodCategory({
        categoryId: body.categoryId,
        categoryName,
        foodType,
        pureVegRestaurant: restaurant.pureVegRestaurant === true
    });

    const doc = new FoodItem({
        restaurantId,
        categoryId,
        categoryName: resolvedCategoryName,
        name,
        description: typeof body.description === 'string' ? body.description.trim() : '',
        price,
        variants,
        image: typeof body.image === 'string' ? body.image.trim() : '',
        foodType,
        isAvailable: body.isAvailable !== false,
        preparationTime: typeof body.preparationTime === 'string' ? body.preparationTime.trim() : '',
        approvalStatus: 'approved'
    });
    await doc.save();
    return doc.toObject();
}

export async function updateFood(id, body) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodItem.findById(id);
    if (!doc) return null;
    const restaurant = await FoodRestaurant.findById(doc.restaurantId)
        .select('pureVegRestaurant')
        .lean();
    if (!restaurant?._id) {
        throw new ValidationError('Restaurant not found');
    }
    if (body.name !== undefined) doc.name = String(body.name || '').trim();
    if (body.description !== undefined) doc.description = String(body.description || '').trim();
    const targetFoodType = body.foodType !== undefined ? (body.foodType === 'Veg' ? 'Veg' : 'Non-Veg') : (doc.foodType === 'Veg' ? 'Veg' : 'Non-Veg');
    if (restaurant.pureVegRestaurant === true && targetFoodType !== 'Veg') {
        throw new ValidationError('Pure veg restaurants can only use veg foods');
    }
    const pricingUpdate = getAdminFoodUpdatedPricing(doc.toObject(), body);
    if (pricingUpdate.price !== undefined) doc.price = pricingUpdate.price;
    if (pricingUpdate.variants !== undefined) doc.variants = pricingUpdate.variants;
    if (body.image !== undefined) doc.image = String(body.image || '').trim();
    if (body.foodType !== undefined) doc.foodType = targetFoodType;
    if (body.isAvailable !== undefined) doc.isAvailable = body.isAvailable !== false;
    if (body.preparationTime !== undefined) doc.preparationTime = String(body.preparationTime || '').trim();
    if (body.categoryId !== undefined || body.categoryName !== undefined || body.category !== undefined || body.foodType !== undefined) {
        const nextCategoryName = body.categoryName !== undefined
            ? String(body.categoryName || '').trim()
            : (body.category !== undefined ? String(body.category || '').trim() : doc.categoryName);
        const { categoryId, categoryName } = await resolveAdminFoodCategory({
            categoryId: body.categoryId !== undefined ? body.categoryId : doc.categoryId,
            categoryName: nextCategoryName,
            foodType: targetFoodType,
            pureVegRestaurant: restaurant.pureVegRestaurant === true
        });
        doc.categoryId = categoryId;
        doc.categoryName = categoryName;
    }
    await doc.save();
    return doc.toObject();
}

export async function deleteFood(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const deleted = await FoodItem.findByIdAndDelete(id).lean();
    return deleted ? { id } : null;
}

/** Admin creates a restaurant (JSON body with image URLs already uploaded). Single API. */
export async function createRestaurantByAdmin(body) {
    const loc = body.location || {};
    const toStr = (v) => (v != null && v !== undefined ? String(v).trim() : '');
    const toUrl = (v) => (v && (typeof v === 'string' ? v : v.url)) ? (typeof v === 'string' ? v : v.url) : undefined;
    const coordinates = Array.isArray(loc.coordinates) ? loc.coordinates : [];
    const lngFromCoordinates = toFiniteNumber(coordinates[0]);
    const latFromCoordinates = toFiniteNumber(coordinates[1]);
    const latitude = toFiniteNumber(loc.latitude ?? latFromCoordinates);
    const longitude = toFiniteNumber(loc.longitude ?? lngFromCoordinates);
    const menuUrls = Array.isArray(body.menuImages)
        ? body.menuImages.map((m) => toUrl(m)).filter(Boolean)
        : [];

    const normalizedOpeningTime = normalizeRestaurantTime(body.openingTime) || '09:00';
    const normalizedClosingTime = normalizeRestaurantTime(body.closingTime) || '22:00';
    validateOpeningClosingTimes(normalizedOpeningTime, normalizedClosingTime);

    const doc = {
        restaurantName: toStr(body.restaurantName) || toStr(body.name),
        ownerName: toStr(body.ownerName),
        ownerEmail: toStr(body.ownerEmail),
        ownerPhone: toStr(body.ownerPhone),
        primaryContactNumber: toStr(body.primaryContactNumber) || toStr(body.ownerPhone),
        pureVegRestaurant: body.pureVegRestaurant !== undefined
            ? parseBooleanLike(body.pureVegRestaurant, 'pureVegRestaurant')
            : false,
        addressLine1: toStr(loc.addressLine1),
        addressLine2: toStr(loc.addressLine2),
        area: toStr(loc.area),
        city: toStr(loc.city),
        state: toStr(loc.state),
        pincode: toStr(loc.pincode),
        landmark: toStr(loc.landmark),
        cuisines: Array.isArray(body.cuisines) ? body.cuisines : [],
        openingTime: normalizedOpeningTime,
        closingTime: normalizedClosingTime,
        openDays: Array.isArray(body.openDays) ? body.openDays : [],
        panNumber: toStr(body.panNumber),
        nameOnPan: toStr(body.nameOnPan),
        gstRegistered: Boolean(body.gstRegistered),
        gstNumber: toStr(body.gstNumber),
        gstLegalName: toStr(body.gstLegalName),
        gstAddress: toStr(body.gstAddress),
        fssaiNumber: toStr(body.fssaiNumber),
        fssaiExpiry: body.fssaiExpiry ? new Date(body.fssaiExpiry) : undefined,
        accountNumber: toStr(body.accountNumber),
        ifscCode: toStr(body.ifscCode),
        accountHolderName: toStr(body.accountHolderName),
        accountType: toStr(body.accountType),
        menuImages: menuUrls,
        profileImage: toUrl(body.profileImage),
        panImage: toUrl(body.panImage),
        gstImage: toUrl(body.gstImage),
        fssaiImage: toUrl(body.fssaiImage),
        estimatedDeliveryTime: toStr(body.estimatedDeliveryTime),
        featuredDish: toStr(body.featuredDish),
        featuredPrice: typeof body.featuredPrice === 'number' ? body.featuredPrice : (parseFloat(body.featuredPrice) || undefined),
        offer: toStr(body.offer),
        status: 'approved',
        approvedAt: new Date()
    };

    if (body.zoneId !== undefined) {
        const zoneId = String(body.zoneId || '').trim();
        if (!zoneId) {
            doc.zoneId = undefined;
        } else if (!mongoose.Types.ObjectId.isValid(zoneId)) {
            throw new ValidationError('Invalid zoneId');
        } else {
            doc.zoneId = new mongoose.Types.ObjectId(zoneId);
        }
    }

    if (latitude !== null && longitude !== null) {
        doc.location = {
            type: 'Point',
            coordinates: [longitude, latitude],
            latitude,
            longitude,
            formattedAddress: toStr(loc.formattedAddress || loc.address || loc.addressLine1),
            address: toStr(loc.address || loc.formattedAddress || loc.addressLine1),
            addressLine1: toStr(loc.addressLine1 || loc.formattedAddress || loc.address),
            addressLine2: toStr(loc.addressLine2),
            area: toStr(loc.area),
            city: toStr(loc.city),
            state: toStr(loc.state),
            pincode: toStr(loc.pincode || loc.zipCode || loc.postalCode),
            landmark: toStr(loc.landmark),
        };
    }

    if (!doc.restaurantName || !doc.ownerName) {
        throw new ValidationError('Restaurant name and owner name are required');
    }
    if (!doc.ownerPhone && !doc.primaryContactNumber) {
        throw new ValidationError('Owner phone or primary contact number is required');
    }

    const restaurant = await FoodRestaurant.create(doc);
    return restaurant.toObject();
}

export async function approveRestaurant(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodRestaurant.findByIdAndUpdate(
        id,
        {
            $set: {
                status: 'approved',
                approvedAt: new Date(),
                rejectedAt: undefined,
                rejectionReason: undefined
            }
        },
        { new: true, runValidators: false }
    ).lean();

    if (updated) {
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated._id }],
                {
                    title: 'Congratulations! ðŸŽ‰',
                    body: `Your restaurant "${updated.restaurantName}" has been approved. You can now start receiving orders!`,
                    image: updated.profileImage || 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'restaurant_approved',
                        restaurantId: String(updated._id)
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send restaurant approval notification:', e);
        }
    }
    return updated;
}

export async function rejectRestaurant(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodRestaurant.findByIdAndUpdate(
        id,
        {
            $set: {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectionReason: typeof reason === 'string' ? reason.trim() : undefined,
                approvedAt: null
            }
        },
        { new: true, runValidators: false }
    ).lean();

    if (updated) {
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: updated._id }],
                {
                    title: 'Update on Registration ðŸ“‹',
                    body: `Your restaurant registration for "${updated.restaurantName}" has been rejected. Reason: ${reason || 'Incomplete documents'}.`,
                    image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'restaurant_rejected',
                        restaurantId: String(updated._id),
                        reason: reason || ''
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send restaurant rejection notification:', e);
        }
    }
    return updated;
}

// ----- Offers & Coupons -----
export async function getAllOffers(_query = {}) {
    const list = await FoodOffer.find({})
        .sort({ createdAt: -1 })
        .populate({ path: 'restaurantId', select: 'restaurantName' })
        .lean();

    const offers = list.map((o, index) => {
        const now = Date.now();
        const endTs = o.endDate ? new Date(o.endDate).getTime() : null;
        const isExpired = Boolean(endTs && now >= endTs);
        const restaurantName =
            o.restaurantScope === 'selected'
                ? (o.restaurantId?.restaurantName || 'Selected Restaurant')
                : 'All Restaurants';

        const discountPercentage = o.discountType === 'percentage' ? Number(o.discountValue) : 0;

        const originalPrice = o.discountType === 'flat-price' ? Number(o.discountValue) : 0;
        const discountedPrice = 0;

        return {
            sl: index + 1,
            offerId: String(o._id),
            dishId: 'all',
            restaurantName,
            dishName: 'All Items',
            couponCode: o.couponCode,
            customerGroup: o.customerScope === 'first-time' ? 'new' : 'all',
            discountType: o.discountType,
            discountPercentage,
            originalPrice,
            discountedPrice,
            status: isExpired ? 'inactive' : (o.status || 'active'),
            showInCart: o.showInCart !== false,
            endDate: o.endDate || null,
            // Additional info for admin UI (backward compatible)
            minOrderValue: o.minOrderValue ?? 0,
            maxDiscount: o.maxDiscount ?? null,
            usageLimit: o.usageLimit ?? null,
            usedCount: o.usedCount ?? 0,
            restaurantScope: o.restaurantScope,
            restaurantId: o.restaurantId?._id ? String(o.restaurantId._id) : (o.restaurantId ? String(o.restaurantId) : ""),
            isFirstOrderOnly: !!o.isFirstOrderOnly,
            startDate: o.startDate || null,
            perUserLimit: o.perUserLimit ?? null,
            approvalStatus: o.approvalStatus || 'approved',
            createdByRestaurantId: o.createdByRestaurantId ? String(o.createdByRestaurantId) : null,
            rejectionReason: o.rejectionReason || ''
        };
    });

    return { offers };
}

export async function createAdminOffer(body) {
    const existing = await FoodOffer.findOne({ couponCode: body.couponCode }).lean();
    if (existing) {
        throw new ValidationError('Coupon code already exists');
    }

    const doc = await FoodOffer.create({
        couponCode: body.couponCode,
        discountType: body.discountType,
        discountValue: body.discountValue,
        customerScope: body.customerScope,
        restaurantScope: body.restaurantScope,
        restaurantId: body.restaurantScope === 'selected' ? body.restaurantId : undefined,
        minOrderValue: body.minOrderValue ?? 0,
        maxDiscount: body.maxDiscount ?? null,
        usageLimit: body.usageLimit ?? null,
        perUserLimit: body.perUserLimit ?? null,
        startDate: body.startDate,
        isFirstOrderOnly: body.isFirstOrderOnly ?? false,
        endDate: body.endDate,
        approvalStatus: 'approved',
        createdByRestaurantId: null,
        rejectionReason: '',
        status: body.endDate && new Date(body.endDate).getTime() <= Date.now() ? 'inactive' : 'active',
        showInCart: true
    });

    if (doc.restaurantScope === 'selected' && doc.restaurantId) {
        try {
            const { notifyOwnersSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnersSafely(
                [{ ownerType: 'RESTAURANT', ownerId: doc.restaurantId }],
                {
                    title: 'New Campaign Invitation! ðŸ“¢',
                    body: `You have been invited to join a new campaign: "${doc.couponCode}". Check it out now!`,
                    image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'campaign_invitation',
                        offerId: String(doc._id),
                        couponCode: doc.couponCode
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send campaign invitation notification:', e);
        }
    }

    return doc.toObject();
}

export async function updateAdminOfferCartVisibility(offerId, itemId, showInCart) {
    if (!offerId || !mongoose.Types.ObjectId.isValid(offerId)) return null;
    if (!itemId) return null;
    const updated = await FoodOffer.findByIdAndUpdate(
        offerId,
        { $set: { showInCart: Boolean(showInCart) } },
        { new: true }
    ).lean();
    return updated;
}

export async function updateAdminOffer(id, body) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

    const updateData = {
        couponCode: body.couponCode,
        discountType: body.discountType,
        discountValue: body.discountValue,
        customerScope: body.customerScope,
        restaurantScope: body.restaurantScope,
        restaurantId: body.restaurantScope === 'selected' ? body.restaurantId : undefined,
        minOrderValue: body.minOrderValue ?? 0,
        maxDiscount: body.maxDiscount ?? null,
        usageLimit: body.usageLimit ?? null,
        perUserLimit: body.perUserLimit ?? null,
        startDate: body.startDate,
        isFirstOrderOnly: body.isFirstOrderOnly ?? false,
        endDate: body.endDate,
        status: body.endDate && new Date(body.endDate).getTime() <= Date.now() ? 'inactive' : 'active',
        approvalStatus: 'approved',
        rejectionReason: ''
    };

    const updated = await FoodOffer.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
    ).lean();

    return updated;
}

export async function deleteAdminOffer(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const deleted = await FoodOffer.findByIdAndDelete(id).lean();
    if (!deleted) return null;
    await FoodOfferUsage.deleteMany({ offerId: new mongoose.Types.ObjectId(id) });
    return { id };
}

export async function getPendingRestaurantOffers(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const filter = { approvalStatus: 'pending' };
    const [list, total] = await Promise.all([
        FoodOffer.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({ path: 'restaurantId', select: 'restaurantName' })
            .lean(),
        FoodOffer.countDocuments(filter)
    ]);

    const offers = list.map((o, idx) => ({
        _id: o._id,
        sl: skip + idx + 1,
        couponCode: o.couponCode,
        discountType: o.discountType,
        discountValue: o.discountValue,
        customerScope: o.customerScope,
        minOrderValue: o.minOrderValue ?? 0,
        maxDiscount: o.maxDiscount ?? null,
        usageLimit: o.usageLimit ?? null,
        perUserLimit: o.perUserLimit ?? null,
        startDate: o.startDate || null,
        endDate: o.endDate || null,
        restaurantId: o.restaurantId?._id ? String(o.restaurantId._id) : (o.restaurantId ? String(o.restaurantId) : null),
        restaurantName: o.restaurantId?.restaurantName || 'Selected Restaurant',
        createdByRestaurantId: o.createdByRestaurantId ? String(o.createdByRestaurantId) : null,
        createdAt: o.createdAt || null
    }));

    const pages = Math.ceil(total / limit) || 1;
    return {
        offers,
        pagination: { page, limit, total, pages }
    };
}

export async function getPendingRestaurantProductOffers(query = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;
    const filter = { approvalStatus: 'pending' };
    const [list, total] = await Promise.all([
        RestaurantOffer.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({ path: 'restaurantId', select: 'restaurantName' })
            .lean(),
        RestaurantOffer.countDocuments(filter)
    ]);

    const offers = list.map((o, idx) => ({
        _id: o._id,
        sl: skip + idx + 1,
        title: o.title,
        discountType: o.discountType,
        discountValue: o.discountValue,
        minOrderValue: o.minOrderValue ?? 0,
        maxDiscount: o.maxDiscount ?? null,
        usageLimit: o.usageLimit ?? null,
        perUserLimit: o.perUserLimit ?? null,
        startDate: o.startDate || null,
        endDate: o.endDate || null,
        restaurantId: o.restaurantId?._id ? String(o.restaurantId._id) : (o.restaurantId ? String(o.restaurantId) : null),
        restaurantName: o.restaurantId?.restaurantName || 'Selected Restaurant',
        createdAt: o.createdAt || null
    }));

    const pages = Math.ceil(total / limit) || 1;
    return { offers, pagination: { page, limit, total, pages } };
}

export async function approveRestaurantProductOffer(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return RestaurantOffer.findByIdAndUpdate(
        id,
        { $set: { approvalStatus: 'approved', status: 'active', rejectionReason: '' } },
        { new: true }
    ).lean();
}

export async function rejectRestaurantProductOffer(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return RestaurantOffer.findByIdAndUpdate(
        id,
        { $set: { approvalStatus: 'rejected', status: 'inactive', rejectionReason: String(reason || '').trim() } },
        { new: true }
    ).lean();
}

export async function approveRestaurantOffer(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodOffer.findByIdAndUpdate(
        id,
        {
            $set: {
                approvalStatus: 'approved',
                status: 'active',
                showInCart: true,
                restaurantScope: 'selected',
                rejectionReason: ''
            }
        },
        { new: true }
    ).lean();
    return updated;
}

export async function rejectRestaurantOffer(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodOffer.findByIdAndUpdate(
        id,
        {
            $set: {
                approvalStatus: 'rejected',
                status: 'inactive',
                rejectionReason: String(reason || '').trim()
            }
        },
        { new: true }
    ).lean();
    return updated;
}

export async function expireExpiredOffers() {
    const now = new Date();
    await FoodOffer.updateMany(
        { status: 'active', endDate: { $lte: now } },
        { $set: { status: 'inactive' } }
    );
}
// ----- Delivery join requests -----
export async function getDeliveryJoinRequests(query) {
    const { status = 'pending', page = 1, limit = 1000, search, zone, vehicleType } = query;
    const filter = {};
    if (status === 'pending') filter.status = 'pending';
    else if (status === 'denied' || status === 'rejected') filter.status = 'rejected';
    else filter.status = status;

    const andParts = [];
    if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim();
        andParts.push({
            $or: [
                { name: { $regex: term, $options: 'i' } },
                { phone: { $regex: term, $options: 'i' } }
            ]
        });
    }
    if (zone && zone.trim()) {
        const z = zone.trim();
        andParts.push({
            $or: [
                { city: { $regex: z, $options: 'i' } },
                { state: { $regex: z, $options: 'i' } },
                { address: { $regex: z, $options: 'i' } }
            ]
        });
    }
    if (andParts.length) filter.$and = andParts;
    if (vehicleType && vehicleType.trim()) {
        filter.vehicleType = { $regex: vehicleType.trim(), $options: 'i' };
    }

    const skip = Math.max(0, (Number(page) || 1) - 1) * Math.max(1, Math.min(1000, Number(limit) || 100));
    const limitNum = Math.max(1, Math.min(1000, Number(limit) || 100));

    const list = await FoodDeliveryPartner.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

    const requests = list.map((doc, index) => ({
        _id: doc._id,
        sl: skip + index + 1,
        name: doc.name || '',
        email: doc.email || '',
        phone: doc.phone || '',
        zone: doc.city || doc.state || doc.address || '',
        jobType: doc.jobType || '',
        vehicleType: doc.vehicleType || '',
        status: doc.status === 'rejected' ? 'denied' : doc.status,
        rejectionReason: doc.rejectionReason || undefined,
        profilePhoto: doc.profilePhoto || null,
        profileImage: doc.profilePhoto ? { url: doc.profilePhoto } : null
    }));

    return { requests };
}

export function getDeliveryWalletsStub() {
    return {
        wallets: [],
        pagination: { page: 1, limit: 100, total: 0, pages: 0 }
    };
}

// ----- Support tickets -----
export async function getSupportTicketStats() {
    const [open, inProgress, resolved, closed] = await Promise.all([
        DeliverySupportTicket.countDocuments({ status: 'open' }),
        DeliverySupportTicket.countDocuments({ status: 'in_progress' }),
        DeliverySupportTicket.countDocuments({ status: 'resolved' }),
        DeliverySupportTicket.countDocuments({ status: 'closed' })
    ]);
    return {
        total: open + inProgress + resolved + closed,
        open,
        inProgress,
        resolved,
        closed
    };
}

export async function getDeliverySupportTickets(query = {}) {
    const { status, priority, search, page = 1, limit = 100 } = query;
    const filter = {};
    if (status && String(status).trim()) filter.status = String(status).trim();
    if (priority && String(priority).trim()) filter.priority = String(priority).trim();
    if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim();
        filter.$or = [
            { subject: { $regex: term, $options: 'i' } },
            { description: { $regex: term, $options: 'i' } },
            { ticketId: { $regex: term, $options: 'i' } }
        ];
    }

    const skip = Math.max(0, (Number(page) || 1) - 1) * Math.max(1, Math.min(500, Number(limit) || 100));
    const limitNum = Math.max(1, Math.min(500, Number(limit) || 100));

    const [list, total] = await Promise.all([
        DeliverySupportTicket.find(filter)
            .populate('deliveryPartnerId', 'name phone email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),
        DeliverySupportTicket.countDocuments(filter)
    ]);

    const tickets = list.map((t) => ({
        _id: t._id,
        ticketId: t.ticketId,
        subject: t.subject,
        description: t.description,
        category: t.category,
        priority: t.priority,
        status: t.status,
        adminResponse: t.adminResponse,
        respondedAt: t.respondedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        deliveryPartner: t.deliveryPartnerId
            ? {
                _id: t.deliveryPartnerId._id,
                name: t.deliveryPartnerId.name || '',
                phone: t.deliveryPartnerId.phone || '',
                email: t.deliveryPartnerId.email || ''
            }
            : null
    }));

    return {
        tickets,
        pagination: {
            page: Number(page) || 1,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1
        }
    };
}

export async function updateDeliverySupportTicket(id, body = {}) {
    const ticket = await DeliverySupportTicket.findById(id);
    if (!ticket) return null;
    const { status, adminResponse } = body || {};
    if (status !== undefined) {
        const allowed = ['open', 'in_progress', 'resolved', 'closed'];
        if (allowed.includes(String(status))) ticket.status = String(status);
    }
    if (adminResponse !== undefined) {
        ticket.adminResponse = typeof adminResponse === 'string' ? adminResponse.trim() : '';
        if (ticket.adminResponse) ticket.respondedAt = new Date();
    }
    await ticket.save();
    return ticket.toObject();
}

// ----- Delivery partners (approved list) -----
export async function getDeliveryPartners(query, adminScope = {}) {
    const { page = 1, limit = 1000, search } = query;
    const filter = { status: 'approved' };
    const includeAvailability = String(query?.includeAvailability || '').toLowerCase() === 'true';
    const scope = normalizeAdminScope(adminScope);

    if (query?.zoneId && String(query.zoneId).trim()) {
        const zoneId = String(query.zoneId).trim();
        if (!mongoose.Types.ObjectId.isValid(zoneId)) {
            throw new ValidationError('Invalid zoneId');
        }
        if (scope.isSubAdmin) {
            assertZoneAccess(adminScope, zoneId);
        }
        filter.zoneId = new mongoose.Types.ObjectId(zoneId);
    } else if (scope.isSubAdmin) {
        if (!scope.zoneIds.length) {
            return {
                deliveryPartners: [],
                pagination: {
                    page: Number(page) || 1,
                    limit: Math.max(1, Math.min(1000, Number(limit) || 100)),
                    total: 0,
                    pages: 1
                }
            };
        }
        filter.zoneId = { $in: scope.zoneIds.map((zid) => new mongoose.Types.ObjectId(zid)) };
    }

    if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim();
        filter.$or = [
            { name: { $regex: term, $options: 'i' } },
            { phone: { $regex: term, $options: 'i' } },
            { email: { $regex: term, $options: 'i' } },
            { city: { $regex: term, $options: 'i' } },
            { state: { $regex: term, $options: 'i' } }
        ];
    }

    const skip = Math.max(0, (Number(page) || 1) - 1) * Math.max(1, Math.min(1000, Number(limit) || 100));
    const limitNum = Math.max(1, Math.min(1000, Number(limit) || 100));

    const [list, total] = await Promise.all([
        FoodDeliveryPartner.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('zoneId', 'name zoneName serviceLocation')
            .lean(),
        FoodDeliveryPartner.countDocuments(filter)
    ]);

    const deliveryPartners = list.map((doc, index) => ({
        _id: doc._id,
        sl: skip + index + 1,
        name: doc.name || '',
        email: doc.email || '',
        phone: doc.phone || '',
        deliveryId: doc._id ? `DP-${doc._id.toString().slice(-8).toUpperCase()}` : null,
        zoneId: doc.zoneId?._id || doc.zoneId || null,
        zone: doc.zoneId?.name || doc.zoneId?.zoneName || doc.zoneId?.serviceLocation || doc.city || doc.state || doc.address || '',
        vehicleType: doc.vehicleType || '',
        status: doc.status,
        availabilityStatus: doc.availabilityStatus || 'offline',
        lastLat: Number(doc?.lastLat) || 0,
        lastLng: Number(doc?.lastLng) || 0,
        lastLocationAt: doc?.lastLocationAt || null,
        ...(includeAvailability
            ? {
                availability: {
                    isOnline: String(doc?.availabilityStatus || '').toLowerCase() === 'online',
                    status: doc?.availabilityStatus || 'offline',
                    lastLocationUpdate: doc?.lastLocationAt || null,
                    currentLocation:
                        Array.isArray(doc?.lastLocation?.coordinates) && doc.lastLocation.coordinates.length >= 2
                            ? {
                                type: 'Point',
                                coordinates: doc.lastLocation.coordinates,
                                lastUpdate: doc?.lastLocationAt || null,
                            }
                            : (Number.isFinite(Number(doc?.lastLat)) && Number.isFinite(Number(doc?.lastLng))
                                ? {
                                    type: 'Point',
                                    coordinates: [Number(doc.lastLng), Number(doc.lastLat)],
                                    lastUpdate: doc?.lastLocationAt || null,
                                }
                                : null),
                },
            }
            : {}),
        profilePhoto: doc.profilePhoto || null,
        profileImage: doc.profilePhoto ? { url: doc.profilePhoto } : null
    }));

    return {
        deliveryPartners,
        pagination: {
            page: Number(page) || 1,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1
        }
    };
}

// ----- Delivery partner bonus (admin) -----
function generateBonusTransactionId() {
    const n = Date.now().toString(36).slice(-6).toUpperCase();
    const r = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `BON-${n}${r}`;
}

export async function getDeliveryPartnerBonusTransactions(query = {}) {
    const { page = 1, limit = 1000, search } = query;
    const filter = {};

    // For search (name/phone/email/transactionId) we do a two-step lookup to keep it simple.
    if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim();
        const partnerIds = await FoodDeliveryPartner.find({
            $or: [
                { name: { $regex: term, $options: 'i' } },
                { phone: { $regex: term, $options: 'i' } },
                { email: { $regex: term, $options: 'i' } }
            ]
        }).select('_id').lean();
        filter.$or = [
            { transactionId: { $regex: term, $options: 'i' } },
            { deliveryPartnerId: { $in: partnerIds.map((p) => p._id) } }
        ];
    }

    const skip = Math.max(0, (Number(page) || 1) - 1) * Math.max(1, Math.min(1000, Number(limit) || 100));
    const limitNum = Math.max(1, Math.min(1000, Number(limit) || 100));

    const [list, total] = await Promise.all([
        DeliveryBonusTransaction.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate({ path: 'deliveryPartnerId', select: 'name phone email' })
            .lean(),
        DeliveryBonusTransaction.countDocuments(filter)
    ]);

    const transactions = list.map((t, index) => {
        const partner = t.deliveryPartnerId;
        const partnerId = partner?._id ? String(partner._id) : null;
        return {
            sl: skip + index + 1,
            transactionId: t.transactionId,
            deliveryPartnerId: partnerId,
            deliveryId: partnerId ? `DP-${partnerId.slice(-8).toUpperCase()}` : null,
            deliveryman: partner?.name || '',
            amount: t.amount,
            bonus: t.amount, // legacy compatibility
            reference: t.reference || '',
            createdAt: t.createdAt
        };
    });

    return {
        transactions,
        pagination: {
            page: Number(page) || 1,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1
        }
    };
}

export async function addDeliveryPartnerBonus(body, adminUser) {
    const partner = await FoodDeliveryPartner.findById(body.deliveryPartnerId).lean();
    if (!partner) {
        throw new ValidationError('Delivery partner not found');
    }
    if (partner.status !== 'approved') {
        throw new ValidationError('Delivery partner must be approved');
    }

    let transactionId = generateBonusTransactionId();
    let exists = await DeliveryBonusTransaction.findOne({ transactionId }).lean();
    while (exists) {
        transactionId = generateBonusTransactionId();
        exists = await DeliveryBonusTransaction.findOne({ transactionId }).lean();
    }

    const created = await DeliveryBonusTransaction.create({
        deliveryPartnerId: body.deliveryPartnerId,
        transactionId,
        amount: body.amount,
        reference: body.reference || '',
        createdByAdminId: adminUser?._id
    });

    try {
        const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnerSafely(
            { ownerType: 'DELIVERY_PARTNER', ownerId: body.deliveryPartnerId },
            {
                title: 'Bonus Credited! ðŸŽŠ',
                body: `You have received a bonus of \u20B9${body.amount}. ${body.reference || 'Great job!'}`,
                image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                data: {
                    type: 'bonus_credited',
                    amount: String(body.amount),
                    transactionId: created.transactionId
                }
            }
        );
    } catch (e) {
        console.error('Failed to send bonus notification:', e);
    }

    return created.toObject();
}

// ----- Delivery Earnings (admin) -----
export async function getDeliveryEarnings(query = {}) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const limit = Math.max(1, Math.min(1000, parseInt(query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = {
        'dispatch.deliveryPartnerId': { $ne: null }
    };

    // Date range filters
    const createdAtFilter = {};
    if (query.fromDate) {
        const from = new Date(query.fromDate);
        if (!Number.isNaN(from.getTime())) {
            from.setHours(0, 0, 0, 0);
            createdAtFilter.$gte = from;
        }
    }
    if (query.toDate) {
        const to = new Date(query.toDate);
        if (!Number.isNaN(to.getTime())) {
            to.setHours(23, 59, 59, 999);
            createdAtFilter.$lte = to;
        }
    }

    // Period filters (only when explicit date range is not provided)
    if (!createdAtFilter.$gte && !createdAtFilter.$lte) {
        const period = String(query.period || 'all').trim().toLowerCase();
        const now = new Date();
        if (period === 'today') {
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now);
            end.setHours(23, 59, 59, 999);
            createdAtFilter.$gte = start;
            createdAtFilter.$lte = end;
        } else if (period === 'week') {
            const start = new Date(now);
            start.setHours(0, 0, 0, 0);
            start.setDate(start.getDate() - start.getDay()); // Sunday
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            createdAtFilter.$gte = start;
            createdAtFilter.$lte = end;
        } else if (period === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            start.setHours(0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
            createdAtFilter.$gte = start;
            createdAtFilter.$lte = end;
        }
    }

    if (createdAtFilter.$gte || createdAtFilter.$lte) {
        filter.createdAt = createdAtFilter;
    }

    if (query.deliveryPartnerId && mongoose.Types.ObjectId.isValid(query.deliveryPartnerId)) {
        filter['dispatch.deliveryPartnerId'] = new mongoose.Types.ObjectId(query.deliveryPartnerId);
    }

    const search = String(query.search || '').trim();
    if (search) {
        const regex = new RegExp(search, 'i');

        const [partners, restaurants] = await Promise.all([
            FoodDeliveryPartner.find({
                $or: [{ name: regex }, { phone: regex }, { email: regex }]
            }).select('_id').lean(),
            FoodRestaurant.find({
                $or: [{ restaurantName: regex }, { name: regex }]
            }).select('_id').lean()
        ]);

        const partnerIds = partners.map((p) => p._id);
        const restaurantIds = restaurants.map((r) => r._id);

        filter.$or = [
            { orderId: regex },
            { 'dispatch.deliveryPartnerId': { $in: partnerIds } },
            { restaurantId: { $in: restaurantIds } }
        ];
    }

    const [orders, total, earningsAgg, distinctPartners] = await Promise.all([
        FoodOrder.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('orderId orderStatus createdAt pricing riderEarning deliveryPartnerSettlement dispatch.deliveryPartnerId restaurantId payment paymentMethod')
            .populate({ path: 'dispatch.deliveryPartnerId', select: 'name phone' })
            .populate({ path: 'restaurantId', select: 'restaurantName name' })
            .lean(),
        FoodOrder.countDocuments(filter),
        FoodOrder.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalEarnings: {
                        $sum: {
                            $ifNull: [
                                '$riderEarning',
                                {
                                    $ifNull: [
                                        '$deliveryPartnerSettlement',
                                        { $ifNull: ['$pricing.deliveryFee', 0] }
                                    ]
                                }
                            ]
                        }
                    },
                    totalOrders: { $sum: 1 }
                }
            }
        ]),
        FoodOrder.distinct('dispatch.deliveryPartnerId', filter)
    ]);

    const earnings = orders.map((order) => {
        const partner = order?.dispatch?.deliveryPartnerId;
        const amount = Number(
            order?.riderEarning ??
            order?.deliveryPartnerSettlement ??
            order?.pricing?.deliveryFee ??
            0
        ) || 0;

        return {
            transactionId: String(order._id),
            orderId: order.orderId || 'N/A',
            deliveryPartnerId: partner?._id ? String(partner._id) : null,
            deliveryPartnerName: partner?.name || 'N/A',
            deliveryPartnerPhone: partner?.phone || 'N/A',
            restaurantName: order?.restaurantId?.restaurantName || order?.restaurantId?.name || 'N/A',
            paymentMethod: order?.payment?.method || order?.paymentMethod || '',
            amount,
            orderTotal: Number(order?.pricing?.total || 0) || 0,
            deliveryFee: Number(order?.pricing?.deliveryFee || 0) || 0,
            orderStatus: order?.orderStatus || 'N/A',
            createdAt: order?.createdAt || null
        };
    });

    const agg = earningsAgg?.[0] || {};
    const totalDeliveryPartners = (distinctPartners || []).filter(Boolean).length;

    return {
        earnings,
        summary: {
            totalDeliveryPartners,
            totalEarnings: Number(agg.totalEarnings || 0),
            totalOrders: Number(agg.totalOrders || 0)
        },
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit) || 1
        }
    };
}

// ----- Earning Addon Offers (admin) -----
export async function getEarningAddons() {
    const list = await FoodEarningAddon.find({})
        .sort({ createdAt: -1 })
        .lean();

    const now = Date.now();
    const earningAddons = list.map((a) => {
        const start = a.startDate ? new Date(a.startDate).getTime() : 0;
        const end = a.endDate ? new Date(a.endDate).getTime() : 0;
        const isValid = Boolean(a.status === 'active' && start && end && now >= start && now <= end);
        const isExpired = Boolean(end && now > end);

        return {
            ...a,
            isValid,
            status: isExpired ? 'expired' : (a.status || 'inactive')
        };
    });

    return { earningAddons };
}

export async function createEarningAddon(body) {
    const created = await FoodEarningAddon.create({
        title: body.title,
        requiredOrders: body.requiredOrders,
        earningAmount: body.earningAmount,
        startDate: body.startDate,
        endDate: body.endDate,
        maxRedemptions: body.maxRedemptions ?? null,
        status: 'active'
    });
    return created.toObject();
}

export async function updateEarningAddon(id, body) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const doc = await FoodEarningAddon.findById(id);
    if (!doc) return null;
    doc.title = body.title;
    doc.requiredOrders = body.requiredOrders;
    doc.earningAmount = body.earningAmount;
    doc.startDate = body.startDate;
    doc.endDate = body.endDate;
    doc.maxRedemptions = body.maxRedemptions ?? null;
    await doc.save();
    return doc.toObject();
}

export async function deleteEarningAddon(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const deleted = await FoodEarningAddon.findByIdAndDelete(id).lean();
    return deleted ? { id } : null;
}

export async function toggleEarningAddonStatus(id, status) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    return FoodEarningAddon.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
}

// ----- Earning Addon History (admin) -----
export async function getEarningAddonHistory(query = {}) {
    const { page = 1, limit = 1000, search } = query;
    const filter = {};

    // Optional search by delivery partner name/phone/email or offer title.
    // Keep it simple and fast: only apply when search is provided.
    let partnerIds = null;
    let offerIds = null;
    if (search && typeof search === 'string' && search.trim()) {
        const term = search.trim();
        partnerIds = await FoodDeliveryPartner.find({
            $or: [
                { name: { $regex: term, $options: 'i' } },
                { phone: { $regex: term, $options: 'i' } },
                { email: { $regex: term, $options: 'i' } }
            ]
        }).select('_id').lean();
        offerIds = await FoodEarningAddon.find({ title: { $regex: term, $options: 'i' } }).select('_id').lean();
        filter.$or = [
            { deliveryPartnerId: { $in: (partnerIds || []).map((p) => p._id) } },
            { offerId: { $in: (offerIds || []).map((o) => o._id) } }
        ];
    }

    const skip = Math.max(0, (Number(page) || 1) - 1) * Math.max(1, Math.min(1000, Number(limit) || 100));
    const limitNum = Math.max(1, Math.min(1000, Number(limit) || 100));

    const [list, total] = await Promise.all([
        FoodEarningAddonHistory.find(filter)
            .sort({ completedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate({ path: 'deliveryPartnerId', select: 'name phone email' })
            .populate({ path: 'offerId', select: 'title requiredOrders earningAmount' })
            .lean(),
        FoodEarningAddonHistory.countDocuments(filter)
    ]);

    const history = list.map((h, index) => {
        const partner = h.deliveryPartnerId;
        const offer = h.offerId;
        const partnerId = partner?._id ? String(partner._id) : null;
        return {
            _id: h._id,
            sl: skip + index + 1,
            deliveryPartnerId: partnerId,
            deliveryId: partnerId ? `DP-${partnerId.slice(-8).toUpperCase()}` : null,
            deliveryman: partner?.name || '',
            deliveryPhone: partner?.phone || 'N/A',
            offerTitle: offer?.title || '',
            ordersCompleted: h.ordersCompleted ?? 0,
            ordersRequired: h.ordersRequired ?? offer?.requiredOrders ?? 0,
            earningAmount: h.earningAmount ?? offer?.earningAmount ?? 0,
            totalEarning: h.totalEarning ?? h.earningAmount ?? 0,
            status: h.status || 'pending',
            date: h.completedAt || h.createdAt,
            completedAt: h.completedAt || h.createdAt
        };
    });

    return {
        history,
        pagination: {
            page: Number(page) || 1,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum) || 1
        }
    };
}

export async function creditEarningAddonHistory(historyId, notes) {
    if (!historyId || !mongoose.Types.ObjectId.isValid(historyId)) return null;
    const doc = await FoodEarningAddonHistory.findById(historyId).populate('offerId');
    if (!doc) return null;
    if (doc.status !== 'pending') return doc.toObject();

    const amountToCredit = Number(doc.earningAmount || 0);

    // 1. Update history status
    doc.status = 'credited';
    doc.creditedAt = new Date();
    doc.creditedNotes = typeof notes === 'string' ? notes.trim() : '';
    await doc.save();

    // 2. Credit the wallet
    if (amountToCredit > 0) {
        await FoodDeliveryWallet.findOneAndUpdate(
            { deliveryPartnerId: doc.deliveryPartnerId },
            { $inc: { balance: amountToCredit, totalEarnings: amountToCredit } },
            { upsert: true }
        );

        // 3. Create a transaction for ledger
        try {
            await DeliveryBonusTransaction.create({
                deliveryPartnerId: doc.deliveryPartnerId,
                transactionId: `ADDON-${String(doc._id).slice(-8).toUpperCase()}-${Date.now().toString().slice(-4)}`,
                amount: amountToCredit,
                reference: `Earning Addon: ${doc.offerId?.title || 'Offer Reward'}`
            });
        } catch (txnError) {
            console.error('Failed to create bonus transaction:', txnError);
            // Non-blocking but should be logged.
        }
    }

    try {
        const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnerSafely(
            { ownerType: 'DELIVERY_PARTNER', ownerId: doc.deliveryPartnerId },
            {
                title: 'Incentive Credited! ðŸŽ¯',
                body: `Your incentive for "${doc.offerId?.title || 'Earning Addon'}" has been approved and moved to your pocket.`,
                image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                data: {
                    type: 'incentive_credited',
                    historyId: String(doc._id),
                    amount: String(doc.earningAmount || 0)
                }
            }
        );
    } catch (e) {
        console.error('Failed to send incentive credited notification:', e);
    }

    return doc.toObject();
}

export async function cancelEarningAddonHistory(historyId, reason) {
    if (!historyId || !mongoose.Types.ObjectId.isValid(historyId)) return null;
    const doc = await FoodEarningAddonHistory.findById(historyId).populate('offerId');
    if (!doc) return null;
    if (doc.status !== 'pending') return doc.toObject();
    doc.status = 'cancelled';
    doc.cancelledAt = new Date();
    doc.cancelReason = typeof reason === 'string' ? reason.trim() : '';
    await doc.save();

    try {
        const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnerSafely(
            { ownerType: 'DELIVERY_PARTNER', ownerId: doc.deliveryPartnerId },
            {
                title: 'Incentive Update ðŸ“‹',
                body: `Your incentive request for "${doc.offerId?.title || 'Earning Addon'}" was not approved. Reason: ${doc.cancelReason || 'Ineligible'}`,
                image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                data: {
                    type: 'incentive_rejected',
                    historyId: String(doc._id),
                    reason: doc.cancelReason
                }
            }
        );
    } catch (e) {
        console.error('Failed to send incentive rejection notification:', e);
    }

    return doc.toObject();
}

export async function checkEarningAddonCompletions(deliveryPartnerId, _force = false) {
    const now = new Date();
    
    // Only search for active offers that are currently running.
    const activeOffers = await FoodEarningAddon.find({
        status: 'active',
        startDate: { $lte: now },
        endDate: { $gte: now }
    }).lean();

    if (activeOffers.length === 0) return { completionsFound: 0 };

    let partnerIds = [];
    if (deliveryPartnerId === 'all') {
        const partners = await FoodDeliveryPartner.find({ status: 'approved' }).select('_id').lean();
        partnerIds = partners.map(p => p._id);
    } else if (deliveryPartnerId && mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        partnerIds = [deliveryPartnerId];
    }

    if (partnerIds.length === 0) return { completionsFound: 0 };

    let globalCompletions = 0;

    for (const pId of partnerIds) {
        for (const offer of activeOffers) {
            // Find existing history so we don't grant it twice for the same offer.
            const existing = await FoodEarningAddonHistory.findOne({
                deliveryPartnerId: pId,
                offerId: offer._id,
                status: { $in: ['pending', 'credited'] }
            }).lean();

            if (existing) continue;

            // Count orders delivered by this partner during the offer period.
            const orderCount = await FoodOrder.countDocuments({
                'dispatch.deliveryPartnerId': pId,
                orderStatus: 'delivered',
                createdAt: { $gte: offer.startDate, $lte: offer.endDate }
            });

            if (orderCount >= (offer.requiredOrders || 1)) {
                // Requirement met!
                await FoodEarningAddonHistory.create({
                    offerId: offer._id,
                    deliveryPartnerId: pId,
                    ordersCompleted: orderCount,
                    ordersRequired: offer.requiredOrders,
                    earningAmount: offer.earningAmount,
                    totalEarning: offer.earningAmount,
                    status: 'pending',
                    completedAt: now
                });
                
                // Update current redemptions in addon
                await FoodEarningAddon.findByIdAndUpdate(offer._id, { $inc: { currentRedemptions: 1 } });
                
                globalCompletions++;
            }
        }
    }

    return { completionsFound: globalCompletions };
}

export async function getDeliveryPartnerById(id) {
    const partner = await FoodDeliveryPartner.findById(id).lean();
    if (!partner) return null;
    const deliveryId = partner._id ? `DP-${partner._id.toString().slice(-8).toUpperCase()}` : null;
    return {
        ...partner,
        email: partner.email || null,
        deliveryId,
        status: partner.status === 'rejected' ? 'blocked' : partner.status,
        profileImage: partner.profilePhoto ? { url: partner.profilePhoto } : null,
        documents: {
            aadhar: (partner.aadharPhoto || partner.aadharNumber)
                ? { number: partner.aadharNumber || null, document: partner.aadharPhoto || null }
                : null,
            pan: (partner.panPhoto || partner.panNumber)
                ? { number: partner.panNumber || null, document: partner.panPhoto || null }
                : null,
            drivingLicense: partner.drivingLicensePhoto ? { document: partner.drivingLicensePhoto } : null,
            bankDetails:
                partner.bankAccountHolderName || partner.bankAccountNumber || partner.bankIfscCode || partner.bankName
                    ? {
                        accountHolderName: partner.bankAccountHolderName || null,
                        accountNumber: partner.bankAccountNumber || null,
                        ifscCode: partner.bankIfscCode || null,
                        bankName: partner.bankName || null
                    }
                    : null
        },
        location: (partner.address || partner.city || partner.state)
            ? { addressLine1: partner.address, city: partner.city, state: partner.state }
            : null,
        vehicle: (partner.vehicleType || partner.vehicleName || partner.vehicleNumber)
            ? {
                type: partner.vehicleType,
                brand: partner.vehicleName,
                model: partner.vehicleName,
                number: partner.vehicleNumber
            }
            : null
    };
}

export async function getDeliverymanReviews(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {
        'ratings.deliveryPartner.rating': { $exists: true, $ne: null }
    };

    if (query.search && String(query.search).trim()) {
        const term = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchRegex = new RegExp(term, 'i');
        
        // Find delivery partners matching search
        const partners = await FoodDeliveryPartner.find({
            $or: [
                { name: searchRegex },
                { phone: searchRegex }
            ]
        }).select('_id').lean();
        
        // Find customers matching search
        const customers = await FoodUser.find({
            $or: [
                { name: searchRegex },
                { email: searchRegex }
            ]
        }).select('_id').lean();

        filter.$or = [
            { orderId: searchRegex },
            { 'ratings.deliveryPartner.comment': searchRegex },
            { 'dispatch.deliveryPartnerId': { $in: partners.map(p => p._id) } },
            { userId: { $in: customers.map(c => c._id) } }
        ];
    }

    const [docs, total] = await Promise.all([
        FoodOrder.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'name email phone')
            .populate('dispatch.deliveryPartnerId', 'name phone')
            .select('orderId userId dispatch.deliveryPartnerId ratings.deliveryPartner createdAt deliveryState.deliveredAt')
            .lean(),
        FoodOrder.countDocuments(filter)
    ]);

    const reviews = docs.map((doc, index) => ({
        sl: skip + index + 1,
        orderId: doc.orderId,
        deliveryman: doc.dispatch?.deliveryPartnerId?.name || 'Unknown',
        deliverymanId: doc.dispatch?.deliveryPartnerId?._id || 'N/A',
        deliverymanPhone: doc.dispatch?.deliveryPartnerId?.phone || 'N/A',
        customer: doc.userId?.name || 'Unknown',
        customerId: doc.userId?._id || 'N/A',
        customerPhone: doc.userId?.phone || 'N/A',
        review: doc.ratings?.deliveryPartner?.comment || '',
        rating: doc.ratings?.deliveryPartner?.rating || 0,
        submittedAt: doc.createdAt,
        deliveredAt: doc.deliveryState?.deliveredAt
    }));

    return { reviews, total, page, limit };
}

export async function approveDeliveryPartner(id) {
    const partner = await FoodDeliveryPartner.findById(id);
    if (!partner) return null;
    partner.status = 'approved';
    partner.approvedAt = new Date();
    partner.rejectedAt = undefined;
    partner.rejectionReason = undefined;
    await partner.save();

    try {
        const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
        await notifyOwnerSafely(
            { ownerType: 'DELIVERY_PARTNER', ownerId: partner._id },
            {
                title: 'Welcome Aboard! ðŸš²',
                body: `Your delivery partner application has been approved. You can now go online and start earning!`,
                image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                data: {
                    type: 'onboarding_approved',
                    partnerId: String(partner._id)
                }
            }
        );
    } catch (e) {
        console.error('Failed to send delivery partner approval notification:', e);
    }

    // Referral crediting: on approval, credit the referrer partner's pocket balance via DeliveryBonusTransaction.
    try {
        const referrerId = partner.referredBy ? String(partner.referredBy) : '';
        if (referrerId && mongoose.Types.ObjectId.isValid(referrerId)) {
            const already = await FoodReferralLog.findOne({ refereeId: partner._id, role: 'DELIVERY_PARTNER' }).lean();
            if (!already) {
                const settingsDoc = await FoodReferralSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
                const reward = Math.max(0, Number(settingsDoc?.referralRewardDelivery) || 0);
                const limit = Math.max(0, Number(settingsDoc?.referralLimitDelivery) || 0);
                const referrer = await FoodDeliveryPartner.findById(referrerId).select('_id referralCount status').lean();

                if (referrer && referrer.status === 'approved' && reward > 0 && limit > 0 && Number(referrer.referralCount || 0) < limit) {
                    const log = await FoodReferralLog.create({
                        referrerId: referrer._id,
                        refereeId: partner._id,
                        role: 'DELIVERY_PARTNER',
                        rewardAmount: reward,
                        status: 'credited'
                    });

                    await Promise.all([
                        FoodDeliveryPartner.updateOne({ _id: referrer._id }, { $inc: { referralCount: 1 } }),
                        addDeliveryPartnerBonus(
                            { deliveryPartnerId: String(referrer._id), amount: reward, reference: 'Referral bonus' },
                            null
                        )
                    ]);
                } else {
                    await FoodReferralLog.create({
                        referrerId: new mongoose.Types.ObjectId(referrerId),
                        refereeId: partner._id,
                        role: 'DELIVERY_PARTNER',
                        rewardAmount: reward,
                        status: 'rejected',
                        reason: !referrer ? 'referrer_not_found' : reward <= 0 ? 'reward_disabled' : limit <= 0 ? 'limit_disabled' : 'limit_reached'
                    });
                }
            }
        }
    } catch (e) {
        // Never fail approval due to referral errors.
        // eslint-disable-next-line no-console
        console.warn('Referral crediting failed (delivery approval):', e?.message || e);
    }
    return partner.toObject();
}

export async function rejectDeliveryPartner(id, reason) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
    const updated = await FoodDeliveryPartner.findByIdAndUpdate(
        id,
        {
            $set: {
                status: 'rejected',
                rejectedAt: new Date(),
                rejectionReason: typeof reason === 'string' ? reason.trim() : undefined,
                approvedAt: null
            }
        },
        { new: true }
    ).lean();

    if (updated) {
        try {
            const { notifyOwnerSafely } = await import('../../../../core/notifications/firebase.service.js');
            await notifyOwnerSafely(
                { ownerType: 'DELIVERY_PARTNER', ownerId: updated._id },
                {
                    title: 'Onboarding Update ðŸ“‹',
                    body: `Your application to join as a delivery partner was rejected. Reason: ${reason || 'Incomplete documents'}.`,
                    image: 'https://i.ibb.co/3m2Yh7r/Appzeto-Brand-Image.png',
                    data: {
                        type: 'onboarding_rejected',
                        partnerId: String(updated._id),
                        reason: reason || ''
                    }
                }
            );
        } catch (e) {
            console.error('Failed to send delivery partner rejection notification:', e);
        }
    }
    return updated;
}

export async function updateDeliveryPartnerZone(id, zoneId, adminScope = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;

    const partner = await FoodDeliveryPartner.findById(id);
    if (!partner) return null;

    const rawZoneId = String(zoneId || '').trim();
    if (!rawZoneId) {
        throw new ValidationError('zoneId is required');
    }
    if (!mongoose.Types.ObjectId.isValid(rawZoneId)) {
        throw new ValidationError('Invalid zoneId');
    }

    assertZoneAccess(adminScope, rawZoneId);

    const zone = await FoodZone.findById(rawZoneId).select('_id isActive').lean();
    if (!zone) {
        throw new ValidationError('Zone not found');
    }
    if (zone.isActive === false) {
        throw new ValidationError('Cannot assign inactive zone');
    }

    partner.zoneId = new mongoose.Types.ObjectId(rawZoneId);
    await partner.save();

    return FoodDeliveryPartner.findById(partner._id)
        .populate('zoneId', 'name zoneName serviceLocation')
        .lean();
}

// ----- Zones CRUD -----
export async function getZones(query, adminScope = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 1000);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const isActive = query.isActive;
    const search = typeof query.search === 'string' ? query.search.trim() : '';

    const filter = {};
    if (isActive !== undefined && isActive !== '') {
        filter.isActive = isActive === 'true' || isActive === '1';
    }
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { zoneName: { $regex: search, $options: 'i' } },
            { serviceLocation: { $regex: search, $options: 'i' } },
            { country: { $regex: search, $options: 'i' } }
        ];
    }
    applyZoneConstraint(filter, adminScope, '_id');

    const [zones, total] = await Promise.all([
        FoodZone.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        FoodZone.countDocuments(filter)
    ]);
    return { zones, total, page, limit };
}

export async function getZoneById(id, adminScope = {}) {
    const zone = await FoodZone.findById(id).lean();
    if (!zone) return null;
    assertZoneAccess(adminScope, zone._id);
    return zone;
}

export async function createZone(body) {
    const name = typeof body.name === 'string' ? body.name.trim() : (body.zoneName && body.zoneName.trim()) || '';
    if (!name) return { error: 'Zone name is required' };
    const coordinates = Array.isArray(body.coordinates) ? body.coordinates : [];
    if (coordinates.length < 3) return { error: 'At least 3 coordinates (polygon points) are required' };

    const normalized = coordinates.map((c) => ({
        latitude: Number(c.latitude) || 0,
        longitude: Number(c.longitude) || 0
    }));

    const zone = new FoodZone({
        name,
        zoneName: body.zoneName && body.zoneName.trim() ? body.zoneName.trim() : name,
        country: (body.country && body.country.trim()) || 'India',
        serviceLocation: (body.serviceLocation && body.serviceLocation.trim()) || name,
        unit: body.unit === 'miles' ? 'miles' : 'kilometer',
        coordinates: normalized,
        isActive: body.isActive !== false
    });
    await zone.save();
    return { zone: zone.toObject() };
}

export async function updateZone(id, body) {
    const zone = await FoodZone.findById(id);
    if (!zone) return null;

    if (body.name !== undefined) zone.name = String(body.name).trim();
    if (body.zoneName !== undefined) zone.zoneName = String(body.zoneName).trim();
    if (body.country !== undefined) zone.country = String(body.country).trim();
    if (body.serviceLocation !== undefined) zone.serviceLocation = String(body.serviceLocation).trim();
    if (body.unit !== undefined) zone.unit = body.unit === 'miles' ? 'miles' : 'kilometer';
    if (body.isActive !== undefined) zone.isActive = body.isActive !== false;
    if (Array.isArray(body.coordinates) && body.coordinates.length >= 3) {
        zone.coordinates = body.coordinates.map((c) => ({
            latitude: Number(c.latitude) || 0,
            longitude: Number(c.longitude) || 0
        }));
    }
    if (zone.name) zone.serviceLocation = zone.serviceLocation || zone.name;

    await zone.save();
    return { zone: zone.toObject() };
}

export async function deleteZone(id) {
    const zone = await FoodZone.findByIdAndDelete(id);
    return zone ? { id } : null;
}

// ----- Admin Management -----
const normalizeAdminType = (value) => {
    const type = String(value || 'SUB_ADMIN').trim().toUpperCase();
    return type === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SUB_ADMIN';
};

const toObjectIdList = (values = []) => {
    if (!Array.isArray(values)) return [];
    return [...new Set(
        values
            .map((id) => String(id || '').trim())
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )].map((id) => new mongoose.Types.ObjectId(id));
};

export async function listAdmins(query = {}) {
    const search = String(query.search || '').trim();
    const status = String(query.status || '').trim().toLowerCase();
    const type = String(query.adminType || '').trim().toUpperCase();

    const filter = { role: 'ADMIN' };
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (type === 'SUPER_ADMIN' || type === 'SUB_ADMIN') filter.adminType = type;
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
        ];
    }

    const admins = await FoodAdmin.find(filter)
        .select('-password')
        .populate('zoneIds', 'name zoneName serviceLocation isActive')
        .sort({ createdAt: -1 })
        .lean();
    return { admins };
}

export async function createAdmin(body = {}, actor = {}) {
    if (!actor?.isSuperAdmin) {
        throw new ForbiddenError('Only super admin can create admins');
    }

    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    if (!email) throw new ValidationError('Email is required');
    if (!password || password.length < 6) throw new ValidationError('Password must be at least 6 characters');

    const existing = await FoodAdmin.findOne({ email }).select('_id').lean();
    if (existing) throw new ValidationError('Admin already exists with this email');

    const adminType = normalizeAdminType(body.adminType);
    const permissions = adminType === 'SUPER_ADMIN' ? [] : normalizeAdminPermissions(body.permissions || []);
    const zoneIds = adminType === 'SUPER_ADMIN' ? [] : toObjectIdList(body.zoneIds || []);

    if (adminType === 'SUB_ADMIN') {
        if (!permissions.length) throw new ValidationError('At least one sidebar permission is required for sub-admin');
        if (!zoneIds.length) throw new ValidationError('At least one zone is required for sub-admin');
    }

    const created = await FoodAdmin.create({
        email,
        password,
        name: String(body.name || '').trim(),
        phone: String(body.phone || '').trim(),
        role: 'ADMIN',
        adminType,
        permissions,
        zoneIds,
        isActive: body.isActive !== false,
        servicesAccess: ['food'],
    });

    return FoodAdmin.findById(created._id)
        .select('-password')
        .populate('zoneIds', 'name zoneName serviceLocation isActive')
        .lean();
}

export async function updateAdmin(id, body = {}, actor = {}) {
    if (!actor?.isSuperAdmin) {
        throw new ForbiddenError('Only super admin can update admins');
    }
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid admin id');

    const admin = await FoodAdmin.findById(id);
    if (!admin) throw new ValidationError('Admin not found');

    if (body.name !== undefined) admin.name = String(body.name || '').trim();
    if (body.phone !== undefined) admin.phone = String(body.phone || '').trim();
    if (body.email !== undefined) {
        const email = String(body.email || '').trim().toLowerCase();
        if (!email) throw new ValidationError('Email is required');
        const existing = await FoodAdmin.findOne({ email, _id: { $ne: admin._id } }).select('_id').lean();
        if (existing) throw new ValidationError('Email is already in use');
        admin.email = email;
    }
    if (body.password !== undefined) {
        const password = String(body.password || '').trim();
        if (!password || password.length < 6) throw new ValidationError('Password must be at least 6 characters');
        admin.password = password;
    }

    if (body.adminType !== undefined) {
        admin.adminType = normalizeAdminType(body.adminType);
    }

    if (body.isActive !== undefined) {
        admin.isActive = body.isActive !== false;
    }

    if (admin.adminType === 'SUPER_ADMIN') {
        admin.permissions = [];
        admin.zoneIds = [];
    } else {
        if (body.permissions !== undefined) {
            admin.permissions = normalizeAdminPermissions(body.permissions || []);
        }
        if (body.zoneIds !== undefined) {
            admin.zoneIds = toObjectIdList(body.zoneIds || []);
        }
        if (!admin.permissions?.length) throw new ValidationError('Sub-admin must have at least one permission');
        if (!admin.zoneIds?.length) throw new ValidationError('Sub-admin must have at least one assigned zone');
    }

    await admin.save();
    return FoodAdmin.findById(admin._id)
        .select('-password')
        .populate('zoneIds', 'name zoneName serviceLocation isActive')
        .lean();
}

export async function updateAdminStatus(id, body = {}, actor = {}) {
    if (!actor?.isSuperAdmin) {
        throw new ForbiddenError('Only super admin can update admin status');
    }
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid admin id');
    const updated = await FoodAdmin.findByIdAndUpdate(
        id,
        { $set: { isActive: body?.isActive !== false } },
        { new: true }
    )
        .select('-password')
        .populate('zoneIds', 'name zoneName serviceLocation isActive')
        .lean();
    if (!updated) throw new ValidationError('Admin not found');
    return updated;
}

export async function deleteAdmin(id, actor = {}) {
    if (!actor?.isSuperAdmin) {
        throw new ForbiddenError('Only super admin can delete admins');
    }
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid admin id');
    }
    if (String(actor.id || '') === String(id)) {
        throw new ValidationError('You cannot delete your own admin account');
    }

    const target = await FoodAdmin.findById(id).select('_id adminType').lean();
    if (!target) throw new ValidationError('Admin not found');

    if (String(target.adminType || '').toUpperCase() === 'SUPER_ADMIN') {
        const superAdminCount = await FoodAdmin.countDocuments({
            role: 'ADMIN',
            adminType: 'SUPER_ADMIN',
            isActive: true,
        });
        if (superAdminCount <= 1) {
            throw new ValidationError('Cannot delete the last active super admin');
        }
    }

    await FoodAdmin.deleteOne({ _id: target._id });
    return { id: String(target._id) };
}

// ----- Withdrawals (admin) -----
export async function getWithdrawals(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.status && query.status !== 'all') {
        filter.status = query.status.toLowerCase();
    }
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(query.restaurantId)) {
        filter.restaurantId = new mongoose.Types.ObjectId(query.restaurantId);
    }

    const [withdrawals, total] = await Promise.all([
        FoodRestaurantWithdrawal.find(filter)
            .populate('restaurantId', 'restaurantName profileImage ownerName phone ownerPhone accountHolderName accountNumber ifscCode accountType upiId upiQrImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodRestaurantWithdrawal.countDocuments(filter)
    ]);

    // UI expects status with first letter capitalized, and data in 'requests' key
    const requests = withdrawals.map((w) => ({
        ...w,
        id: w._id,
        restaurantName: w.restaurantId?.restaurantName || 'N/A',
        restaurantIdString: w.restaurantId ? `REST${w.restaurantId._id.toString().slice(-6).padStart(6, '0')}` : 'N/A',
        restaurantBankDetails: {
            accountHolderName: w.restaurantId?.accountHolderName || '',
            accountNumber: w.restaurantId?.accountNumber || '',
            ifscCode: w.restaurantId?.ifscCode || '',
            accountType: w.restaurantId?.accountType || '',
            upiId: w.restaurantId?.upiId || '',
            upiQrImage: w.restaurantId?.upiQrImage || ''
        },
        status: w.status.charAt(0).toUpperCase() + w.status.slice(1)
    }));

    return { requests, total, page, limit };
}

export async function updateWithdrawalStatus(id, { status, adminNote, rejectionReason, transactionId }) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid withdrawal ID');
    
    const normalizedStatus = String(status).toLowerCase();
    const update = {
        status: normalizedStatus,
        adminNote,
        rejectionReason,
        transactionId,
        processedAt: new Date()
    };

    const updated = await FoodRestaurantWithdrawal.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true }
    ).populate('restaurantId', 'restaurantName').lean();

    if (!updated) throw new ValidationError('Withdrawal request not found');

    // If approved, mark restaurant transactions as settled so they don't reappear in balance
    if (normalizedStatus === 'approved') {
        const restaurantId = updated.restaurantId?._id || updated.restaurantId;
        if (restaurantId) {
            await FoodTransaction.updateMany(
                { 
                    restaurantId, 
                    'settlement.isRestaurantSettled': { $ne: true },
                    status: { $in: ['captured', 'authorized'] }
                },
                { 
                    $set: { 
                        'settlement.isRestaurantSettled': true,
                        'settlement.restaurantSettledAt': new Date()
                    },
                    $push: {
                        history: {
                            kind: 'settled',
                            amount: 0,
                            at: new Date(),
                            note: `Settled via withdrawal ${id}`
                        }
                    }
                }
            );
        }
    }

    return updated;
}

export async function getDeliveryWithdrawals(query = {}) {
    const limit = parseInt(query.limit, 10) || 100;
    const page = parseInt(query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.status && query.status !== 'All') {
        filter.status = query.status.toLowerCase();
    }

    if (query.search) {
        // Search by amount or placeholder for name (name requires join usually)
        if (!isNaN(query.search)) {
            filter.amount = Number(query.search);
        }
    }

    const [withdrawals, total] = await Promise.all([
        FoodDeliveryWithdrawal.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('deliveryPartnerId', 'name phone profilePartnerId upiId upiQrCode')
            .lean(),
        FoodDeliveryWithdrawal.countDocuments(filter)
    ]);

    const requests = withdrawals.map((w) => ({
        ...w,
        id: w._id,
        deliveryName: w.deliveryPartnerId?.name || 'N/A',
        deliveryPhone: w.deliveryPartnerId?.phone || 'N/A',
        deliveryIdString: w.deliveryPartnerId?.profilePartnerId || 'N/A',
        status: w.status.charAt(0).toUpperCase() + w.status.slice(1)
    }));

    return { requests, total, page, limit };
}

export async function updateDeliveryWithdrawalStatus(id, { status, adminNote, rejectionReason, transactionId }) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid withdrawal ID');
    
    const update = {
        status: String(status).toLowerCase(),
        adminNote,
        rejectionReason,
        transactionId,
        processedAt: new Date()
    };

    const updated = await FoodDeliveryWithdrawal.findByIdAndUpdate(
        id,
        { $set: update },
        { new: true }
    ).populate('deliveryPartnerId', 'name phone profilePartnerId').lean();

    if (!updated) throw new ValidationError('Withdrawal request not found');

    // If approved, deduct from wallet balance
    if (status.toLowerCase() === 'approved' || status.toLowerCase() === 'processed') {
        const amount = Number(updated.amount || 0);
        if (amount > 0) {
            await FoodDeliveryWallet.findOneAndUpdate(
                { deliveryPartnerId: updated.deliveryPartnerId?._id || updated.deliveryPartnerId },
                { 
                    $inc: { 
                        balance: -amount,
                        totalSettled: amount 
                    } 
                }
            );
        }
    }

    return updated;
}

/**
 * Fetch delivery partner wallets with financial summary
 */
export async function getDeliveryWallets(query = {}) {
    const limit = parseInt(query.limit, 10) || 20;
    const page = parseInt(query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const filter = { status: 'approved' };
    if (query.search) {
        filter.$or = [
            { name: new RegExp(query.search, 'i') },
            { phone: new RegExp(query.search, 'i') }
        ];
    }

    const [partners, total] = await Promise.all([
        FoodDeliveryPartner.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodDeliveryPartner.countDocuments(filter)
    ]);

    const cashLimitSettings = await FoodDeliveryCashLimit.findOne({ isActive: true }).lean();
    const globalLimit = Number(cashLimitSettings?.deliveryCashLimit || 0);
    const COD_CASH_METHODS = ['cash', 'cod', 'cash_on_delivery'];

    const partnerIds = partners.map((p) => p?._id).filter(Boolean);

    const [cashCollectedAgg, payoutSettlementsAgg] = await Promise.all([
        FoodOrder.aggregate([
            {
                $match: {
                    'dispatch.deliveryPartnerId': { $in: partnerIds },
                    orderStatus: 'delivered',
                    'payment.method': { $in: COD_CASH_METHODS }
                }
            },
            {
                $group: {
                    _id: '$dispatch.deliveryPartnerId',
                    grossCashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } },
                    codOrderIds: { $addToSet: '$_id' }
                }
            }
        ]),
        FoodPayoutSettlement.aggregate([
            {
                $match: {
                    beneficiaryType: 'delivery',
                    status: 'paid',
                    beneficiaryId: { $in: partnerIds }
                }
            },
            {
                $group: {
                    _id: '$beneficiaryId',
                    totalPaidAmount: { $sum: { $ifNull: ['$paidAmount', 0] } }
                }
            }
        ])
    ]);

    const allCodOrderIds = (cashCollectedAgg || [])
        .flatMap((entry) => entry?.codOrderIds || [])
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

    const cashSettledAgg = allCodOrderIds.length
        ? await FoodPayoutSettlement.aggregate([
            {
                $match: {
                    beneficiaryType: 'delivery',
                    status: 'paid',
                    beneficiaryId: { $in: partnerIds },
                    codPaidAmount: { $gt: 0 },
                    transactionIds: { $in: allCodOrderIds }
                }
            },
            {
                $group: {
                    _id: '$beneficiaryId',
                    totalSubmittedToAdmin: { $sum: { $ifNull: ['$codPaidAmount', 0] } }
                }
            }
        ])
        : [];

    const cashCollectedMap = new Map(
        (cashCollectedAgg || []).map((entry) => [String(entry?._id), Number(entry?.grossCashCollected || 0)])
    );
    const cashSubmittedMap = new Map(
        (cashSettledAgg || []).map((entry) => [String(entry?._id), Number(entry?.totalSubmittedToAdmin || 0)])
    );
    const payoutPaidMap = new Map(
        (payoutSettlementsAgg || []).map((entry) => [String(entry?._id), Number(entry?.totalPaidAmount || 0)])
    );

    const wallets = await Promise.all(partners.map(async (p) => {
        const wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId: p._id }).lean();
        const key = String(p._id);

        const grossCashCollected = Number(cashCollectedMap.get(key) || 0);
        const rawSubmittedToAdmin = Number(cashSubmittedMap.get(key) || 0);
        const totalSubmittedToAdmin = Math.max(0, Math.min(rawSubmittedToAdmin, grossCashCollected));
        const settlementPaidAmount = Number(payoutPaidMap.get(key) || 0);
        const cashInHand = Math.max(0, grossCashCollected - totalSubmittedToAdmin);
        const totalEarning = Number(wallet?.totalEarnings || 0);
        const totalWithdrawn = settlementPaidAmount;
        
        return {
            walletId: wallet?._id,
            deliveryId: p._id,
            name: p.name,
            deliveryIdString: p.phone, // Placeholder or sequential ID if available
            pocketBalance: Number(wallet?.balance || 0),
            remainingCashLimit: Math.max(0, globalLimit - cashInHand),
            cashCollected: grossCashCollected,
            totalCashCollected: grossCashCollected,
            cashInHand,
            cashSubmittedToAdmin: totalSubmittedToAdmin,
            totalSubmittedToAdmin,
            totalEarning,
            bonus: Number(wallet?.totalBonus || 0),
            totalWithdrawn,
            paidAmount: totalWithdrawn,
            unpaidAmount: Math.max(0, totalEarning - totalWithdrawn),
            walletTotalSettled: Number(wallet?.totalSettled || 0)
        };
    }));

    return { 
        wallets, 
        pagination: { 
            total, 
            page, 
            limit, 
            pages: Math.ceil(total / limit) || 1 
        } 
    };
}

/**
 * Fetch cash limit settlement (deposit) transactions
 */
export async function getCashLimitSettlements(query = {}) {
    const limit = parseInt(query.limit, 10) || 20;
    const page = parseInt(query.page, 10) || 1;
    const skip = (page - 1) * limit;

    const AUTO_COD_SETTLEMENT_NOTE_REGEX = /^COD(?:\s+handover)?\s+settled via payout batch/i;
    const filter = {
        $or: [
            { adminNote: { $exists: false } },
            { adminNote: null },
            { adminNote: { $not: AUTO_COD_SETTLEMENT_NOTE_REGEX } }
        ]
    };
    if (query.search) {
        // Search by razorpay ID or find partner IDs to search by partner
        if (query.search.startsWith('pay_')) {
            filter.razorpayPaymentId = query.search;
        }
    }

    const [deposits, total] = await Promise.all([
        FoodDeliveryCashDeposit.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('deliveryPartnerId', 'name phone')
            .lean(),
        FoodDeliveryCashDeposit.countDocuments(filter)
    ]);

    const transactions = deposits.map((d) => ({
        id: d._id,
        createdAt: d.createdAt,
        deliveryId: d.deliveryPartnerId?._id,
        deliveryName: d.deliveryPartnerId?.name || 'N/A',
        deliveryIdString: d.deliveryPartnerId?.phone || 'N/A',
        amount: Number(d.amount || 0),
        status: d.status,
        razorpayPaymentId: d.razorpayPaymentId || '-'
    }));

    return { 
        transactions, 
        pagination: { 
            total, 
            page, 
            limit, 
            pages: Math.ceil(total / limit) || 1 
        } 
    };
}

const normalizePayoutMethod = (value) => {
    const raw = String(value || 'manual').trim().toLowerCase();
    if (['bank', 'upi', 'cash', 'manual'].includes(raw)) return raw;
    throw new ValidationError('payoutMethod must be one of bank, upi, cash, manual');
};

const normalizeRestaurantIdList = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
};

const resolveRestaurantScopeIds = async (query = {}, adminScope = {}) => {
    const requestedRestaurantId = String(query.beneficiaryId || query.restaurantId || '').trim();
    const requestedZoneId = String(query.zoneId || '').trim();
    const scope = normalizeAdminScope(adminScope);

    const restaurantFilter = {};
    if (requestedRestaurantId) {
        if (!mongoose.Types.ObjectId.isValid(requestedRestaurantId)) {
            throw new ValidationError('Invalid beneficiaryId');
        }
        restaurantFilter._id = new mongoose.Types.ObjectId(requestedRestaurantId);
    }

    if (requestedZoneId) {
        if (!mongoose.Types.ObjectId.isValid(requestedZoneId)) {
            throw new ValidationError('Invalid zoneId');
        }
        if (scope.isSubAdmin) {
            const allowed = scope.zoneIds.some((zoneId) => String(zoneId) === requestedZoneId);
            if (!allowed) {
                throw new ForbiddenError('Sub-admin can only access assigned zones');
            }
        }
        restaurantFilter.zoneId = new mongoose.Types.ObjectId(requestedZoneId);
    } else if (scope.isSubAdmin) {
        if (!scope.zoneIds.length) return [];
        restaurantFilter.zoneId = { $in: scope.zoneIds };
    }

    if (!Object.keys(restaurantFilter).length) {
        return null;
    }

    const restaurants = await FoodRestaurant.find(restaurantFilter).select('_id').lean();
    return restaurants.map((r) => r._id);
};

const normalizeDeliveryIdList = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((id) => String(id || '').trim())
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
};

const resolveDeliveryScopeIds = async (query = {}, adminScope = {}) => {
    const requestedPartnerId = String(query.beneficiaryId || query.deliveryPartnerId || '').trim();
    const requestedZoneId = String(query.zoneId || '').trim();
    const scope = normalizeAdminScope(adminScope);

    if (!requestedPartnerId && !requestedZoneId && !scope.isSubAdmin) {
        return null;
    }

    const partnerFilter = { status: 'approved' };
    if (requestedPartnerId) {
        if (!mongoose.Types.ObjectId.isValid(requestedPartnerId)) {
            throw new ValidationError('Invalid beneficiaryId');
        }
        partnerFilter._id = new mongoose.Types.ObjectId(requestedPartnerId);
    }

    if (requestedZoneId) {
        if (!mongoose.Types.ObjectId.isValid(requestedZoneId)) {
            throw new ValidationError('Invalid zoneId');
        }
        if (scope.isSubAdmin) {
            const allowed = scope.zoneIds.some((zoneId) => String(zoneId) === requestedZoneId);
            if (!allowed) throw new ForbiddenError('Sub-admin can only access assigned zones');
        }
        partnerFilter.zoneId = new mongoose.Types.ObjectId(requestedZoneId);
    } else if (scope.isSubAdmin) {
        if (!scope.zoneIds.length) return [];
        partnerFilter.zoneId = { $in: scope.zoneIds };
    }

    const partners = await FoodDeliveryPartner.find(partnerFilter).select('_id').lean();
    return partners.map((p) => p._id);
};

export async function getRestaurantPayoutSettlementPreview(query = {}, adminScope = {}) {
    const hasExplicitWindow = Boolean(
        normalizeDateString(query.fromDate) &&
        normalizeDateString(query.toDate)
    );
    const {
        start,
        end,
        fromRaw,
        toRaw,
        fromTimeRaw,
        toTimeRaw,
        auto
    } = hasExplicitWindow
        ? normalizeDateRangeOrThrow(query.fromDate, query.toDate, query.fromTime, query.toTime)
        : await resolveAutoDateRange();
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const search = String(query.search || '').trim().toLowerCase();

    const scopedRestaurantIds = await resolveRestaurantScopeIds(query, adminScope);
    if (Array.isArray(scopedRestaurantIds) && scopedRestaurantIds.length === 0) {
        return {
            rows: [],
            summary: { totalEarning: 0, totalPaid: 0, totalPending: 0, rowsCount: 0 },
            pagination: { total: 0, page, limit, pages: 1 }
        };
    }

    const pendingTransactions = await loadPendingRestaurantSettlementTransactions({
        start,
        end,
        scopedRestaurantIds: Array.isArray(scopedRestaurantIds) ? scopedRestaurantIds : null,
    });
    const restaurantIds = [...new Set(
        pendingTransactions
            .map((tx) => String(tx?.restaurantId || '').trim())
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
    )].map((id) => new mongoose.Types.ObjectId(id));
    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } })
            .select('_id restaurantName')
            .lean()
        : [];
    const restaurantNameMap = new Map(
        restaurants.map((restaurant) => [
            String(restaurant._id),
            String(restaurant.restaurantName || 'Unknown Restaurant')
        ])
    );

    const groupedRows = new Map();
    for (const tx of pendingTransactions) {
        const restaurantId = String(tx?.restaurantId || '').trim();
        if (!restaurantId) continue;
        if (!groupedRows.has(restaurantId)) {
            groupedRows.set(restaurantId, {
                beneficiaryId: restaurantId,
                beneficiaryName: restaurantNameMap.get(restaurantId) || 'Unknown Restaurant',
                ordersCount: 0,
                totalEarning: 0,
                alreadyPaid: 0,
                payableNow: 0,
                lastSettledToDate: null,
                status: 'pending'
            });
        }
        const bucket = groupedRows.get(restaurantId);
        const earning = Number(tx?.amounts?.restaurantShare || 0);
        bucket.ordersCount += 1;
        bucket.totalEarning += earning;
        bucket.payableNow += earning;
    }

    const rowsRaw = Array.from(groupedRows.values()).sort((a, b) => {
        if (Number(b.payableNow || 0) !== Number(a.payableNow || 0)) {
            return Number(b.payableNow || 0) - Number(a.payableNow || 0);
        }
        return String(a.beneficiaryName || '').localeCompare(String(b.beneficiaryName || ''));
    });

    const rowsFiltered = search
        ? rowsRaw.filter((row) => {
            const name = String(row.beneficiaryName || '').toLowerCase();
            const id = String(row.beneficiaryId || '').toLowerCase();
            return name.includes(search) || id.includes(search);
        })
        : rowsRaw;

    const summary = rowsFiltered.reduce(
        (acc, row) => {
            acc.totalEarning += Number(row.totalEarning || 0);
            acc.totalPaid += Number(row.alreadyPaid || 0);
            acc.totalPending += Number(row.payableNow || 0);
            acc.rowsCount += 1;
            return acc;
        },
        { totalEarning: 0, totalPaid: 0, totalPending: 0, rowsCount: 0 }
    );

    const total = rowsFiltered.length;
    const pagedRows = rowsFiltered.slice(skip, skip + limit);
    const beneficiaryIds = pagedRows
        .map((row) => row?.beneficiaryId)
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

    let lastSettledByRestaurant = new Map();
    if (beneficiaryIds.length) {
        const lastSettlements = await FoodPayoutSettlement.aggregate([
            {
                $match: {
                    beneficiaryType: 'restaurant',
                    status: 'paid',
                    beneficiaryId: { $in: beneficiaryIds }
                }
            },
            {
                $group: {
                    _id: '$beneficiaryId',
                    lastSettledAt: { $max: { $ifNull: ['$toAt', '$paidAt'] } }
                }
            }
        ]);
        lastSettledByRestaurant = new Map(
            lastSettlements.map((item) => [String(item._id), item.lastSettledAt || null])
        );
    }

    const rows = pagedRows.map((row) => {
        const id = String(row.beneficiaryId);
        return {
            ...row,
            beneficiaryId: id,
            lastSettledToDate: lastSettledByRestaurant.get(id) || row.lastSettledToDate || null
        };
    });

    return {
        rows,
        summary,
        window: {
            fromDate: fromRaw,
            toDate: toRaw,
            fromTime: fromTimeRaw,
            toTime: toTimeRaw,
            isAuto: auto
        },
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 1
        }
    };
}

export async function getRestaurantPayoutSettlementHistory(query = {}, adminScope = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const search = String(query.search || '').trim();

    const scopedRestaurantIds = await resolveRestaurantScopeIds(query, adminScope);
    if (Array.isArray(scopedRestaurantIds) && scopedRestaurantIds.length === 0) {
        return {
            rows: [],
            pagination: { total: 0, page, limit, pages: 1 }
        };
    }

    const fromDateRaw = normalizeDateString(query.fromDate || query.startDate);
    const toDateRaw = normalizeDateString(query.toDate || query.endDate);
    const historyMatch = {
        beneficiaryType: 'restaurant',
        status: 'paid'
    };
    if (Array.isArray(scopedRestaurantIds)) {
        historyMatch.beneficiaryId = { $in: scopedRestaurantIds };
    }

    const dateRangeMatch = {};
    if (fromDateRaw) {
        const from = new Date(`${fromDateRaw}T00:00:00.000`);
        if (!Number.isNaN(from.getTime())) {
            dateRangeMatch.$gte = from;
        }
    }
    if (toDateRaw) {
        const to = new Date(`${toDateRaw}T23:59:59.999`);
        if (!Number.isNaN(to.getTime())) {
            dateRangeMatch.$lte = to;
        }
    }

    const pipeline = [
        { $match: historyMatch },
        {
            $addFields: {
                effectivePaidAt: { $ifNull: ['$paidAt', '$createdAt'] },
                effectiveFromAt: { $ifNull: ['$fromAt', '$fromDate'] },
                effectiveToAt: { $ifNull: ['$toAt', '$toDate'] }
            }
        },
        ...(Object.keys(dateRangeMatch).length ? [{ $match: { effectivePaidAt: dateRangeMatch } }] : []),
        {
            $lookup: {
                from: 'food_restaurants',
                localField: 'beneficiaryId',
                foreignField: '_id',
                as: 'restaurant'
            }
        },
        {
            $unwind: {
                path: '$restaurant',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $addFields: {
                beneficiaryIdText: { $toString: '$beneficiaryId' },
                beneficiaryName: { $ifNull: ['$restaurant.restaurantName', 'Unknown Restaurant'] }
            }
        },
        ...(search
            ? [{
                $match: {
                    $or: [
                        { beneficiaryName: { $regex: search, $options: 'i' } },
                        { beneficiaryIdText: { $regex: search, $options: 'i' } },
                        { note: { $regex: search, $options: 'i' } },
                        { referenceNumber: { $regex: search, $options: 'i' } }
                    ]
                }
            }]
            : []),
        {
            $group: {
                _id: {
                    batchId: '$batchId',
                    paidAt: '$effectivePaidAt',
                    fromAt: '$effectiveFromAt',
                    toAt: '$effectiveToAt',
                    paidByAdminId: '$paidByAdminId',
                    payoutMethod: '$payoutMethod',
                    referenceNumber: '$referenceNumber',
                    note: '$note'
                },
                totalPaidAmount: { $sum: { $ifNull: ['$paidAmount', 0] } },
                totalGrossAmount: { $sum: { $ifNull: ['$grossAmount', 0] } },
                totalOrders: { $sum: { $ifNull: ['$ordersCount', 0] } },
                restaurantsSet: { $addToSet: '$beneficiaryIdText' },
                beneficiaries: {
                    $addToSet: {
                        beneficiaryId: '$beneficiaryIdText',
                        beneficiaryName: '$beneficiaryName'
                    }
                },
                settlementsCount: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                batchId: '$_id.batchId',
                paidAt: '$_id.paidAt',
                fromAt: '$_id.fromAt',
                toAt: '$_id.toAt',
                paidByAdminId: '$_id.paidByAdminId',
                payoutMethod: '$_id.payoutMethod',
                referenceNumber: '$_id.referenceNumber',
                note: '$_id.note',
                totalPaidAmount: 1,
                totalGrossAmount: 1,
                totalOrders: 1,
                settlementsCount: 1,
                restaurantsCount: { $size: '$restaurantsSet' },
                beneficiaries: { $slice: ['$beneficiaries', 5] }
            }
        },
        { $sort: { paidAt: -1, toAt: -1 } },
        {
            $facet: {
                rows: [{ $skip: skip }, { $limit: limit }],
                total: [{ $count: 'count' }]
            }
        }
    ];

    const agg = await FoodPayoutSettlement.aggregate(pipeline);
    const rowsRaw = agg?.[0]?.rows || [];
    const total = Number(agg?.[0]?.total?.[0]?.count || 0);

    const adminIds = rowsRaw
        .map((row) => row?.paidByAdminId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));
    let adminNameMap = new Map();
    if (adminIds.length) {
        const admins = await FoodAdmin.find({ _id: { $in: adminIds } })
            .select('_id name email')
            .lean();
        adminNameMap = new Map(
            admins.map((admin) => [
                String(admin._id),
                String(admin.name || admin.email || 'Unknown Admin')
            ])
        );
    }

    const rows = rowsRaw.map((row) => {
        const adminId = row?.paidByAdminId ? String(row.paidByAdminId) : '';
        const batchId = row?.batchId ? String(row.batchId) : null;
        return {
            ...row,
            batchId,
            paidByAdminId: adminId || null,
            paidByAdminName: adminNameMap.get(adminId) || (adminId ? 'Unknown Admin' : 'System')
        };
    });

    return {
        rows,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 1
        }
    };
}

export async function getRestaurantPayoutSettlementHistoryBatchDetails(batchId, adminScope = {}) {
    const rawBatchId = String(batchId || '').trim();
    if (!rawBatchId || !mongoose.Types.ObjectId.isValid(rawBatchId)) {
        throw new ValidationError('Invalid settlement batch id');
    }

    const scopedRestaurantIds = await resolveRestaurantScopeIds({}, adminScope);
    const match = {
        beneficiaryType: 'restaurant',
        status: 'paid',
        batchId: new mongoose.Types.ObjectId(rawBatchId)
    };
    if (Array.isArray(scopedRestaurantIds)) {
        if (!scopedRestaurantIds.length) {
            return null;
        }
        match.beneficiaryId = { $in: scopedRestaurantIds };
    }

    const docs = await FoodPayoutSettlement.find(match)
        .sort({ paidAmount: -1, ordersCount: -1 })
        .lean();

    if (!docs.length) {
        return null;
    }

    const restaurantIds = docs
        .map((doc) => doc?.beneficiaryId)
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
    const restaurants = restaurantIds.length
        ? await FoodRestaurant.find({ _id: { $in: restaurantIds } })
            .select('_id restaurantName ownerName')
            .lean()
        : [];
    const restaurantMap = new Map(
        restaurants.map((restaurant) => [
            String(restaurant._id),
            String(restaurant.restaurantName || restaurant.ownerName || 'Unknown Restaurant')
        ])
    );

    const paidByAdminId = docs[0]?.paidByAdminId ? String(docs[0].paidByAdminId) : '';
    let paidByAdminName = paidByAdminId ? 'Unknown Admin' : 'System';
    if (paidByAdminId && mongoose.Types.ObjectId.isValid(paidByAdminId)) {
        const admin = await FoodAdmin.findById(paidByAdminId).select('name email').lean();
        if (admin) {
            paidByAdminName = String(admin.name || admin.email || paidByAdminName);
        }
    }

    const rows = docs.map((doc) => ({
        settlementId: String(doc._id),
        beneficiaryId: String(doc.beneficiaryId),
        beneficiaryName: restaurantMap.get(String(doc.beneficiaryId)) || 'Unknown Restaurant',
        ordersCount: Number(doc.ordersCount || 0),
        grossAmount: Number(doc.grossAmount || 0),
        paidAmount: Number(doc.paidAmount || 0),
        adjustmentAmount: Number(doc.adjustmentAmount || 0),
        note: String(doc.note || ''),
        referenceNumber: String(doc.referenceNumber || '')
    }));

    const meta = docs[0];
    return {
        batchId: rawBatchId,
        paidAt: meta?.paidAt || meta?.createdAt || null,
        fromAt: meta?.fromAt || meta?.fromDate || null,
        toAt: meta?.toAt || meta?.toDate || null,
        paidByAdminId: paidByAdminId || null,
        paidByAdminName,
        payoutMethod: String(meta?.payoutMethod || 'manual'),
        note: String(meta?.note || ''),
        referenceNumber: String(meta?.referenceNumber || ''),
        totals: {
            restaurantsCount: rows.length,
            totalOrders: rows.reduce((sum, item) => sum + Number(item.ordersCount || 0), 0),
            totalGrossAmount: rows.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0),
            totalPaidAmount: rows.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0)
        },
        rows
    };
}

export async function markAllRestaurantPayoutSettled(payload = {}, adminScope = {}) {
    const beneficiaryType = String(payload.beneficiaryType || 'restaurant').trim().toLowerCase();
    if (beneficiaryType !== 'restaurant') {
        throw new ValidationError('Only restaurant beneficiaryType is supported in this endpoint');
    }

    const hasExplicitWindow = Boolean(
        normalizeDateString(payload.fromDate) &&
        normalizeDateString(payload.toDate)
    );
    const {
        start,
        end,
        fromRaw,
        toRaw,
        fromTimeRaw,
        toTimeRaw
    } = hasExplicitWindow
        ? normalizeDateRangeOrThrow(payload.fromDate, payload.toDate, payload.fromTime, payload.toTime)
        : await resolveAutoDateRange();
    const payoutMethod = normalizePayoutMethod(payload.payoutMethod || 'manual');
    const note = String(payload.note || '').trim();
    const referenceNumber = String(payload.referenceNumber || '').trim();
    const now = new Date();

    const scopedRestaurantIds = await resolveRestaurantScopeIds(
        {
            beneficiaryId: payload.beneficiaryId,
            zoneId: payload.zoneId
        },
        adminScope
    );
    const requestedBeneficiaryIds = normalizeRestaurantIdList(payload.beneficiaryIds);

    let candidateRestaurantIds = null;
    if (Array.isArray(scopedRestaurantIds)) {
        candidateRestaurantIds = scopedRestaurantIds;
    }
    if (requestedBeneficiaryIds.length) {
        if (candidateRestaurantIds) {
            const scopedSet = new Set(candidateRestaurantIds.map((id) => String(id)));
            candidateRestaurantIds = requestedBeneficiaryIds.filter((id) => scopedSet.has(String(id)));
        } else {
            candidateRestaurantIds = requestedBeneficiaryIds;
        }
    }

    if (Array.isArray(candidateRestaurantIds) && candidateRestaurantIds.length === 0) {
        return { updatedTransactions: 0, settlementsCreated: 0, totalPaidAmount: 0 };
    }

    const pendingTransactions = await loadPendingRestaurantSettlementTransactions({
        start,
        end,
        scopedRestaurantIds: Array.isArray(candidateRestaurantIds) ? candidateRestaurantIds : null,
    });

    if (!pendingTransactions.length) {
        return { updatedTransactions: 0, settlementsCreated: 0, totalPaidAmount: 0 };
    }

    const groupMap = new Map();
    for (const tx of pendingTransactions) {
        const restaurantKey = String(tx.restaurantId);
        if (!groupMap.has(restaurantKey)) {
            groupMap.set(restaurantKey, {
                beneficiaryId: tx.restaurantId,
                transactionIds: [],
                ordersCount: 0,
                grossAmount: 0
            });
        }
        const bucket = groupMap.get(restaurantKey);
        bucket.transactionIds.push(tx._id);
        bucket.ordersCount += 1;
        bucket.grossAmount += Number(tx.amounts?.restaurantShare || 0);
    }

    const allTransactionIds = pendingTransactions.map((tx) => tx._id);
    const historyNote = `Restaurant payout settled by admin (${fromRaw} ${fromTimeRaw} to ${toRaw} ${toTimeRaw})`;

    await FoodTransaction.updateMany(
        { _id: { $in: allTransactionIds } },
        {
            $set: {
                'settlement.isRestaurantSettled': true,
                'settlement.restaurantSettledAt': now
            },
            $push: {
                history: {
                    kind: 'settled',
                    amount: 0,
                    at: now,
                    note: historyNote
                }
            }
        }
    );

    const paidByAdminId = mongoose.Types.ObjectId.isValid(adminScope?.id)
        ? new mongoose.Types.ObjectId(adminScope.id)
        : null;
    const settlementBatchId = new mongoose.Types.ObjectId();

    const settlementDocs = Array.from(groupMap.values()).map((entry) => ({
        beneficiaryType: 'restaurant',
        beneficiaryId: entry.beneficiaryId,
        batchId: settlementBatchId,
        fromDate: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0),
        toDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
        fromAt: start,
        toAt: end,
        transactionIds: entry.transactionIds,
        ordersCount: entry.ordersCount,
        grossAmount: entry.grossAmount,
        paidAmount: entry.grossAmount,
        adjustmentAmount: 0,
        status: 'paid',
        payoutMethod,
        referenceNumber,
        note,
        paidAt: now,
        paidByAdminId
    }));

    if (settlementDocs.length) {
        await FoodPayoutSettlement.insertMany(settlementDocs);
    }

    return {
        updatedTransactions: allTransactionIds.length,
        settlementsCreated: settlementDocs.length,
        totalPaidAmount: settlementDocs.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0),
        fromDate: fromRaw,
        toDate: toRaw,
        fromTime: fromTimeRaw,
        toTime: toTimeRaw,
        settledAt: end.toISOString(),
        batchId: String(settlementBatchId),
        recommendedNextFromAt: new Date(end.getTime() + 1000).toISOString()
    };
}

const COD_PAYMENT_METHODS = ['cash', 'cod', 'cash_on_delivery', 'razorpay_qr'];
const DELIVERY_EFFECTIVE_DELIVERED_AT_EXPR = {
    $ifNull: [
        '$deliveryState.deliveredAt',
        { $ifNull: ['$deliveredAt', { $ifNull: ['$completedAt', { $ifNull: ['$updatedAt', '$createdAt'] }] }] }
    ]
};

const getSettledDeliveryOrderIdBuckets = async (partnerIds = null) => {
    const baseMatch = {
        beneficiaryType: 'delivery',
        status: 'paid',
        transactionIds: { $exists: true, $ne: [] }
    };
    if (Array.isArray(partnerIds)) {
        baseMatch.beneficiaryId = { $in: partnerIds };
    }

    const [payoutRows, codRows] = await Promise.all([
        FoodPayoutSettlement.aggregate([
            { $match: { ...baseMatch, paidAmount: { $gt: 0 } } },
            { $unwind: '$transactionIds' },
            { $group: { _id: null, orderIds: { $addToSet: '$transactionIds' } } }
        ]),
        FoodPayoutSettlement.aggregate([
            { $match: { ...baseMatch, codPaidAmount: { $gt: 0 } } },
            { $unwind: '$transactionIds' },
            { $group: { _id: null, orderIds: { $addToSet: '$transactionIds' } } }
        ])
    ]);

    const toValidObjectIds = (rows) => (rows?.[0]?.orderIds || [])
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

    return {
        payoutSettledOrderIds: toValidObjectIds(payoutRows),
        codSettledOrderIds: toValidObjectIds(codRows)
    };
};

export async function getDeliveryPayoutSettlementPreview(query = {}, adminScope = {}) {
    const hasExplicitWindow = Boolean(
        normalizeDateString(query.fromDate) &&
        normalizeDateString(query.toDate)
    );
    const {
        start,
        end,
        fromRaw,
        toRaw,
        fromTimeRaw,
        toTimeRaw,
        auto
    } = hasExplicitWindow
        ? normalizeDateRangeOrThrow(query.fromDate, query.toDate, query.fromTime, query.toTime)
        : await resolveDeliveryAutoDateRange();
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const search = String(query.search || '').trim().toLowerCase();

    const scopedPartnerIds = await resolveDeliveryScopeIds(query, adminScope);
    if (Array.isArray(scopedPartnerIds) && scopedPartnerIds.length === 0) {
        return {
            rows: [],
            summary: {
                totalEarning: 0,
                totalPaid: 0,
                totalPending: 0,
                totalCodAmount: 0,
                totalCodPaid: 0,
                totalCodPending: 0,
                rowsCount: 0
            },
            pagination: { total: 0, page, limit, pages: 1 },
            window: { fromDate: fromRaw, toDate: toRaw, fromTime: fromTimeRaw, toTime: toTimeRaw, isAuto: auto }
        };
    }

    const { payoutSettledOrderIds, codSettledOrderIds } = await getSettledDeliveryOrderIdBuckets(
        Array.isArray(scopedPartnerIds) ? scopedPartnerIds : null
    );

    const match = {
        effectiveDeliveredAt: { $lte: end },
        orderStatus: { $in: PAYABLE_SETTLEMENT_ORDER_STATUSES },
        'dispatch.deliveryPartnerId': { $exists: true, $ne: null }
    };
    if (Array.isArray(scopedPartnerIds)) {
        match['dispatch.deliveryPartnerId'] = { $in: scopedPartnerIds };
    }

    const rowsRaw = await FoodOrder.aggregate([
        {
            $addFields: {
                effectiveDeliveredAt: DELIVERY_EFFECTIVE_DELIVERED_AT_EXPR,
                paymentMethodLower: {
                    $toLower: {
                        $ifNull: ['$payment.method', '$paymentMethod']
                    }
                }
            }
        },
        {
            $addFields: {
                payoutPending: { $not: [{ $in: ['$_id', payoutSettledOrderIds] }] },
                codPending: {
                    $and: [
                        { $in: ['$paymentMethodLower', COD_PAYMENT_METHODS] },
                        { $eq: ['$orderStatus', 'delivered'] },
                        { $not: [{ $in: ['$_id', codSettledOrderIds] }] }
                    ]
                }
            }
        },
        { $match: match },
        { $match: { $or: [{ payoutPending: true }, { codPending: true }] } },
        {
            $group: {
                _id: '$dispatch.deliveryPartnerId',
                ordersCount: { $sum: { $cond: ['$payoutPending', 1, 0] } },
                totalEarning: {
                    $sum: {
                        $cond: [
                            '$payoutPending',
                            {
                                $ifNull: [
                                    '$riderEarning',
                                    { $ifNull: ['$deliveryPartnerSettlement', { $ifNull: ['$pricing.deliveryFee', 0] }] }
                                ]
                            },
                            0
                        ]
                    }
                },
                codOrdersCount: {
                    $sum: { $cond: ['$codPending', 1, 0] }
                },
                codAmount: {
                    $sum: {
                        $cond: ['$codPending', { $ifNull: ['$pricing.total', 0] }, 0]
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'food_delivery_partners',
                localField: '_id',
                foreignField: '_id',
                as: 'partner'
            }
        },
        {
            $unwind: {
                path: '$partner',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $project: {
                _id: 0,
                beneficiaryId: '$_id',
                beneficiaryName: { $ifNull: ['$partner.name', 'Unknown Delivery Partner'] },
                ordersCount: 1,
                totalEarning: 1,
                codOrdersCount: 1,
                codAmount: 1
            }
        },
        { $sort: { totalEarning: -1, beneficiaryName: 1 } }
    ]);

    const rowsFiltered = search
        ? rowsRaw.filter((row) => {
            const name = String(row.beneficiaryName || '').toLowerCase();
            const id = String(row.beneficiaryId || '').toLowerCase();
            return name.includes(search) || id.includes(search);
        })
        : rowsRaw;

    const filteredIds = rowsFiltered
        .map((row) => row?.beneficiaryId)
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));

    const [lastSettlements] = await Promise.all([
        FoodPayoutSettlement.aggregate([
            {
                $match: {
                    beneficiaryType: 'delivery',
                    status: 'paid',
                    ...(filteredIds.length ? { beneficiaryId: { $in: filteredIds } } : { beneficiaryId: { $in: [] } })
                }
            },
            {
                $group: {
                    _id: '$beneficiaryId',
                    lastSettledAt: { $max: { $ifNull: ['$toAt', '$paidAt'] } }
                }
            }
        ])
    ]);

    const lastSettledByPartner = new Map(
        lastSettlements.map((item) => [String(item._id), item.lastSettledAt || null])
    );

    const rowsWithSettlement = rowsFiltered.map((row) => {
        const id = String(row.beneficiaryId);
        const totalEarning = Number(row.totalEarning || 0);
        const codAmount = Number(row.codAmount || 0);
        const alreadyPaid = 0;
        const codPaid = 0;
        const payableNow = Math.max(0, totalEarning);
        const codPending = Math.max(0, codAmount);
        const codOrdersCount = Number(row.codOrdersCount || 0);
        const codStatus = codOrdersCount <= 0 ? 'nil' : 'unpaid';

        return {
            ...row,
            beneficiaryId: id,
            alreadyPaid,
            payableNow,
            codPaid,
            codPending,
            codStatus,
            status: payableNow <= 0 && codPending <= 0 ? 'paid' : 'pending',
            lastSettledToDate: lastSettledByPartner.get(id) || null
        };
    });

    const summary = rowsWithSettlement.reduce(
        (acc, row) => {
            acc.totalEarning += Number(row.totalEarning || 0);
            acc.totalPaid += Number(row.alreadyPaid || 0);
            acc.totalPending += Number(row.payableNow || 0);
            acc.totalCodAmount += Number(row.codAmount || 0);
            acc.totalCodPaid += Number(row.codPaid || 0);
            acc.totalCodPending += Number(row.codPending || 0);
            acc.rowsCount += 1;
            return acc;
        },
        {
            totalEarning: 0,
            totalPaid: 0,
            totalPending: 0,
            totalCodAmount: 0,
            totalCodPaid: 0,
            totalCodPending: 0,
            rowsCount: 0
        }
    );

    const total = rowsWithSettlement.length;
    const rows = rowsWithSettlement.slice(skip, skip + limit);

    return {
        rows,
        summary,
        window: {
            fromDate: fromRaw,
            toDate: toRaw,
            fromTime: fromTimeRaw,
            toTime: toTimeRaw,
            isAuto: auto
        },
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 1
        }
    };
}

export async function getDeliveryPayoutSettlementHistory(query = {}, adminScope = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const search = String(query.search || '').trim();

    const scopedPartnerIds = await resolveDeliveryScopeIds(query, adminScope);
    if (Array.isArray(scopedPartnerIds) && scopedPartnerIds.length === 0) {
        return {
            rows: [],
            pagination: { total: 0, page, limit, pages: 1 }
        };
    }

    const fromDateRaw = normalizeDateString(query.fromDate || query.startDate);
    const toDateRaw = normalizeDateString(query.toDate || query.endDate);
    const historyMatch = {
        beneficiaryType: 'delivery',
        status: 'paid'
    };
    if (Array.isArray(scopedPartnerIds)) {
        historyMatch.beneficiaryId = { $in: scopedPartnerIds };
    }

    const dateRangeMatch = {};
    if (fromDateRaw) {
        const from = new Date(`${fromDateRaw}T00:00:00.000`);
        if (!Number.isNaN(from.getTime())) {
            dateRangeMatch.$gte = from;
        }
    }
    if (toDateRaw) {
        const to = new Date(`${toDateRaw}T23:59:59.999`);
        if (!Number.isNaN(to.getTime())) {
            dateRangeMatch.$lte = to;
        }
    }

    const pipeline = [
        { $match: historyMatch },
        {
            $addFields: {
                effectivePaidAt: { $ifNull: ['$paidAt', '$createdAt'] },
                effectiveFromAt: { $ifNull: ['$fromAt', '$fromDate'] },
                effectiveToAt: { $ifNull: ['$toAt', '$toDate'] }
            }
        },
        ...(Object.keys(dateRangeMatch).length ? [{ $match: { effectivePaidAt: dateRangeMatch } }] : []),
        {
            $lookup: {
                from: 'food_delivery_partners',
                localField: 'beneficiaryId',
                foreignField: '_id',
                as: 'partner'
            }
        },
        {
            $unwind: {
                path: '$partner',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $addFields: {
                beneficiaryIdText: { $toString: '$beneficiaryId' },
                beneficiaryName: { $ifNull: ['$partner.name', 'Unknown Delivery Partner'] }
            }
        },
        ...(search
            ? [{
                $match: {
                    $or: [
                        { beneficiaryName: { $regex: search, $options: 'i' } },
                        { beneficiaryIdText: { $regex: search, $options: 'i' } },
                        { note: { $regex: search, $options: 'i' } },
                        { referenceNumber: { $regex: search, $options: 'i' } }
                    ]
                }
            }]
            : []),
        {
            $group: {
                _id: {
                    batchId: '$batchId',
                    paidAt: '$effectivePaidAt',
                    fromAt: '$effectiveFromAt',
                    toAt: '$effectiveToAt',
                    paidByAdminId: '$paidByAdminId',
                    payoutMethod: '$payoutMethod',
                    referenceNumber: '$referenceNumber',
                    note: '$note'
                },
                totalPaidAmount: { $sum: { $ifNull: ['$paidAmount', 0] } },
                totalGrossAmount: { $sum: { $ifNull: ['$grossAmount', 0] } },
                totalOrders: { $sum: { $ifNull: ['$ordersCount', 0] } },
                totalCodOrders: { $sum: { $ifNull: ['$codOrdersCount', 0] } },
                totalCodAmount: { $sum: { $ifNull: ['$codAmount', 0] } },
                totalCodPaidAmount: { $sum: { $ifNull: ['$codPaidAmount', 0] } },
                partnersSet: { $addToSet: '$beneficiaryIdText' },
                beneficiaries: {
                    $addToSet: {
                        beneficiaryId: '$beneficiaryIdText',
                        beneficiaryName: '$beneficiaryName'
                    }
                },
                settlementsCount: { $sum: 1 }
            }
        },
        {
            $project: {
                _id: 0,
                batchId: '$_id.batchId',
                paidAt: '$_id.paidAt',
                fromAt: '$_id.fromAt',
                toAt: '$_id.toAt',
                paidByAdminId: '$_id.paidByAdminId',
                payoutMethod: '$_id.payoutMethod',
                referenceNumber: '$_id.referenceNumber',
                note: '$_id.note',
                totalPaidAmount: 1,
                totalGrossAmount: 1,
                totalOrders: 1,
                totalCodOrders: 1,
                totalCodAmount: 1,
                totalCodPaidAmount: 1,
                settlementsCount: 1,
                partnersCount: { $size: '$partnersSet' },
                beneficiaries: { $slice: ['$beneficiaries', 5] }
            }
        },
        { $sort: { paidAt: -1, toAt: -1 } },
        {
            $facet: {
                rows: [{ $skip: skip }, { $limit: limit }],
                total: [{ $count: 'count' }]
            }
        }
    ];

    const agg = await FoodPayoutSettlement.aggregate(pipeline);
    const rowsRaw = agg?.[0]?.rows || [];
    const total = Number(agg?.[0]?.total?.[0]?.count || 0);

    const adminIds = rowsRaw
        .map((row) => row?.paidByAdminId)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));
    let adminNameMap = new Map();
    if (adminIds.length) {
        const admins = await FoodAdmin.find({ _id: { $in: adminIds } })
            .select('_id name email')
            .lean();
        adminNameMap = new Map(
            admins.map((admin) => [
                String(admin._id),
                String(admin.name || admin.email || 'Unknown Admin')
            ])
        );
    }

    const rows = rowsRaw.map((row) => {
        const adminId = row?.paidByAdminId ? String(row.paidByAdminId) : '';
        const batchId = row?.batchId ? String(row.batchId) : null;
        return {
            ...row,
            batchId,
            paidByAdminId: adminId || null,
            paidByAdminName: adminNameMap.get(adminId) || (adminId ? 'Unknown Admin' : 'System')
        };
    });

    return {
        rows,
        pagination: {
            total,
            page,
            limit,
            pages: Math.ceil(total / limit) || 1
        }
    };
}

export async function getDeliveryPayoutSettlementHistoryBatchDetails(batchId, adminScope = {}) {
    const rawBatchId = String(batchId || '').trim();
    if (!rawBatchId || !mongoose.Types.ObjectId.isValid(rawBatchId)) {
        throw new ValidationError('Invalid settlement batch id');
    }

    const scopedPartnerIds = await resolveDeliveryScopeIds({}, adminScope);
    const match = {
        beneficiaryType: 'delivery',
        status: 'paid',
        batchId: new mongoose.Types.ObjectId(rawBatchId)
    };
    if (Array.isArray(scopedPartnerIds)) {
        if (!scopedPartnerIds.length) {
            return null;
        }
        match.beneficiaryId = { $in: scopedPartnerIds };
    }

    const docs = await FoodPayoutSettlement.find(match)
        .sort({ paidAmount: -1, ordersCount: -1 })
        .lean();

    if (!docs.length) {
        return null;
    }

    const partnerIds = docs
        .map((doc) => doc?.beneficiaryId)
        .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
    const partners = partnerIds.length
        ? await FoodDeliveryPartner.find({ _id: { $in: partnerIds } })
            .select('_id name phone')
            .lean()
        : [];
    const partnerMap = new Map(
        partners.map((partner) => [
            String(partner._id),
            {
                name: String(partner.name || 'Unknown Delivery Partner'),
                phone: String(partner.phone || '')
            }
        ])
    );

    const paidByAdminId = docs[0]?.paidByAdminId ? String(docs[0].paidByAdminId) : '';
    let paidByAdminName = paidByAdminId ? 'Unknown Admin' : 'System';
    if (paidByAdminId && mongoose.Types.ObjectId.isValid(paidByAdminId)) {
        const admin = await FoodAdmin.findById(paidByAdminId).select('name email').lean();
        if (admin) {
            paidByAdminName = String(admin.name || admin.email || paidByAdminName);
        }
    }

    const rows = docs.map((doc) => {
        const partner = partnerMap.get(String(doc.beneficiaryId));
        return {
            settlementId: String(doc._id),
            beneficiaryId: String(doc.beneficiaryId),
            beneficiaryName: partner?.name || 'Unknown Delivery Partner',
            beneficiaryPhone: partner?.phone || '',
            ordersCount: Number(doc.ordersCount || 0),
            codOrdersCount: Number(doc.codOrdersCount || 0),
            grossAmount: Number(doc.grossAmount || 0),
            codAmount: Number(doc.codAmount || 0),
            codPaidAmount: Number(doc.codPaidAmount || 0),
            paidAmount: Number(doc.paidAmount || 0),
            adjustmentAmount: Number(doc.adjustmentAmount || 0),
            note: String(doc.note || ''),
            referenceNumber: String(doc.referenceNumber || '')
        };
    });

    const meta = docs[0];
    return {
        batchId: rawBatchId,
        paidAt: meta?.paidAt || meta?.createdAt || null,
        fromAt: meta?.fromAt || meta?.fromDate || null,
        toAt: meta?.toAt || meta?.toDate || null,
        paidByAdminId: paidByAdminId || null,
        paidByAdminName,
        payoutMethod: String(meta?.payoutMethod || 'manual'),
        note: String(meta?.note || ''),
        referenceNumber: String(meta?.referenceNumber || ''),
        totals: {
            partnersCount: rows.length,
            totalOrders: rows.reduce((sum, item) => sum + Number(item.ordersCount || 0), 0),
            totalCodOrders: rows.reduce((sum, item) => sum + Number(item.codOrdersCount || 0), 0),
            totalGrossAmount: rows.reduce((sum, item) => sum + Number(item.grossAmount || 0), 0),
            totalCodAmount: rows.reduce((sum, item) => sum + Number(item.codAmount || 0), 0),
            totalCodPaidAmount: rows.reduce((sum, item) => sum + Number(item.codPaidAmount || 0), 0),
            totalPaidAmount: rows.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0)
        },
        rows
    };
}

export async function markAllDeliveryPayoutSettled(payload = {}, adminScope = {}) {
    const beneficiaryType = String(payload.beneficiaryType || 'delivery').trim().toLowerCase();
    if (beneficiaryType !== 'delivery') {
        throw new ValidationError('Only delivery beneficiaryType is supported in this endpoint');
    }

    const hasExplicitWindow = Boolean(
        normalizeDateString(payload.fromDate) &&
        normalizeDateString(payload.toDate)
    );
    const {
        start,
        end,
        fromRaw,
        toRaw,
        fromTimeRaw,
        toTimeRaw
    } = hasExplicitWindow
        ? normalizeDateRangeOrThrow(payload.fromDate, payload.toDate, payload.fromTime, payload.toTime)
        : await resolveDeliveryAutoDateRange();
    const payoutMethod = normalizePayoutMethod(payload.payoutMethod || 'manual');
    const settleCodToAdmin = payload?.settleCodToAdmin === true;
    const note = String(payload.note || '').trim();
    const referenceNumber = String(payload.referenceNumber || '').trim();
    const now = new Date();

    const scopedPartnerIds = await resolveDeliveryScopeIds(
        {
            beneficiaryId: payload.beneficiaryId,
            zoneId: payload.zoneId
        },
        adminScope
    );
    const requestedBeneficiaryIds = normalizeDeliveryIdList(payload.beneficiaryIds);

    let candidatePartnerIds = null;
    if (Array.isArray(scopedPartnerIds)) {
        candidatePartnerIds = scopedPartnerIds;
    }
    if (requestedBeneficiaryIds.length) {
        if (candidatePartnerIds) {
            const scopedSet = new Set(candidatePartnerIds.map((id) => String(id)));
            candidatePartnerIds = requestedBeneficiaryIds.filter((id) => scopedSet.has(String(id)));
        } else {
            candidatePartnerIds = requestedBeneficiaryIds;
        }
    }

    if (Array.isArray(candidatePartnerIds) && candidatePartnerIds.length === 0) {
        return { updatedTransactions: 0, settlementsCreated: 0, totalPaidAmount: 0, totalCodSettledAmount: 0 };
    }

    const { payoutSettledOrderIds, codSettledOrderIds } = await getSettledDeliveryOrderIdBuckets(
        Array.isArray(candidatePartnerIds) ? candidatePartnerIds : null
    );

    const orderMatch = {
        effectiveDeliveredAt: { $lte: end },
        orderStatus: { $in: PAYABLE_SETTLEMENT_ORDER_STATUSES },
        'dispatch.deliveryPartnerId': { $exists: true, $ne: null }
    };
    if (Array.isArray(candidatePartnerIds)) {
        orderMatch['dispatch.deliveryPartnerId'] = { $in: candidatePartnerIds };
    }

    const groupedOrders = await FoodOrder.aggregate([
        {
            $addFields: {
                effectiveDeliveredAt: DELIVERY_EFFECTIVE_DELIVERED_AT_EXPR,
                paymentMethodLower: {
                    $toLower: {
                        $ifNull: ['$payment.method', '$paymentMethod']
                    }
                },
                payoutAmount: {
                    $ifNull: [
                        '$riderEarning',
                        { $ifNull: ['$deliveryPartnerSettlement', { $ifNull: ['$pricing.deliveryFee', 0] }] }
                    ]
                }
            }
        },
        {
            $addFields: {
                payoutPending: { $not: [{ $in: ['$_id', payoutSettledOrderIds] }] },
                codPending: {
                    $and: [
                        { $in: ['$paymentMethodLower', COD_PAYMENT_METHODS] },
                        { $eq: ['$orderStatus', 'delivered'] },
                        { $not: [{ $in: ['$_id', codSettledOrderIds] }] }
                    ]
                }
            }
        },
        { $match: orderMatch },
        { $match: { $or: [{ payoutPending: true }, { codPending: true }] } },
        {
            $group: {
                _id: '$dispatch.deliveryPartnerId',
                payoutOrderIds: { $push: { $cond: ['$payoutPending', '$_id', null] } },
                codOrderIds: { $push: { $cond: ['$codPending', '$_id', null] } },
                ordersCount: { $sum: { $cond: ['$payoutPending', 1, 0] } },
                totalEarning: { $sum: { $cond: ['$payoutPending', '$payoutAmount', 0] } },
                codOrdersCount: {
                    $sum: { $cond: ['$codPending', 1, 0] }
                },
                codAmount: {
                    $sum: {
                        $cond: ['$codPending', { $ifNull: ['$pricing.total', 0] }, 0]
                    }
                }
            }
        }
    ]);

    if (!groupedOrders.length) {
        return { updatedTransactions: 0, settlementsCreated: 0, totalPaidAmount: 0, totalCodSettledAmount: 0 };
    }

    const paidByAdminId = mongoose.Types.ObjectId.isValid(adminScope?.id)
        ? new mongoose.Types.ObjectId(adminScope.id)
        : null;
    const settlementBatchId = new mongoose.Types.ObjectId();
    const settlementDocs = [];
    const depositDocs = [];
    let updatedTransactions = 0;

    for (const entry of groupedOrders) {
        const beneficiaryId = entry?._id;

        const totalEarning = Number(entry.totalEarning || 0);
        const totalCodAmount = Number(entry.codAmount || 0);
        const payableNow = Math.max(0, totalEarning);
        const codPayableNow = Math.max(0, totalCodAmount);
        const codSettledNow = settleCodToAdmin ? codPayableNow : 0;

        if (payableNow <= 0 && codSettledNow <= 0) {
            continue;
        }

        const payoutOrderIds = (entry.payoutOrderIds || [])
            .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));
        const codOrderIds = (entry.codOrderIds || [])
            .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));
        const settlementOrderIdMap = new Map();
        for (const id of payoutOrderIds) settlementOrderIdMap.set(String(id), id);
        if (settleCodToAdmin) {
            for (const id of codOrderIds) settlementOrderIdMap.set(String(id), id);
        }
        const settlementOrderIds = Array.from(settlementOrderIdMap.values());

        updatedTransactions += settlementOrderIds.length;
        settlementDocs.push({
            beneficiaryType: 'delivery',
            beneficiaryId,
            batchId: settlementBatchId,
            fromDate: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0),
            toDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999),
            fromAt: start,
            toAt: end,
            transactionIds: settlementOrderIds,
            ordersCount: Number(entry.ordersCount || 0),
            codOrdersCount: Number(entry.codOrdersCount || 0),
            grossAmount: totalEarning,
            codAmount: totalCodAmount,
            codPaidAmount: codSettledNow,
            paidAmount: payableNow,
            adjustmentAmount: 0,
            status: 'paid',
            payoutMethod,
            referenceNumber,
            note,
            paidAt: now,
            paidByAdminId
        });

        if (codSettledNow > 0) {
            depositDocs.push({
                deliveryPartnerId: beneficiaryId,
                amount: codSettledNow,
                paymentMethod: 'cash',
                status: 'Completed',
                adminId: paidByAdminId || null,
                adminNote: `COD settled via payout batch ${String(settlementBatchId)}`
            });
        }
    }

    if (!settlementDocs.length) {
        return { updatedTransactions: 0, settlementsCreated: 0, totalPaidAmount: 0, totalCodSettledAmount: 0 };
    }

    await FoodPayoutSettlement.insertMany(settlementDocs);
    if (depositDocs.length) {
        await FoodDeliveryCashDeposit.insertMany(depositDocs);
    }

    const codByPartner = new Map();
    for (const doc of settlementDocs) {
        const key = String(doc.beneficiaryId);
        codByPartner.set(key, Number(codByPartner.get(key) || 0) + Number(doc.codPaidAmount || 0));
    }
    if (codByPartner.size) {
        await Promise.all(
            Array.from(codByPartner.entries()).map(async ([partnerId, codPaidAmount]) => {
                if (!mongoose.Types.ObjectId.isValid(partnerId) || codPaidAmount <= 0) return;
                const wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId: new mongoose.Types.ObjectId(partnerId) });
                if (!wallet) return;
                wallet.cashInHand = Math.max(0, Number(wallet.cashInHand || 0) - Number(codPaidAmount || 0));
                await wallet.save();
            })
        );
    }

    return {
        updatedTransactions,
        settlementsCreated: settlementDocs.length,
        totalPaidAmount: settlementDocs.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0),
        totalCodSettledAmount: settlementDocs.reduce((sum, item) => sum + Number(item.codPaidAmount || 0), 0),
        fromDate: fromRaw,
        toDate: toRaw,
        fromTime: fromTimeRaw,
        toTime: toTimeRaw,
        settledAt: end.toISOString(),
        batchId: String(settlementBatchId),
        recommendedNextFromAt: new Date(end.getTime() + 1000).toISOString()
    };
}

export async function getSidebarBadges() {
    try {
        const [
            pendingRestaurants,
            pendingDeliveryPartners,
            pendingFoods,
            pendingAddons,
            pendingOrders,
            pendingOfflinePayments,
            pendingRestaurantWithdrawals,
            pendingDeliveryWithdrawals,
            openUserSupportTickets,
            openDeliverySupportTickets,
            pendingEarningAddons,
            pendingSafetyReports,
            pendingEmergencyHelp,
            pendingRestaurantComplaints
        ] = await Promise.all([
            FoodRestaurant.countDocuments({ status: 'pending' }),
            FoodDeliveryPartner.countDocuments({ status: 'pending' }),
            FoodItem.countDocuments({ status: 'pending' }),
            FoodAddon.countDocuments({ status: 'pending' }),
            FoodOrder.countDocuments({ orderStatus: 'pending' }),
            FoodOrder.countDocuments({ paymentMethod: 'offline_payment', orderStatus: 'pending' }),
            FoodRestaurantWithdrawal.countDocuments({ status: 'pending' }),
            FoodDeliveryWithdrawal.countDocuments({ status: 'pending' }),
            FoodSupportTicket.countDocuments({ status: 'open', userId: { $exists: true }, restaurantId: { $exists: false } }),
            DeliverySupportTicket.countDocuments({ status: 'open' }),
            FoodEarningAddonHistory.countDocuments({ status: 'pending' }),
            FoodSafetyEmergencyReport.countDocuments({ status: 'pending' }),
            FoodDeliveryEmergencyHelp.countDocuments({ status: 'pending' }),
            FoodSupportTicket.countDocuments({ status: 'open', restaurantId: { $exists: true } })
        ]);

        return {
            restaurants: pendingRestaurants,
            deliveryPartners: pendingDeliveryPartners,
            foods: pendingFoods + pendingAddons,
            foodApprovals: pendingFoods,
            orders: pendingOrders,
            offlinePayments: pendingOfflinePayments,
            restaurantWithdrawals: pendingRestaurantWithdrawals,
            deliveryWithdrawals: pendingDeliveryWithdrawals,
            userSupportTickets: openUserSupportTickets,
            deliverySupportTickets: openDeliverySupportTickets,
            earningAddons: pendingEarningAddons,
            safetyReports: pendingSafetyReports,
            emergencyHelp: pendingEmergencyHelp,
            restaurantComplaints: pendingRestaurantComplaints
        };
    } catch (error) {
        console.error('Error fetching sidebar badges:', error);
        return {};
    }
}

// ===== STORE PRODUCTS (Admin sells to Delivery Boys) =====

export async function getStoreProducts(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.isPublished !== undefined && query.isPublished !== '') {
        filter.isPublished = String(query.isPublished) === 'true';
    }
    if (query.search) {
        filter.$or = [
            { name: { $regex: query.search, $options: 'i' } },
            { description: { $regex: query.search, $options: 'i' } },
            { category: { $regex: query.search, $options: 'i' } }
        ];
    }

    const [products, total] = await Promise.all([
        StoreProduct.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        StoreProduct.countDocuments(filter)
    ]);

    return { products, total, page, limit };
}

export async function createStoreProduct(body = {}) {
    const { name, description, image, category, variants, isPublished, sortOrder } = body;

    if (!name || !String(name).trim()) {
        throw new ValidationError('Product name is required');
    }
    if (!Array.isArray(variants) || variants.length === 0) {
        throw new ValidationError('At least one variant is required');
    }
    for (const v of variants) {
        if (!v.name || !String(v.name).trim()) throw new ValidationError('Each variant must have a name');
        if (v.price === undefined || v.price === null || Number(v.price) < 0) throw new ValidationError('Each variant must have a valid price');
        if (v.stock === undefined || v.stock === null || Number(v.stock) < 0) throw new ValidationError('Each variant must have a valid stock quantity');
    }

    const product = await StoreProduct.create({
        name: String(name).trim(),
        description: String(description || '').trim(),
        image: String(image || '').trim(),
        category: String(category || '').trim(),
        variants: variants.map(v => ({
            name: String(v.name).trim(),
            price: Number(v.price),
            stock: Number(v.stock)
        })),
        isPublished: Boolean(isPublished),
        sortOrder: Number(sortOrder) || 0
    });

    return product;
}

export async function updateStoreProduct(id, body = {}) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid product ID');
    }

    const update = {};
    if (body.name !== undefined) update.name = String(body.name).trim();
    if (body.description !== undefined) update.description = String(body.description).trim();
    if (body.image !== undefined) update.image = String(body.image).trim();
    if (body.category !== undefined) update.category = String(body.category).trim();
    if (body.isPublished !== undefined) update.isPublished = Boolean(body.isPublished);
    if (body.sortOrder !== undefined) update.sortOrder = Number(body.sortOrder) || 0;

    if (Array.isArray(body.variants)) {
        for (const v of body.variants) {
            if (!v.name || !String(v.name).trim()) throw new ValidationError('Each variant must have a name');
            if (v.price === undefined || Number(v.price) < 0) throw new ValidationError('Each variant must have a valid price');
            if (v.stock === undefined || Number(v.stock) < 0) throw new ValidationError('Each variant must have a valid stock quantity');
        }
        update.variants = body.variants.map(v => ({
            name: String(v.name).trim(),
            price: Number(v.price),
            stock: Number(v.stock)
        }));
    }

    const updated = await StoreProduct.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    return updated;
}

export async function deleteStoreProduct(id) {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('Invalid product ID');
    }
    const deleted = await StoreProduct.findByIdAndDelete(id).lean();
    return deleted;
}

export async function updateStoreProductStock(productId, variantId, stockDelta) {
    // stockDelta: positive to add stock, negative to reduce
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        throw new ValidationError('Invalid product ID');
    }
    if (!variantId || !mongoose.Types.ObjectId.isValid(variantId)) {
        throw new ValidationError('Invalid variant ID');
    }
    const delta = Number(stockDelta);
    if (!Number.isFinite(delta)) throw new ValidationError('Stock delta must be a number');

    const updated = await StoreProduct.findOneAndUpdate(
        { _id: productId, 'variants._id': variantId },
        { $inc: { 'variants.$.stock': delta } },
        { new: true }
    ).lean();

    if (!updated) throw new ValidationError('Product or variant not found');
    return updated;
}

export async function getStoreOrders(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.paymentStatus && query.paymentStatus !== 'all') filter.paymentStatus = query.paymentStatus;
    if (query.orderStatus && query.orderStatus !== 'all') filter.orderStatus = query.orderStatus;
    if (query.deliveryPartnerId && mongoose.Types.ObjectId.isValid(query.deliveryPartnerId)) {
        filter.deliveryPartnerId = new mongoose.Types.ObjectId(query.deliveryPartnerId);
    }
    if (query.fromDate && query.toDate) {
        filter.createdAt = { $gte: new Date(query.fromDate), $lte: new Date(query.toDate) };
    }

    const [orders, total] = await Promise.all([
        StoreOrder.find(filter)
            .populate('deliveryPartnerId', 'name phone profilePhoto')
            .populate('productId', 'name image category')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        StoreOrder.countDocuments(filter)
    ]);

    return { orders, total, page, limit };
}

export async function updateStoreOrderStatus(orderId, body = {}) {
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
        throw new ValidationError('Invalid store order ID');
    }

    const allowedStatuses = ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'];
    const nextStatus = String(body?.orderStatus || '').trim().toLowerCase();
    if (!allowedStatuses.includes(nextStatus)) {
        throw new ValidationError('Invalid order status');
    }

    const updated = await StoreOrder.findByIdAndUpdate(
        orderId,
        { $set: { orderStatus: nextStatus } },
        { new: true }
    )
        .populate('deliveryPartnerId', 'name phone profilePhoto')
        .populate('productId', 'name image category')
        .lean();

    if (!updated) {
        throw new ValidationError('Store order not found');
    }

    return updated;
}
