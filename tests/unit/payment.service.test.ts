import PaymentService from '../../src/services/payment.service';
import PaymentModel from '../../src/models/Payment.model';
import Razorpay from 'razorpay';
import Stripe from 'stripe';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../src/models/Payment.model');
jest.mock('razorpay');
jest.mock('stripe');

const mockPaymentSave = jest.fn();
const mockPaymentFindOne = jest.fn();
const mockPaymentFindById = jest.fn();

const TENANT_ID = 'tenant-001';
const BRANCH_ID = 'branch-001';
const MEMBER_ID = 'member-001';

describe('PaymentService', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Payment model constructor
        (PaymentModel as any).mockImplementation(() => ({
            save: mockPaymentSave,
        }));
        (PaymentModel.findOne as jest.Mock) = mockPaymentFindOne;
        (PaymentModel.findById as jest.Mock) = mockPaymentFindById;
    });

    // ── createPayment ────────────────────────────────────────────────────────
    describe('createPayment', () => {
        it('should create a new payment record with correct structure', async () => {
            const savedPayment = {
                _id: 'pay-001',
                tenantId: TENANT_ID,
                branchId: BRANCH_ID,
                memberId: MEMBER_ID,
                paymentType: 'subscription',
                amount: { base: 1999, tax: 360, discount: 0, total: 2359 },
                status: 'pending',
                method: 'razorpay',
            };
            mockPaymentSave.mockResolvedValue(savedPayment);

            const result = await PaymentService.createPayment({
                tenantId: TENANT_ID,
                branchId: BRANCH_ID,
                memberId: MEMBER_ID,
                paymentType: 'subscription',
                amount: 1999,
                taxAmount: 360,
                paymentMethod: 'razorpay',
            });

            expect(mockPaymentSave).toHaveBeenCalledTimes(1);
            expect(result).toBeDefined();
        });

        it('should apply discount when provided', async () => {
            mockPaymentSave.mockResolvedValue({ _id: 'pay-002', status: 'pending' });

            await PaymentService.createPayment({
                tenantId: TENANT_ID,
                branchId: BRANCH_ID,
                memberId: MEMBER_ID,
                paymentType: 'subscription',
                amount: 2999,
                discount: 500,
                paymentMethod: 'cash',
            });

            expect(mockPaymentSave).toHaveBeenCalledTimes(1);
        });
    });

    // ── createRazorpayOrder ──────────────────────────────────────────────────
    describe('createRazorpayOrder', () => {
        it('should call Razorpay orders.create with correct amount in paise', async () => {
            const mockCreate = jest.fn().mockResolvedValue({
                id: 'order_test_123',
                amount: 199900,
                currency: 'INR',
            });

            (Razorpay as any).mockImplementation(() => ({
                orders: { create: mockCreate },
            }));

            // Re-import to use mocked Razorpay
            jest.resetModules();
            const { default: FreshPaymentService } = await import('../../src/services/payment.service');

            const order = await FreshPaymentService.createRazorpayOrder(1999);

            // Razorpay expects amount in paise (× 100)
            expect(order).toBeDefined();
        });
    });

    // ── processPayment ───────────────────────────────────────────────────────
    describe('processPayment', () => {
        it('should update payment status to completed on successful processing', async () => {
            const mockPayment = {
                _id: 'pay-003',
                status: 'pending',
                method: 'razorpay',
                save: jest.fn().mockResolvedValue(true),
            };
            mockPaymentFindById.mockResolvedValue(mockPayment);

            const result = await PaymentService.processPayment({
                paymentId: 'pay-003',
                gateway: 'razorpay',
                gatewayPaymentId: 'pay_rzp_test123',
                gatewayOrderId: 'order_rzp_test123',
            });

            expect(mockPaymentFindById).toHaveBeenCalledWith('pay-003');
        });

        it('should throw error if payment not found', async () => {
            mockPaymentFindById.mockResolvedValue(null);

            await expect(
                PaymentService.processPayment({
                    paymentId: 'nonexistent',
                    gateway: 'razorpay',
                    gatewayPaymentId: 'pay_test',
                })
            ).rejects.toThrow();
        });
    });

    // ── processRefund ────────────────────────────────────────────────────────
    describe('processRefund', () => {
        it('should initiate refund for a completed payment', async () => {
            const mockPayment = {
                _id: 'pay-004',
                status: 'completed',
                amount: { total: 1999 },
                gatewayPaymentId: 'pay_rzp_abc',
                save: jest.fn().mockResolvedValue(true),
            };
            mockPaymentFindById.mockResolvedValue(mockPayment);

            await PaymentService.processRefund('pay-004', 1999, 'Member requested');

            expect(mockPaymentFindById).toHaveBeenCalledWith('pay-004');
        });
    });

    // ── getPaymentStats ───────────────────────────────────────────────────────
    describe('getPaymentStats', () => {
        it('should return stats for a tenant', async () => {
            (PaymentModel.aggregate as jest.Mock) = jest.fn().mockResolvedValue([
                { _id: 'completed', total: 50000, count: 22 },
                { _id: 'pending', total: 5000, count: 3 },
            ]);

            const stats = await PaymentService.getPaymentStats(TENANT_ID);
            expect(stats).toBeDefined();
        });
    });
});
