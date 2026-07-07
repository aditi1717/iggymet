import {
    deleteLandingHeaderVideo,
    getLandingSettings,
    updateLandingSettings,
    uploadLandingHeaderVideo,
    uploadGourmetBanner,
    deleteGourmetBanner,
    uploadOffersBanner,
    deleteOffersBanner,
    uploadUnderPriceBanner,
    deleteUnderPriceBanner
} from '../services/landingSettings.service.js';
import { sendResponse } from '../../../../utils/response.js';
import { ValidationError } from '../../../../core/auth/errors.js';

export const getAdminLandingSettingsController = async (req, res, next) => {
    try {
        const settings = await getLandingSettings();
        return sendResponse(res, 200, 'Landing settings fetched successfully', { settings });
    } catch (error) {
        next(error);
    }
};

export const updateAdminLandingSettingsController = async (req, res, next) => {
    try {
        const payload = req.body || {};
        if (typeof payload !== 'object') {
            throw new ValidationError('Invalid settings payload');
        }
        if (payload.defaultUnderPriceLimit !== undefined) {
            const parsed = Number(payload.defaultUnderPriceLimit);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                throw new ValidationError('defaultUnderPriceLimit must be a positive number');
            }
            payload.defaultUnderPriceLimit = Math.round(parsed);
        }
        const updated = await updateLandingSettings(payload);
        return sendResponse(res, 200, 'Landing settings updated successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const uploadAdminLandingHeaderVideoController = async (req, res, next) => {
    try {
        const updated = await uploadLandingHeaderVideo(req.file);
        return sendResponse(res, 200, 'Landing header video uploaded successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminLandingHeaderVideoController = async (req, res, next) => {
    try {
        const updated = await deleteLandingHeaderVideo();
        return sendResponse(res, 200, 'Landing header video removed successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const uploadAdminGourmetBannerController = async (req, res, next) => {
    try {
        const updated = await uploadGourmetBanner(req.file);
        return sendResponse(res, 200, 'Gourmet page banner uploaded successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminGourmetBannerController = async (req, res, next) => {
    try {
        const updated = await deleteGourmetBanner();
        return sendResponse(res, 200, 'Gourmet page banner removed successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const uploadAdminOffersBannerController = async (req, res, next) => {
    try {
        const updated = await uploadOffersBanner(req.file);
        return sendResponse(res, 200, 'Offers page banner uploaded successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminOffersBannerController = async (req, res, next) => {
    try {
        const updated = await deleteOffersBanner();
        return sendResponse(res, 200, 'Offers page banner removed successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const uploadAdminUnderPriceBannerController = async (req, res, next) => {
    try {
        const updated = await uploadUnderPriceBanner(req.file);
        return sendResponse(res, 200, 'Under-price page banner uploaded successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

export const deleteAdminUnderPriceBannerController = async (req, res, next) => {
    try {
        const updated = await deleteUnderPriceBanner();
        return sendResponse(res, 200, 'Under-price page banner removed successfully', { settings: updated });
    } catch (error) {
        next(error);
    }
};

