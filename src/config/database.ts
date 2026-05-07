import mongoose from 'mongoose';
import { config } from './config';

export const connectDB = async (): Promise<void> => {
    try {
        const uri = config.env === 'test' ? config.mongodb.testUri : config.mongodb.uri;

        await mongoose.connect(uri, {
            maxPoolSize: 20,
            minPoolSize: 5,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            heartbeatFrequencyMS: 10000,
        });

        console.log(`✅ MongoDB Connected: ${mongoose.connection.host}`);

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
