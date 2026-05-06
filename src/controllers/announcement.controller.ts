import { Request, Response, NextFunction } from 'express';
import Announcement from '../models/Announcement.model';

export class AnnouncementController {
    async getAnnouncements(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { targetAudience, page = 1, limit = 20 } = req.query;
            const query: any = { tenantId, isActive: true };
            if (targetAudience) query.targetAudience = { $in: [targetAudience, 'all'] };
            const skip = (Number(page) - 1) * Number(limit);
            const [announcements, total] = await Promise.all([
                Announcement.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
                Announcement.countDocuments(query)
            ]);
            return res.json({ success: true, data: { announcements, total } });
        } catch (error) { return next(error); }
    }

    async createAnnouncement(req: Request, res: Response, next: NextFunction) {
        try {
            const { title, content, targetAudience, priority, publishedAt, expiresAt } = req.body;
            if (!title || !content) return res.status(400).json({ success: false, message: 'title and content are required' });
            const announcement = await Announcement.create({
                title,
                content,
                targetAudience: targetAudience || 'all',
                priority: priority || 'medium',
                publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
                expiresAt: expiresAt ? new Date(expiresAt) : undefined,
                isActive: true,
                tenantId: req.user!.tenantId,
                createdBy: req.user!._id
            });
            return res.status(201).json({ success: true, data: announcement });
        } catch (error) { return next(error); }
    }

    async getAnnouncementById(req: Request, res: Response, next: NextFunction) {
        try {
            const announcement = await Announcement.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
            if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
            return res.json({ success: true, data: announcement });
        } catch (error) { return next(error); }
    }

    async updateAnnouncement(req: Request, res: Response, next: NextFunction) {
        try {
            const announcement = await Announcement.findOneAndUpdate(
                { _id: req.params.id, tenantId: req.user!.tenantId },
                req.body, { new: true }
            );
            if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
            return res.json({ success: true, data: announcement });
        } catch (error) { return next(error); }
    }

    async deleteAnnouncement(req: Request, res: Response, next: NextFunction) {
        try {
            await Announcement.findOneAndUpdate(
                { _id: req.params.id, tenantId: req.user!.tenantId },
                { isActive: false }
            );
            return res.json({ success: true, message: 'Announcement deleted' });
        } catch (error) { return next(error); }
    }
}

export default new AnnouncementController();
