import { Request, Response, NextFunction } from 'express';
import SupportTicket from '../models/SupportTicket.model';

class SupportController {
    async getTickets(req: Request, res: Response, next: NextFunction) {
        try {
            const { status, priority, category, page = '1', limit = '20' } = req.query as Record<string, string>;
            const filter: any = {};

            // Super admin sees all; gym users see their tenant's tickets
            if (req.user?.role !== 'super_admin') {
                filter.tenantId = req.tenantId;
            }
            // Members only see their own tickets
            if (req.user?.role === 'member') {
                filter.userId = req.user._id;
            }
            if (status) filter.status = status;
            if (priority) filter.priority = priority;
            if (category) filter.category = category;

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [tickets, total] = await Promise.all([
                SupportTicket.find(filter)
                    .populate('userId', 'firstName lastName email role')
                    .populate('assignedTo', 'firstName lastName')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                SupportTicket.countDocuments(filter),
            ]);

            res.json({
                success: true,
                data: { tickets, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) },
            });
        } catch (error) { next(error); }
    }

    async createTicket(req: Request, res: Response, next: NextFunction) {
        try {
            const ticket = await SupportTicket.create({
                ...req.body,
                tenantId: req.tenantId,
                userId: req.user!._id,
                status: 'open',
            });
            res.status(201).json({ success: true, data: ticket });
        } catch (error) { next(error); }
    }

    async getTicket(req: Request, res: Response, next: NextFunction) {
        try {
            const ticket = await SupportTicket.findById(req.params.id)
                .populate('userId', 'firstName lastName email role')
                .populate('assignedTo', 'firstName lastName')
                .populate('replies.userId', 'firstName lastName role');

            if (!ticket) { res.status(404).json({ success: false, message: 'Ticket not found' }); return; }
            res.json({ success: true, data: ticket });
        } catch (error) { next(error); }
    }

    async updateTicket(req: Request, res: Response, next: NextFunction) {
        try {
            const { status, priority, assignedTo, reply } = req.body;
            const ticket = await SupportTicket.findById(req.params.id);
            if (!ticket) { res.status(404).json({ success: false, message: 'Ticket not found' }); return; }

            if (status) {
                ticket.status = status;
                if (status === 'resolved') ticket.resolvedAt = new Date();
                if (status === 'closed') ticket.closedAt = new Date();
            }
            if (priority) ticket.priority = priority;
            if (assignedTo) ticket.assignedTo = assignedTo;
            if (reply) {
                ticket.replies.push({
                    userId: req.user!._id as any,
                    message: reply,
                    isStaff: req.user?.role === 'super_admin',
                    createdAt: new Date(),
                });
            }

            await ticket.save();
            res.json({ success: true, data: ticket });
        } catch (error) { next(error); }
    }

    async getStats(req: Request, res: Response, next: NextFunction) {
        try {
            const filter: any = req.user?.role !== 'super_admin' ? { tenantId: req.tenantId } : {};
            const [open, inProgress, resolved, closed, critical] = await Promise.all([
                SupportTicket.countDocuments({ ...filter, status: 'open' }),
                SupportTicket.countDocuments({ ...filter, status: 'in_progress' }),
                SupportTicket.countDocuments({ ...filter, status: 'resolved' }),
                SupportTicket.countDocuments({ ...filter, status: 'closed' }),
                SupportTicket.countDocuments({ ...filter, priority: 'critical', status: { $in: ['open', 'in_progress'] } }),
            ]);
            res.json({ success: true, data: { open, inProgress, resolved, closed, critical, total: open + inProgress + resolved + closed } });
        } catch (error) { next(error); }
    }
}

export default new SupportController();
