import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import AutomationRule from '../models/AutomationRule.model';

const automationSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    isActive: z.boolean().default(true),
    trigger: z.object({
        type: z.enum(['event', 'schedule', 'condition']),
        event: z.string().optional(),
        schedule: z.object({
            cron: z.string(),
            timezone: z.string().default('UTC'),
        }).optional(),
        conditions: z.array(z.object({
            field: z.string(),
            operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains']),
            value: z.any(),
        })).optional(),
    }),
    actions: z.array(z.object({
        type: z.enum(['send_notification', 'update_status', 'assign_task', 'webhook']),
        config: z.any(),
        delay: z.number().default(0),
    })),
});

export class AutomationController {
    async createRule(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = automationSchema.parse(req.body);
            const tenantId = req.user?.tenantId;
            const branchId = req.user?.branchId;

            const rule = await AutomationRule.create({
                ...validatedData,
                tenantId,
                branchId,
                createdBy: req.user?._id,
            });

            res.status(201).json({
                success: true,
                data: rule,
            });
        } catch (error) {
            next(error);
        }
    }

    async getRules(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId;
            const rules = await AutomationRule.find({ tenantId }).sort({ createdAt: -1 });

            res.status(200).json({
                success: true,
                data: rules,
            });
        } catch (error) {
            next(error);
        }
    }

    async getRuleById(req: Request, res: Response, next: NextFunction) {
        try {
            const { ruleId } = req.params;
            const tenantId = req.user?.tenantId;

            const rule = await AutomationRule.findOne({ _id: ruleId, tenantId });

            if (!rule) {
                return res.status(404).json({
                    success: false,
                    message: 'Automation rule not found',
                });
            }

            res.status(200).json({
                success: true,
                data: rule,
            });
        } catch (error) {
            next(error);
        }
    }

    async updateRule(req: Request, res: Response, next: NextFunction) {
        try {
            const { ruleId } = req.params;
            const tenantId = req.user?.tenantId;
            const validatedData = automationSchema.partial().parse(req.body);

            const rule = await AutomationRule.findOneAndUpdate(
                { _id: ruleId, tenantId },
                { $set: validatedData },
                { new: true, runValidators: true }
            );

            if (!rule) {
                return res.status(404).json({
                    success: false,
                    message: 'Automation rule not found',
                });
            }

            res.status(200).json({
                success: true,
                data: rule,
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteRule(req: Request, res: Response, next: NextFunction) {
        try {
            const { ruleId } = req.params;
            const tenantId = req.user?.tenantId;

            const rule = await AutomationRule.findOneAndDelete({ _id: ruleId, tenantId });

            if (!rule) {
                return res.status(404).json({
                    success: false,
                    message: 'Automation rule not found',
                });
            }

            res.status(200).json({
                success: true,
                message: 'Automation rule deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }

    async getExecutionLogs(req: Request, res: Response, next: NextFunction) {
        try {
            const { ruleId } = req.params;
            const tenantId = req.user?.tenantId;

            const rule = await AutomationRule.findOne({ _id: ruleId, tenantId }, { executionLog: { $slice: -50 } });

            if (!rule) {
                return res.status(404).json({
                    success: false,
                    message: 'Automation rule not found',
                });
            }

            res.status(200).json({
                success: true,
                data: rule.executionLog,
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new AutomationController();
