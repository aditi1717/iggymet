import mongoose from 'mongoose';

const restaurantOfferUsageSchema = new mongoose.Schema(
    {
        offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'RestaurantOffer', index: true, required: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', index: true, required: true },
        count: { type: Number, default: 0, min: 0 },
        lastUsedAt: { type: Date, default: null }
    },
    { collection: 'restaurant_offer_usages', timestamps: true }
);

restaurantOfferUsageSchema.index({ offerId: 1, userId: 1 }, { unique: true });

export const RestaurantOfferUsage = mongoose.model('RestaurantOfferUsage', restaurantOfferUsageSchema);
