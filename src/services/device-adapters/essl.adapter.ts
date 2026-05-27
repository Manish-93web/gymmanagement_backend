import axios from 'axios';
import {
    IDeviceAdapter, DeviceCredentials, SyncResult, ConnectionTestResult,
    normalizePunchType, deviceLocalToUTC,
} from './base.adapter';

export class ESSLAdapter implements IDeviceAdapter {
    private base(creds: DeviceCredentials) {
        return `http://${creds.ipAddress}:${creds.port}`;
    }

    private auth(creds: DeviceCredentials) {
        return creds.apiKey
            ? { headers: { Authorization: `Bearer ${creds.apiKey}` } }
            : { auth: { username: 'admin', password: creds.password || '' } };
    }

    async testConnection(creds: DeviceCredentials): Promise<ConnectionTestResult> {
        const t0 = Date.now();
        try {
            const res = await axios.get(`${this.base(creds)}/api/v1/device/info`, {
                ...this.auth(creds), timeout: 8000,
            });
            return {
                success: true,
                latencyMs: Date.now() - t0,
                firmwareVersion: res.data?.firmware,
                deviceSerial: res.data?.serialNo,
            };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async pullLogs(creds: DeviceCredentials, fromCursor?: string): Promise<SyncResult> {
        const params: any = { pageSize: 500 };
        if (fromCursor) params.startTime = fromCursor;

        const res = await axios.get(`${this.base(creds)}/api/v1/attendance/logs`, {
            ...this.auth(creds), params, timeout: 30000,
        });

        const raw: any[] = res.data?.data || res.data?.records || [];
        const tz = creds.timezone || 'Asia/Kolkata';
        const records = raw.map((r: any) => {
            const timeStr: string = r.punchTime || r.checkTime || r.time || '';
            return {
                biometricUserId: String(r.enrollId || r.userId || r.pin || ''),
                punchTime: deviceLocalToUTC(timeStr, tz),
                deviceLocalTime: timeStr,
                eventType: normalizePunchType(r.punchType ?? r.verifyType ?? 0),
                rawPayload: r,
            };
        }).filter(r => !isNaN(r.punchTime.getTime()) && r.biometricUserId);

        return {
            records,
            newCursor: res.data?.lastSyncTime || (records.length > 0
                ? records[records.length - 1].deviceLocalTime
                : fromCursor || ''),
            deviceTime: res.data?.deviceTime ? new Date(res.data.deviceTime) : undefined,
        };
    }
}
