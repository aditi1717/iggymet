import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongodbUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const check = async () => {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;

    // Fetch fee settings
    const feeSettings = await db.collection('foodfeesettings').find({}).toArray();
    console.log('\n--- FEE SETTINGS (foodfeesettings) ---');
    console.log(JSON.stringify(feeSettings, null, 2));

    // Also try other possible collection names in case
    const altSettings = await db.collection('food_fee_settings').find({}).toArray();
    console.log('\n--- FEE SETTINGS (food_fee_settings) ---');
    console.log(JSON.stringify(altSettings, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

check();
