import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Announcement from '../models/Announcement.model';

const NO_TENANT = (res: Response) =>
    res.status(400).json({ success: false, message: 'Tenant context required' });

export class AnnouncementController {
    // GET / — list announcements for this tenant
    async getAnnouncements(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const status  = (req.query.status as string) || 'published';
            const limit   = parseInt((req.query.limit as string) || '10', 10);
            const page    = parseInt((req.query.page  as string) || '1',  10);
            const skip    = (page - 1) * limit;

            const filter: Record<string, any> = { tenantId, isActive: true };
            if (status !== 'all') filter.status = status;

            const [announcements, total] = await Promise.all([
                Announcement.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('createdBy', 'firstName lastName'),
                Announcement.countDocuments(filter),
            ]);

            res.status(200).json({
                success: true,
                data: announcements,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch announcements' });
        }
    }

    // POST / — create announcement
    async createAnnouncement(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const {
                title,
                content,
                targetRoles,
                priority,
                expiresAt,
                channels,
                targetAudience,
                scheduledFor,
                status,
                branchId,
            } = req.body;

            if (!title || !content) {
                res.status(400).json({ success: false, message: 'Title and content are required' });
                return;
            }

            const announcementStatus = status || 'draft';

            const announcement = await Announcement.create({
                tenantId,
                branchId: branchId || undefined,
                title,
                content,
                targetRoles:    targetRoles    || [],
                priority:       priority       || 'medium',
                expiresAt:      expiresAt      ? new Date(expiresAt)      : undefined,
                channels:       channels       || [],
                targetAudience: targetAudience || 'all',
                scheduledFor:   scheduledFor   ? new Date(scheduledFor)   : undefined,
                status:         announcementStatus,
                publishedAt:    announcementStatus === 'published' ? new Date() : undefined,
                createdBy:      req.user._id,
                isActive:       true,
            });

            res.status(201).json({
                success: true,
                message: 'Announcement created successfully',
                data: announcement,
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to create announcement' });
        }
    }

    // GET /:id — get single announcement
    async getAnnouncementById(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid announcement ID' });
                return;
            }

            const announcement = await Announcement.findOne({ _id: id, tenantId, isActive: true })
                .populate('createdBy', 'firstName lastName');

            if (!announcement) {
                res.status(404).json({ success: false, message: 'Announcement not found' });
                return;
            }

            res.status(200).json({ success: true, data: announcement });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch announcement' });
        }
    }

    // PUT /:id — update announcement
    async updateAnnouncement(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid announcement ID' });
                return;
            }

            const updateData: Record<string, any> = { ...req.body };

            // If publishing now, stamp the publishedAt date
            if (updateData.status === 'published') {
                updateData.publishedAt = updateData.publishedAt || new Date();
            }

            // Convert date strings to Date objects
            if (updateData.expiresAt)   updateData.expiresAt   = new Date(updateData.expiresAt);
            if (updateData.scheduledFor) updateData.scheduledFor = new Date(updateData.scheduledFor);

            // Guard against overwriting tenantId or createdBy via body
            delete updateData.tenantId;
            delete updateData.createdBy;

            const announcement = await Announcement.findOneAndUpdate(
                { _id: id, tenantId, isActive: true },
                { $set: updateData },
                { new: true, runValidators: true }
            ).populate('createdBy', 'firstName lastName');

            if (!announcement) {
                res.status(404).json({ success: false, message: 'Announcement not found' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Announcement updated successfully',
                data: announcement,
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to update announcement' });
        }
    }

    // DELETE /:id — soft delete (isActive=false)
    async deleteAnnouncement(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid announcement ID' });
                return;
            }

            const announcement = await Announcement.findOneAndUpdate(
                { _id: id, tenantId, isActive: true },
                { $set: { isActive: false, status: 'archived' } },
                { new: true }
            );

            if (!announcement) {
                res.status(404).json({ success: false, message: 'Announcement not found' });
                return;
            }

            res.status(200).json({ success: true, message: 'Announcement deleted successfully' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to delete announcement' });
        }
    }
}

export default new AnnouncementController();
