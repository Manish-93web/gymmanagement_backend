export interface DeviceCredentials {
    ipAddress: string;
    port: number;
    password?: string;
    apiKey?: string;
    timezone: string;
}

export interface RawPunchRecord {
    biometricUserId: string;   // enrollId from device
    punchTime: Date;           // UTC
    deviceLocalTime: string;   // raw string from device for audit
    eventType: 'check_in' | 'check_out' | 'overtime_in' | 'overtime_out' | 'unknown';
    rawPayload?: any;
    // Per-record cursor: adapter sets this to the position of this record on the device.
    // The controller advances lastSyncCursor only after each record is successfully saved,
    // so failed records remain retrievable on the next pull (cursor does not skip ahead past them).
    cursor?: string;
}

export interface SyncResult {
    records: RawPunchRecord[];
    newCursor: string;         // cursor AFTER last successfully fetched record (advance per-record, not per-batch)
    deviceTime?: Date;         // for drift detection
    clockDriftSeconds?: number;
    // Records that could not be parsed or were rejected by the device layer (not DB failures).
    // These are already past the cursor; the controller should log them to BiometricSyncJob.failedCount.
    failedRecords?: RawPunchRecord[];
    skippedCount?: number;     // total count of records skipped (invalid format, unknown user type, etc.)
}

export interface ConnectionTestResult {
    success: boolean;
    latencyMs?: number;
    firmwareVersion?: string;
    deviceSerial?: string;
    error?: string;
}

export interface IDeviceAdapter {
    testConnection(creds: DeviceCredentials): Promise<ConnectionTestResult>;
    pullLogs(creds: DeviceCredentials, fromCursor?: string): Promise<SyncResult>;
}

export function normalizePunchType(code: number | string): RawPunchRecord['eventType'] {
    const n = typeof code === 'string' ? parseInt(code, 10) : code;
    switch (n) {
        case 1:  return 'check_out';
        case 4:  return 'overtime_in';
        case 5:  return 'overtime_out';
        default: return 'check_in';
    }
}

export function deviceLocalToUTC(timeStr: string, tz: string): Date {
    const naive = new Date(timeStr.replace(' ', 'T') + 'Z');
    if (isNaN(naive.getTime())) return new Date(NaN);
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).formatToParts(naive);
        const m: Record<string, string> = {};
        for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
        const tzAsUTC = new Date(`${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`);
        const offsetMs = tzAsUTC.getTime() - naive.getTime();
        return new Date(naive.getTime() - offsetMs);
    } catch {
        return naive;
    }
}
