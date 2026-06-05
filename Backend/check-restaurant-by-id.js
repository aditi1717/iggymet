import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongodbUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const check = async () => {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;

    // Fetch all restaurants and filter by ID prefix
    const restaurants = await db.collection('food_restaurants').find({}).toArray();
    const matched = restaurants.find(r => String(r._id).startsWith('6a081351a7f0ed101df2'));

    if (!matched) {
      console.log('Could not find restaurant with ID starting with 6a081351a7f0ed101df2');
      console.log('Available restaurants in database:');
      restaurants.forEach(r => {
        console.log(`- ${r.restaurantName} (ID: ${r._id})`);
      });
    } else {
      console.log('\n--- RESTAURANT DETAILS ---');
      console.log('ID:', matched._id);
      console.log('Name:', matched.restaurantName);
      console.log('Status:', matched.status);
      console.log('IsActive:', matched.isActive);
      console.log('Zone ID:', matched.zoneId);
      console.log('Location:', JSON.stringify(matched.location, null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();
