import mongoose from 'mongoose';

const foodPayoutSettlementSchema = new mongoose.Schema(
    {
        beneficiaryType: {
            type: String,
            enum: ['restaurant', 'delivery'],
            required: true,
            index: true
        },
        beneficiaryId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true
        },
        batchId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true
        },
        fromDate: { type: Date, required: true },
        toDate: { type: Date, required: true },
        fromAt: { type: Date, default: null, index: true },
        toAt: { type: Date, default: null, index: true },
        transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodTransaction' }],
        ordersCount: { type: Number, default: 0, min: 0 },
        codOrdersCount: { type: Number, default: 0, min: 0 },
        grossAmount: { type: Number, default: 0, min: 0 },
        codAmount: { type: Number, default: 0, min: 0 },
        codPaidAmount: { type: Number, default: 0, min: 0 },
        paidAmount: { type: Number, default: 0, min: 0 },
        adjustmentAmount: { type: Number, default: 0 },
        status: {
            type: String,
            enum: ['pending', 'partially_paid', 'paid', 'cancelled'],
            default: 'paid',
            index: true
        },
        payoutMethod: {
            type: String,
            enum: ['bank', 'upi', 'cash', 'manual'],
            default: 'manual'
        },
        referenceNumber: { type: String, default: '', trim: true },
        note: { type: String, default: '', trim: true },
        paidAt: { type: Date, default: null, index: true },
        paidByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    {
        collection: 'food_payout_settlements',
        timestamps: true
    }
);

foodPayoutSettlementSchema.index({ beneficiaryType: 1, beneficiaryId: 1, fromDate: 1, toDate: 1 });

export const FoodPayoutSettlement = mongoose.model('FoodPayoutSettlement', foodPayoutSettlementSchema);
