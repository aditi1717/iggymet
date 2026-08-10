import mongoose from 'mongoose';

const dailyIncentiveCreditSchema = new mongoose.Schema(
    {
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },
        campaignId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDailyIncentiveCampaign',
            required: true,
            index: true
        },
        zoneId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodZone',
            default: null,
            index: true
        },
        incentiveDate: {
            type: Date,
            required: true,
            index: true
        },
        slabTrips: { type: Number, required: true, min: 1 },
        rewardAmount: { type: Number, required: true, min: 0 },
        completedTrips: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: ['credited', 'pending', 'paid', 'void'],
            default: 'pending',
            index: true
        },
        walletTransactionId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true
        },
        settlementBatchId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true
        },
        walletTransactionType: {
            type: String,
            trim: true,
            default: 'incentive'
        },
        creditedAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        paidAt: {
            type: Date,
            default: null,
            index: true
        },
        paidByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { collection: 'food_daily_incentive_credits', timestamps: true }
);

dailyIncentiveCreditSchema.index(
    { deliveryPartnerId: 1, campaignId: 1, incentiveDate: 1, slabTrips: 1 },
    { unique: true }
);
dailyIncentiveCreditSchema.index({ deliveryPartnerId: 1, incentiveDate: -1 });

export const FoodDailyIncentiveCredit = mongoose.model(
    'FoodDailyIncentiveCredit',
    dailyIncentiveCreditSchema
);
