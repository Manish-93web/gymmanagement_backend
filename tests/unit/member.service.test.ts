import MemberService from '../../src/services/member.service';
import Member from '../../src/models/Member.model';
import Subscription from '../../src/models/Subscription.model';

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../../src/models/Member.model');
jest.mock('../../src/models/Subscription.model');

const TENANT_ID = 'tenant-001';
const BRANCH_ID = 'branch-001';

describe('MemberService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── createMember ─────────────────────────────────────────────────────────
    describe('createMember', () => {
        it('should create a member with initial lifecycle stage "lead"', async () => {
            const mockMember = {
                _id: 'mem-001',
                tenantId: TENANT_ID,
                branchId: BRANCH_ID,
                name: 'Test User',
                email: 'test@gym.com',
                lifecycleStage: 'lead',
                status: 'active',
                save: jest.fn().mockResolvedValue(true),
            };

            (Member as any).mockImplementation(() => mockMember);

            const result = await MemberService.createMember({
                tenantId: TENANT_ID,
                branchId: BRANCH_ID,
                name: 'Test User',
                email: 'test@gym.com',
                mobile: '9876543210',
                role: 'member',
                password: 'test@123',
            });

            expect(mockMember.save).toHaveBeenCalledTimes(1);
        });

        it('should reject duplicate email within the same tenant', async () => {
            (Member.findOne as jest.Mock) = jest.fn().mockResolvedValue({ _id: 'existing' });

            await expect(
                MemberService.createMember({
                    tenantId: TENANT_ID,
                    branchId: BRANCH_ID,
                    name: 'Duplicate User',
                    email: 'existing@gym.com',
                    mobile: '9876543211',
                    role: 'member',
                    password: 'test@123',
                })
            ).rejects.toThrow();
        });
    });

    // ── getMembersByBranch ────────────────────────────────────────────────────
    describe('getMembersByBranch', () => {
        it('should return members filtered by branch', async () => {
            const mockMembers = [
                { _id: 'mem-001', name: 'Alice', branchId: BRANCH_ID },
                { _id: 'mem-002', name: 'Bob', branchId: BRANCH_ID },
            ];

            (Member.find as jest.Mock) = jest.fn().mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue(mockMembers),
            });

            const result = await MemberService.getMembersByBranch(TENANT_ID, BRANCH_ID);

            expect(Member.find).toHaveBeenCalledWith(
                expect.objectContaining({ tenantId: TENANT_ID, branchId: BRANCH_ID })
            );
        });
    });

    // ── Lifecycle Transitions ─────────────────────────────────────────────────
    describe('lifecycle transitions', () => {
        it('should freeze an active member', async () => {
            const mockMember = {
                _id: 'mem-002',
                status: 'active',
                lifecycleStage: 'active',
                freezeHistory: [],
                save: jest.fn().mockResolvedValue(true),
            };

            (Member.findOne as jest.Mock) = jest.fn().mockResolvedValue(mockMember);

            await MemberService.freezeMembership(
                'mem-002',
                TENANT_ID,
                { reason: 'Vacation', startDate: new Date(), endDate: new Date(Date.now() + 7 * 86400000) }
            );

            expect(mockMember.save).toHaveBeenCalled();
        });

        it('should reactivate a frozen member', async () => {
            const mockMember = {
                _id: 'mem-003',
                status: 'frozen',
                lifecycleStage: 'frozen',
                freezeHistory: [{ reason: 'Vacation', endDate: new Date(Date.now() - 86400000) }],
                save: jest.fn().mockResolvedValue(true),
            };

            (Member.findOne as jest.Mock) = jest.fn().mockResolvedValue(mockMember);

            await MemberService.reactivateMembership('mem-003', TENANT_ID);

            expect(mockMember.save).toHaveBeenCalled();
            expect(mockMember.status).toBe('active');
        });

        it('should transfer member to a different branch', async () => {
            const NEW_BRANCH = 'branch-002';
            const mockMember = {
                _id: 'mem-004',
                branchId: BRANCH_ID,
                transferHistory: [],
                save: jest.fn().mockResolvedValue(true),
            };

            (Member.findOne as jest.Mock) = jest.fn().mockResolvedValue(mockMember);
            (Member.countDocuments as jest.Mock) = jest.fn().mockResolvedValue(100);

            await MemberService.transferMember('mem-004', TENANT_ID, NEW_BRANCH, 'Closer to home');

            expect(mockMember.branchId).toBe(NEW_BRANCH);
            expect(mockMember.save).toHaveBeenCalled();
        });
    });

    // ── getLifecycleStats ─────────────────────────────────────────────────────
    describe('getLifecycleStats', () => {
        it('should return member counts by lifecycle stage', async () => {
            (Member.aggregate as jest.Mock) = jest.fn().mockResolvedValue([
                { _id: 'lead', count: 18 },
                { _id: 'active', count: 245 },
                { _id: 'frozen', count: 12 },
                { _id: 'churned', count: 34 },
            ]);

            const stats = await MemberService.getLifecycleStats(TENANT_ID);

            expect(Member.aggregate).toHaveBeenCalledTimes(1);
            expect(stats).toBeDefined();
        });
    });
});
