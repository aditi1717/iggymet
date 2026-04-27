import mongoose from 'mongoose';

const restaurantOfferSchema = new mongoose.Schema(
    {
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        createdByRestaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
        productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' }],
        title: { type: String, required: true, trim: true, maxlength: 120 },
        discountType: { type: String, enum: ['percentage', 'flat-price'], required: true },
        discountValue: { type: Number, required: true, min: 0 },
        maxDiscount: { type: Number, default: null, min: 0 },
        maxOfferQuantityPerOrder: { type: Number, default: null, min: 0 },
        usageLimit: { type: Number, default: null, min: 0 },
        perUserLimit: { type: Number, default: null, min: 0 },
        usedCount: { type: Number, default: 0, min: 0 },
        startDate: { type: Date, default: null },
        endDate: { type: Date, default: null },
        showInCart: { type: Boolean, default: true },
        status: { type: String, enum: ['active', 'paused', 'inactive'], default: 'inactive', index: true },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
        rejectionReason: { type: String, default: '' }
    },
    { collection: 'restaurant_offers', timestamps: true }
);

restaurantOfferSchema.index({ restaurantId: 1, createdAt: -1 });
restaurantOfferSchema.index({ productId: 1 });
restaurantOfferSchema.index({ productIds: 1 });

export const RestaurantOffer = mongoose.model('RestaurantOffer', restaurantOfferSchema);
