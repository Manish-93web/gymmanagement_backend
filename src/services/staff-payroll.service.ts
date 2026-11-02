import mongoose from 'mongoose';
import StaffAttendance from '../models/StaffAttendance.model';
import StaffDeductionSettings from '../models/StaffDeductionSettings.model';
import StaffPayroll from '../models/StaffPayroll.model';
import BiometricSettings from '../models/BiometricSettings.model';
import Trainer from '../models/Trainer.model';
import User from '../models/User.model';
import StaffAttendanceService from './staff-attendance.service';
import { monthBoundsUTC } from '../utils/tz.utils';

const PAYABLE_ROLES = ['trainer', 'staff', 'branch_manager', 'accountant'];
const round2 = (n: number) => parseFloat(n.toFixed(2));

export interface PayrollBreakdown {
    staffId: string;
    staffName: string;
    role: string;
    month: number;
    year: number;
    monthlySalary: number;
    workingDays: number;
    paidLeaveDays: number;     // approved leave / holidays, paid at the daily rate
    absentDays: number;
    lateCount: number;
    earlyDepartures: number;
    shiftHours: number;         // length of this person's full day
    shortfallHours: number;     // shift hours not worked on attended days
    shortfallDeduction: number; // pay deducted for those hours
    incompleteDays: number;     // days with a check-in but no check-out (hours not counted)
    totalHours: number;
    overtimeHours: number;
    basePay: number;
    overtimePay: number;
    absentDayDeduction: number;
    lateDeduction: number;
    earlyDepartureDeduction: number;
    deductions: number;
    netPay: number;
    biometricDays: number;
}

class StaffPayrollService {
    /** Timezone used to cut month boundaries (tenant biometric setting, IST by default). */
    private async tenantTimezone(tenantId: mongoose.Types.ObjectId | string): Promise<string> {
        const s: any = await BiometricSettings.findOne({ tenantId }).select('timezone').lean();
        return s?.timezone || 'Asia/Kolkata';
    }

    /** Contractual monthly salary: the Trainer profile for trainers, otherwise the user profile. */
    private async monthlySalaryFor(tenantId: any, user: any): Promise<number> {
        if (user.role === 'trainer') {
            const trainer: any = await Trainer.findOne({ tenantId, userId: user._id }).select('salary').lean();
            if (trainer?.salary?.base) return trainer.salary.base;
        }
        return user.salary || 0;
    }

    /**
     * Attendance-based pay for one staff member over [start, end].
     * Each attended day earns monthly salary / working days; hours short of the shift are deducted at
     * the hourly rate (daily rate / shift hours), extra hours are paid as overtime.
     */
    async compute(
        tenantId: mongoose.Types.ObjectId | string,
        staffId: mongoose.Types.ObjectId | string,
        range: { start: Date; end: Date; month: number; year: number },
        preloaded?: { user?: any; settings?: any }
    ): Promise<PayrollBreakdown> {
        const user: any = preloaded?.user ?? await User.findOne({ _id: staffId, tenantId })
            .select('firstName lastName role salary').lean();
        if (!user) throw new Error('Staff member not found');

        const settings: any = preloaded?.settings ?? await StaffDeductionSettings.findOne({ tenantId }).lean();
        const workingDaysPerMonth: number = settings?.workingDaysPerMonth ?? 26;
        const otMultiplier: number = settings?.overtimeMultiplier ?? 1.5;
        const absentFactor: number = settings?.deductionPerAbsentDay ?? 1.0;
        const lateFixed: number = settings?.deductionPerLate ?? 50;
        const earlyFactor: number = settings?.deductionPerEarlyDeparture ?? 0;
        const graceMinutes: number = settings?.graceMinutes ?? 10;

        // The person's own shift (trainers) or the gym default decides what a full day is.
        const shiftHours = (await StaffAttendanceService.rulesFor(tenantId, user._id)).stdHours;

        const records = await StaffAttendance.find({
            tenantId, staffId, date: { $gte: range.start, $lte: range.end },
        }).lean();

        const monthlySalary = await this.monthlySalaryFor(tenantId, user);
        const dailyRate = monthlySalary / workingDaysPerMonth;
        const hourlyRate = dailyRate / shiftHours;

        const completed = records.filter(r => r.status !== 'absent' && r.status !== 'paid_leave' && r.clockOut);
        const totalHours = completed.reduce((s, r) => s + (r.hoursWorked || 0), 0);
        const overtimeHours = completed.reduce((s, r) => s + Math.max(0, (r.hoursWorked || 0) - shiftHours), 0);
        const paidLeaveDays = records.filter(r => r.status === 'paid_leave').length;
        const absentDays = records.filter(r => r.status === 'absent').length;

        // Every attended day (and paid leave) earns a full day's pay, capped at the monthly salary...
        const basePay = Math.min(monthlySalary, dailyRate * (completed.length + paidLeaveDays));
        const overtimePay = hourlyRate * otMultiplier * overtimeHours;

        // ...then the part of the shift not worked is deducted at the hourly rate. Being a few minutes
        // short (within the grace period) is forgiven.
        const graceHours = graceMinutes / 60;
        const shortfallHours = completed.reduce((s, r) => {
            const short = shiftHours - (r.hoursWorked || 0);
            return short > graceHours ? s + short : s;
        }, 0);
        const shortfallDeduction = shortfallHours * hourlyRate;

        const lateCount = records.filter(r => r.status === 'late').length;
        const earlyRecords = completed.filter(r => r.earlyDeparture === true);

        // An absent day already earns nothing; this is only an extra penalty when the factor is above 1.
        const absentDayDeduction = absentDays * dailyRate * Math.max(0, absentFactor - 1);
        const lateDeduction = lateCount * lateFixed;
        const earlyDepartureDeduction = earlyRecords.length * dailyRate * earlyFactor;

        const deductions = shortfallDeduction + absentDayDeduction + lateDeduction + earlyDepartureDeduction;
        const netPay = Math.max(0, basePay + overtimePay - deductions);

        return {
            staffId: String(user._id),
            staffName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
            role: user.role,
            month: range.month,
            year: range.year,
            monthlySalary: round2(monthlySalary),
            workingDays: completed.length,
            paidLeaveDays,
            absentDays,
            lateCount,
            earlyDepartures: earlyRecords.length,
            shiftHours: round2(shiftHours),
            shortfallHours: round2(shortfallHours),
            shortfallDeduction: round2(shortfallDeduction),
            incompleteDays: records.filter(r => !r.clockOut && r.status !== 'absent' && r.status !== 'paid_leave').length,
            totalHours: round2(totalHours),
            overtimeHours: round2(overtimeHours),
            basePay: round2(basePay),
            overtimePay: round2(overtimePay),
            absentDayDeduction: round2(absentDayDeduction),
            lateDeduction: round2(lateDeduction),
            earlyDepartureDeduction: round2(earlyDepartureDeduction),
            deductions: round2(deductions),
            netPay: round2(netPay),
            biometricDays: records.filter(r => r.source === 'biometric').length,
        };
    }

    async computeForMonth(tenantId: mongoose.Types.ObjectId | string, staffId: string, month: number, year: number) {
        const tz = await this.tenantTimezone(tenantId);
        const { start, end } = monthBoundsUTC(year, month, tz);
        return this.compute(tenantId, staffId, { start, end, month, year });
    }

    /** One person's month: attendance-based breakdown plus the saved payslip status, if any. */
    async getForStaff(tenantId: mongoose.Types.ObjectId | string, staffId: string, month: number, year: number) {
        const breakdown = await this.computeForMonth(tenantId, staffId, month, year);
        const saved: any = await StaffPayroll.findOne({ tenantId, staffId, month, year }).lean();
        return {
            ...breakdown,
            payrollId: saved ? String(saved._id) : null,
            status: saved?.status ?? 'draft',
            paidAt: saved?.paidAt ?? null,
            ...(saved?.status === 'paid' ? { netPay: saved.netPay, deductions: saved.deductions, basePay: saved.basePay, overtimePay: saved.overtimePay } : {}),
        };
    }

    /** Payroll for every payable staff member for a month, merged with any saved/paid payslip status. */
    async listForMonth(tenantId: mongoose.Types.ObjectId | string, month: number, year: number) {
        const tz = await this.tenantTimezone(tenantId);
        const { start, end } = monthBoundsUTC(year, month, tz);
        const settings = await StaffDeductionSettings.findOne({ tenantId }).lean();
        const users = await User.find({ tenantId, role: { $in: PAYABLE_ROLES as any }, isActive: true })
            .select('firstName lastName role salary').lean();
        const saved = await StaffPayroll.find({ tenantId, month, year }).lean();
        const savedByStaff = new Map(saved.map(p => [String(p.staffId), p]));

        const rows = [];
        for (const user of users) {
            const b = await this.compute(tenantId, user._id, { start, end, month, year }, { user, settings });
            const s: any = savedByStaff.get(String(user._id));
            rows.push({
                ...b,
                payrollId: s ? String(s._id) : null,
                status: s?.status ?? 'draft',
                generatedAt: s?.generatedAt ?? null,
                paidAt: s?.paidAt ?? null,
                // A paid payslip is frozen: show what was actually paid, not a recalculation.
                ...(s?.status === 'paid' ? { netPay: s.netPay, deductions: s.deductions, basePay: s.basePay, overtimePay: s.overtimePay } : {}),
            });
        }
        return rows;
    }

    /** Generate (or refresh) payslips for the month. Payslips already marked paid are left untouched. */
    async run(tenantId: mongoose.Types.ObjectId | string, month: number, year: number, generatedBy?: string) {
        const rows = await this.listForMonth(tenantId, month, year);
        let generated = 0, skippedPaid = 0, skippedNoSalary = 0;
        for (const r of rows) {
            if (r.status === 'paid') { skippedPaid++; continue; }
            if (r.monthlySalary <= 0) { skippedNoSalary++; continue; }
            await StaffPayroll.findOneAndUpdate(
                { tenantId, staffId: r.staffId, month, year },
                {
                    $set: {
                        monthlySalary: r.monthlySalary, workingDays: r.workingDays, paidLeaveDays: r.paidLeaveDays, absentDays: r.absentDays,
                        lateCount: r.lateCount, earlyDepartures: r.earlyDepartures, shortfallHours: r.shortfallHours,
                        shortfallDeduction: r.shortfallDeduction, totalHours: r.totalHours,
                        overtimeHours: r.overtimeHours, basePay: r.basePay, overtimePay: r.overtimePay,
                        absentDayDeduction: r.absentDayDeduction, lateDeduction: r.lateDeduction,
                        earlyDepartureDeduction: r.earlyDepartureDeduction, deductions: r.deductions,
                        netPay: r.netPay, status: 'generated', generatedAt: new Date(),
                        ...(generatedBy && { generatedBy }),
                    },
                },
                { upsert: true, new: true }
            );
            generated++;
        }
        return { generated, skippedPaid, skippedNoSalary, total: rows.length };
    }

    async markPaid(tenantId: mongoose.Types.ObjectId | string, payrollId: string) {
        return StaffPayroll.findOneAndUpdate(
            { _id: payrollId, tenantId },
            { $set: { status: 'paid', paidAt: new Date() } },
            { new: true }
        );
    }
}

export default new StaffPayrollService();
