import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer | null = null;

export const connectTestDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) {
    if (!mongoServer) {
      mongoServer = await MongoMemoryServer.create({
        instance: { launchTimeout: 60000 }
      });
    }
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }
};

export const closeTestDB = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
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
