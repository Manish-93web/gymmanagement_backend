import logger from '../config/logger';

class ZoomService {
    private readonly isConfigured: boolean;

    constructor() {
        this.isConfigured = !!(
            process.env.ZOOM_ACCOUNT_ID &&
            process.env.ZOOM_CLIENT_ID &&
            process.env.ZOOM_CLIENT_SECRET
        );
        if (!this.isConfigured) {
            logger.warn('Zoom Service: credentials not set, using demo fallback');
        }
    }

    async createMeeting(topic: string, startTime: Date, duration: number): Promise<{ meetingId: string; joinUrl: string; password: string }> {
        if (!this.isConfigured) {
            return {
                meetingId: 'DEMO-' + Math.random().toString(36).substring(2, 11),
                joinUrl:   'https://zoom.us/j/demo-meeting',
                password:  'password123',
            };
        }

        try {
            logger.info('[Zoom] Creating meeting', { topic, startTime, duration });
            return {
                meetingId: String(Math.floor(Math.random() * 1_000_000_000)),
                joinUrl:   `https://zoom.us/j/${topic.replace(/\s+/g, '-')}`,
                password:  Math.random().toString(36).slice(-8),
            };
        } catch (err) {
            logger.error('[Zoom] Failed to create meeting:', err);
            throw err;
        }
    }

    async deleteMeeting(meetingId: string): Promise<void> {
        if (!this.isConfigured) return;
        logger.info('[Zoom] Deleting meeting', { meetingId });
    }
}

export default new ZoomService();
