import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import Payment from '../models/Payment.model';
import Member from '../models/Member.model';
import Tenant from '../models/Tenant.model';
import { sendEmail } from '../utils/email.util';
import logger from '../config/logger';

class InvoiceService {
    /**
     * Generate PDF invoice
     */
    async generateInvoice(paymentId: string): Promise<string> {
        const payment = await Payment.findById(paymentId)
            .populate('userId', 'firstName lastName email mobile address')
            .populate('planId', 'name price')
            .populate('tenantId', 'name address gst logo');

        if (!payment) {
            throw new Error('Payment not found');
        }

        const member = payment.userId as any;
        const plan = payment.planId as any;
        const tenant = payment.tenantId as any;

        // Create invoices directory if it doesn't exist
        const invoicesDir = path.join(process.cwd(), 'invoices');
        if (!fs.existsSync(invoicesDir)) {
            fs.mkdirSync(invoicesDir, { recursive: true });
        }

        const invoiceNumber = `INV-${payment._id.toString().slice(-8).toUpperCase()}`;
        const fileName = `${invoiceNumber}.pdf`;
        const filePath = path.join(invoicesDir, fileName);

        // Create PDF
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).text(tenant.name || 'Gym Management', { align: 'center' });
        doc.fontSize(10).text(tenant.address || '', { align: 'center' });
        if (tenant.gst) {
            doc.text(`GSTIN: ${tenant.gst}`, { align: 'center' });
        }
        doc.moveDown();

        // Invoice details
        doc.fontSize(16).text('INVOICE', { align: 'center', underline: true });
        doc.moveDown();

        doc.fontSize(10);
        doc.text(`Invoice Number: ${invoiceNumber}`);
        doc.text(`Date: ${new Date(payment.createdAt).toLocaleDateString()}`);
        doc.text(`Payment ID: ${payment.gateway?.transactionId || payment.gateway?.paymentId || payment._id}`);
        doc.moveDown();

        // Bill to
        doc.fontSize(12).text('Bill To:', { underline: true });
        doc.fontSize(10);
        doc.text(`${member.firstName} ${member.lastName}`);
        doc.text(`Email: ${member.email}`);
        doc.text(`Phone: ${member.mobile}`);
        if (member.address) {
            doc.text(`Address: ${member.address}`);
        }
        doc.moveDown();

        // Table header
        const tableTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Description', 50, tableTop);
        doc.text('Amount', 400, tableTop, { width: 90, align: 'right' });
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        // Table content
        doc.font('Helvetica');
        let yPosition = tableTop + 25;

        // Plan
        doc.text(plan.name || 'Membership Plan', 50, yPosition);
        doc.text(`₹${payment.amount.total.toFixed(2)}`, 400, yPosition, { width: 90, align: 'right' });
        yPosition += 20;

        // Discount
        if (payment.discount && payment.discount > 0) {
            doc.text('Discount', 50, yPosition);
            doc.text(`-₹${payment.discount.toFixed(2)}`, 400, yPosition, { width: 90, align: 'right' });
            yPosition += 20;
        }

        // Tax
        const taxRate = payment.taxDetails?.taxRate || 0;
        const taxAmount = payment.amount.taxAmount || 0;
        const taxType = payment.taxDetails?.taxType || 'GST';

        doc.text(`${taxType} (${taxRate}%)`, 50, yPosition);
        doc.text(`₹${taxAmount.toFixed(2)}`, 400, yPosition, { width: 90, align: 'right' });
        yPosition += 20;

        // CGST / SGST / IGST Breakdown
        if (payment.taxDetails?.cgst) {
            doc.fontSize(8).text(`CGST: ₹${payment.taxDetails.cgst.toFixed(2)}`, 60, yPosition);
            yPosition += 15;
        }
        if (payment.taxDetails?.sgst) {
            doc.fontSize(8).text(`SGST: ₹${payment.taxDetails.sgst.toFixed(2)}`, 60, yPosition);
            yPosition += 15;
        }
        if (payment.taxDetails?.igst) {
            doc.fontSize(8).text(`IGST: ₹${payment.taxDetails.igst.toFixed(2)}`, 60, yPosition);
            yPosition += 15;
        }
        doc.fontSize(10);

        // Total
        doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
        yPosition += 10;
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text('Total Amount', 50, yPosition);
        doc.text(`₹${payment.amount.total.toFixed(2)}`, 400, yPosition, { width: 90, align: 'right' });

        // Payment status
        doc.moveDown(2);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Payment Status: ${payment.status.toUpperCase()}`, { align: 'center' });
        doc.text(`Payment Method: ${(payment.gateway?.provider || payment.method).toUpperCase()}`, { align: 'center' });

        // Footer
        doc.moveDown(3);
        doc.fontSize(8).text('Thank you for your business!', { align: 'center' });
        doc.text('This is a computer-generated invoice and does not require a signature.', {
            align: 'center',
        });

        doc.end();

        await new Promise<void>((resolve, reject) => {
            stream.on('finish', () => {
                resolve();
            });
            stream.on('error', reject);
        });

        logger.info('Invoice generated', { paymentId, invoiceNumber });

        return filePath;
    }

    /**
     * Email invoice to member
     */
    async emailInvoice(paymentId: string) {
        const payment = await Payment.findById(paymentId).populate('userId', 'email firstName lastName');

        if (!payment) {
            throw new Error('Payment not found');
        }

        const member = payment.userId as any;

        // Generate invoice
        const invoicePath = await this.generateInvoice(paymentId);

        // Send email with attachment
        await sendEmail({
            to: member.email,
            subject: 'Your Invoice',
            template: 'invoice',
            data: {
                name: `${member.firstName} ${member.lastName}`,
                amount: payment.amount,
                date: new Date(payment.createdAt).toLocaleDateString(),
            },
            attachments: [
                {
                    filename: path.basename(invoicePath),
                    path: invoicePath,
                },
            ],
        });

        logger.info('Invoice emailed', { paymentId, email: member.email });

        return {
            success: true,
            message: 'Invoice sent successfully',
        };
    }

    /**
     * Bulk generate invoices
     */
    async bulkGenerateInvoices(paymentIds: string[]) {
        const results = [];

        for (const paymentId of paymentIds) {
            try {
                const invoicePath = await this.generateInvoice(paymentId);
                results.push({ paymentId, success: true, path: invoicePath });
            } catch (error: any) {
                results.push({ paymentId, success: false, error: error.message });
            }
        }

        logger.info('Bulk invoice generation completed', { total: paymentIds.length });

        return {
            success: true,
            results,
        };
    }

    /**
     * Get invoice URL
     */
    async getInvoiceUrl(paymentId: string): Promise<string> {
        const invoiceNumber = `INV-${paymentId.slice(-8).toUpperCase()}`;
        const fileName = `${invoiceNumber}.pdf`;
        const filePath = path.join(process.cwd(), 'invoices', fileName);

        // Check if invoice exists
        if (!fs.existsSync(filePath)) {
            // Generate if not exists
            await this.generateInvoice(paymentId);
        }

        // Return URL (in production, this would be a cloud storage URL)
        return `/invoices/${fileName}`;
    }
}

export default new InvoiceService();
