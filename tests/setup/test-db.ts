import mongoose from 'mongoose';

export const connectTestDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pitchmint_test';
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }
};

export const closeTestDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
};

export const clearTestDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
};
