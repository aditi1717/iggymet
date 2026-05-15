import mongoose from 'mongoose';
import { ValidationError, NotFoundError } from '../auth/errors.js';
import { FoodNotification } from './models/notification.model.js';

const normalizePagination = ({ page = 1, limit = 20 } = {}) => {
    const nextPage = Math.max(1, Number(page) || 1);
    const nextLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    return {
        page: nextPage,
        limit: nextLimit,
        skip: (nextPage - 1) * nextLimit
    };
};

const normalizeOwnerType = (role) => {
    const normalized = String(role || '').trim().toUpperCase();
    if (normalized === 'USER') return 'USER';
    if (normalized === 'RESTAURANT') return 'RESTAURANT';
    if (normalized === 'DELIVERY_PARTNER' || normalized === 'DELIVERY' || normalized === 'PARTNER') return 'DELIVERY_PARTNER';
    return null;
};

const ensureObjectId = (value, fieldName = 'ID') => {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (mongoose.Types.ObjectId.isValid(String(value))) {
        return new mongoose.Types.ObjectId(String(value));
    }
    throw new ValidationError(`${fieldName} is invalid`);
};

export const resolveNotificationOwnerFromRequest = (user = {}) => {
    const ownerType = normalizeOwnerType(user?.role);
    const ownerId = user?.userId || user?._id || null;

    if (!ownerType || !ownerId) {
        throw new ValidationError('Authenticated notification owner not found');
    }

    return {
        ownerType,
        ownerId: ensureObjectId(ownerId, 'ownerId')
    };
};

export const createInboxNotifications = async ({ notifications = [] } = {}) => {
    console.log(`[Notification:Service] createInboxNotifications: Processing ${notifications?.length || 0} items`);
    const rows = Array.isArray(notifications)
        ? notifications.filter((item) => item?.ownerType && item?.ownerId && item?.title && item?.message)
        : [];

    if (!rows.length) return [];

    const operations = rows.map((item) => {
        const payload = {
            ownerType: item.ownerType,
            ownerId: ensureObjectId(item.ownerId, 'ownerId'),
            title: String(item.title).trim(),
            message: String(item.message).trim(),
            link: String(item.link || '').trim(),
            category: String(item.category || 'broadcast').trim(),
            source: String(item.source || 'ADMIN_BROADCAST').trim(),
            metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
        };

        if (item.broadcastId && mongoose.Types.ObjectId.isValid(String(item.broadcastId))) {
            payload.broadcastId = new mongoose.Types.ObjectId(String(item.broadcastId));
        }

        const supportTicketId = String(payload.metadata?.ticketId || '').trim();
        const isSupportTicketNotification = payload.source === 'SUPPORT_TICKET' && supportTicketId;
        const filter = payload.broadcastId
            ? {
                broadcastId: payload.broadcastId,
                ownerType: payload.ownerType,
                ownerId: payload.ownerId
            }
            : isSupportTicketNotification
                ? {
                    ownerType: payload.ownerType,
                    ownerId: payload.ownerId,
                    source: payload.source,
                    $or: [
                        { 'metadata.ticketId': supportTicketId },
                        { 'metadata.ticketId': mongoose.Types.ObjectId.isValid(supportTicketId) ? new mongoose.Types.ObjectId(supportTicketId) : supportTicketId }
                    ]
                }
                : {
                    ownerType: payload.ownerType,
                    ownerId: payload.ownerId,
                    title: payload.title,
                    message: payload.message,
                    source: payload.source
                };
        const readStateUpdate = isSupportTicketNotification
            ? { isRead: false, readAt: null, dismissedAt: null }
            : {};
        const insertReadState = isSupportTicketNotification
            ? {}
            : { isRead: false, readAt: null };
        const update = {
            $set: {
                ...payload,
                ...readStateUpdate,
                updatedAt: new Date()
            },
            $setOnInsert: {
                ...insertReadState
            }
        };

        // Ensure dismissedAt is only in one of them to avoid MongoBulkWriteError (code 40)
        if (isSupportTicketNotification) {
            // Already in readStateUpdate -> $set
        } else {
            update.$setOnInsert.dismissedAt = null;
        }

        return {
            updateOne: {
                filter,
                update,
                upsert: true
            }
        };
    });

    console.log(`[Notification:Service] Bulk writing ${operations.length} notifications to food_notifications collection`);
    const result = await FoodNotification.bulkWrite(operations, { ordered: false });
    console.log(`[Notification:Service] Bulk write result: upserted=${result.nUpserted}, matched=${result.nMatched}, modified=${result.nModified}`);

    const ids = rows
        .map((item) => item.broadcastId)
        .filter((value) => value && mongoose.Types.ObjectId.isValid(String(value)))
        .map((value) => new mongoose.Types.ObjectId(String(value)));

    if (ids.length > 0) {
        return FoodNotification.find({ broadcastId: { $in: ids } }).sort({ createdAt: -1 }).lean();
    }

    return [];
};

export const getInboxNotifications = async ({ ownerType, ownerId, page = 1, limit = 20 } = {}) => {
    const normalizedOwnerType = normalizeOwnerType(ownerType);
    const normalizedOwnerId = ensureObjectId(ownerId, 'ownerId');
    const { skip, ...meta } = normalizePagination({ page, limit });

    const filter = {
        ownerType: normalizedOwnerType,
        ownerId: normalizedOwnerId,
        dismissedAt: null
    };

    console.log(`[Notification:Service] getInboxNotifications Filter: ${JSON.stringify(filter)}`);
    const debugCountAll = await FoodNotification.countDocuments({ ownerType: normalizedOwnerType, ownerId: normalizedOwnerId });
    console.log(`[Notification:Service] getInboxNotifications: Found ${debugCountAll} TOTAL (including dismissed) for this owner`);

    const [items, total, unreadCount] = await Promise.all([
        FoodNotification.find(filter)
            .sort({ updatedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(meta.limit)
            .lean(),
        FoodNotification.countDocuments(filter),
        FoodNotification.countDocuments({
            ...filter,
            isRead: false
        })
    ]);

    // 2. LAZY BACKFILL: Check for missed broadcasts (e.g. for newly created accounts)
    // We do this if it's the first page to ensure they see recent global announcements.
    if (page === 1) {
        try {
            const { BroadcastNotification } = await import('./models/notificationBroadcast.model.js');
            
            // Map our ownerType to broadcast targetType
            const broadcastTargetType = normalizedOwnerType === 'DELIVERY_PARTNER' ? 'DELIVERY' : normalizedOwnerType;
            
            // Fetch recent broadcasts (last 30 days) that might apply
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const applicableBroadcasts = await BroadcastNotification.find({
                targetType: { $in: ['ALL', broadcastTargetType] },
                createdAt: { $gte: thirtyDaysAgo }
            }).limit(10).lean();

            if (applicableBroadcasts.length > 0) {
                const existingBroadcastIds = await FoodNotification.find({
                    ownerType: normalizedOwnerType,
                    ownerId: normalizedOwnerId,
                    broadcastId: { $in: applicableBroadcasts.map(b => b._id) }
                }).distinct('broadcastId');

                const missing = applicableBroadcasts.filter(b => !existingBroadcastIds.some(id => String(id) === String(b._id)));
                
                if (missing.length > 0) {
                    console.log(`[Notification:Service] Backfilling ${missing.length} missed broadcasts for ${normalizedOwnerType}:${normalizedOwnerId}`);
                    await createInboxNotifications({
                        notifications: missing.map(b => ({
                            ownerType: normalizedOwnerType,
                            ownerId: normalizedOwnerId,
                            title: b.title,
                            message: b.message,
                            link: b.link,
                            category: 'broadcast',
                            broadcastId: b._id
                        }))
                    });
                    
                    // Re-fetch items if we added something (to ensure they appear in the result)
                    return getInboxNotifications({ ownerType, ownerId, page, limit });
                }
            }
        } catch (err) {
            console.error('[Notification:Service] Failed to backfill broadcasts:', err);
        }
    }

    console.log(`[Notification:Service] getInboxNotifications for ${normalizedOwnerType}:${normalizedOwnerId} found ${items.length} items. Total: ${total}`);

    return {
        items,
        pagination: {
            page: meta.page,
            limit: meta.limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / meta.limit))
        },
        unreadCount
    };
};

export const markNotificationAsRead = async ({ notificationId, ownerType, ownerId } = {}) => {
    const notification = await FoodNotification.findOneAndUpdate(
        {
            _id: ensureObjectId(notificationId, 'notificationId'),
            ownerType: normalizeOwnerType(ownerType),
            ownerId: ensureObjectId(ownerId, 'ownerId'),
            dismissedAt: null
        },
        {
            $set: {
                isRead: true,
                readAt: new Date()
            }
        },
        { new: true }
    ).lean();

    if (!notification) {
        throw new NotFoundError('Notification not found');
    }

    return notification;
};

export const dismissNotification = async ({ notificationId, ownerType, ownerId } = {}) => {
    const notification = await FoodNotification.findOneAndUpdate(
        {
            _id: ensureObjectId(notificationId, 'notificationId'),
            ownerType: normalizeOwnerType(ownerType),
            ownerId: ensureObjectId(ownerId, 'ownerId'),
            dismissedAt: null
        },
        {
            $set: {
                dismissedAt: new Date(),
                isRead: true,
                readAt: new Date()
            }
        },
        { new: true }
    ).lean();

    if (!notification) {
        throw new NotFoundError('Notification not found');
    }

    return notification;
};

export const dismissAllNotifications = async ({ ownerType, ownerId } = {}) => {
    const result = await FoodNotification.updateMany(
        {
            ownerType: normalizeOwnerType(ownerType),
            ownerId: ensureObjectId(ownerId, 'ownerId'),
            dismissedAt: null
        },
        {
            $set: {
                dismissedAt: new Date(),
                isRead: true,
                readAt: new Date()
            }
        }
    );

    return {
        modifiedCount: Number(result?.modifiedCount || 0)
    };
};
