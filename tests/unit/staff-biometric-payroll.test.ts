import mongoose from 'mongoose';
import StaffAttendanceService from '../../src/services/staff-attendance.service';
import StaffPayrollService from '../../src/services/staff-payroll.service';
import BiometricAttendanceService from '../../src/services/biometric-attendance.service';
import StaffAttendance from '../../src/models/StaffAttendance.model';
import StaffPayroll from '../../src/models/StaffPayroll.model';
import BiometricStaff from '../../src/models/BiometricStaff.model';
import Attendance from '../../src/models/Attendance.model';
import User from '../../src/models/User.model';
import Trainer from '../../src/models/Trainer.model';

const TZ = 'Asia/Kolkata';
const tenantId = new mongoose.Types.ObjectId();
const branchId = new mongoose.Types.ObjectId();

// IST wall-clock -> instant (IST = UTC+05:30, no DST)
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

async function seedTrainer(monthlySalary: number, shift?: { startTime: string; endTime: string }) {
    const userId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({
        _id: userId, tenantId, branchId, role: 'trainer', firstName: 'Ravi', lastName: 'K', isActive: true,
    });
    await Trainer.collection.insertOne({
        _id: new mongoose.Types.ObjectId(), tenantId, branchId, userId, salary: { base: monthlySalary, type: 'fixed' }, ...(shift && { shift }),
    });
    return userId;
}

const punch = (staffId: mongoose.Types.ObjectId, punchTime: Date) =>
    StaffAttendanceService.recordPunch({ tenantId, branchId, staffId, punchTime, timezone: TZ, dedupeMinutes: 5 });

describe('Trainer biometric attendance', () => {
    it('first punch checks in, later punch checks out and computes hours and overtime', async () => {
        const staffId = await seedTrainer(26000);

        const inRes = await punch(staffId, ist('2026-10-05', '09:00'));
        expect(inRes).toMatchObject({ created: true, action: 'check_in' });

        const outRes = await punch(staffId, ist('2026-10-05', '18:00'));
        expect(outRes).toMatchObject({ created: true, action: 'check_out' });

        const rec: any = await StaffAttendance.findOne({ staffId }).lean();
        expect(rec.status).toBe('present');
        expect(rec.hoursWorked).toBe(9);
        expect(rec.overtime).toBe(1);
        expect(rec.earlyDeparture).toBe(false);
        expect(rec.source).toBe('biometric');
        expect(rec.punchCount).toBe(2);
    });

    it('marks a late check-in and an early departure', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '10:15'));
        await punch(staffId, ist('2026-10-05', '17:00'));

        const rec: any = await StaffAttendance.findOne({ staffId }).lean();
        expect(rec.status).toBe('late');
        expect(rec.earlyDeparture).toBe(true);
    });

    it('ignores a repeat punch inside the dedupe window', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));
        const dup = await punch(staffId, ist('2026-10-05', '09:02'));

        expect(dup).toMatchObject({ created: false, reason: 'duplicate_punch' });
        expect(await StaffAttendance.countDocuments({ staffId })).toBe(1);
    });

    it('keeps one record per local day and starts a new one the next day', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));
        await punch(staffId, ist('2026-10-05', '18:00'));
        await punch(staffId, ist('2026-10-06', '09:00'));

        expect(await StaffAttendance.countDocuments({ staffId })).toBe(2);
    });

    it('routes an enrolled device ID to staff attendance, not member attendance', async () => {
        const staffId = await seedTrainer(26000);
        await BiometricStaff.create({ tenantId, userId: staffId, biometricUserId: '7', active: true });

        const result = await BiometricAttendanceService.processRawLog({
            _id: new mongoose.Types.ObjectId(),
            tenantId,
            branchId,
            biometricUserId: '007', // device may send zero-padded IDs
            punchTime: ist('2026-10-05', '09:00'),
        });

        expect(result.created).toBe(true);
        expect(await StaffAttendance.countDocuments({ staffId, source: 'biometric' })).toBe(1);
        expect(await Attendance.countDocuments({ tenantId })).toBe(0);
    });
});

describe('Trainer payroll from attendance', () => {
    it('pays hours worked, adds overtime and deducts a late fee (Trainer.salary.base, 26 days x 8h)', async () => {
        const staffId = await seedTrainer(26000); // hourly rate = 26000 / 26 / 8 = 125

        await punch(staffId, ist('2026-10-05', '10:00')); // late (after 09:30)
        await punch(staffId, ist('2026-10-05', '18:00')); // 8h, not early
        await punch(staffId, ist('2026-10-06', '09:00'));
        await punch(staffId, ist('2026-10-06', '18:00')); // 9h -> 1h overtime

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);

        expect(p.monthlySalary).toBe(26000);
        expect(p.workingDays).toBe(2);
        expect(p.totalHours).toBe(17);
        expect(p.overtimeHours).toBe(1);
        expect(p.lateCount).toBe(1);
        expect(p.basePay).toBe(2000);          // 16 regular hours x 125
        expect(p.overtimePay).toBe(187.5);     // 1h x 125 x 1.5
        expect(p.deductions).toBe(50);         // one late arrival
        expect(p.netPay).toBe(2137.5);
        expect(p.biometricDays).toBe(2);
    });

    it('never pays more than the monthly salary for base hours', async () => {
        const staffId = await seedTrainer(1000);
        for (let d = 1; d <= 27; d++) {
            const day = `2026-10-${String(d).padStart(2, '0')}`;
            await punch(staffId, ist(day, '09:00'));
            await punch(staffId, ist(day, '18:00')); // 9h = 8 regular + 1 overtime
        }
        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.basePay).toBe(1000); // 216 regular hours would be 1038 uncapped
    });

    it('counts a missed check-out as an incomplete day and does not pay its hours', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00')); // never checks out

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.incompleteDays).toBe(1);
        expect(p.totalHours).toBe(0);
        expect(p.basePay).toBe(0);
    });

    it('run() saves payslips, and a paid payslip is not overwritten on the next run', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));
        await punch(staffId, ist('2026-10-05', '18:00'));

        const first = await StaffPayrollService.run(tenantId, 10, 2026);
        expect(first.generated).toBe(1);

        const saved: any = await StaffPayroll.findOne({ tenantId, staffId }).lean();
        expect(saved.status).toBe('generated');
        await StaffPayrollService.markPaid(tenantId, String(saved._id));

        // more attendance arrives after payment
        await punch(staffId, ist('2026-10-06', '09:00'));
        await punch(staffId, ist('2026-10-06', '18:00'));
        const second = await StaffPayrollService.run(tenantId, 10, 2026);

        expect(second.skippedPaid).toBe(1);
        const after: any = await StaffPayroll.findOne({ tenantId, staffId }).lean();
        expect(after.status).toBe('paid');
        expect(after.netPay).toBe(saved.netPay);
    });
});

describe('Manual clock-in, corrections and leave', () => {
    it('manual clock-in after a biometric punch reuses the same day record (no duplicate day)', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));

        await expect(
            StaffAttendanceService.clockIn(tenantId, staffId, branchId, ist('2026-10-05', '09:30'))
        ).rejects.toThrow('Already clocked in');
        expect(await StaffAttendance.countDocuments({ staffId })).toBe(1);

        const out = await StaffAttendanceService.clockOut(tenantId, staffId, ist('2026-10-05', '18:00'));
        expect(out.hoursWorked).toBe(9);
    });

    it('manual clock-in just after IST midnight still lands on the IST calendar day', async () => {
        const staffId = await seedTrainer(26000);
        const rec: any = await StaffAttendanceService.clockIn(tenantId, staffId, branchId, ist('2026-10-05', '00:30'));
        expect(rec.date.toISOString()).toBe(ist('2026-10-05', '00:00').toISOString());
    });

    it('owner can fix a missed check-out and hours are recalculated', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00')); // forgot to punch out

        const rec: any = await StaffAttendanceService.correct({
            tenantId, staffId, day: ist('2026-10-05', '12:00'), clockOut: ist('2026-10-05', '17:30'),
        });
        expect(rec.hoursWorked).toBe(8.5);
        expect(rec.status).toBe('present');
        expect(rec.notes).toContain('Adjusted');
        expect(await StaffAttendance.countDocuments({ staffId })).toBe(1);

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.incompleteDays).toBe(0);
        expect(p.totalHours).toBe(8.5);
    });

    it('owner can add a whole missing day', async () => {
        const staffId = await seedTrainer(26000);
        const rec: any = await StaffAttendanceService.correct({
            tenantId, staffId, day: ist('2026-10-07', '12:00'),
            clockIn: ist('2026-10-07', '09:00'), clockOut: ist('2026-10-07', '18:00'),
        });
        expect(rec.hoursWorked).toBe(9);
        expect(rec.source).toBe('manual');
    });

    it('paid leave is paid at the daily rate and a stray punch does not overwrite it', async () => {
        const staffId = await seedTrainer(26000); // daily rate 1000
        await StaffAttendanceService.correct({ tenantId, staffId, day: ist('2026-10-08', '12:00'), status: 'paid_leave' });

        const stray = await punch(staffId, ist('2026-10-08', '10:00'));
        expect(stray).toMatchObject({ created: false, reason: 'day_marked_paid_leave' });

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.paidLeaveDays).toBe(1);
        expect(p.basePay).toBe(1000);
        expect(p.incompleteDays).toBe(0);
        expect(p.netPay).toBe(1000);
    });

    it('rejects a check-out earlier than the check-in', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));
        await expect(
            StaffAttendanceService.correct({ tenantId, staffId, day: ist('2026-10-05', '12:00'), clockOut: ist('2026-10-05', '08:00') })
        ).rejects.toThrow('after check-in');
    });
});

describe('Incomplete shifts reduce salary', () => {
    it('deducts the hours not worked at the hourly rate (default 8h day)', async () => {
        const staffId = await seedTrainer(26000); // daily 1000, hourly 125
        await punch(staffId, ist('2026-10-05', '09:00'));
        await punch(staffId, ist('2026-10-05', '15:00')); // 6h of 8h -> 2h short

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.shortfallHours).toBe(2);
        expect(p.shortfallDeduction).toBe(250);
        expect(p.basePay).toBe(1000);
        expect(p.netPay).toBe(750);
    });

    it('forgives being a few minutes short (inside the 10 minute grace)', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));
        await punch(staffId, ist('2026-10-05', '16:55')); // 7h55m

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.shortfallHours).toBe(0);
        expect(p.shortfallDeduction).toBe(0);
    });

    it('uses the own shift length of a trainer: a 6h shift fully worked has no deduction', async () => {
        const staffId = await seedTrainer(26000, { startTime: '06:00', endTime: '12:00' });
        // daily 1000, shift 6h -> hourly 166.67
        await punch(staffId, ist('2026-10-05', '06:00'));
        await punch(staffId, ist('2026-10-05', '12:00'));

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.shiftHours).toBe(6);
        expect(p.shortfallHours).toBe(0);
        expect(p.lateCount).toBe(0);
        expect(p.netPay).toBe(1000);
    });

    it('marks late against the own shift start of a trainer and deducts a short shift', async () => {
        const staffId = await seedTrainer(26000, { startTime: '16:00', endTime: '22:00' });
        await punch(staffId, ist('2026-10-05', '16:30')); // late (start 16:00 + 10 min grace)
        await punch(staffId, ist('2026-10-05', '20:00')); // 3.5h of 6h, 2.5h short

        const rec: any = await StaffAttendance.findOne({ staffId }).lean();
        expect(rec.status).toBe('late');
        expect(rec.earlyDeparture).toBe(true);

        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        // hourly = 1000 / 6 = 166.67; short 2.5h -> 416.67; late fee 50
        expect(p.shortfallHours).toBe(2.5);
        expect(p.shortfallDeduction).toBe(416.67);
        expect(p.lateDeduction).toBe(50);
        expect(p.netPay).toBe(533.33);
    });

    it('a missed check-out is not paid at all (no hours to count)', async () => {
        const staffId = await seedTrainer(26000);
        await punch(staffId, ist('2026-10-05', '09:00'));
        const p = await StaffPayrollService.computeForMonth(tenantId, String(staffId), 10, 2026);
        expect(p.netPay).toBe(0);
    });
});
