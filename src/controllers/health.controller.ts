import { Request, Response } from 'express';
import { subDays } from 'date-fns';
import HealthData from '../models/HealthData.model';

/**
 * Sync Health Data (Bulk Upsert)
 */
export const syncHealthData = async (req: Request, res: Response) => {
    try {
        const { data } = req.body; // Array of daily metrics
        const memberId = req.user?._id;
        const tenantId = req.user?.tenantId;

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ success: false, message: 'Invalid data format' });
        }

        const operations = data.map((entry) => ({
            updateOne: {
                filter: { memberId, date: new Date(entry.date) },
                update: {
                    $set: {
                        metrics: entry.metrics,
                        source: entry.source,
                        syncedAt: new Date(),
                        tenantId, // Ensure tenant isolation
                    },
                },
                upsert: true,
            },
        }));

        await HealthData.bulkWrite(operations);

        res.status(200).json({ success: true, message: 'Health data synced successfully' });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error syncing health data',
            error: (error as Error).message,
        });
    }
};

/**
 * Get Health Summary (Weekly Stats)
 */
export const getHealthSummary = async (req: Request, res: Response) => {
    try {
        const memberId = req.user?._id;
        const endDate = new Date();
        const startDate = subDays(endDate, 7);

        const healthRecords = await HealthData.find({
            memberId,
            date: { $gte: startDate, $lte: endDate },
        }).sort({ date: 1 });

        // Calculate averages/totals
        const totalSteps = healthRecords.reduce((acc, rec) => acc + (rec.metrics.steps || 0), 0);
        const totalCalories = healthRecords.reduce(
            (acc, rec) => acc + (rec.metrics.caloriesBurned || 0),
            0
        );

        res.status(200).json({
            success: true,
            data: {
                records: healthRecords,
                summary: {
                    totalSteps,
                    totalCalories,
                    avgSteps: Math.round(totalSteps / 7),
                },
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching health summary',
            error: (error as Error).message,
        });
    }
};
