import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongodbUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const listCollections = async () => {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log('Collections in the database:');
    for (const collection of collections) {
      console.log(`- ${collection.name}`);
      const count = await db.collection(collection.name).countDocuments();
      console.log(`  Documents: ${count}`);
      if (count > 0) {
        const sample = await db.collection(collection.name).find().limit(3).toArray();
        console.log(`  Sample documents:`);
        sample.forEach((doc, index) => {
          console.log(`    ${index + 1}: ${JSON.stringify(doc, null, 2)}`);
        });
      }
      console.log('');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};

listCollections();