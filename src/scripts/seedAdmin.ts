import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User.model';

// Load base env, then override with production if DB_ENV=production
dotenv.config({ path: path.join(__dirname, '../../.env') });
if (process.env.DB_ENV === 'production' || process.env.NODE_ENV === 'production') {
    dotenv.config({ path: path.join(__dirname, '../../.env.production'), override: true });
}

const MONGODB_URI       = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';
const SUPER_ADMIN_MOBILE = process.env.SUPER_ADMIN_MOBILE || '0000000000';

const seedAdmin = async () => {
    try {
        console.log('🌱 Starting Super Admin seeding...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const adminEmail = 'admin@platform.com';
        const existingAdmin = await User.findOne({ email: adminEmail });

        if (existingAdmin) {
            if (existingAdmin.mobile === '0000000000' || !existingAdmin.mobile) {
                await User.updateOne({ email: adminEmail }, { $set: { mobile: SUPER_ADMIN_MOBILE } });
                console.log(`✅ Super Admin mobile updated to ${SUPER_ADMIN_MOBILE}`);
            } else {
                console.log('⚠️  Super Admin already exists. Skipping...');
            }
            process.exit(0);
        }

        const adminUser = new User({
            firstName: 'System',
            lastName: 'Administrator',
            email: adminEmail,
            mobile: SUPER_ADMIN_MOBILE,
            password: 'Admin@123',
            role: 'super_admin',
            isActive: true,
            isEmailVerified: true,
            isMobileVerified: true,
            permissions: ['*'],
        });

        await adminUser.save();
        console.log('✨ Super Admin created successfully!');
        console.log('📧 Email:    admin@platform.com');
        console.log(`📱 Mobile:   ${SUPER_ADMIN_MOBILE}`);
        console.log('🔑 Password: Admin@123');
        console.log('⚠️  PLEASE CHANGE THIS PASSWORD AFTER FIRST LOGIN');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding Super Admin:', error);
        process.exit(1);
    }
};

seedAdmin();
