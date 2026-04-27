import { sendResponse, sendError } from '../../../../utils/response.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { getRestaurantFinance } from '../services/restaurantFinance.service.js';

export const createWithdrawalRequestController = async (req, res, next) => {
    try {
        const ownerId = req.user?.userId;
        const { amount, bankDetails } = req.body;

        if (!ownerId) return sendError(res, 401, 'Restaurant authentication required');

        // Resolve actual FoodRestaurant ID
        const restaurantProfile = await FoodRestaurant.findOne({ _id: ownerId }).select('_id').lean();
        const restaurantId = restaurantProfile?._id;

        if (!restaurantId) return sendError(res, 404, 'Restaurant profile not found');
        if (!amount || amount <= 0) return sendError(res, 400, 'Invalid withdrawal amount');

        // Check if restaurant has enough balance
        const finance = await getRestaurantFinance(restaurantId);
        const availableBalance = finance?.currentCycle?.estimatedPayout || 0;

        if (amount > availableBalance) {
            return sendError(res, 400, `Insufficient balance. Available: ₹${availableBalance}`);
        }

        // Create the withdrawal request
        const withdrawal = new FoodRestaurantWithdrawal({
            restaurantId,
            amount,
            bankDetails,
            status: 'pending'
        });

        await withdrawal.save();

        return sendResponse(res, 201, 'Withdrawal request submitted successfully', withdrawal);
    } catch (error) {
        next(error);
    }
};

export const listMyWithdrawalsController = async (req, res, next) => {
    try {
        const ownerId = req.user?.userId;
        if (!ownerId) return sendError(res, 401, 'Restaurant authentication required');

        // Resolve actual FoodRestaurant ID
        const restaurantProfile = await FoodRestaurant.findOne({ _id: ownerId }).select('_id').lean();
        const restaurantId = restaurantProfile?._id;

        if (!restaurantId) {
            return sendResponse(res, 200, 'Withdrawals fetched successfully', []);
        }

        const withdrawals = await FoodRestaurantWithdrawal.find({ restaurantId })
            .sort({ createdAt: -1 })
            .lean();

        return sendResponse(res, 200, 'Withdrawals fetched successfully', withdrawals);
    } catch (error) {
        next(error);
    }
};
