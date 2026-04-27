import mongoose from 'mongoose';
import { FoodSupportTicket } from '../models/supportTicket.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export async function createSupportTicketController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const body = req.body || {};
        const type = String(body.type || '').trim();
        const issueType = String(body.issueType || '').trim() || (type === 'order' ? 'Order issue' : type === 'restaurant' ? 'Restaurant issue' : 'Other issue');
        const description = String(body.description || '').trim();
        if (!['order', 'restaurant', 'other'].includes(type)) {
            return sendError(res, 400, 'Invalid ticket type');
        }
        if (!description) {
            return sendError(res, 400, 'description required');
        }
        const doc = {
            userId: new mongoose.Types.ObjectId(userId),
            type,
            issueType,
            description
        };
        if (type === 'order') {
            const rawOrderId = String(body.orderId || body.orderMongoId || body.displayOrderId || '').trim();
            if (!rawOrderId) {
                return sendError(res, 400, 'orderId required');
            }
            const { FoodOrder } = await import('../../orders/models/order.model.js');
            const order = mongoose.Types.ObjectId.isValid(rawOrderId)
                ? await FoodOrder.findOne({
                      _id: new mongoose.Types.ObjectId(rawOrderId),
                      userId: new mongoose.Types.ObjectId(userId)
                  })
                      .select('_id restaurantId')
                      .lean()
                : await FoodOrder.findOne({
                      orderId: rawOrderId,
                      userId: new mongoose.Types.ObjectId(userId)
                  })
                      .select('_id restaurantId')
                      .lean();

            if (!order?._id) {
                return sendError(res, 400, 'orderId required');
            }
            const orderMongoId = order._id;
            doc.orderId = orderMongoId;
            if (order?.restaurantId) {
                doc.restaurantId = order.restaurantId;
            }
        }
        if (type === 'restaurant') {
            if (!body.restaurantId || !mongoose.Types.ObjectId.isValid(body.restaurantId)) {
                return sendError(res, 400, 'restaurantId required');
            }
            doc.restaurantId = new mongoose.Types.ObjectId(body.restaurantId);
        }
        const created = await FoodSupportTicket.create(doc);
        return sendResponse(res, 201, 'Ticket created', { ticket: created.toObject() });
    } catch (e) {
        next(e);
    }
}

export async function listMySupportTicketsController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 50);
        const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
        const skip = (page - 1) * limit;
        const [tickets, total] = await Promise.all([
            FoodSupportTicket.find({ userId: new mongoose.Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate({
                    path: 'orderId',
                    select: 'orderId displayOrderId pricing totalAmount restaurantId',
                    populate: {
                        path: 'restaurantId',
                        select: 'restaurantName name area city'
                    }
                })
                .populate('restaurantId', 'restaurantName name area city')
                .lean(),
            FoodSupportTicket.countDocuments({ userId: new mongoose.Types.ObjectId(userId) })
        ]);
        return sendResponse(res, 200, 'Tickets fetched', { tickets, total, page, limit });
    } catch (e) {
        next(e);
    }
}
