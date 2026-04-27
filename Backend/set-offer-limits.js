// Quick script to set perUserLimit on all restaurant offers
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_db';

async function setOfferLimits() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const RestaurantOffer = mongoose.model('RestaurantOffer', new mongoose.Schema({}, { strict: false }), 'restaurant_offers');

    // Find offers without perUserLimit
    const offersWithoutLimit = await RestaurantOffer.find({
      $or: [
        { perUserLimit: { $exists: false } },
        { perUserLimit: 0 },
        { perUserLimit: null }
      ]
    });

    console.log(`\n📊 Found ${offersWithoutLimit.length} offers without perUserLimit`);

    if (offersWithoutLimit.length === 0) {
      console.log('✅ All offers already have perUserLimit set!');
      await mongoose.disconnect();
      return;
    }

    // Show offers that will be updated
    console.log('\n📋 Offers to update:');
    offersWithoutLimit.forEach((offer, index) => {
      console.log(`${index + 1}. ${offer.title || 'Untitled'} (ID: ${offer._id})`);
    });

    // Update all offers to have perUserLimit = 1 (one-time use per user)
    const result = await RestaurantOffer.updateMany(
      {
        $or: [
          { perUserLimit: { $exists: false } },
          { perUserLimit: 0 },
          { perUserLimit: null }
        ]
      },
      { 
        $set: { 
          perUserLimit: 1  // One-time use per user
        } 
      }
    );

    console.log(`\n✅ Updated ${result.modifiedCount} offers`);
    console.log('✅ All offers now have perUserLimit = 1');

    // Verify
    const updatedOffers = await RestaurantOffer.find({
      _id: { $in: offersWithoutLimit.map(o => o._id) }
    }, { title: 1, perUserLimit: 1 });

    console.log('\n📊 Verification:');
    updatedOffers.forEach((offer, index) => {
      console.log(`${index + 1}. ${offer.title}: perUserLimit = ${offer.perUserLimit} ✅`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    console.log('\n🎉 Done! Restart backend and test.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setOfferLimits();
