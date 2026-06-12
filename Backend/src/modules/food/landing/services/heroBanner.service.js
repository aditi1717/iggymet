import { FoodHeroBanner } from '../models/heroBanner.model.js';
import { v2 as cloudinary } from 'cloudinary';

export const listHeroBanners = async () => {
    const banners = await FoodHeroBanner.find()
        .populate({
            path: 'linkedRestaurantIds',
            select: 'restaurantName name images.profileImage images.coverImages status'
        })
        .sort({ sortOrder: 1, createdAt: -1 })
        .lean();

    return banners.map((banner) => {
        const { linkedRestaurantIds, ...rest } = banner;
        return {
            ...rest,
            order: rest.sortOrder,
            linkedRestaurantIds: Array.isArray(linkedRestaurantIds)
                ? linkedRestaurantIds.map((restaurant) => restaurant?._id || restaurant)
                : [],
            linkedRestaurants: Array.isArray(linkedRestaurantIds) ? linkedRestaurantIds : []
        };
    });
};

export const getHeroBannerById = async (id) => {
    return FoodHeroBanner.findById(id).lean();
};

export const createHeroBannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const results = [];

    for (const file of files) {
        try {
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'food/hero-banners', resource_type: 'image' },
                    (error, result) => {
                        if (error) return reject(error);
                        return resolve(result);
                    }
                );
                stream.end(file.buffer);
            });

            const banner = await FoodHeroBanner.create({
                imageUrl: uploadResult.secure_url,
                publicId: uploadResult.public_id,
                title: meta.title,
                ctaText: meta.ctaText,
                ctaLink: meta.ctaLink,
                linkedRestaurantIds: meta.linkedRestaurantIds || [],
                sortOrder: meta.sortOrder ?? 0,
                isActive: true
            });

            results.push({ success: true, banner: banner.toObject() });
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteHeroBanner = async (id) => {
    const doc = await FoodHeroBanner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await cloudinary.uploader.destroy(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors to avoid blocking deletion
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateHeroBannerOrder = async (id, sortOrder) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return updated;
};

export const toggleHeroBannerStatus = async (id, isActive) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return updated;
};

export const linkHeroBannerRestaurants = async (id, restaurantIds = []) => {
    const updated = await FoodHeroBanner.findByIdAndUpdate(
        id,
        { linkedRestaurantIds: restaurantIds },
        { new: true }
    )
        .populate({
            path: 'linkedRestaurantIds',
            select: 'restaurantName name images.profileImage images.coverImages status'
        })
        .lean();

    if (!updated) {
        return null;
    }

    const { linkedRestaurantIds, ...rest } = updated;
    return {
        ...rest,
        order: rest.sortOrder,
        linkedRestaurantIds: Array.isArray(linkedRestaurantIds)
            ? linkedRestaurantIds.map((restaurant) => restaurant?._id || restaurant)
            : [],
        linkedRestaurants: Array.isArray(linkedRestaurantIds) ? linkedRestaurantIds : []
    };
};

