import { sendResponse, sendError } from '../../../../utils/response.js';
import { createRestaurantOffer, deleteRestaurantOffer, listRestaurantOffers, updateRestaurantOffer } from '../services/restaurantOffer.service.js';

export const createRestaurantOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await createRestaurantOffer(restaurantId, req.body || {});
        return sendResponse(res, 201, 'Coupon submitted for approval', { offer });
    } catch (error) {
        next(error);
    }
};

export const listRestaurantOffersController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offers = await listRestaurantOffers(restaurantId);
        return sendResponse(res, 200, 'Coupons fetched successfully', { offers });
    } catch (error) {
        next(error);
    }
};

export const deleteRestaurantOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await deleteRestaurantOffer(restaurantId, req.params.id);
        if (!result) return sendError(res, 404, 'Coupon not found');
        return sendResponse(res, 200, 'Coupon deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateRestaurantOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await updateRestaurantOffer(restaurantId, req.params.id, req.body || {});
        if (!offer) return sendError(res, 404, 'Coupon not found');
        return sendResponse(res, 200, 'Coupon updated successfully', { offer });
    } catch (error) {
        next(error);
    }
};
