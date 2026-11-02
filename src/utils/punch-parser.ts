import { deviceLocalToUTC } from './tz.utils';

/**
 * Brand-neutral punch parsing. Turns whatever a biometric machine, its vendor software or an
 * exported file produces (JSON, CSV/TSV, ADMS-style lines, Hikvision / Suprema / Matrix / Mantra /
 * Anviz style payloads) into { biometricUserId, punchTime, eventType } records.
 */

export interface ParsedPunch {
    biometricUserId: string;
    punchTime: Date;
    eventType: 'check_in' | 'check_out';
    raw: unknown;
}

export interface ParseResult {
    punches: ParsedPunch[];
    rejected: { row: number; reason: string }[];
}

const ID_KEYS = [
    'biometricuserid', 'employeeno', 'employeenostring', 'empcode', 'empid', 'employeeid', 'enrollid', 'enrollno',
    'userid', 'user_id', 'pin', 'uid', 'personid', 'cardno', 'badge', 'badgenumber', 'code', 'id', 'userno', 'enrollnumber',
];
const TIME_KEYS = [
    'punchtime', 'punchdatetime', 'datetime', 'timestamp', 'time', 'authtime', 'eventtime', 'logtime', 'checktime',
    'verifytime', 'attendancetime', 'transactiontime', 'devicetime', 'date',
];
const DIRECTION_KEYS = [
    'eventtype', 'direction', 'inout', 'entryexit', 'status', 'state', 'punchstate', 'attendancestatus', 'checktype',
    'punchtype', 'type', 'attendancetype',
];

const norm = (k: string) => k.toLowerCase().replace(/[\s_\-.]/g, '');

/** Case/format-insensitive lookup of the first present field among `keys`. */
function pick(obj: Record<string, any>, keys: string[]): any {
    const flat: Record<string, any> = {};
    const walk = (o: any, depth: number) => {
        if (!o || typeof o !== 'object' || depth > 3) return;
        for (const [k, v] of Object.entries(o)) {
            if (v && typeof v === 'object' && !(v instanceof Date)) walk(v, depth + 1);
            else if (!(norm(k) in flat)) flat[norm(k)] = v;
        }
    };
    walk(obj, 0);
    for (const k of keys) {
        const v = flat[norm(k)];
        if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
    return undefined;
}

/** In/out intent from the many encodings devices use. Unknown -> check_in (first/last-punch logic still decides). */
export function parseDirection(v: unknown): 'check_in' | 'check_out' {
    const s = String(v ?? '').trim().toLowerCase();
    if (!s) return 'check_in';
    if (['1', 'o', 'out', 'exit', 'checkout', 'check_out', 'check-out', 'clockout', 'clock_out', 'leave', 'egress', '5', 'overtime_out'].includes(s)) return 'check_out';
    return 'check_in';
}

const pad = (n: number | string) => String(n).padStart(2, '0');

/**
 * Parse a punch time. Values carrying an offset / Z, or epoch numbers, are absolute. Anything else is
 * wall-clock time in the device's timezone `tz`. Day-first (DD/MM/YYYY) is assumed for ambiguous dates.
 */
export function parsePunchTime(value: unknown, tz: string): Date {
    if (value instanceof Date) return value;
    const s = String(value ?? '').trim();
    if (!s) return new Date(NaN);

    // Epoch seconds / milliseconds
    if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000);
    if (/^\d{13}$/.test(s)) return new Date(Number(s));

    // ISO with explicit offset or Z (Hikvision: 2026-10-05T09:01:02+05:30)
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
        return new Date(s.replace(' ', 'T').replace(/\s+/g, ''));
    }

    // YYYY-MM-DD[ T]HH:mm[:ss] or YYYY/MM/DD
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(s);
    if (m) return deviceLocalToUTC(`${m[1]}-${pad(m[2])}-${pad(m[3])} ${pad(m[4])}:${m[5]}:${pad(m[6] ?? '00')}`, tz);

    // DD/MM/YYYY[ HH:mm[:ss]] [AM|PM]  (also - and .)
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(s);
    if (m) {
        let h = Number(m[4] ?? 0);
        const ap = m[7]?.toUpperCase();
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        const day = Number(m[1]), mon = Number(m[2]);
        if (mon < 1 || mon > 12 || day < 1 || day > 31) return new Date(NaN);
        return deviceLocalToUTC(`${m[3]}-${pad(mon)}-${pad(day)} ${pad(h)}:${m[5] ?? '00'}:${pad(m[6] ?? '00')}`, tz);
    }

    // Compact YYYYMMDDHHmmss
    m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
    if (m) return deviceLocalToUTC(`${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`, tz);

    return new Date(NaN);
}

/** Build one punch from a key/value record (JSON object or CSV row). */
function fromRecord(rec: Record<string, any>, tz: string): ParsedPunch | string {
    const id = pick(rec, ID_KEYS);
    if (id === undefined) return 'no user id field';

    let timeVal = pick(rec, TIME_KEYS.filter(k => k !== 'date'));
    const dateVal = pick(rec, ['date', 'punchdate', 'logdate', 'attendancedate']);
    // Separate date + time columns (Matrix COSEC, Anviz exports, Excel sheets)
    if (dateVal !== undefined) {
        const t = pick(rec, ['time', 'punchtime', 'logtime', 'intime', 'checktime']);
        if (t !== undefined && !/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(String(t))) {
            timeVal = `${String(dateVal).trim()} ${String(t).trim()}`;
        } else if (timeVal === undefined) timeVal = dateVal;
    }
    if (timeVal === undefined) return 'no time field';

    const punchTime = parsePunchTime(timeVal, tz);
    if (isNaN(punchTime.getTime())) return `unreadable time "${String(timeVal).slice(0, 40)}"`;

    return {
        biometricUserId: String(id).trim(),
        punchTime,
        eventType: parseDirection(pick(rec, DIRECTION_KEYS)),
        raw: rec,
    };
}

/** Split one CSV/TSV line honouring double quotes. */
function splitLine(line: string, delim: string): string[] {
    const out: string[] = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if (c === delim && !q) { out.push(cur); cur = ''; }
        else cur += c;
    }
    out.push(cur);
    return out.map(x => x.trim());
}

function parseDelimited(text: string, tz: string): ParseResult {
    const res: ParseResult = { punches: [], rejected: [] };
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return res;

    const sample = lines.slice(0, 5).join('\n');
    const delim = (sample.match(/\t/g) || []).length >= (sample.match(/,/g) || []).length && sample.includes('\t') ? '\t'
        : sample.includes(';') && !sample.includes(',') ? ';' : ',';

    const first = splitLine(lines[0], delim);
    const hasHeader = first.some(c => /[a-z]/i.test(c)) && !first.some(c => parsePunchTime(c, tz).getTime() > 0);
    const header = hasHeader ? first.map(norm) : null;
    const startAt = hasHeader ? 1 : 0;

    for (let i = startAt; i < lines.length; i++) {
        const cells = splitLine(lines[i], delim);
        const rowNo = i + 1;
        let out: ParsedPunch | string;
        if (header) {
            const rec: Record<string, string> = {};
            header.forEach((h, idx) => { if (h) rec[h] = cells[idx] ?? ''; });
            out = fromRecord(rec, tz);
        } else {
            // Headerless: ADMS order "id, time[, status ...]" or "id, date, time[, status]"
            const [id, a, b, c] = cells;
            const joined = parsePunchTime(`${a} ${b}`.trim(), tz);
            const timeStr = !isNaN(joined.getTime()) && b ? `${a} ${b}` : a;
            const statusCell = !isNaN(joined.getTime()) && b ? c : b;
            out = fromRecord({ id, time: timeStr, status: statusCell }, tz);
        }
        if (typeof out === 'string') res.rejected.push({ row: rowNo, reason: out });
        else res.punches.push(out);
    }
    return res;
}

/** Find the array of event objects inside arbitrary vendor JSON. */
function extractRecords(json: any): any[] {
    if (Array.isArray(json)) return json;
    if (!json || typeof json !== 'object') return [];
    const listKeys = ['punches', 'records', 'logs', 'events', 'data', 'rows', 'attlog', 'InfoList', 'AcsEvent', 'event_list', 'items', 'result'];
    for (const [k, v] of Object.entries(json)) {
        if (listKeys.some(x => norm(x) === norm(k))) {
            if (Array.isArray(v)) return v;
            if (v && typeof v === 'object') {
                const inner = extractRecords(v);
                if (inner.length) return inner;
            }
        }
    }
    // Hikvision push: { EventNotificationAlert / AccessControllerEvent: { employeeNoString, dateTime } } or a single flat event
    return [json];
}

/**
 * Parse any request/file body. `body` may be an already-decoded object, a JSON string, a CSV/TSV
 * file or ADMS-style text lines. `tz` is the device's timezone for wall-clock values.
 */
export function parsePunches(body: unknown, tz: string): ParseResult {
    if (body === undefined || body === null || body === '') return { punches: [], rejected: [] };

    let value: any = body;
    if (typeof body === 'string') {
        const t = body.trim();
        if (t.startsWith('{') || t.startsWith('[')) {
            try { value = JSON.parse(t); } catch { return parseDelimited(body, tz); }
        } else if (t.startsWith('<')) {
            // XML push (some Hikvision / ISAPI): pull flat tags into one record per <Event...>
            return parseXml(t, tz);
        } else {
            return parseDelimited(body, tz);
        }
    }

    const records = extractRecords(value);
    const res: ParseResult = { punches: [], rejected: [] };
    records.forEach((r, i) => {
        if (typeof r === 'string') {
            const inner = parseDelimited(r, tz);
            res.punches.push(...inner.punches);
            res.rejected.push(...inner.rejected.map(x => ({ row: i + 1, reason: x.reason })));
            return;
        }
        if (!r || typeof r !== 'object') { res.rejected.push({ row: i + 1, reason: 'not an object' }); return; }
        const out = fromRecord(r, tz);
        if (typeof out === 'string') res.rejected.push({ row: i + 1, reason: out });
        else res.punches.push(out);
    });
    return res;
}

function parseXml(xml: string, tz: string): ParseResult {
    const res: ParseResult = { punches: [], rejected: [] };
    const chunks = xml.split(/<\/(?:EventNotificationAlert|Event|Record|Row|Item)>/i).filter(c => /<\w+/.test(c));
    chunks.forEach((chunk, i) => {
        const rec: Record<string, string> = {};
        for (const m of chunk.matchAll(/<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g)) rec[m[1]] = m[2].trim();
        if (!Object.keys(rec).length) return;
        const out = fromRecord(rec, tz);
        if (typeof out === 'string') res.rejected.push({ row: i + 1, reason: out });
        else res.punches.push(out);
    });
    return res;
}

/** GET-style devices that send a single punch in the query string (?id=7&time=...&status=0). */
export function punchFromQuery(query: Record<string, any>, tz: string): ParseResult {
    const out = fromRecord(query, tz);
    return typeof out === 'string'
        ? { punches: [], rejected: [{ row: 1, reason: out }] }
        : { punches: [out], rejected: [] };
}
