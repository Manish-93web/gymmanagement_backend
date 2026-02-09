import Announcement from '../models/Announcement.model';
import Member from '../models/Member.model';
import { sendEmail } from '../utils/email.util';
import WhatsAppService from './whatsapp.service';
import logger from '../config/logger';

interface AnnouncementConfig {
    title: string;
    content: string;
    type: 'general' | 'class' | 'event' | 'maintenance' | 'achievement' | 'urgent';
    priority: 'low' | 'medium' | 'high';
    targetAudience: 'all' | 'active' | 'branch' | 'custom';
    customMemberIds?: string[];
    branchId?: string;
    channels: ('app' | 'email' | 'sms' | 'whatsapp')[];
    publishedBy: string;
    tenantId: string;
    scheduledFor?: Date;
}

class TrainerAnnouncementService {
    /**
     * Create announcement
     */
    async createAnnouncement(config: AnnouncementConfig) {
        const announcement = await Announcement.create({
            ...config,
            status: config.scheduledFor ? 'scheduled' : 'draft',
            viewCount: 0,
            createdAt: new Date(),
        });

        logger.info('Announcement created', { announcementId: announcement._id });

        return announcement;
    }

    /**
     * Publish announcement
     */
    async publishAnnouncement(announcementId: string) {
        const announcement = await Announcement.findById(announcementId);
        if (!announcement) throw new Error('Announcement not found');

        if (announcement.status === 'published') {
            throw new Error('Announcement already published');
        }

        // Get target members
        const members = await this.getTargetMembers(announcement);

        // Send through selected channels
        const results = {
            app: 0,
            email: 0,
            sms: 0,
            whatsapp: 0,
        };

        if (announcement.channels.includes('email')) {
            for (const member of members) {
                try {
                    await sendEmail({
                        to: member.email,
                        subject: announcement.title,
                        template: 'announcement',
                        data: {
                            title: announcement.title,
                            content: announcement.content,
                            name: `${member.firstName} ${member.lastName}`,
                        },
                    });
                    results.email++;
                } catch (error) {
                    logger.error('Failed to send announcement email', { error, memberId: member._id });
                }
            }
        }

        if (announcement.channels.includes('whatsapp')) {
            for (const member of members) {
                try {
                    await WhatsAppService.sendMessage({
                        to: member.mobile,
                        message: `📢 ${announcement.title}\n\n${announcement.content}`,
                    });
                    results.whatsapp++;
                } catch (error) {
                    logger.error('Failed to send announcement WhatsApp', { error, memberId: member._id });
                }
            }
        }

        // Update announcement
        announcement.status = 'published';
        announcement.publishedAt = new Date();
        announcement.recipientCount = members.length;
        await announcement.save();

        logger.info('Announcement published', {
            announcementId,
            recipients: members.length,
            results,
        });

        return {
            success: true,
            recipientCount: members.length,
            results,
        };
    }

    /**
     * Get target members
     */
    private async getTargetMembers(announcement: any) {
        let query: any = { tenantId: announcement.tenantId };

        switch (announcement.targetAudience) {
            case 'active':
                query.status = 'active';
                break;
            case 'branch':
                if (announcement.branchId) {
                    query.branchId = announcement.branchId;
                }
                break;
            case 'custom':
                if (announcement.customMemberIds && announcement.customMemberIds.length > 0) {
                    query._id = { $in: announcement.customMemberIds };
                }
                break;
            case 'all':
            default:
                // No additional filter
                break;
        }

        return await Member.find(query).select('firstName lastName email mobile');
    }

    /**
     * Get all announcements
     */
    async getAllAnnouncements(
        tenantId: string,
        filters?: {
            type?: string;
            status?: string;
            branchId?: string;
        },
        page: number = 1,
        limit: number = 20
    ) {
        const query: any = { tenantId };

        if (filters?.type) query.type = filters.type;
        if (filters?.status) query.status = filters.status;
        if (filters?.branchId) query.branchId = filters.branchId;

        const total = await Announcement.countDocuments(query);
        const announcements = await Announcement.find(query)
            .populate('publishedBy', 'firstName lastName profilePicture')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            announcements,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get member announcements
     */
    async getMemberAnnouncements(memberId: string, page: number = 1, limit: number = 20) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const query: any = {
            tenantId: member.tenantId,
            status: 'published',
            $or: [
                { targetAudience: 'all' },
                { targetAudience: 'active', customMemberIds: memberId },
                { targetAudience: 'branch', branchId: member.branchId },
                { targetAudience: 'custom', customMemberIds: memberId },
            ],
        };

        const total = await Announcement.countDocuments(query);
        const announcements = await Announcement.find(query)
            .populate('publishedBy', 'firstName lastName profilePicture')
            .sort({ publishedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            announcements,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Mark announcement as viewed
     */
    async markAsViewed(announcementId: string) {
        await Announcement.findByIdAndUpdate(announcementId, {
            $inc: { viewCount: 1 },
        });

        return {
            success: true,
        };
    }

    /**
     * Delete announcement
     */
    async deleteAnnouncement(announcementId: string) {
        await Announcement.findByIdAndDelete(announcementId);

        logger.info('Announcement deleted', { announcementId });

        return {
            success: true,
            message: 'Announcement deleted successfully',
        };
    }

    /**
     * Auto-publish scheduled announcements (run periodically)
     */
    async autoPublishScheduled() {
        const now = new Date();

        const scheduledAnnouncements = await Announcement.find({
            status: 'scheduled',
            scheduledFor: { $lte: now },
        });

        for (const announcement of scheduledAnnouncements) {
            await this.publishAnnouncement(announcement._id.toString());
        }

        return {
            success: true,
            published: scheduledAnnouncements.length,
        };
    }
}

export default new TrainerAnnouncementService();
