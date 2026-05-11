import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User.model';
import Tenant from '../models/Tenant.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';

const seedGymOwner = async () => {
    try {
        console.log('🌱 Starting Gym Owner seeding...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const ownerEmail = 'owner@testgym.com';
        const existing = await User.findOne({ email: ownerEmail });
        if (existing) {
            console.log('⚠️  Gym Owner already exists. Skipping...');
            process.exit(0);
        }

        let tenant = await Tenant.findOne({ slug: 'test-gym' });
        if (!tenant) {
            tenant = await Tenant.create({
                name: 'Test Gym',
                slug: 'test-gym',
                isActive: true,
                subscription: {
                    plan: 'pro',
                    status: 'active',
                    startDate: new Date(),
                    maxBranches: 3,
                    maxMembers: 500,
                    maxTrainers: 20,
                },
                features: {
                    aiEnabled: true, onlineClasses: true, pos: true,
                    whatsappIntegration: false, smsNotifications: true,
                    emailNotifications: true, customDomain: false, multiCurrency: false,
                },
            });
            console.log('✅ Test Tenant created:', tenant._id);
        }

        const ownerUser = new User({
            firstName: 'John',
            lastName: 'Owner',
            email: ownerEmail,
            mobile: '9999999999',
            password: 'GymOwner@123',
            role: 'gym_owner',
            tenantId: tenant._id,
            isActive: true,
            isEmailVerified: true,
            isMobileVerified: true,
        });

        await ownerUser.save();
        console.log('✨ Gym Owner created successfully!');
        console.log('📧 Email:    owner@testgym.com');
        console.log('🔑 Password: GymOwner@123');
        console.log('👤 Role:     gym_owner');
        console.log('🏋️  Tenant:   Test Gym');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding Gym Owner:', error);
        process.exit(1);
    }
};

seedGymOwner();
