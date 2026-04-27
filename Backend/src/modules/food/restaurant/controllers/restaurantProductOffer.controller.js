import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    createRestaurantProductOffer,
    listRestaurantProductOffers,
    deleteRestaurantProductOffer,
    updateRestaurantProductOffer,
    listPublicRestaurantProductOffers
} from '../services/restaurantProductOffer.service.js';

export const createRestaurantProductOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await createRestaurantProductOffer(restaurantId, req.body || {});
        return sendResponse(res, 201, 'Offer submitted for approval', { offer });
    } catch (error) {
        next(error);
    }
};

export const listRestaurantProductOffersController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offers = await listRestaurantProductOffers(restaurantId);
        return sendResponse(res, 200, 'Offers fetched successfully', { offers });
    } catch (error) {
        next(error);
    }
};

export const deleteRestaurantProductOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const result = await deleteRestaurantProductOffer(restaurantId, req.params.id);
        if (!result) return sendError(res, 404, 'Offer not found');
        return sendResponse(res, 200, 'Offer deleted successfully', result);
    } catch (error) {
        next(error);
    }
};

export const updateRestaurantProductOfferController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        const offer = await updateRestaurantProductOffer(restaurantId, req.params.id, req.body || {});
        if (!offer) return sendError(res, 404, 'Offer not found');
        return sendResponse(res, 200, 'Offer updated successfully', { offer });
    } catch (error) {
        next(error);
    }
};

export const listPublicRestaurantProductOffersController = async (req, res, next) => {
    try {
        const offers = await listPublicRestaurantProductOffers(req.params.id, req.user);
        return sendResponse(res, 200, 'Offers fetched successfully', { offers });
    } catch (error) {
        next(error);
    }
};
