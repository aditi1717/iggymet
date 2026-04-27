import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';

const toStr = (v) => (v != null ? String(v).trim() : '');

const normalizeCouponPayload = (body = {}) => {
    const couponCode = toStr(body.couponCode).toUpperCase();
    if (!couponCode) throw new ValidationError('Coupon code is required');

    const discountType = body.discountType === 'flat-price' ? 'flat-price' : 'percentage';
    const discountValue = Number(body.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }

    const minOrderValue = body.minOrderValue !== undefined ? Number(body.minOrderValue) : 0;
    if (Number.isFinite(minOrderValue) && minOrderValue < 0) {
        throw new ValidationError('Minimum order value cannot be negative');
    }

    const maxDiscountRaw = body.maxDiscount !== undefined ? Number(body.maxDiscount) : null;
    let maxDiscount = null;
    if (discountType === 'percentage') {
        if (!Number.isFinite(maxDiscountRaw) || maxDiscountRaw <= 0) {
            throw new ValidationError('Max discount is required for percentage coupons');
        }
        maxDiscount = maxDiscountRaw;
    }

    if (body.usageLimit === undefined || body.usageLimit === null || body.usageLimit === '') {
        throw new ValidationError('Usage limit is required');
    }
    const usageLimit = Number(body.usageLimit);
    if (!Number.isFinite(usageLimit) || usageLimit <= 0) {
        throw new ValidationError('Usage limit must be greater than 0');
    }

    if (body.perUserLimit === undefined || body.perUserLimit === null || body.perUserLimit === '') {
        throw new ValidationError('Per user limit is required');
    }
    const perUserLimit = Number(body.perUserLimit);
    if (!Number.isFinite(perUserLimit) || perUserLimit <= 0) {
        throw new ValidationError('Per user limit must be greater than 0');
    }

    if (usageLimit <= perUserLimit) {
        throw new ValidationError('Total usage limit must be greater than per-user limit');
    }

    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;

    if (startDate && Number.isNaN(startDate.getTime())) throw new ValidationError('Invalid start date');
    if (endDate && Number.isNaN(endDate.getTime())) throw new ValidationError('Invalid end date');
    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
        throw new ValidationError('End date must be after start date');
    }

    return {
        couponCode,
        discountType,
        discountValue,
        minOrderValue: Number.isFinite(minOrderValue) ? minOrderValue : 0,
        maxDiscount,
        usageLimit,
        perUserLimit,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        customerScope: body.customerScope === 'first-time' ? 'first-time' : 'all',
        isFirstOrderOnly: body.isFirstOrderOnly === true
    };
};

const ensureRestaurant = async (restaurantId) => {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(String(restaurantId))) {
        throw new ValidationError('Invalid restaurant id');
    }
    const restaurant = await FoodRestaurant.findById(restaurantId).select('_id restaurantName').lean();
    if (!restaurant?._id) {
        throw new ValidationError('Restaurant not found');
    }
    return restaurant;
};

export async function createRestaurantOffer(restaurantId, body = {}) {
    const restaurant = await ensureRestaurant(restaurantId);
    const payload = normalizeCouponPayload(body);

    const existing = await FoodOffer.findOne({ couponCode: payload.couponCode }).lean();
    if (existing) {
        throw new ValidationError('Coupon code already exists');
    }

    const doc = await FoodOffer.create({
        ...payload,
        restaurantScope: 'selected',
        restaurantId: restaurant._id,
        createdByRestaurantId: restaurant._id,
        approvalStatus: 'pending',
        status: 'inactive',
        showInCart: false
    });

    try {
        const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
        void notifyAdminsSafely({
            title: 'New Coupon Approval Needed',
            body: `Restaurant "${restaurant.restaurantName || 'Restaurant'}" submitted coupon ${payload.couponCode}.`,
            data: { type: 'approval_request', subType: 'offer', id: String(doc._id) }
        });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to notify admins of new coupon approval request:', e);
    }

    return doc.toObject();
}

export async function listRestaurantOffers(restaurantId) {
    const restaurant = await ensureRestaurant(restaurantId);
    const offers = await FoodOffer.find({
        restaurantScope: 'selected',
        restaurantId: restaurant._id
    })
        .sort({ createdAt: -1 })
        .lean();

    return offers.map((o) => ({
        id: String(o._id),
        couponCode: o.couponCode,
        discountType: o.discountType,
        discountValue: o.discountValue,
        customerScope: o.customerScope,
        approvalStatus: o.approvalStatus || 'approved',
        status: o.status || 'inactive',
        minOrderValue: o.minOrderValue ?? 0,
        maxDiscount: o.maxDiscount ?? null,
        usageLimit: o.usageLimit ?? null,
        perUserLimit: o.perUserLimit ?? null,
        usedCount: o.usedCount ?? 0,
        startDate: o.startDate || null,
        endDate: o.endDate || null,
        showInCart: o.showInCart !== false,
        isFirstOrderOnly: !!o.isFirstOrderOnly,
        createdByRestaurantId: o.createdByRestaurantId ? String(o.createdByRestaurantId) : null,
        createdAt: o.createdAt || null,
        rejectionReason: o.rejectionReason || '',
        restaurantName: restaurant.restaurantName || ''
    }));
}

export async function deleteRestaurantOffer(restaurantId, offerId) {
    await ensureRestaurant(restaurantId);
    if (!offerId || !mongoose.Types.ObjectId.isValid(String(offerId))) {
        throw new ValidationError('Invalid offer id');
    }

    const offer = await FoodOffer.findOne({
        _id: offerId,
        createdByRestaurantId: restaurantId
    }).lean();
    if (!offer) return null;

    await FoodOffer.deleteOne({ _id: offerId });
    return { id: String(offerId) };
}

export async function updateRestaurantOffer(restaurantId, offerId, body = {}) {
    await ensureRestaurant(restaurantId);
    if (!offerId || !mongoose.Types.ObjectId.isValid(String(offerId))) {
        throw new ValidationError('Invalid offer id');
    }
    const existing = await FoodOffer.findOne({
        _id: offerId,
        createdByRestaurantId: restaurantId
    }).lean();
    if (!existing) return null;

    const payload = normalizeCouponPayload(body);
    // Prevent duplicate coupon codes (excluding current)
    const duplicate = await FoodOffer.findOne({
        _id: { $ne: offerId },
        couponCode: payload.couponCode
    }).lean();
    if (duplicate) {
        throw new ValidationError('Coupon code already exists');
    }

    const updated = await FoodOffer.findOneAndUpdate(
        { _id: offerId, createdByRestaurantId: restaurantId },
        {
            $set: {
                ...payload,
                restaurantScope: 'selected',
                restaurantId: existing.restaurantId,
                approvalStatus: 'pending',
                status: 'inactive',
                showInCart: false,
                rejectionReason: ''
            }
        },
        { new: true }
    ).lean();

    return updated;
}
