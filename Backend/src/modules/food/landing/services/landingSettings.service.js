import { v2 as cloudinary } from 'cloudinary';
import { uploadBufferDetailed } from '../../../../services/cloudinary.service.js';
import { FoodLandingSettings } from '../models/landingSettings.model.js';

export const getLandingSettings = async () => {
    let doc = await FoodLandingSettings.findOne().lean();
    if (!doc) {
        doc = (await FoodLandingSettings.create({})).toObject();
    }
    return doc;
};

export const updateLandingSettings = async (payload) => {
    const doc = await FoodLandingSettings.findOneAndUpdate({}, payload, {
        new: true,
        upsert: true
    }).lean();
    return doc;
};

export const uploadLandingHeaderVideo = async (file) => {
    if (!file?.buffer) {
        throw new Error('Video file is required');
    }

    const existing = await getLandingSettings();
    const uploaded = await uploadBufferDetailed(file.buffer, {
        folder: 'food/landing/header-video',
        resourceType: 'video'
    });

    if (existing?.headerVideoPublicId) {
        await cloudinary.uploader
            .destroy(existing.headerVideoPublicId, { resource_type: 'video' })
            .catch(() => {});
    }

    return updateLandingSettings({
        headerVideoUrl: uploaded?.secure_url || '',
        headerVideoPublicId: uploaded?.public_id || ''
    });
};

export const deleteLandingHeaderVideo = async () => {
    const existing = await getLandingSettings();

    if (existing?.headerVideoPublicId) {
        await cloudinary.uploader
            .destroy(existing.headerVideoPublicId, { resource_type: 'video' })
            .catch(() => {});
    }

    return updateLandingSettings({
        headerVideoUrl: '',
        headerVideoPublicId: ''
    });
};

export const uploadGourmetBanner = async (file) => {
    if (!file?.buffer) {
        throw new Error('Image file is required');
    }

    const existing = await getLandingSettings();
    const uploaded = await uploadBufferDetailed(file.buffer, {
        folder: 'food/landing/gourmet-banner',
        resourceType: 'image'
    });

    if (existing?.gourmetBannerPublicId) {
        await cloudinary.uploader
            .destroy(existing.gourmetBannerPublicId)
            .catch(() => {});
    }

    return updateLandingSettings({
        gourmetBannerUrl: uploaded?.secure_url || '',
        gourmetBannerPublicId: uploaded?.public_id || ''
    });
};

export const deleteGourmetBanner = async () => {
    const existing = await getLandingSettings();

    if (existing?.gourmetBannerPublicId) {
        await cloudinary.uploader
            .destroy(existing.gourmetBannerPublicId)
            .catch(() => {});
    }

    return updateLandingSettings({
        gourmetBannerUrl: '',
        gourmetBannerPublicId: ''
    });
};

export const uploadOffersBanner = async (file) => {
    if (!file?.buffer) {
        throw new Error('Image file is required');
    }

    const existing = await getLandingSettings();
    const uploaded = await uploadBufferDetailed(file.buffer, {
        folder: 'food/landing/offers-banner',
        resourceType: 'image'
    });

    if (existing?.offersBannerPublicId) {
        await cloudinary.uploader
            .destroy(existing.offersBannerPublicId)
            .catch(() => {});
    }

    return updateLandingSettings({
        offersBannerUrl: uploaded?.secure_url || '',
        offersBannerPublicId: uploaded?.public_id || ''
    });
};

export const deleteOffersBanner = async () => {
    const existing = await getLandingSettings();

    if (existing?.offersBannerPublicId) {
        await cloudinary.uploader
            .destroy(existing.offersBannerPublicId)
            .catch(() => {});
    }

    return updateLandingSettings({
        offersBannerUrl: '',
        offersBannerPublicId: ''
    });
};

export const uploadUnderPriceBanner = async (file) => {
    if (!file?.buffer) {
        throw new Error('Image file is required');
    }

    const existing = await getLandingSettings();
    const uploaded = await uploadBufferDetailed(file.buffer, {
        folder: 'food/landing/under-price-banner',
        resourceType: 'image'
    });

    if (existing?.underPriceBannerPublicId) {
        await cloudinary.uploader
            .destroy(existing.underPriceBannerPublicId)
            .catch(() => {});
    }

    return updateLandingSettings({
        underPriceBannerUrl: uploaded?.secure_url || '',
        underPriceBannerPublicId: uploaded?.public_id || ''
    });
};

export const deleteUnderPriceBanner = async () => {
    const existing = await getLandingSettings();

    if (existing?.underPriceBannerPublicId) {
        await cloudinary.uploader
            .destroy(existing.underPriceBannerPublicId)
            .catch(() => {});
    }

    return updateLandingSettings({
        underPriceBannerUrl: '',
        underPriceBannerPublicId: ''
    });
};

