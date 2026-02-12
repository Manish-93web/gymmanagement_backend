import Payment from '../models/Payment.model';
import Member from '../models/Member.model';
import Plan from '../models/Plan.model';
import { Parser } from 'json2csv';
import logger from '../config/logger';

interface ExportFilters {
    tenantId: string;
    startDate?: Date;
    endDate?: Date;
    branchId?: string;
    paymentStatus?: string;
}

class AccountingExportService {
    /**
     * Export to CSV format
     */
    async exportToCSV(filters: ExportFilters): Promise<string> {
        const payments = await this.getPayments(filters);

        const fields = [
            { label: 'Date', value: 'date' },
            { label: 'Invoice Number', value: 'invoiceNumber' },
            { label: 'Member Name', value: 'memberName' },
            { label: 'Member ID', value: 'memberId' },
            { label: 'Plan', value: 'planName' },
            { label: 'Amount', value: 'amount' },
            { label: 'Discount', value: 'discount' },
            { label: 'Tax', value: 'tax' },
            { label: 'Total', value: 'total' },
            { label: 'Payment Method', value: 'paymentMethod' },
            { label: 'Transaction ID', value: 'transactionId' },
            { label: 'Status', value: 'status' },
        ];

        const data = payments.map((payment: any) => ({
            date: new Date(payment.createdAt).toLocaleDateString(),
            invoiceNumber: `INV-${payment._id.toString().slice(-8).toUpperCase()}`,
            memberName: `${payment.userId.firstName} ${payment.userId.lastName}`,
            memberId: payment.userId.membershipNumber || payment.userId._id,
            planName: payment.planId?.name || 'N/A',
            amount: payment.amount.subtotal,
            discount: payment.amount.discountAmount || 0,
            tax: payment.amount.taxAmount || 0,
            total: payment.amount.total,
            paymentMethod: payment.gateway,
            transactionId: payment.transactionId || '',
            status: payment.status,
        }));

        const parser = new Parser({ fields });
        const csv = parser.parse(data);

        logger.info('CSV export generated', { recordCount: data.length });

        return csv;
    }

    /**
     * Export to Tally XML format
     */
    async exportToTally(filters: ExportFilters): Promise<string> {
        const payments = await this.getPayments(filters);

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<ENVELOPE>\n';
        xml += '  <HEADER>\n';
        xml += '    <TALLYREQUEST>Import Data</TALLYREQUEST>\n';
        xml += '  </HEADER>\n';
        xml += '  <BODY>\n';
        xml += '    <IMPORTDATA>\n';
        xml += '      <REQUESTDESC>\n';
        xml += '        <REPORTNAME>Vouchers</REPORTNAME>\n';
        xml += '      </REQUESTDESC>\n';
        xml += '      <REQUESTDATA>\n';

        for (const payment of payments) {
            const member = payment.userId as any;
            const plan = payment.planId as any;
            const date = new Date(payment.createdAt).toISOString().split('T')[0].replace(/-/g, '');

            xml += '        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n';
            xml += '          <VOUCHER REMOTEID="" VCHKEY="" VCHTYPE="Sales" ACTION="Create">\n';
            xml += `            <DATE>${date}</DATE>\n`;
            xml += `            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n`;
            xml += `            <VOUCHERNUMBER>INV-${payment._id.toString().slice(-8).toUpperCase()}</VOUCHERNUMBER>\n`;
            xml += `            <PARTYLEDGERNAME>${member.firstName} ${member.lastName}</PARTYLEDGERNAME>\n`;
            xml += '            <ALLLEDGERENTRIES.LIST>\n';
            xml += `              <LEDGERNAME>${member.firstName} ${member.lastName}</LEDGERNAME>\n`;
            xml += '              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n';
            xml += `              <AMOUNT>-${payment.amount}</AMOUNT>\n`;
            xml += '            </ALLLEDGERENTRIES.LIST>\n';
            xml += '            <ALLLEDGERENTRIES.LIST>\n';
            xml += `              <LEDGERNAME>${plan?.name || 'Membership'}</LEDGERNAME>\n`;
            xml += '              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n';
            xml += `              <AMOUNT>${payment.amount}</AMOUNT>\n`;
            xml += '            </ALLLEDGERENTRIES.LIST>\n';
            xml += '          </VOUCHER>\n';
            xml += '        </TALLYMESSAGE>\n';
        }

        xml += '      </REQUESTDATA>\n';
        xml += '    </IMPORTDATA>\n';
        xml += '  </BODY>\n';
        xml += '</ENVELOPE>';

        logger.info('Tally XML export generated', { recordCount: payments.length });

        return xml;
    }

    /**
     * Export revenue summary
     */
    async exportRevenueSummary(filters: ExportFilters) {
        const payments = await this.getPayments(filters);

        const summary = {
            totalRevenue: 0,
            totalDiscount: 0,
            totalTax: 0,
            netRevenue: 0,
            paymentsByMethod: {} as any,
            paymentsByStatus: {} as any,
            dailyRevenue: {} as any,
        };

        for (const payment of payments) {
            const amount = payment.amount;
            const discount = payment.discount || 0;
            const tax = amount * 0.18;

            summary.totalRevenue += amount;
            summary.totalDiscount += discount;
            summary.totalTax += tax;

            // By payment method
            const method = payment.gateway;
            summary.paymentsByMethod[method] = (summary.paymentsByMethod[method] || 0) + amount;

            // By status
            const status = payment.status;
            summary.paymentsByStatus[status] = (summary.paymentsByStatus[status] || 0) + amount;

            // Daily revenue
            const date = new Date(payment.createdAt).toISOString().split('T')[0];
            summary.dailyRevenue[date] = (summary.dailyRevenue[date] || 0) + amount;
        }

        summary.netRevenue = summary.totalRevenue - summary.totalDiscount;

        return summary;
    }

    /**
     * Get payments with filters
     */
    private async getPayments(filters: ExportFilters) {
        const query: any = { tenantId: filters.tenantId };

        if (filters.startDate || filters.endDate) {
            query.createdAt = {};
            if (filters.startDate) query.createdAt.$gte = filters.startDate;
            if (filters.endDate) query.createdAt.$lte = filters.endDate;
        }

        if (filters.branchId) {
            query.branchId = filters.branchId;
        }

        if (filters.paymentStatus) {
            query.status = filters.paymentStatus;
        }

        const payments = await Payment.find(query)
            .populate('userId', 'firstName lastName email membershipNumber')
            .populate('planId', 'name price')
            .sort({ createdAt: -1 });

        return payments;
    }

    /**
     * Export tax report (GST)
     */
    async exportTaxReport(filters: ExportFilters) {
        const payments = await this.getPayments(filters);

        const taxReport = payments.map((payment: any) => {
            const baseAmount = payment.amount;
            const cgst = (baseAmount * 0.09).toFixed(2); // 9% CGST
            const sgst = (baseAmount * 0.09).toFixed(2); // 9% SGST
            const totalTax = (baseAmount * 0.18).toFixed(2); // 18% GST

            return {
                date: new Date(payment.createdAt).toLocaleDateString(),
                invoiceNumber: `INV-${payment._id.toString().slice(-8).toUpperCase()}`,
                customerName: `${payment.userId.firstName} ${payment.userId.lastName}`,
                gstin: payment.userId.gstin || 'N/A',
                baseAmount: baseAmount.toFixed(2),
                cgst,
                sgst,
                totalTax,
                totalAmount: baseAmount.toFixed(2),
            };
        });

        return taxReport;
    }
}

export default new AccountingExportService();
