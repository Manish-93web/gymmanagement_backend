import axios from 'axios';
import {
    IDeviceAdapter, DeviceCredentials, SyncResult, ConnectionTestResult,
    normalizePunchType, deviceLocalToUTC,
} from './base.adapter';

export class ZKTecoAdapter implements IDeviceAdapter {
    private base(creds: DeviceCredentials) {
        return `http://${creds.ipAddress}:${creds.port}`;
    }

    async testConnection(creds: DeviceCredentials): Promise<ConnectionTestResult> {
        const t0 = Date.now();
        try {
            const res = await axios.get(`${this.base(creds)}/iclock/cdata`, {
                params: { SN: 'ping', options: 'all' },
                auth: { username: 'admin', password: creds.password || '' },
                timeout: 8000,
            });
            return {
                success: res.status === 200,
                latencyMs: Date.now() - t0,
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async pullLogs(creds: DeviceCredentials, fromCursor?: string): Promise<SyncResult> {
        const params: any = { limit: 500 };
        if (fromCursor) params.cursor = fromCursor;

        const res = await axios.get(`${this.base(creds)}/iclock/getrequest`, {
            auth: { username: 'admin', password: creds.password || '' },
            params, timeout: 30000,
        });

        const raw: any[] = res.data?.data || res.data || [];
        const tz = creds.timezone || 'Asia/Kolkata';
        const records = (Array.isArray(raw) ? raw : []).map((r: any) => {
            const timeStr: string = r.timestamp || r.time || r.punchTime || '';
            return {
                biometricUserId: String(r.pin || r.uid || r.userId || ''),
                punchTime: deviceLocalToUTC(timeStr, tz),
                deviceLocalTime: timeStr,
                eventType: normalizePunchType(r.status ?? r.type ?? 0),
                rawPayload: r,
            };
        }).filter(r => !isNaN(r.punchTime.getTime()) && r.biometricUserId);

        return {
            records,
            newCursor: res.data?.nextCursor || (records.length > 0
                ? records[records.length - 1].deviceLocalTime
                : fromCursor || ''),
        };
    }
}
