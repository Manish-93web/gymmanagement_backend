import mongoose from 'mongoose';
import { config } from './config';
import { createIndexes } from './createIndexes';

export const connectDB = async (): Promise<void> => {
    try {
        const uri = config.env === 'test' ? config.mongodb.testUri : config.mongodb.uri;

        await mongoose.connect(uri, {
            maxPoolSize: 50,       // increased for 1000+ gyms concurrent load
            minPoolSize: 10,
            maxIdleTimeMS: 60000,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 60000,
            connectTimeoutMS: 15000,
            heartbeatFrequencyMS: 10000,
            retryWrites: true,
            w: 'majority',
        });

        console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);
        await createIndexes();

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
        });

        process.on('SIGINT', async () => {
            await mongoose.connection.close();
            console.log('MongoDB connection closed through app termination');
            process.exit(0);
        });
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
};
