import User from '../models/User.model';
import Attendance from '../models/Attendance.model';
import Payment from '../models/Payment.model';
import RevenueSharingService from './revenue-sharing.service';
import { Parser } from 'json2csv';
import logger from '../config/logger';

interface PayrollData {
    userId: string;
    userName: string;
    role: string;
    baseSalary: number;
    revenueShare: number;
    bonus: number;
    deductions: number;
    netSalary: number;
    workingDays: number;
    totalDays: number;
    attendance: number;
}

class PayrollService {
    /**
     * Generate payroll report for a user
     */
    async generateUserPayroll(
        userId: string,
        month: number,
        year: number
    ): Promise<PayrollData> {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        // Get attendance
        const attendanceRecords = await Attendance.find({
            userId,
            checkInTime: { $gte: startDate, $lte: endDate },
        });

        const workingDays = attendanceRecords.length;
        const totalDays = new Date(year, month, 0).getDate();
        const attendancePercentage = (workingDays / totalDays) * 100;

        // Base salary (from user profile or default)
        const baseSalary = user.salary || this.getDefaultSalary(user.role);

        // Calculate revenue share
        const revenueShare = await RevenueSharingService.calculateRevenueShare(
            userId,
            startDate,
            endDate
        );

        // Calculate bonus (based on attendance)
        let bonus = 0;
        if (attendancePercentage >= 95) {
            bonus = baseSalary * 0.1; // 10% bonus for 95%+ attendance
        } else if (attendancePercentage >= 90) {
            bonus = baseSalary * 0.05; // 5% bonus for 90%+ attendance
        }

        // Calculate deductions
        const deductions = this.calculateDeductions(baseSalary, workingDays, totalDays);

        // Net salary
        const netSalary = baseSalary + revenueShare.amount + bonus - deductions;

        return {
            userId,
            userName: `${user.firstName} ${user.lastName}`,
            role: user.role,
            baseSalary,
            revenueShare: revenueShare.amount,
            bonus,
            deductions,
            netSalary,
            workingDays,
            totalDays,
            attendance: attendancePercentage,
        };
    }

    /**
     * Generate payroll report for all staff
     */
    async generateBulkPayroll(tenantId: string, month: number, year: number) {
        const staffRoles = ['trainer', 'branch_manager', 'staff', 'accountant'];

        const users = await (User as any).find({
            tenantId,
            role: { $in: staffRoles },
            isActive: true,
        });

        const payrollData: PayrollData[] = [];

        for (const user of users) {
            try {
                const data = await this.generateUserPayroll(user._id.toString(), month, year);
                payrollData.push(data);
            } catch (error: any) {
                logger.error('Payroll generation failed', { userId: user._id, error });
            }
        }

        const summary = {
            period: `${month}/${year}`,
            totalEmployees: payrollData.length,
            totalBaseSalary: payrollData.reduce((sum, p) => sum + p.baseSalary, 0),
            totalRevenueShare: payrollData.reduce((sum, p) => sum + p.revenueShare, 0),
            totalBonus: payrollData.reduce((sum, p) => sum + p.bonus, 0),
            totalDeductions: payrollData.reduce((sum, p) => sum + p.deductions, 0),
            totalNetSalary: payrollData.reduce((sum, p) => sum + p.netSalary, 0),
        };

        logger.info('Bulk payroll generated', { tenantId, employeeCount: payrollData.length });

        return {
            summary,
            payroll: payrollData,
        };
    }

    /**
     * Export payroll to CSV
     */
    async exportPayrollCSV(tenantId: string, month: number, year: number): Promise<string> {
        const { payroll } = await this.generateBulkPayroll(tenantId, month, year);

        const fields = [
            { label: 'Employee Name', value: 'userName' },
            { label: 'Role', value: 'role' },
            { label: 'Base Salary', value: 'baseSalary' },
            { label: 'Revenue Share', value: 'revenueShare' },
            { label: 'Bonus', value: 'bonus' },
            { label: 'Deductions', value: 'deductions' },
            { label: 'Net Salary', value: 'netSalary' },
            { label: 'Working Days', value: 'workingDays' },
            { label: 'Total Days', value: 'totalDays' },
            { label: 'Attendance %', value: 'attendance' },
        ];

        const parser = new Parser({ fields });
        const csv = parser.parse(payroll);

        return csv;
    }

    /**
     * Get payroll summary by role
     */
    async getPayrollSummaryByRole(tenantId: string, month: number, year: number) {
        const { payroll } = await this.generateBulkPayroll(tenantId, month, year);

        const summaryByRole: any = {};

        for (const data of payroll) {
            if (!summaryByRole[data.role]) {
                summaryByRole[data.role] = {
                    count: 0,
                    totalBaseSalary: 0,
                    totalRevenueShare: 0,
                    totalBonus: 0,
                    totalDeductions: 0,
                    totalNetSalary: 0,
                    avgAttendance: 0,
                };
            }

            summaryByRole[data.role].count += 1;
            summaryByRole[data.role].totalBaseSalary += data.baseSalary;
            summaryByRole[data.role].totalRevenueShare += data.revenueShare;
            summaryByRole[data.role].totalBonus += data.bonus;
            summaryByRole[data.role].totalDeductions += data.deductions;
            summaryByRole[data.role].totalNetSalary += data.netSalary;
            summaryByRole[data.role].avgAttendance += data.attendance;
        }

        // Calculate averages
        for (const role in summaryByRole) {
            summaryByRole[role].avgAttendance /= summaryByRole[role].count;
        }

        return summaryByRole;
    }

    /**
     * Get default salary by role
     */
    private getDefaultSalary(role: string): number {
        const salaryMap: any = {
            trainer: 25000,
            branch_manager: 40000,
            staff: 18000,
            accountant: 30000,
            gym_owner: 0, // Owners don't have salary
            super_admin: 0,
        };

        return salaryMap[role] || 20000;
    }

    /**
     * Calculate deductions (PF, Tax, etc.)
     */
    private calculateDeductions(baseSalary: number, workingDays: number, totalDays: number): number {
        // Provident Fund (12% of basic)
        const pf = baseSalary * 0.12;

        // Professional Tax (fixed)
        const professionalTax = 200;

        // Absent deduction
        const absentDays = totalDays - workingDays;
        const perDaySalary = baseSalary / totalDays;
        const absentDeduction = absentDays * perDaySalary;

        return pf + professionalTax + absentDeduction;
    }

    /**
     * Generate payslip for individual employee
     */
    async generatePayslip(userId: string, month: number, year: number) {
        const payrollData = await this.generateUserPayroll(userId, month, year);

        const payslip = {
            employeeName: payrollData.userName,
            role: payrollData.role,
            period: `${month}/${year}`,
            earnings: {
                baseSalary: payrollData.baseSalary,
                revenueShare: payrollData.revenueShare,
                bonus: payrollData.bonus,
                total: payrollData.baseSalary + payrollData.revenueShare + payrollData.bonus,
            },
            deductions: {
                pf: payrollData.baseSalary * 0.12,
                professionalTax: 200,
                other: payrollData.deductions - (payrollData.baseSalary * 0.12 + 200),
                total: payrollData.deductions,
            },
            netSalary: payrollData.netSalary,
            attendance: {
                workingDays: payrollData.workingDays,
                totalDays: payrollData.totalDays,
                percentage: payrollData.attendance,
            },
        };

        return payslip;
    }
}

export default new PayrollService();
