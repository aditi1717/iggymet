import mongoose from 'mongoose';

const dailyIncentiveSlabSchema = new mongoose.Schema(
    {
        trips: { type: Number, required: true, min: 1 },
        amount: { type: Number, required: true, min: 0 },
        label: { type: String, trim: true, default: '' }
    },
    { _id: false }
);

const dailyIncentiveCampaignSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true, index: true },
        description: { type: String, trim: true, default: '' },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
            index: true
        },
        resetType: {
            type: String,
            enum: ['daily'],
            default: 'daily'
        },
        timezone: {
            type: String,
            trim: true,
            default: 'Asia/Kolkata'
        },
        zoneIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodZone',
                index: true
            }
        ],
        isAllZones: {
            type: Boolean,
            default: true,
            index: true
        },
        slabs: {
            type: [dailyIncentiveSlabSchema],
            validate: {
                validator(value) {
                    return Array.isArray(value) && value.length > 0;
                },
                message: 'At least one incentive slab is required.'
            }
        },
        maxTrips: { type: Number, min: 1, default: null },
        maxReward: { type: Number, min: 0, default: null },
        createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { collection: 'food_daily_incentive_campaigns', timestamps: true }
);

dailyIncentiveCampaignSchema.index({ status: 1, isAllZones: 1 });
dailyIncentiveCampaignSchema.index({ 'zoneIds': 1 });

export const FoodDailyIncentiveCampaign = mongoose.model(
    'FoodDailyIncentiveCampaign',
    dailyIncentiveCampaignSchema
);
