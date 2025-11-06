import { MongooseModuleOptions } from '@nestjs/mongoose';

export const databaseConfig = (): MongooseModuleOptions => ({
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/agency_db',
  retryAttempts: 3,
  retryDelay: 1000,
});
