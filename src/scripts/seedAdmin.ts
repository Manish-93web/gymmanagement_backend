import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User.model';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';

const seedAdmin = async () => {
    try {
        console.log('🌱 Starting Super Admin seeding...');

        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Check if admin already exists
        const adminEmail = 'admin@platform.com';
        const existingAdmin = await User.findOne({ email: adminEmail });

        if (existingAdmin) {
            console.log('⚠️  Super Admin already exists. Skipping...');
            process.exit(0);
        }

        // Create Super Admin
        const adminUser = new User({
            firstName: 'System',
            lastName: 'Administrator',
            email: adminEmail,
            mobile: '0000000000',
            password: 'Admin@123', // Will be hashed by pre-save hook
            role: 'super_admin',
            isActive: true,
            isEmailVerified: true,
            isMobileVerified: true,
            permissions: ['*'],
        });

        await adminUser.save();
        console.log('✨ Super Admin created successfully!');
        console.log('📧 Email: admin@platform.com');
        console.log('🔑 Password: Admin@123');
        console.log('⚠️  PLEASE CHANGE THIS PASSWORD AFTER FIRST LOGIN');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding Super Admin:', error);
        process.exit(1);
    }
};

seedAdmin();
