import mongoose from 'mongoose';

const deliveryCashLimitSchema = new mongoose.Schema(
    {
        deliveryCashLimit: { type: Number, default: 0, min: 0 },
        deliveryWithdrawalLimit: { type: Number, default: 0, min: 0 },
        zoneLimits: [{
            zoneId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodZone',
                required: true,
            },
            deliveryCashLimit: { type: Number, default: 0, min: 0 },
        }],
        isActive: { type: Boolean, default: true, index: true }
    },
    { collection: 'food_delivery_cash_limits', timestamps: true }
);

deliveryCashLimitSchema.index({ isActive: 1, createdAt: -1 });
deliveryCashLimitSchema.index({ 'zoneLimits.zoneId': 1 });

export const FoodDeliveryCashLimit = mongoose.model('FoodDeliveryCashLimit', deliveryCashLimitSchema);

