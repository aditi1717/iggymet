import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/iggymet';

async function diagnose() {
  try {
    await mongoose.connect(mongoUri);
    const db = mongoose.connection.db;

    // 1. Get all zones
    const zones = await db.collection('food_zones').find({}).toArray();
    console.log('\n--- ZONES ---');
    zones.forEach(z => {
      console.log(`Zone ID: ${z._id}, Name: ${z.name}`);
    });

    // 2. Get all restaurants, their names, and their zones
    const restaurants = await db.collection('food_restaurants').find({}).toArray();
    console.log('\n--- RESTAURANTS ---');
    restaurants.forEach(r => {
      console.log(`Restaurant ID: ${r._id}, Name: ${r.restaurantName || r.name}, Zone ID: ${r.zoneId || r.serviceZoneId}, status: ${r.status}`);
    });

    // 3. Get all food items with category containing 'chat' or similar
    const foods = await db.collection('food_items').find({}).toArray();
    console.log('\n--- FOOD ITEMS ---');
    foods.forEach(f => {
      console.log(`Food ID: ${f._id}, Name: ${f.name}, Restaurant ID: ${f.restaurantId}, Category: ${f.categoryName || f.category}, Status: ${f.approvalStatus}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

diagnose();
