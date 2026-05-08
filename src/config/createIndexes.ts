import mongoose from 'mongoose';

export async function createIndexes(): Promise<void> {
    const db = mongoose.connection.db;
    if (!db) return;

    try {
        await Promise.all([
            // Member — most queried per-tenant collection
            db.collection('members').createIndex({ tenantId: 1, status: 1 }),
            db.collection('members').createIndex({ tenantId: 1, membershipExpiry: 1 }),
            db.collection('members').createIndex({ tenantId: 1, email: 1 }),
            db.collection('members').createIndex({ tenantId: 1, mobile: 1 }),
            db.collection('members').createIndex({ tenantId: 1, branchId: 1, status: 1 }),
            db.collection('members').createIndex({ tenantId: 1, membershipNumber: 1 }, { unique: true, sparse: true }),

            // Attendance — time-series per member
            db.collection('attendances').createIndex({ tenantId: 1, memberId: 1, checkInTime: -1 }),
            db.collection('attendances').createIndex({ tenantId: 1, checkInTime: -1 }),
            db.collection('attendances').createIndex({ tenantId: 1, branchId: 1, checkInTime: -1 }),

            // Payments
            db.collection('payments').createIndex({ tenantId: 1, status: 1, createdAt: -1 }),
            db.collection('payments').createIndex({ tenantId: 1, memberId: 1, createdAt: -1 }),

            // Subscriptions
            db.collection('subscriptions').createIndex({ tenantId: 1, memberId: 1, status: 1 }),
            db.collection('subscriptions').createIndex({ tenantId: 1, planId: 1 }),
            db.collection('subscriptions').createIndex({ tenantId: 1, endDate: 1, status: 1 }),

            // WorkoutLogs
            db.collection('workoutlogs').createIndex({ tenantId: 1, memberId: 1, date: -1 }),

            // Leads
            db.collection('leads').createIndex({ tenantId: 1, status: 1 }),
            db.collection('leads').createIndex({ tenantId: 1, nextFollowUp: 1 }),

            // Notifications
            db.collection('notifications').createIndex({ tenantId: 1, recipientId: 1, createdAt: -1 }),
            db.collection('notifications').createIndex({ tenantId: 1, status: 1 }),

            // Classes / Bookings
            db.collection('classes').createIndex({ tenantId: 1, 'schedule.startTime': 1 }),
            db.collection('bookings').createIndex({ tenantId: 1, memberId: 1, status: 1 }),
            db.collection('bookings').createIndex({ tenantId: 1, classId: 1, status: 1 }),

            // Trainers
            db.collection('trainers').createIndex({ tenantId: 1, isActive: 1 }),

            // Audit logs — time-based queries
            db.collection('auditlogs').createIndex({ tenantId: 1, createdAt: -1 }),
            db.collection('auditlogs').createIndex({ tenantId: 1, userId: 1, createdAt: -1 }),

            // Biometric — device lookup + raw log processing
            db.collection('biometricdevices').createIndex({ tenantId: 1, status: 1 }),
            db.collection('biometricdevices').createIndex({ tenantId: 1, branchId: 1 }),
            db.collection('biometricrawlogs').createIndex({ deviceId: 1, processed: 1, punchTime: 1 }),
            db.collection('biometricrawlogs').createIndex({ tenantId: 1, createdAt: -1 }),
            db.collection('biometricrawlogs').createIndex({ deviceId: 1, skippedReason: 1, createdAt: -1 }),
            db.collection('biometricmembers').createIndex({ deviceId: 1, biometricUid: 1 }, { unique: true }),
            db.collection('biometricmembers').createIndex({ tenantId: 1, memberId: 1 }),
            db.collection('biometricsyncs').createIndex({ deviceId: 1, status: 1, createdAt: -1 }),

            // Gamification
            db.collection('badges').createIndex({ tenantId: 1, category: 1 }),
            db.collection('memberbadges').createIndex({ tenantId: 1, memberId: 1 }),
            db.collection('streakhistories').createIndex({ tenantId: 1, memberId: 1, date: -1 }),
            db.collection('challengeparticipants').createIndex({ tenantId: 1, memberId: 1 }),
            db.collection('challengeparticipants').createIndex({ challengeId: 1, memberId: 1 }, { unique: true }),
            db.collection('rewardredemptions').createIndex({ tenantId: 1, memberId: 1, createdAt: -1 }),

            // Community
            db.collection('posts').createIndex({ tenantId: 1, createdAt: -1 }),
            db.collection('posts').createIndex({ tenantId: 1, authorId: 1 }),
            db.collection('postlikes').createIndex({ postId: 1, memberId: 1 }, { unique: true }),
            db.collection('postcomments').createIndex({ postId: 1, createdAt: -1 }),
            db.collection('groups').createIndex({ tenantId: 1, type: 1 }),
            db.collection('groupmembers').createIndex({ groupId: 1, memberId: 1 }, { unique: true }),

            // CRM / Leads
            db.collection('leads').createIndex({ tenantId: 1, assignedTo: 1, status: 1 }),
            db.collection('calllogs').createIndex({ tenantId: 1, leadId: 1, createdAt: -1 }),

            // Marketing / Campaigns
            db.collection('campaigns').createIndex({ tenantId: 1, status: 1 }),
            db.collection('emailcampaigns').createIndex({ tenantId: 1, status: 1, scheduledAt: 1 }),
            db.collection('promocampaigns').createIndex({ tenantId: 1, status: 1 }),
            db.collection('winbackcampaigns').createIndex({ tenantId: 1, status: 1 }),

            // Nutrition / Diet
            db.collection('dietplans').createIndex({ tenantId: 1, memberId: 1 }),
            db.collection('nutritionlogs').createIndex({ tenantId: 1, memberId: 1, date: -1 }),

            // WhatsApp
            db.collection('whatsapplogs').createIndex({ tenantId: 1, memberId: 1, createdAt: -1 }),
            db.collection('whatsappscheduleds').createIndex({ tenantId: 1, status: 1, scheduledFor: 1 }),

            // POS / Sales
            db.collection('sales').createIndex({ tenantId: 1, createdAt: -1 }),
            db.collection('sales').createIndex({ tenantId: 1, memberId: 1 }),
            db.collection('products').createIndex({ tenantId: 1, category: 1, isActive: 1 }),

            // Retention / Inactivity
            db.collection('retentionactions').createIndex({ tenantId: 1, memberId: 1, createdAt: -1 }),
            db.collection('inactivityalerts').createIndex({ tenantId: 1, memberId: 1, status: 1 }),

            // Activity log — for audit trail
            db.collection('activitylogs').createIndex({ tenantId: 1, userId: 1, createdAt: -1 }),
            db.collection('activitylogs').createIndex({ tenantId: 1, action: 1, createdAt: -1 }),

            // SaaS platform
            db.collection('tenants').createIndex({ isActive: 1 }),
            db.collection('usagerecords').createIndex({ tenantId: 1, month: 1, year: 1 }),
        ]);

        console.log('✅ Database indexes created');
    } catch (error: any) {
        // Indexes may already exist — not a fatal error
        console.warn('⚠️  Index creation warning:', error.message);
    }
}
