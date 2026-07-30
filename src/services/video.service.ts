import { randomBytes } from 'crypto';

const VIDEO_SERVER_URL = process.env.GYMVIDEO_SERVER_URL || process.env.VIDEO_SERVER_URL || 'http://localhost:3030';

export interface VideoRoomConfig {
    defaultAudio?: boolean;
    defaultVideo?: boolean;
    trainerAutoScreen?: boolean;
    password?: string;
}

class VideoService {
    async createRoom(
        classId: string,
        topic: string,
        trainerName?: string,
        durationMinutes?: number,
        config?: VideoRoomConfig,
    ): Promise<{ roomId: string; joinUrl: string; hostUrl: string }> {
        const roomId = `gym-${classId}-${randomBytes(4).toString('hex')}`;
        const base = `${VIDEO_SERVER_URL}/roomscreen/${roomId}`;

        const audioVal = config?.defaultAudio !== false ? '1' : '0';
        const videoVal = config?.defaultVideo !== false ? '1' : '0';

        // Shared params: suppress share-room popup, set default media state
        const sharedParams = new URLSearchParams({
            notify: '0',
            audio: audioVal,
            video: videoVal,
        });
        if (durationMinutes && durationMinutes > 0) {
            sharedParams.set('duration', String(durationMinutes));
        }

        // Member join URL — members type their own name
        const joinUrl = `${base}?${sharedParams.toString()}`;

        // Trainer host URL — gym profile name pre-filled; optionally auto-starts screen share
        const hostParams = new URLSearchParams(sharedParams);
        if (trainerName) hostParams.set('name', trainerName);
        if (config?.trainerAutoScreen) hostParams.set('screen', '1');
        const hostUrl = `${base}?${hostParams.toString()}`;

        try {
            await fetch(`${VIDEO_SERVER_URL}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, roomName: topic, classId, duration: durationMinutes, presenterName: trainerName, channel_password: config?.password ?? '' }),
                signal: AbortSignal.timeout(5000),
            });
        } catch (_err) {
            // Video server registers the room on first join if this endpoint is unavailable
        }

        return { roomId, joinUrl, hostUrl };
    }

    async deleteRoom(roomId: string): Promise<void> {
        try {
            await fetch(`${VIDEO_SERVER_URL}/api/rooms/${roomId}`, {
                method: 'DELETE',
                signal: AbortSignal.timeout(5000),
            });
        } catch (_err) {}
    }

    async getServerHealth(): Promise<{ online: boolean; serverUrl: string }> {
        try {
            const resp = await fetch(VIDEO_SERVER_URL, { signal: AbortSignal.timeout(3000) });
            return { online: resp.ok || resp.status < 500, serverUrl: VIDEO_SERVER_URL };
        } catch {
            return { online: false, serverUrl: VIDEO_SERVER_URL };
        }
    }
}

export const videoService = new VideoService();
