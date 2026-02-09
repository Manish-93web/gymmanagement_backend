import { google } from 'googleapis';
import Class from '../models/Class.model';
import User from '../models/User.model';
import logger from '../config/logger';

const calendar = google.calendar('v3');

interface CalendarEvent {
    summary: string;
    description: string;
    location: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
}

class CalendarSyncService {
    private oauth2Client: any;

    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }

    /**
     * Set user credentials
     */
    setCredentials(accessToken: string, refreshToken: string) {
        this.oauth2Client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
    }

    /**
     * Sync class to Google Calendar
     */
    async syncClassToCalendar(classId: string, userId: string) {
        const classData = await Class.findById(classId)
            .populate('trainerId', 'firstName lastName email')
            .populate('branchId', 'name address');

        if (!classData) {
            throw new Error('Class not found');
        }

        const user = await User.findById(userId);
        if (!user || !user.googleCalendarToken) {
            throw new Error('User not connected to Google Calendar');
        }

        this.setCredentials(user.googleCalendarToken, user.googleRefreshToken || '');

        const trainer = classData.trainerId as any;
        const branch = classData.branchId as any;

        const event = {
            summary: `${classData.name} - ${classData.type}`,
            description: `Trainer: ${trainer.firstName} ${trainer.lastName}\nCapacity: ${classData.currentCapacity}/${classData.maxCapacity}`,
            location: branch.address || '',
            start: {
                dateTime: classData.startTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            end: {
                dateTime: classData.endTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            attendees: [{ email: user.email }],
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 60 },
                    { method: 'popup', minutes: 30 },
                ],
            },
        };

        try {
            const response = await calendar.events.insert({
                auth: this.oauth2Client,
                calendarId: 'primary',
                requestBody: event,
            });

            // Store event ID for future updates/deletions
            await Class.findByIdAndUpdate(classId, {
                $push: {
                    calendarEvents: {
                        userId,
                        eventId: response.data.id,
                        provider: 'google',
                    },
                },
            });

            logger.info('Class synced to Google Calendar', { classId, eventId: response.data.id });

            return {
                success: true,
                eventId: response.data.id,
                eventLink: response.data.htmlLink,
            };
        } catch (error: any) {
            logger.error('Calendar sync failed', { error, classId });
            throw new Error('Failed to sync to Google Calendar');
        }
    }

    /**
     * Update calendar event
     */
    async updateCalendarEvent(classId: string, userId: string) {
        const classData = await Class.findById(classId);
        if (!classData) {
            throw new Error('Class not found');
        }

        const user = await User.findById(userId);
        if (!user || !user.googleCalendarToken) {
            throw new Error('User not connected to Google Calendar');
        }

        // Find existing event
        const calendarEvent = classData.calendarEvents?.find(
            (e: any) => e.userId.toString() === userId && e.provider === 'google'
        );

        if (!calendarEvent) {
            throw new Error('Calendar event not found');
        }

        this.setCredentials(user.googleCalendarToken, user.googleRefreshToken || '');

        const event = {
            summary: `${classData.name} - ${classData.type}`,
            start: {
                dateTime: classData.startTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
            end: {
                dateTime: classData.endTime.toISOString(),
                timeZone: 'Asia/Kolkata',
            },
        };

        try {
            await calendar.events.update({
                auth: this.oauth2Client,
                calendarId: 'primary',
                eventId: calendarEvent.eventId,
                requestBody: event,
            });

            logger.info('Calendar event updated', { classId, eventId: calendarEvent.eventId });

            return {
                success: true,
                message: 'Calendar event updated successfully',
            };
        } catch (error: any) {
            logger.error('Calendar update failed', { error, classId });
            throw new Error('Failed to update calendar event');
        }
    }

    /**
     * Delete calendar event
     */
    async deleteCalendarEvent(classId: string, userId: string) {
        const classData = await Class.findById(classId);
        if (!classData) {
            throw new Error('Class not found');
        }

        const user = await User.findById(userId);
        if (!user || !user.googleCalendarToken) {
            throw new Error('User not connected to Google Calendar');
        }

        const calendarEvent = classData.calendarEvents?.find(
            (e: any) => e.userId.toString() === userId && e.provider === 'google'
        );

        if (!calendarEvent) {
            throw new Error('Calendar event not found');
        }

        this.setCredentials(user.googleCalendarToken, user.googleRefreshToken || '');

        try {
            await calendar.events.delete({
                auth: this.oauth2Client,
                calendarId: 'primary',
                eventId: calendarEvent.eventId,
            });

            // Remove from class
            await Class.findByIdAndUpdate(classId, {
                $pull: {
                    calendarEvents: { eventId: calendarEvent.eventId },
                },
            });

            logger.info('Calendar event deleted', { classId, eventId: calendarEvent.eventId });

            return {
                success: true,
                message: 'Calendar event deleted successfully',
            };
        } catch (error: any) {
            logger.error('Calendar deletion failed', { error, classId });
            throw new Error('Failed to delete calendar event');
        }
    }

    /**
     * Bulk sync upcoming classes
     */
    async bulkSyncUpcomingClasses(userId: string, days: number = 7) {
        const user = await User.findById(userId);
        if (!user || !user.googleCalendarToken) {
            throw new Error('User not connected to Google Calendar');
        }

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + days);

        // Find user's booked classes
        const classes = await Class.find({
            'bookings.userId': userId,
            startTime: { $gte: startDate, $lte: endDate },
        });

        const results = [];

        for (const classData of classes) {
            try {
                const result = await this.syncClassToCalendar(classData._id.toString(), userId);
                results.push({ classId: classData._id, success: true, eventId: result.eventId });
            } catch (error: any) {
                results.push({ classId: classData._id, success: false, error: error.message });
            }
        }

        logger.info('Bulk calendar sync completed', { userId, classCount: classes.length });

        return {
            success: true,
            synced: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
            results,
        };
    }
}

export default new CalendarSyncService();
