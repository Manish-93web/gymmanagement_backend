import { randomBytes } from 'crypto';

const VIDEO_SERVER_URL = process.env.VIDEO_SERVER_URL || 'http://localhost:3030';

class VideoService {
  async createRoom(classId: string, topic: string): Promise<{ roomId: string; joinUrl: string; hostUrl: string }> {
    const roomId = `gym-${classId}-${randomBytes(4).toString('hex')}`;
    const joinUrl = `${VIDEO_SERVER_URL}/roomscreen/${roomId}`;

    try {
      await fetch(`${VIDEO_SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, roomName: topic }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (_err) {
      // Video server may not have the endpoint yet — URL is still valid, room creates on first join
    }

    return { roomId, joinUrl, hostUrl: joinUrl };
  }

  async deleteRoom(roomId: string): Promise<void> {
    try {
      await fetch(`${VIDEO_SERVER_URL}/api/rooms/${roomId}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
    } catch (_err) {
      // Room may have already ended
    }
  }
}

export const videoService = new VideoService();
