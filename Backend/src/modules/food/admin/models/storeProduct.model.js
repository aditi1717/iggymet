import mongoose from 'mongoose';

// Each variant has its own name, price, and stock quantity
const storeVariantSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },     // e.g. "Small", "Medium", "Large"
        price: { type: Number, required: true, min: 0 },        // Variant price in ₹
        stock: { type: Number, required: true, min: 0, default: 0 } // Available stock count
    },
    { _id: true }
);

const storeProductSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        description: {
            type: String,
            trim: true,
            default: ''
        },
        image: {
            type: String,
            trim: true,
            default: ''
        },
        category: {
            type: String,
            trim: true,
            default: ''          // e.g. "Uniform", "Equipment", "Accessories"
        },
        variants: {
            type: [storeVariantSchema],
            default: []          // At least one variant expected
        },
        isPublished: {
            type: Boolean,
            default: false,      // Admin must explicitly publish before delivery boys can see
            index: true
        },
        sortOrder: {
            type: Number,
            default: 0           // For ordering products in the shop
        }
    },
    {
        collection: 'store_products',
        timestamps: true
    }
);

storeProductSchema.index({ isPublished: 1, createdAt: -1 });
storeProductSchema.index({ name: 'text', description: 'text' }); // For text search

export const StoreProduct = mongoose.model('StoreProduct', storeProductSchema);
