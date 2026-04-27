import mongoose from 'mongoose';

const storeOrderSchema = new mongoose.Schema(
    {
        // Who is buying
        deliveryPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            required: true,
            index: true
        },

        // What is being bought (snapshot at time of purchase)
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'StoreProduct',
            required: true,
            index: true
        },
        productName: { type: String, required: true }, // Snapshot — keep even if product deleted
        productImage: { type: String, default: '' },   // Snapshot

        // Variant details (snapshot)
        variantId: { type: mongoose.Schema.Types.ObjectId, required: true },
        variantName: { type: String, required: true }, // e.g. "Medium"
        unitPrice: { type: Number, required: true, min: 0 }, // Price per unit at purchase time

        quantity: { type: Number, required: true, min: 1, default: 1 },
        totalAmount: { type: Number, required: true, min: 0 }, // unitPrice * quantity
        checkoutGroupId: {
            type: String,
            trim: true,
            default: '',
            index: true
        },

        // Payment info
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed'],
            default: 'pending',
            index: true
        },
        paymentMethod: {
            type: String,
            enum: ['razorpay', 'wallet', 'cod'],
            default: 'razorpay'
        },

        // Razorpay specific
        razorpayOrderId: { type: String, trim: true, default: '' },
        razorpayPaymentId: { type: String, trim: true, default: '' },
        razorpaySignature: { type: String, trim: true, default: '' },

        // Order status (after payment)
        orderStatus: {
            type: String,
            enum: ['pending', 'confirmed', 'dispatched', 'delivered', 'cancelled'],
            default: 'pending',
            index: true
        },

        // Notes
        notes: { type: String, trim: true, default: '' }
    },
    {
        collection: 'store_orders',
        timestamps: true
    }
);

storeOrderSchema.index({ deliveryPartnerId: 1, createdAt: -1 });
storeOrderSchema.index({ paymentStatus: 1, createdAt: -1 });
storeOrderSchema.index({ orderStatus: 1, createdAt: -1 });

export const StoreOrder = mongoose.model('StoreOrder', storeOrderSchema);
