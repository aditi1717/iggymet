import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { RestaurantOffer } from '../models/restaurantOffer.model.js';
import { RestaurantOfferUsage } from '../models/restaurantOfferUsage.model.js';

const ensureObjectId = (id, label) => {
    if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
        throw new ValidationError(`Invalid ${label}`);
    }
    return new mongoose.Types.ObjectId(String(id));
};

const ensureObjectIdList = (ids = [], fallbackId = null) => {
    const source = Array.isArray(ids) && ids.length > 0 ? ids : fallbackId ? [fallbackId] : [];
    const normalized = source
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id, index, arr) => arr.indexOf(id) === index);

    if (!normalized.length) {
        throw new ValidationError('At least one product is required');
    }

    return normalized.map((id) => ensureObjectId(id, 'productId'));
};

export async function createRestaurantProductOffer(restaurantId, body = {}) {
    const rid = ensureObjectId(restaurantId, 'restaurant id');
    const productIds = ensureObjectIdList(body.productIds, body.productId);
    const productId = productIds[0];

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) throw new ValidationError('Title is required');

    const discountType = body.discountType === 'flat-price' ? 'flat-price' : 'percentage';
    const discountValue = Number(body.discountValue);
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }
    let maxDiscount = null;
    if (discountType === 'percentage') {
        maxDiscount = Number(body.maxDiscount);
        if (!Number.isFinite(maxDiscount) || maxDiscount <= 0) {
            throw new ValidationError('maxDiscount is required for percentage offers');
        }
    }

    const maxOfferQuantityPerOrder = body.maxOfferQuantityPerOrder !== undefined
        ? Number(body.maxOfferQuantityPerOrder)
        : null;
    const usageLimit = body.usageLimit !== undefined ? Number(body.usageLimit) : null;
    const perUserLimit = body.perUserLimit !== undefined ? Number(body.perUserLimit) : null;
    if (maxOfferQuantityPerOrder !== null && (!Number.isFinite(maxOfferQuantityPerOrder) || maxOfferQuantityPerOrder < 0)) {
        throw new ValidationError('maxOfferQuantityPerOrder must be 0 or greater');
    }
    if (usageLimit !== null && (!Number.isFinite(usageLimit) || usageLimit < 0)) {
        throw new ValidationError('usageLimit must be 0 or greater');
    }
    if (perUserLimit !== null && (!Number.isFinite(perUserLimit) || perUserLimit < 0)) {
        throw new ValidationError('perUserLimit must be 0 or greater');
    }

    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;
    if (startDate && Number.isNaN(startDate.getTime())) throw new ValidationError('Invalid startDate');
    if (endDate && Number.isNaN(endDate.getTime())) throw new ValidationError('Invalid endDate');
    if (startDate && endDate && endDate <= startDate) throw new ValidationError('endDate must be after startDate');

    const doc = await RestaurantOffer.create({
        restaurantId: rid,
        createdByRestaurantId: rid,
        productId,
        productIds,
        title,
        discountType,
        discountValue,
        maxDiscount,
        maxOfferQuantityPerOrder: Number.isFinite(maxOfferQuantityPerOrder) && maxOfferQuantityPerOrder > 0 ? maxOfferQuantityPerOrder : null,
        usageLimit: Number.isFinite(usageLimit) && usageLimit >= 0 ? usageLimit : null,
        perUserLimit: Number.isFinite(perUserLimit) && perUserLimit >= 0 ? perUserLimit : null,
        startDate: startDate || null,
        endDate: endDate || null,
        status: 'active',
        approvalStatus: 'approved',
        showInCart: true
    });

    return doc.toObject();
}

export async function listRestaurantProductOffers(restaurantId) {
    const rid = ensureObjectId(restaurantId, 'restaurant id');
    const list = await RestaurantOffer.find({ restaurantId: rid }).sort({ createdAt: -1 }).lean();
    return list.map((o) => ({
        ...o,
        productIds: Array.isArray(o.productIds) && o.productIds.length > 0 ? o.productIds.map((id) => String(id)) : o.productId ? [String(o.productId)] : [],
        id: String(o._id)
    }));
}

export async function listPublicRestaurantProductOffers(restaurantId, authUser = null) {
    const rid = ensureObjectId(restaurantId, 'restaurant id');
    const now = new Date();
    const list = await RestaurantOffer.find({ restaurantId: rid })
        .populate({ path: 'productId', select: 'name image coverImage photos price discountedPrice foodType preparationTime description approvalStatus isAvailable' })
        .populate({ path: 'productIds', select: 'name image coverImage photos price discountedPrice foodType preparationTime description approvalStatus isAvailable' })
        .sort({ createdAt: -1 })
        .lean();
    const filtered = [];

    const userId =
        authUser?.role === 'USER' && authUser?.userId && mongoose.Types.ObjectId.isValid(String(authUser.userId))
            ? new mongoose.Types.ObjectId(String(authUser.userId))
            : null;

    for (const offer of list) {
        if ((offer?.approvalStatus || 'approved') !== 'approved') continue;
        if (offer?.status !== 'active') continue;
        if (offer?.startDate && now < new Date(offer.startDate)) continue;
        if (offer?.endDate && now >= new Date(offer.endDate)) continue;
        if (
            Number(offer?.usageLimit) > 0 &&
            Number(offer?.usedCount || 0) >= Number(offer?.usageLimit)
        ) {
            continue;
        }
        if (userId && Number(offer?.perUserLimit) > 0) {
            const usage = await RestaurantOfferUsage.findOne({
                offerId: offer._id,
                userId,
            }).lean();
            if (usage && Number(usage.count) >= Number(offer.perUserLimit)) {
                continue;
            }
        }

        const approvedPrimaryProduct =
            offer?.productId &&
            String(offer.productId.approvalStatus || '') === 'approved' &&
            offer.productId.isAvailable !== false
                ? offer.productId
                : null;
        const approvedProducts = Array.isArray(offer?.productIds)
            ? offer.productIds.filter(
                (product) =>
                    product &&
                    String(product.approvalStatus || '') === 'approved' &&
                    product.isAvailable !== false,
            )
            : [];

        if (!approvedPrimaryProduct && approvedProducts.length === 0) {
            continue;
        }

        offer.productId = approvedPrimaryProduct;
        offer.productIds = approvedProducts;
        filtered.push(offer);
    }

    return filtered.map((o) => ({
        ...o,
        id: String(o._id),
        productName: o.productId?.name || '',
        productImage: o.productId?.image || o.productId?.coverImage || (Array.isArray(o.productId?.photos) ? o.productId.photos[0] : null),
        products: Array.isArray(o.productIds) && o.productIds.length > 0
            ? o.productIds.map((product) => ({
                id: String(product?._id || ''),
                name: product?.name || '',
                image: product?.image || product?.coverImage || (Array.isArray(product?.photos) ? product.photos[0] : null),
                price: product?.price ?? null,
                discountedPrice: product?.discountedPrice ?? null,
                foodType: product?.foodType || '',
                preparationTime: product?.preparationTime || '',
                description: product?.description || '',
            })).filter((product) => product.id)
            : o.productId
                ? [{
                    id: String(o.productId?._id || ''),
                    name: o.productId?.name || '',
                    image: o.productId?.image || o.productId?.coverImage || (Array.isArray(o.productId?.photos) ? o.productId.photos[0] : null),
                    price: o.productId?.price ?? null,
                    discountedPrice: o.productId?.discountedPrice ?? null,
                    foodType: o.productId?.foodType || '',
                    preparationTime: o.productId?.preparationTime || '',
                    description: o.productId?.description || '',
                }].filter((product) => product.id)
                : [],
    }));
}

export async function deleteRestaurantProductOffer(restaurantId, offerId) {
    const rid = ensureObjectId(restaurantId, 'restaurant id');
    const oid = ensureObjectId(offerId, 'offer id');
    const offer = await RestaurantOffer.findOne({ _id: oid, restaurantId: rid }).lean();
    if (!offer) return null;
    await RestaurantOffer.deleteOne({ _id: oid });
    return { id: String(offerId) };
}

export async function updateRestaurantProductOffer(restaurantId, offerId, body = {}) {
    const rid = ensureObjectId(restaurantId, 'restaurant id');
    const oid = ensureObjectId(offerId, 'offer id');
    const existing = await RestaurantOffer.findOne({ _id: oid, restaurantId: rid }).lean();
    if (!existing) return null;

    const title = typeof body.title === 'string' ? body.title.trim() : existing.title;
    if (!title) throw new ValidationError('Title is required');
    const productIds = body.productIds !== undefined || body.productId !== undefined
        ? ensureObjectIdList(body.productIds, body.productId)
        : Array.isArray(existing.productIds) && existing.productIds.length > 0
            ? existing.productIds.map((id) => ensureObjectId(id, 'productId'))
            : [ensureObjectId(existing.productId, 'productId')];
    const productId = productIds[0];

    const discountType = body.discountType === 'flat-price' ? 'flat-price' : 'percentage';
    const discountValue = body.discountValue !== undefined ? Number(body.discountValue) : existing.discountValue;
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
        throw new ValidationError('Discount value must be greater than 0');
    }
    let maxDiscount = existing.maxDiscount;
    if (discountType === 'percentage') {
        maxDiscount = body.maxDiscount !== undefined ? Number(body.maxDiscount) : existing.maxDiscount;
        if (!Number.isFinite(maxDiscount) || maxDiscount <= 0) {
            throw new ValidationError('maxDiscount is required for percentage offers');
        }
    } else {
        maxDiscount = null;
    }

    const maxOfferQuantityPerOrder = body.maxOfferQuantityPerOrder !== undefined
        ? Number(body.maxOfferQuantityPerOrder)
        : existing.maxOfferQuantityPerOrder;
    const usageLimit = body.usageLimit !== undefined ? Number(body.usageLimit) : existing.usageLimit;
    const perUserLimit = body.perUserLimit !== undefined ? Number(body.perUserLimit) : existing.perUserLimit;
    if (maxOfferQuantityPerOrder !== null && (!Number.isFinite(maxOfferQuantityPerOrder) || maxOfferQuantityPerOrder < 0)) {
        throw new ValidationError('maxOfferQuantityPerOrder must be 0 or greater');
    }
    if (usageLimit !== null && (!Number.isFinite(usageLimit) || usageLimit < 0)) {
        throw new ValidationError('usageLimit must be 0 or greater');
    }
    if (perUserLimit !== null && (!Number.isFinite(perUserLimit) || perUserLimit < 0)) {
        throw new ValidationError('perUserLimit must be 0 or greater');
    }

    const startDate = body.startDate !== undefined ? (body.startDate ? new Date(body.startDate) : null) : existing.startDate;
    const endDate = body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : existing.endDate;
    if (startDate && Number.isNaN(startDate.getTime())) throw new ValidationError('Invalid startDate');
    if (endDate && Number.isNaN(endDate.getTime())) throw new ValidationError('Invalid endDate');
    if (startDate && endDate && endDate <= startDate) throw new ValidationError('endDate must be after startDate');

    const updated = await RestaurantOffer.findOneAndUpdate(
        { _id: oid, restaurantId: rid },
        {
            $set: {
                title,
                productId,
                productIds,
                discountType,
                discountValue,
                maxDiscount,
                maxOfferQuantityPerOrder: Number.isFinite(maxOfferQuantityPerOrder) && maxOfferQuantityPerOrder > 0 ? maxOfferQuantityPerOrder : null,
                usageLimit: Number.isFinite(usageLimit) && usageLimit >= 0 ? usageLimit : null,
                perUserLimit: Number.isFinite(perUserLimit) && perUserLimit >= 0 ? perUserLimit : null,
                startDate: startDate || null,
                endDate: endDate || null,
                approvalStatus: 'approved',
                status: 'active',
                rejectionReason: ''
            }
        },
        { new: true }
    ).lean();

    return updated;
}
