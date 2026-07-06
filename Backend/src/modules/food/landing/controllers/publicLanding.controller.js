import mongoose from 'mongoose';
import { getPublicGourmetRestaurants } from '../services/gourmet.service.js';
import { getLandingSettings } from '../services/landingSettings.service.js';
import { FoodHeroBanner } from '../models/heroBanner.model.js';
import { FoodExploreIcon } from '../models/exploreIcon.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { sendResponse } from '../../../../utils/response.js';
import { listUnder250Banners } from '../services/under250Banner.service.js';

/** Public hero banners for user home: active only, sorted, with linkedRestaurants populated for click-through */
export const getPublicHeroBannersController = async (req, res, next) => {
    try {
        const docs = await FoodHeroBanner.find({ isActive: true })
            .sort({ sortOrder: 1, createdAt: -1 })
            .populate({
                path: 'linkedRestaurantIds',
                select: '_id restaurantName slug area city rating cuisines profileImage pureVegRestaurant zoneId status',
                model: 'FoodRestaurant'
            })
            .lean();
        let banners = (docs || []).map((b) => {
            const { linkedRestaurantIds, ...rest } = b;
            const approvedRestaurants = (Array.isArray(linkedRestaurantIds) ? linkedRestaurantIds : [])
                .filter((r) => r && r.status === 'approved');
            return {
                ...rest,
                linkedRestaurants: approvedRestaurants,
                hasOriginalLinks: Array.isArray(linkedRestaurantIds) && linkedRestaurantIds.length > 0,
                imageUrl: b.imageUrl
            };
        });
        const { zoneId } = req.query;
        banners = banners.filter((b) => {
            if (b.hasOriginalLinks && b.linkedRestaurants.length === 0) return false;
            if (zoneId && zoneId !== 'undefined' && zoneId !== 'null') {
                if (b.linkedRestaurants.length > 0) {
                    return b.linkedRestaurants.some((r) => r.zoneId && r.zoneId.toString() === zoneId.toString());
                }
                return true; // global banners are kept
            }
            // If zoneId is not provided or is invalid, do not show banners linked to restaurants
            return !b.hasOriginalLinks;
        });
        return sendResponse(res, 200, 'Hero banners fetched', { banners });
    } catch (error) {
        next(error);
    }
};

export const getPublicUnder250BannersController = async (req, res, next) => {
    try {
        const { zoneId } = req.query;
        const docs = await listUnder250Banners({ isActive: true, zoneId });
        return sendResponse(res, 200, 'Under 250 banners fetched', { banners: docs });
    } catch (error) {
        next(error);
    }
};

export const getPublicExploreIconsController = async (req, res, next) => {
    try {
        const docs = await FoodExploreIcon.find({ isActive: true }).sort({ sortOrder: 1, createdAt: -1 }).lean();
        const items = docs.map(({ targetPath, sortOrder, ...rest }) => ({ ...rest, link: targetPath, order: sortOrder }));
        return sendResponse(res, 200, 'Explore icons fetched', { items });
    } catch (error) {
        next(error);
    }
};


export const getPublicGourmetController = async (req, res, next) => {
    try {
        const docs = await getPublicGourmetRestaurants();
        const restaurants = (docs || []).map((d) => ({
            ...(d.restaurant || {}),
            _id: d.restaurant?._id || d.restaurantId,
            priority: d.priority
        })).filter((r) => r && r._id);
        return sendResponse(res, 200, 'Gourmet restaurants fetched', { restaurants });
    } catch (error) {
        next(error);
    }
};

export const getPublicLandingSettingsController = async (req, res, next) => {
    try {
        const settings = await getLandingSettings();
        const ids = settings?.recommendedRestaurantIds || [];
        let recommendedRestaurants = [];
        
        const { zoneId } = req.query;
        if (zoneId && zoneId !== 'undefined' && zoneId !== 'null' && mongoose.Types.ObjectId.isValid(String(zoneId))) {
            if (Array.isArray(ids) && ids.length > 0) {
                recommendedRestaurants = await FoodRestaurant.find({ 
                    _id: { $in: ids }, 
                    status: 'approved',
                    zoneId: new mongoose.Types.ObjectId(String(zoneId))
                })
                .select('restaurantName area city profileImage coverImages menuImages slug rating cuisines pureVegRestaurant zoneId')
                .lean();
            }
        }
        const payload = {
            ...settings,
            headerVideoPublicId: undefined,
            recommendedRestaurantIds: undefined,
            recommendedRestaurants
        };
        return sendResponse(res, 200, 'Landing settings fetched', payload);
    } catch (error) {
        next(error);
    }
};

