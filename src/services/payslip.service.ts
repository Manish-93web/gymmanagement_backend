import PDFDocument from 'pdfkit';
import jwt from 'jsonwebtoken';
import Tenant from '../models/Tenant.model';
import User from '../models/User.model';
import StaffPayrollService from './staff-payroll.service';
import StaffAttendanceService from './staff-attendance.service';
import { config } from '../config/config';
import { rupeesInWords } from '../utils/amount-words';
import { monthBoundsUTC, minutesToHHMM } from '../utils/tz.utils';
import { normalizeIndianMobile } from '../controllers/platform-lead.controller';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const C = { ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', soft: '#f8fafc', brand: '#f97316', green: '#15803d', greenSoft: '#dcfce7', red: '#b91c1c', amber: '#b45309', amberSoft: '#fef3c7' };

/** PDF fonts have no rupee sign, so amounts read "Rs. 12,500.00" as on most Indian payslips. */
const money = (n: number) => `Rs. ${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad = (n: number) => String(n).padStart(2, '0');
const dayLabel = (d: Date, tz: string) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz });
const roleLabel = (r: string) => ({ trainer: 'Trainer', staff: 'Staff', branch_manager: 'Branch Manager', accountant: 'Accountant' } as Record<string, string>)[r] ?? r.replace('_', ' ');

export class PayslipError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

interface ShareToken { k: 'payslip'; t: string; s: string; m: number; y: number }

class PayslipService {
    /** The 10-digit mobile of a person, or null when none (or only a stand-in) is saved. */
    phoneOf(user: any): string | null {
        return normalizeIndianMobile(user?.mobile);
    }

    /** A signed link that opens one person's slip for one month without logging in. Expires in 30 days. */
    shareToken(tenantId: string, staffId: string, month: number, year: number): string {
        const payload: ShareToken = { k: 'payslip', t: String(tenantId), s: String(staffId), m: month, y: year };
        return jwt.sign(payload, config.jwt.secret, { expiresIn: '30d' });
    }

    readShareToken(token: string): ShareToken | null {
        try {
            const p = jwt.verify(token, config.jwt.secret) as any;
            return p?.k === 'payslip' && p.t && p.s && p.m >= 1 && p.m <= 12 && p.y ? p as ShareToken : null;
        } catch {
            return null;
        }
    }

    /** The WhatsApp text that goes with the link. */
    async shareMessage(tenantId: string, staffId: string, month: number, year: number, url: string) {
        const user: any = await User.findOne({ _id: staffId, tenantId }).select('firstName mobile').lean();
        if (!user) throw new PayslipError(404, 'Staff member not found');
        const [tenant, pay]: any[] = await Promise.all([
            Tenant.findById(tenantId).select('name').lean(),
            StaffPayrollService.getForStaff(tenantId, staffId, month, year),
        ]);
        const gym = tenant?.name || 'your gym';
        return {
            phone: this.phoneOf(user),
            message: `Hi ${user.firstName || ''}, your salary slip for ${MONTHS[month - 1]} ${year} from ${gym} is ready.\n`
                + `Net pay: ${money(pay.netPay)}\n\nDownload your slip (PDF): ${url}\n\nThis link works for 30 days.`,
        };
    }

    /** The salary slip as a PDF. */
    async build(tenantId: string, staffId: string, month: number, year: number): Promise<{ buffer: Buffer; filename: string }> {
        if (!(month >= 1 && month <= 12) || !(year >= 2000 && year <= 2100)) throw new PayslipError(400, 'Choose a valid month and year');

        const user: any = await User.findOne({ _id: staffId, tenantId }).select('firstName lastName role email mobile').lean();
        if (!user) throw new PayslipError(404, 'Staff member not found');
        const [tenant, pay]: any[] = await Promise.all([
            Tenant.findById(tenantId).select('name contactInfo').lean(),
            StaffPayrollService.getForStaff(tenantId, staffId, month, year),
        ]);

        const schedule = await StaffAttendanceService.schedule(tenantId, staffId);
        const tz = schedule.timezone;
        const { start, end } = monthBoundsUTC(year, month, tz);
        const rules = schedule.at(end);
        const shiftText = rules.segments.length
            ? `${rules.shiftName ? rules.shiftName + ' · ' : ''}${rules.segments.map(g => `${minutesToHHMM(g.start)}-${minutesToHHMM(g.end)}`).join(', ')}`
            : `Gym default hours (${pay.shiftHours} h)`;

        const gymName: string = tenant?.name || 'Gym';
        const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Staff';
        const phone = this.phoneOf(user);
        const email = user.email && !user.email.endsWith('@no-email.invalid') ? user.email : '';
        const empId = `EMP-${String(user._id).slice(-6).toUpperCase()}`;
        const slipNo = `SS-${year}${pad(month)}-${String(user._id).slice(-6).toUpperCase()}`;
        const paid = pay.status === 'paid';
        const contactLine = [tenant?.contactInfo?.address, tenant?.contactInfo?.city].filter(Boolean).join(', ');
        const reachLine = [tenant?.contactInfo?.phone, tenant?.contactInfo?.email].filter(Boolean).join('  |  ');

        const doc = new PDFDocument({ size: 'A4', margin: 36, info: { Title: `Salary Slip - ${name} - ${MONTHS[month - 1]} ${year}`, Author: gymName } });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        const finished = new Promise<Buffer>(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

        const W = doc.page.width;
        const L = 36;
        const R = W - 36;
        const CW = R - L;
        const text = (s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: string; width?: number; align?: 'left' | 'right' | 'center' } = {}) => {
            doc.font(o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.size ?? 10).fillColor(o.color ?? C.ink)
                .text(s, x, y, { width: o.width, align: o.align ?? 'left', lineBreak: false });
        };

        // ── Header band: gym name, contact, slip title
        doc.rect(0, 0, W, 104).fill(C.ink);
        doc.circle(L + 22, 52, 22).fill(C.brand);
        text(gymName.trim().charAt(0).toUpperCase() || 'G', L, 40, { size: 24, bold: true, color: '#ffffff', width: 44, align: 'center' });
        text(gymName, L + 58, 30, { size: 19, bold: true, color: '#ffffff', width: 330 });
        if (contactLine) text(contactLine, L + 58, 55, { size: 8.5, color: '#cbd5e1', width: 330 });
        if (reachLine) text(reachLine, L + 58, 68, { size: 8.5, color: '#cbd5e1', width: 330 });
        text('SALARY SLIP', R - 200, 30, { size: 19, bold: true, color: C.brand, width: 200, align: 'right' });
        text(`${MONTHS[month - 1]} ${year}`, R - 200, 54, { size: 12, bold: true, color: '#ffffff', width: 200, align: 'right' });
        text(`Slip no. ${slipNo}`, R - 200, 72, { size: 8.5, color: '#94a3b8', width: 200, align: 'right' });

        // ── Pay period and status
        let y = 122;
        // the month boundary is a hair past midnight, so step back a minute to land on the last day
        text(`Pay period: ${dayLabel(start, tz)} to ${dayLabel(new Date(end.getTime() - 60_000), tz)}`, L, y + 4, { size: 9.5, color: C.muted });
        const statusText = paid ? `PAID${pay.paidAt ? ' on ' + dayLabel(new Date(pay.paidAt), tz) : ''}` : 'NOT YET PAID';
        const pillW = 150;
        doc.roundedRect(R - pillW, y, pillW, 20, 10).fill(paid ? C.greenSoft : C.amberSoft);
        text(statusText, R - pillW, y + 6, { size: 8.5, bold: true, color: paid ? C.green : C.amber, width: pillW, align: 'center' });

        // ── Employee details
        y = 156;
        const boxH = 124;
        doc.roundedRect(L, y, CW, boxH, 8).lineWidth(0.8).strokeColor(C.line).stroke();
        text('EMPLOYEE DETAILS', L + 14, y + 10, { size: 8, bold: true, color: C.brand });
        const half = CW / 2;
        const field = (label: string, value: string, col: number, row: number) => {
            const fx = L + 14 + col * half;
            const fy = y + 28 + row * 24;
            text(label.toUpperCase(), fx, fy, { size: 7, bold: true, color: C.muted });
            text(value || '-', fx, fy + 9, { size: 10, bold: true, width: half - 24 });
        };
        field('Employee name', name, 0, 0);          field('Employee ID', empId, 1, 0);
        field('Designation', roleLabel(user.role), 0, 1); field('Phone', phone ? `+91 ${phone}` : '-', 1, 1);
        field('Shift', shiftText, 0, 2);             field('Monthly salary', money(pay.monthlySalary), 1, 2);
        field('Days paid', `${pay.workingDays + (pay.paidLeaveDays || 0)}${pay.paidLeaveDays ? ` (worked ${pay.workingDays}, paid leave ${pay.paidLeaveDays})` : ''}`, 0, 3);
        field('Email', email, 1, 3);

        // ── Attendance summary tiles
        y += boxH + 16;
        text('ATTENDANCE SUMMARY', L, y, { size: 8, bold: true, color: C.brand });
        y += 14;
        const tiles = [
            ['Days worked', String(pay.workingDays)],
            ['Hours worked', `${pay.totalHours} h`],
            ['Overtime', `${pay.overtimeHours} h`],
            ['Short hours', `${pay.shortfallHours} h`],
            ['Late marks', String(pay.lateCount)],
        ];
        const gap = 8;
        const tw = (CW - gap * (tiles.length - 1)) / tiles.length;
        tiles.forEach(([label, value], i) => {
            const tx = L + i * (tw + gap);
            doc.roundedRect(tx, y, tw, 46, 6).fill(C.soft);
            text(value, tx, y + 9, { size: 15, bold: true, width: tw, align: 'center' });
            text(label.toUpperCase(), tx, y + 31, { size: 6.8, bold: true, color: C.muted, width: tw, align: 'center' });
        });
        y += 46 + 18;

        // ── Earnings | Deductions
        const colW = (CW - 14) / 2;
        const gross = (pay.basePay || 0) + (pay.overtimePay || 0);
        const earnings: [string, number][] = [
            [`Pay for days attended (${pay.workingDays + (pay.paidLeaveDays || 0)} d)`, pay.basePay || 0],
            [`Overtime (${pay.overtimeHours} h)`, pay.overtimePay || 0],
        ];
        const deductionRows: [string, number][] = [];
        if (pay.shortfallDeduction > 0) deductionRows.push([`Shift not completed (${pay.shortfallHours} h short)`, pay.shortfallDeduction]);
        if (pay.lateDeduction > 0) deductionRows.push([`Late arrivals (${pay.lateCount})`, pay.lateDeduction]);
        if (pay.absentDayDeduction > 0) deductionRows.push([`Absent penalty (${pay.absentDays} d)`, pay.absentDayDeduction]);
        if (pay.earlyDepartureDeduction > 0) deductionRows.push([`Early departures (${pay.earlyDepartures})`, pay.earlyDepartureDeduction]);
        if (!deductionRows.length) deductionRows.push(['No deductions', 0]);

        const rowH = 22;
        const rows = Math.max(earnings.length, deductionRows.length);
        const tableH = 24 + rows * rowH + 26;
        const drawTable = (x: number, title: string, color: string, items: [string, number][], totalLabel: string, total: number) => {
            doc.roundedRect(x, y, colW, tableH, 8).lineWidth(0.8).strokeColor(C.line).stroke();
            doc.save().roundedRect(x, y, colW, 24, 8).clip().rect(x, y, colW, 24).fill(C.soft).restore();
            text(title, x + 12, y + 8, { size: 8.5, bold: true, color });
            items.forEach(([label, amount], i) => {
                const ry = y + 24 + i * rowH;
                doc.moveTo(x, ry).lineTo(x + colW, ry).lineWidth(0.5).strokeColor(C.line).stroke();
                text(label, x + 12, ry + 7, { size: 9, width: colW - 110 });
                text(money(amount), x + colW - 100, ry + 7, { size: 9, bold: true, width: 88, align: 'right' });
            });
            const ty = y + tableH - 26;
            doc.moveTo(x, ty).lineTo(x + colW, ty).lineWidth(0.8).strokeColor(C.line).stroke();
            text(totalLabel, x + 12, ty + 8, { size: 9, bold: true });
            text(money(total), x + colW - 100, ty + 8, { size: 9.5, bold: true, color, width: 88, align: 'right' });
        };
        drawTable(L, 'EARNINGS', C.green, earnings, 'Total earnings', gross);
        drawTable(L + colW + 14, 'DEDUCTIONS', C.red, deductionRows, 'Total deductions', pay.deductions || 0);
        y += tableH + 18;

        // ── Net pay
        doc.roundedRect(L, y, CW, 58, 10).fill(C.ink);
        text('NET PAY', L + 20, y + 14, { size: 9, bold: true, color: '#94a3b8' });
        text(`${MONTHS[month - 1]} ${year}`, L + 20, y + 30, { size: 10, color: '#cbd5e1' });
        text(money(pay.netPay), R - 300, y + 16, { size: 24, bold: true, color: '#ffffff', width: 280, align: 'right' });
        y += 58 + 10;
        text(rupeesInWords(pay.netPay), L, y, { size: 9, bold: true, color: C.muted, width: CW });
        y += 24;

        // ── Notes
        if (pay.incompleteDays > 0) {
            doc.roundedRect(L, y, CW, 30, 6).fill(C.amberSoft);
            text(`${pay.incompleteDays} day(s) have a check-in but no check-out. They are not paid until corrected by the gym.`, L + 12, y + 11, { size: 8.5, color: C.amber, width: CW - 24 });
            y += 40;
        }
        text('How this is calculated', L, y, { size: 8, bold: true, color: C.muted });
        doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(
            'Each day attended earns a day of the monthly salary. Time short of the shift is deducted at the hourly rate, and time beyond the shift is paid as overtime. '
            + 'Attendance comes from the gym\'s biometric punches and owner corrections.', L, y + 12, { width: CW });

        // ── Footer
        doc.page.margins.bottom = 0;
        const fy = doc.page.height - 44;
        doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.6).strokeColor(C.line).stroke();
        text('This is a computer-generated salary slip and does not require a signature.', L, fy + 9, { size: 8, color: C.muted, width: CW, align: 'center' });
        text(`${gymName}  |  Generated on ${dayLabel(new Date(), tz)}  |  Powered by GymBodyFlow`, L, fy + 21, { size: 7.5, color: '#94a3b8', width: CW, align: 'center' });

        doc.end();
        const buffer = await finished;
        const safe = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Staff';
        return { buffer, filename: `Salary_Slip_${safe}_${MONTHS[month - 1]}_${year}.pdf` };
    }
}

export default new PayslipService();
