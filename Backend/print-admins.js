import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const mongodbUri = process.env.MONGO_URI || process.env.MONGODB_URI;

const checkAdmins = async () => {
  try {
    await mongoose.connect(mongodbUri);
    console.log('Connected to MongoDB');
    
    const admins = await mongoose.connection.db.collection('foodadmins').find({}).toArray();
    console.log('Admins list:');
    admins.forEach(a => {
      console.log(`Email: ${a.email}, Name: ${a.name}, Role: ${a.role}, IsActive: ${a.isActive}`);
    });
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

checkAdmins();
