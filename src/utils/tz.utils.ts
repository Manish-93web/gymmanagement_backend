/**
 * Timezone helpers shared by biometric attendance and staff payroll.
 */

/**
 * Compute start and end of a calendar day in a given timezone, returned as UTC Date objects.
 * e.g. for Asia/Kolkata: day start = UTC 18:30 previous day, day end = UTC 18:29:59.999 current day
 */
export function dayBoundsUTC(date: Date, tz: string): { start: Date; end: Date } {
    try {
        const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);

        const tzToUTC = (localStr: string): Date => {
            const naive = new Date(localStr + 'Z');
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false,
            }).formatToParts(naive);
            const m: Record<string, string> = {};
            for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
            const tzInterpretedAsUTC = new Date(
                `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`
            );
            const offsetMs = tzInterpretedAsUTC.getTime() - naive.getTime();
            return new Date(naive.getTime() - offsetMs);
        };

        return {
            start: tzToUTC(`${dayStr}T00:00:00`),
            end:   tzToUTC(`${dayStr}T23:59:59.999`),
        };
    } catch {
        const start = new Date(date); start.setUTCHours(0, 0, 0, 0);
        const end   = new Date(date); end.setUTCHours(23, 59, 59, 999);
        return { start, end };
    }
}

/** First instant of day 1 through last instant of the last day of a calendar month, in `tz`. */
export function monthBoundsUTC(year: number, month: number, tz: string): { start: Date; end: Date } {
    const first = new Date(Date.UTC(year, month - 1, 1, 12));
    const last  = new Date(Date.UTC(year, month, 0, 12));
    return { start: dayBoundsUTC(first, tz).start, end: dayBoundsUTC(last, tz).end };
}

/** Minutes since local midnight for an instant, in `tz`. */
export function localMinutesOfDay(date: Date, tz: string): number {
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
        }).formatToParts(date);
        const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24;
        const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
        return h * 60 + m;
    } catch {
        return date.getUTCHours() * 60 + date.getUTCMinutes();
    }
}

/** "09:30" -> 570 */
export function hhmmToMinutes(hhmm: string, fallback: number): number {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

/**
 * Convert a device-local wall-clock string ("YYYY-MM-DD HH:mm:ss" or ISO without offset)
 * in timezone `tz` to the real UTC instant. Returns an Invalid Date when unparseable.
 */
export function deviceLocalToUTC(timeStr: string, tz: string): Date {
    const naive = new Date(timeStr.replace(' ', 'T') + 'Z');
    if (isNaN(naive.getTime())) return new Date(NaN);
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(naive);
        const m: Record<string, string> = {};
        for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
        const tzInterpretedAsUTC = new Date(`${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`);
        return new Date(naive.getTime() - (tzInterpretedAsUTC.getTime() - naive.getTime()));
    } catch {
        return naive;
    }
}
