// Quick script to check if order has discount breakdown fields
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_db';

async function checkOrder() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const FoodOrder = mongoose.model('FoodOrder', new mongoose.Schema({}, { strict: false }), 'food_orders');

    // Check the specific order
    const order = await FoodOrder.findOne({ orderId: 'FOD-KEDATF' }).lean();
    
    if (!order) {
      console.log('❌ Order FOD-KEDATF not found');
      process.exit(1);
    }

    console.log('\n📦 Order Details:');
    console.log('Order ID:', order.orderId);
    console.log('Created At:', order.createdAt);
    console.log('\n💰 Pricing Object:');
    console.log(JSON.stringify(order.pricing, null, 2));

    console.log('\n🔍 Discount Breakdown Check:');
    console.log('couponByAdmin exists?', 'couponByAdmin' in (order.pricing || {}));
    console.log('couponByRestaurant exists?', 'couponByRestaurant' in (order.pricing || {}));
    console.log('offerByRestaurant exists?', 'offerByRestaurant' in (order.pricing || {}));

    if ('offerByRestaurant' in (order.pricing || {})) {
      console.log('\n✅ Discount breakdown fields EXIST');
      console.log('Values:');
      console.log('  - couponByAdmin:', order.pricing.couponByAdmin);
      console.log('  - couponByRestaurant:', order.pricing.couponByRestaurant);
      console.log('  - offerByRestaurant:', order.pricing.offerByRestaurant);
    } else {
      console.log('\n❌ Discount breakdown fields DO NOT EXIST');
      console.log('This is an OLD order (placed before backend update)');
      console.log('\n💡 Solution: Place a NEW order to test the updated code');
    }

    // Check latest order
    console.log('\n\n📊 Checking Latest Order:');
    const latestOrder = await FoodOrder.findOne().sort({ createdAt: -1 }).lean();
    console.log('Latest Order ID:', latestOrder.orderId);
    console.log('Created At:', latestOrder.createdAt);
    console.log('Has discount breakdown?', 'offerByRestaurant' in (latestOrder.pricing || {}));

    if ('offerByRestaurant' in (latestOrder.pricing || {})) {
      console.log('✅ Latest order has new fields - Backend update is working!');
    } else {
      console.log('❌ Latest order does NOT have new fields');
      console.log('⚠️  Backend might not be restarted with updated code');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkOrder();
