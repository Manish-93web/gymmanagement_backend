import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User.model';
import Tenant from '../models/Tenant.model';
import Branch from '../models/Branch.model';
import Member from '../models/Member.model';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricMember from '../models/BiometricMember.model';

// Load production env to target prodgymmanagement
dotenv.config({ path: path.join(__dirname, '../../.env.production') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env.production');
    process.exit(1);
}

const DEVICE_IP = '192.168.1.201';
const DEVICE_PORT = 4370;
const GYM_OWNER_MOBILE = '8448447886';

const seedEsslDevice = async () => {
    console.log('🌱 Seeding eSSL biometric device for gym owner', GYM_OWNER_MOBILE);
    await mongoose.connect(MONGODB_URI!);
    console.log('✅ Connected to prodgymmanagement');

    // Find gym owner user
    const gymOwner = await User.findOne({ mobile: GYM_OWNER_MOBILE, role: 'gym_owner' });
    if (!gymOwner) {
        console.error(`❌ No gym_owner found with mobile ${GYM_OWNER_MOBILE}`);
        await mongoose.disconnect();
        process.exit(1);
    }

    const tenantId = gymOwner.tenantId as mongoose.Types.ObjectId;
    const tenant = await Tenant.findById(tenantId);
    console.log(`✅ Gym owner: ${gymOwner.firstName} ${gymOwner.lastName} | Tenant: ${tenant?.name}`);

    // Primary branch
    const branch = await Branch.findOne({ tenantId, isActive: true }).sort({ createdAt: 1 });
    if (!branch) {
        console.error('❌ No active branch found for this tenant');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`✅ Branch: ${(branch as any).name}`);

    // Upsert the eSSL biometric device
    // deviceId will be updated to the real serial number once the device connects
    const devicePayload = {
        tenantId,
        branchId: branch._id,
        name: 'Main Entrance — eSSL',
        deviceId: `ESSL-${DEVICE_IP.replace(/\./g, '')}`,
        type: 'fingerprint' as const,
        vendor: 'essl' as const,
        ipAddress: DEVICE_IP,
        port: DEVICE_PORT,
        location: 'Main Entrance',
        status: 'offline' as const,
        isActive: true,
        settings: {
            timezone: 'Asia/Kolkata',
            autoSync: true,
            syncInterval: 5,
            verificationMode: 'finger' as const,
            accessControl: false,
        },
    };

    let device = await BiometricDevice.findOne({ tenantId, ipAddress: DEVICE_IP });
    if (device) {
        await BiometricDevice.findByIdAndUpdate(device._id, { $set: devicePayload });
        console.log(`✅ Updated existing device _id=${device._id}`);
    } else {
        device = await BiometricDevice.create(devicePayload);
        console.log(`✅ Created device _id=${(device as any)._id}`);
    }

    // Enroll active/trial members with sequential biometricUserId (1, 2, 3, ...)
    // The physical ENROLLID on the device must match these numbers
    const members = await Member.find({
        tenantId,
        status: { $in: ['active', 'trial'] },
    })
        .sort({ createdAt: 1 })
        .limit(500)
        .lean();

    console.log(`📋 Found ${members.length} active/trial members to enroll`);

    let created = 0;
    let updated = 0;

    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const biometricUserId = String(i + 1);

        const existing = await BiometricMember.findOne({
            tenantId,
            memberId: member._id,
        });

        if (!existing) {
            await BiometricMember.create({
                tenantId,
                memberId: member._id,
                biometricUserId,
                assignedDeviceIds: [(device as any)._id],
                active: true,
            });
            created++;
        } else if (!existing.biometricUserId) {
            await BiometricMember.findByIdAndUpdate(existing._id, { biometricUserId });
            updated++;
        }
    }

    // Update device enrolled count
    await BiometricDevice.findByIdAndUpdate((device as any)._id, { enrolledMembers: created + updated });

    console.log(`✅ Created ${created} new enrollments, updated ${updated} existing`);
    console.log(`\n📋 Device Summary:`);
    console.log(`   _id       : ${(device as any)._id}`);
    console.log(`   IP        : ${DEVICE_IP}:${DEVICE_PORT}`);
    console.log(`   deviceId  : ${(devicePayload as any).deviceId}`);
    console.log(`\n🔧 Configure the eSSL device ADMS settings:`);
    console.log(`   Server Mode : ADMS`);
    console.log(`   Server Addr : <your-backend-domain-or-IP>`);
    console.log(`   Port        : 80 or 443`);
    console.log(`   (endpoint)  : /essl/iclock/cdata`);
    console.log(`\n   Once the device connects, update deviceId from`);
    console.log(`   "${devicePayload.deviceId}" to the real SN shown in device heartbeat logs.`);

    await mongoose.disconnect();
    console.log('\n✅ Done');
    process.exit(0);
};

seedEsslDevice().catch(err => {
    console.error('❌ Seed error:', err);
    process.exit(1);
});
