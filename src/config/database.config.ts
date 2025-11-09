import { MongooseModuleOptions } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';

const logger = new Logger('MongoDB');

export const databaseConfig = (): MongooseModuleOptions => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/agency_db';
  const dbName = process.env.DB_NAME || 'agency_db';
  
  logger.log(`Connecting to MongoDB: ${uri.replace(/:[^:]*@/, ':***@')}`);
  logger.log(`Database: ${dbName}`);
  
  return {
    uri,
    dbName,
    retryAttempts: 5,
    retryDelay: 2000,
    autoIndex: process.env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    
    // Connection event handlers
    connectionFactory: (connection) => {
      // Log immediately when factory is called
      logger.log('Connection factory initialized');
      
      // These events might have already fired, so check connection state
      if (connection.readyState === 1) {
        logger.log('✅ Successfully connected to MongoDB');
      }
      
      connection.on('connected', () => {
        logger.log('✅ Successfully connected to MongoDB');
      });
      
      connection.on('error', (error) => {
        logger.error('❌ MongoDB connection error:', error);
      });
      
      connection.on('disconnected', () => {
        logger.warn('⚠️ MongoDB disconnected');
      });
      
      connection.on('reconnected', () => {
        logger.log('🔄 MongoDB reconnected');
      });
      
      return connection;
    },
  };
};