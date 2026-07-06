import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://bharathbooshan91533_db_user:YrJmUNLgfAUzOrpt@cluster0.h747xek.mongodb.net/food';

const FoodOfferSchema = new mongoose.Schema({}, { strict: false, collection: 'food_offers' });
const FoodOffer = mongoose.model('FoodOffer', FoodOfferSchema);

async function run() {
    try {
        await mongoose.connect(MONGODB_URI);
        const offers = await FoodOffer.find({}).lean();
        console.log(`Total coupons found: ${offers.length}`);
        console.log(JSON.stringify(offers, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
