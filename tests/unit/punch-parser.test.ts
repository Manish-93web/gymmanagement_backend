import { parsePunches, parsePunchTime, parseDirection, punchFromQuery } from '../../src/utils/punch-parser';

const TZ = 'Asia/Kolkata';
const iso = (d: Date) => d.toISOString();

describe('parsePunchTime', () => {
    it('reads wall-clock times in the device timezone', () => {
        expect(iso(parsePunchTime('2026-10-05 09:00:00', TZ))).toBe('2026-10-05T03:30:00.000Z');
        expect(iso(parsePunchTime('05/10/2026 09:00', TZ))).toBe('2026-10-05T03:30:00.000Z');
        expect(iso(parsePunchTime('05-10-2026 09:00 PM', TZ))).toBe('2026-10-05T15:30:00.000Z');
        expect(iso(parsePunchTime('20261005090000', TZ))).toBe('2026-10-05T03:30:00.000Z');
    });
    it('keeps absolute times as they are', () => {
        expect(iso(parsePunchTime('2026-10-05T09:00:00+05:30', TZ))).toBe('2026-10-05T03:30:00.000Z');
        expect(iso(parsePunchTime('2026-10-05T03:30:00Z', TZ))).toBe('2026-10-05T03:30:00.000Z');
        expect(iso(parsePunchTime('1791171000', TZ))).toBe(iso(new Date(1791171000 * 1000)));
        expect(iso(parsePunchTime('1791171000000', TZ))).toBe(iso(new Date(1791171000000)));
    });
    it('returns an invalid date for junk', () => {
        expect(isNaN(parsePunchTime('yesterday', TZ).getTime())).toBe(true);
        expect(isNaN(parsePunchTime('31/13/2026 09:00', TZ).getTime())).toBe(true);
    });
});

describe('parseDirection', () => {
    it('maps the usual in/out encodings', () => {
        for (const v of ['out', 'OUT', 'Exit', '1', 'check_out', 'O']) expect(parseDirection(v)).toBe('check_out');
        for (const v of ['in', '0', 'entry', '', undefined, 'checkin']) expect(parseDirection(v)).toBe('check_in');
    });
});

describe('parsePunches across vendors', () => {
    it('Hikvision access-controller event (nested, offset time)', () => {
        const r = parsePunches({ AccessControllerEvent: { employeeNoString: '901', currentVerifyMode: 'fp' }, dateTime: '2026-10-05T09:01:02+05:30' }, TZ);
        expect(r.punches).toHaveLength(1);
        expect(r.punches[0].biometricUserId).toBe('901');
        expect(iso(r.punches[0].punchTime)).toBe('2026-10-05T03:31:02.000Z');
    });
    it('Suprema BioStar-style list with nested user id', () => {
        const r = parsePunches({ records: [{ user_id: { user_id: '12' }, datetime: '2026-10-05T03:30:00Z', event_type: 'OUT' }] }, TZ);
        expect(r.punches[0]).toMatchObject({ biometricUserId: '12', eventType: 'check_out' });
    });
    it('Matrix / Excel style: separate date and time columns with header', () => {
        const csv = 'UserID,Date,Time,InOut\n7,05/10/2026,09:10:00,In\n7,05/10/2026,18:05:00,Out';
        const r = parsePunches(csv, TZ);
        expect(r.punches.map(p => p.eventType)).toEqual(['check_in', 'check_out']);
        expect(iso(r.punches[1].punchTime)).toBe('2026-10-05T12:35:00.000Z');
    });
    it('ZKTeco / eSSL USB export: headerless tab lines', () => {
        const r = parsePunches('3\t2026-10-05 09:00:00\t0\t1\t0\n3\t2026-10-05 18:00:00\t1\t1\t0\n', TZ);
        expect(r.punches).toHaveLength(2);
        expect(r.punches[1].eventType).toBe('check_out');
    });
    it('headerless CSV with date and time split', () => {
        const r = parsePunches('55,2026-10-05,09:00:00\n55,2026-10-05,18:00:00', TZ);
        expect(r.punches).toHaveLength(2);
        expect(iso(r.punches[0].punchTime)).toBe('2026-10-05T03:30:00.000Z');
    });
    it('Mantra / Realtime flat JSON array with different field names', () => {
        const r = parsePunches('[{"EmpCode":"21","PunchDateTime":"2026-10-05 09:00:00"},{"EmpCode":"21","PunchDateTime":"2026-10-05 17:30:00"}]', TZ);
        expect(r.punches.map(p => p.biometricUserId)).toEqual(['21', '21']);
    });
    it('XML push', () => {
        const xml = '<EventNotificationAlert><employeeNoString>9</employeeNoString><dateTime>2026-10-05T09:00:00+05:30</dateTime></EventNotificationAlert>';
        const r = parsePunches(xml, TZ);
        expect(r.punches[0].biometricUserId).toBe('9');
    });
    it('reports rows it cannot read instead of failing the batch', () => {
        const r = parsePunches('id,time\n5,2026-10-05 09:00:00\n6,not a time\n,2026-10-05 09:00:00', TZ);
        expect(r.punches).toHaveLength(1);
        expect(r.rejected).toHaveLength(2);
    });
    it('single punch in a query string', () => {
        const r = punchFromQuery({ id: '4', time: '2026-10-05 09:00:00', status: '1' }, TZ);
        expect(r.punches[0]).toMatchObject({ biometricUserId: '4', eventType: 'check_out' });
    });
});
