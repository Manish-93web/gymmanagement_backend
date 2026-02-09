import AuthService from '../../src/services/auth.service';
import User from '../../src/models/User.model';
import Tenant from '../../src/models/Tenant.model';
import Branch from '../../src/models/Branch.model';
import bcrypt from 'bcryptjs';

describe('AuthService', () => {
    let tenantId: string;
    let branchId: string;

    beforeEach(async () => {
        // Create test tenant and branch
        const tenant = await Tenant.create({
            name: 'Test Gym',
            email: 'test@gym.com',
            mobile: '1234567890',
            subscription: {
                tier: 'basic',
                startDate: new Date(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
        });
        tenantId = tenant._id.toString();

        const branch = await Branch.create({
            tenantId,
            name: 'Main Branch',
            address: {
                street: '123 Test St',
                city: 'Test City',
                state: 'Test State',
                country: 'Test Country',
                zipCode: '12345',
            },
        });
        branchId = branch._id.toString();
    });

    describe('register', () => {
        it('should register a new user successfully', async () => {
            const userData = {
                email: 'newuser@test.com',
                mobile: '9876543210',
                password: 'Test@123',
                firstName: 'Test',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            };

            const result = await AuthService.register(userData);

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user.email).toBe(userData.email);
            expect(result.user.role).toBe('member');
        });

        it('should throw error if email already exists', async () => {
            const userData = {
                email: 'duplicate@test.com',
                mobile: '9876543210',
                password: 'Test@123',
                firstName: 'Test',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            };

            await AuthService.register(userData);

            await expect(AuthService.register(userData)).rejects.toThrow('Email already registered');
        });

        it('should hash password before saving', async () => {
            const userData = {
                email: 'hashtest@test.com',
                mobile: '9876543211',
                password: 'Test@123',
                firstName: 'Test',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            };

            await AuthService.register(userData);

            const user = await User.findOne({ email: userData.email });
            expect(user?.password).not.toBe(userData.password);
            const isMatch = await bcrypt.compare(userData.password, user!.password);
            expect(isMatch).toBe(true);
        });
    });

    describe('login', () => {
        beforeEach(async () => {
            // Create a test user
            await AuthService.register({
                email: 'login@test.com',
                mobile: '9876543212',
                password: 'Test@123',
                firstName: 'Login',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            });
        });

        it('should login with correct credentials', async () => {
            const result = await AuthService.login({
                identifier: 'login@test.com',
                password: 'Test@123',
                deviceId: 'test-device-1',
                deviceName: 'Test Device',
                ipAddress: '127.0.0.1',
                userAgent: 'Jest Test',
            });

            expect(result).toHaveProperty('user');
            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.user.email).toBe('login@test.com');
        });

        it('should throw error with incorrect password', async () => {
            await expect(
                AuthService.login({
                    identifier: 'login@test.com',
                    password: 'WrongPassword',
                    deviceId: 'test-device-1',
                    deviceName: 'Test Device',
                    ipAddress: '127.0.0.1',
                    userAgent: 'Jest Test',
                })
            ).rejects.toThrow('Invalid credentials');
        });

        it('should throw error for non-existent user', async () => {
            await expect(
                AuthService.login({
                    identifier: 'nonexistent@test.com',
                    password: 'Test@123',
                    deviceId: 'test-device-1',
                    deviceName: 'Test Device',
                    ipAddress: '127.0.0.1',
                    userAgent: 'Jest Test',
                })
            ).rejects.toThrow('Invalid credentials');
        });

        it('should track device information', async () => {
            await AuthService.login({
                identifier: 'login@test.com',
                password: 'Test@123',
                deviceId: 'test-device-2',
                deviceName: 'Test Device 2',
                ipAddress: '192.168.1.1',
                userAgent: 'Jest Test Agent',
            });

            const user = await User.findOne({ email: 'login@test.com' });
            expect(user?.devices).toHaveLength(2); // One from registration, one from login
            const device = user?.devices.find((d) => d.deviceId === 'test-device-2');
            expect(device).toBeDefined();
            expect(device?.deviceName).toBe('Test Device 2');
            expect(device?.ipAddress).toBe('192.168.1.1');
        });
    });

    describe('refreshToken', () => {
        let refreshToken: string;
        let userId: string;

        beforeEach(async () => {
            const result = await AuthService.register({
                email: 'refresh@test.com',
                mobile: '9876543213',
                password: 'Test@123',
                firstName: 'Refresh',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            });
            refreshToken = result.refreshToken;
            userId = result.user._id;
        });

        it('should generate new tokens with valid refresh token', async () => {
            const result = await AuthService.refreshToken(refreshToken);

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.refreshToken).not.toBe(refreshToken); // Should be a new token
        });

        it('should throw error with invalid refresh token', async () => {
            await expect(AuthService.refreshToken('invalid-token')).rejects.toThrow();
        });
    });

    describe('logout', () => {
        let userId: string;
        let deviceId: string;

        beforeEach(async () => {
            const result = await AuthService.register({
                email: 'logout@test.com',
                mobile: '9876543214',
                password: 'Test@123',
                firstName: 'Logout',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            });
            userId = result.user._id;
            deviceId = 'test-device-logout';
        });

        it('should remove device and refresh token on logout', async () => {
            await AuthService.logout(userId, deviceId);

            const user = await User.findById(userId);
            const device = user?.devices.find((d) => d.deviceId === deviceId);
            expect(device).toBeUndefined();
            expect(user?.refreshToken).toBeUndefined();
        });
    });

    describe('logoutAll', () => {
        let userId: string;

        beforeEach(async () => {
            const result = await AuthService.register({
                email: 'logoutall@test.com',
                mobile: '9876543215',
                password: 'Test@123',
                firstName: 'LogoutAll',
                lastName: 'User',
                role: 'member' as const,
                tenantId,
                branchId,
            });
            userId = result.user._id;

            // Add multiple devices
            await AuthService.login({
                identifier: 'logoutall@test.com',
                password: 'Test@123',
                deviceId: 'device-1',
                deviceName: 'Device 1',
                ipAddress: '127.0.0.1',
                userAgent: 'Test',
            });

            await AuthService.login({
                identifier: 'logoutall@test.com',
                password: 'Test@123',
                deviceId: 'device-2',
                deviceName: 'Device 2',
                ipAddress: '127.0.0.1',
                userAgent: 'Test',
            });
        });

        it('should remove all devices and refresh tokens', async () => {
            await AuthService.logoutAll(userId);

            const user = await User.findById(userId);
            expect(user?.devices).toHaveLength(0);
            expect(user?.refreshToken).toBeUndefined();
        });
    });
});
