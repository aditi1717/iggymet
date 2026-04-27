import mongoose from 'mongoose';

const foodOfferSchema = new mongoose.Schema(
    {
        couponCode: { type: String, required: true, trim: true, uppercase: true, unique: true },
        discountType: { type: String, enum: ['percentage', 'flat-price'], default: 'percentage', index: true },
        discountValue: { type: Number, required: true, min: 0 },
        
        // NEW: Who funds this coupon - restaurant or platform
        fundedBy: { 
            type: String, 
            enum: ['restaurant', 'platform'], 
            default: 'platform',
            index: true 
        },
        
        customerScope: { type: String, enum: ['all', 'first-time'], default: 'all', index: true },
        restaurantScope: { type: String, enum: ['all', 'selected'], default: 'all', index: true },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant' },
        minOrderValue: { type: Number, default: 0, min: 0 },
        maxDiscount: { type: Number, default: null, min: 0 },
        usageLimit: { type: Number, default: null, min: 0 },
        perUserLimit: { type: Number, default: null, min: 0 },
        usedCount: { type: Number, default: 0, min: 0 },
        startDate: { type: Date },
        isFirstOrderOnly: { type: Boolean, default: false },
        endDate: { type: Date },
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'approved',
            index: true
        },
        createdByRestaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', default: null },
        rejectionReason: { type: String, default: '' },
        status: { type: String, enum: ['active', 'paused', 'inactive'], default: 'active', index: true },
        showInCart: { type: Boolean, default: true }
    },
    { collection: 'food_offers', timestamps: true }
);

foodOfferSchema.index({ restaurantId: 1, createdAt: -1 });
foodOfferSchema.index({ approvalStatus: 1, createdAt: -1 });

export const FoodOffer = mongoose.model('FoodOffer', foodOfferSchema);
