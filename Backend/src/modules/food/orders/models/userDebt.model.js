import mongoose from 'mongoose';

const foodUserDebtSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodUser',
      required: true,
      index: true,
    },
    failedOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodOrder',
      required: true,
      unique: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['unpaid', 'paid', 'waived'],
      default: 'unpaid',
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    reasonType: {
      type: String,
      default: 'user_unavailable',
      trim: true,
    },
    reason: {
      type: String,
      default: '',
      trim: true,
    },
    proofImageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    callAttempted: {
      type: Boolean,
      default: false,
    },
    waitTimerCompletedAt: {
      type: Date,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    settledOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodOrder',
      default: null,
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'food_user_debts',
    timestamps: true,
  },
);

foodUserDebtSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const FoodUserDebt = mongoose.model('FoodUserDebt', foodUserDebtSchema);

