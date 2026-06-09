import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongodbUri = process.env.MONGO_URI || process.env.MONGODB_URI;

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const run = async () => {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // 1. Get Commission Rules
    console.log('\n--- Active Commission Rules (food_delivery_commission_rules) ---');
    const rules = await db.collection('food_delivery_commission_rules').find({
      status: { $ne: false }
    }).toArray();
    console.log(JSON.stringify(rules, null, 2));

    // 2. Compute coordinates of order
    const restCoords = [75.89682, 22.75521]; // lng, lat
    const userCoords = [75.8719505050044, 22.717598048080713]; // lng, lat

    const distance = haversineKm(restCoords[1], restCoords[0], userCoords[1], userCoords[0]);
    console.log(`\n--- Distance for Order ---`);
    console.log(`Straight-line Distance (Haversine): ${distance.toFixed(4)} km`);

    // 3. Dry-run getRiderEarning logic
    console.log('\n--- Dry Run Earning Calculation ---');
    const d = Number(distance);
    if (!Number.isFinite(d) || d <= 0) {
      console.log('Rider earning: 0 (invalid distance)');
      process.exit(0);
    }
    
    if (!rules.length) {
      console.log('Rider earning: 0 (no active commission rules found in collection "food_delivery_commission_rules")');
      process.exit(0);
    }

    const sorted = [...rules].sort(
      (a, b) => (a.minDistance || 0) - (b.minDistance || 0),
    );
    const baseRule = sorted.find((r) => Number(r.minDistance || 0) === 0) || null;
    if (!baseRule) {
      console.log('Rider earning: 0 (no base rule with minDistance: 0 found)');
      process.exit(0);
    }

    const basePayout = Number(baseRule.basePayout || 0);
    const baseKm = Number(baseRule.maxDistance || 0);
    console.log(`Base Payout (0 to ${baseKm} km): ₹${basePayout}`);

    if (d <= baseKm) {
      console.log(`Distance is <= baseKm (${d.toFixed(2)} <= ${baseKm}). Final calculated earning: ₹${Math.round(basePayout)}`);
      process.exit(0);
    }

    let earning = basePayout;

    if (sorted.length === 1) {
      const perKm = Number(baseRule.commissionPerKm || 0);
      const extraKm = d - baseKm;
      const extraEarning = extraKm * perKm;
      earning += extraEarning;
      console.log(`Single rule setup: Extra distance: ${extraKm.toFixed(2)} km * ₹${perKm}/km = ₹${extraEarning.toFixed(2)}`);
    } else {
      for (const r of sorted) {
        if (r === baseRule) continue;
        const perKm = Number(r.commissionPerKm || 0);
        if (!Number.isFinite(perKm) || perKm <= 0) continue;
        const min = Number(r.minDistance || 0);
        const max = r.maxDistance == null ? null : Number(r.maxDistance);
        if (d <= min) continue;
        const upper = max == null ? d : Math.min(d, max);
        const kmInSlab = Math.max(0, upper - min);
        if (kmInSlab > 0) {
          const slabEarning = kmInSlab * perKm;
          earning += slabEarning;
          console.log(`Slab [${min} to ${max || 'infinity'} km]: ${kmInSlab.toFixed(2)} km * ₹${perKm}/km = ₹${slabEarning.toFixed(2)}`);
        }
      }
    }

    console.log(`Final calculated earning: ₹${Math.round(earning)}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
