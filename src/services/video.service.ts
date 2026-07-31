import { randomBytes } from 'crypto';

// Frontend URL where the video room page lives (Next.js, port 3001)
const FRONTEND_URL = process.env.GYMVIDEO_FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

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
        const base = `${FRONTEND_URL}/classes/session/${roomId}`;

        const audioVal = config?.defaultAudio !== false ? '1' : '0';
        const videoVal = config?.defaultVideo !== false ? '1' : '0';

        const sharedParams = new URLSearchParams({ audio: audioVal, video: videoVal });
        if (durationMinutes && durationMinutes > 0) {
            sharedParams.set('duration', String(durationMinutes));
        }

        // Member join URL — members type their own name on the pre-join screen
        const joinUrl = `${base}?${sharedParams.toString()}`;

        // Host URL — trainer name pre-filled; optionally starts with screen share
        const hostParams = new URLSearchParams(sharedParams);
        if (trainerName) hostParams.set('name', trainerName);
        if (config?.trainerAutoScreen) hostParams.set('screen', '1');
        const hostUrl = `${base}?${hostParams.toString()}`;

        return { roomId, joinUrl, hostUrl };
    }

    async deleteRoom(_roomId: string): Promise<void> {
        // Room cleanup is handled automatically by Socket.io on disconnect.
        // Nothing to do server-side.
    }

    async getServerHealth(): Promise<{ online: boolean; serverUrl: string }> {
        // The signaling server IS the backend (port 5000) — always online if this method runs.
        return { online: true, serverUrl: FRONTEND_URL };
    }
}

export const videoService = new VideoService();
