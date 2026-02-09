import request from 'supertest';
import express, { Application } from 'express';
import authRoutes from '../../src/routes/auth.routes';
import { connectDatabase } from '../../src/config/database';
import Tenant from '../../src/models/Tenant.model';
import Branch from '../../src/models/Branch.model';

describe('Auth API Integration Tests', () => {
    let app: Application;
    let tenantId: string;
    let branchId: string;

    beforeAll(async () => {
        app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);

        // Create test tenant and branch
        const tenant = await Tenant.create({
            name: 'Test Gym API',
            email: 'api@gym.com',
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

    describe('POST /api/auth/register', () => {
        it('should register a new user', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'apitest@test.com',
                    mobile: '9876543210',
                    password: 'Test@123',
                    firstName: 'API',
                    lastName: 'Test',
                    role: 'member',
                    tenantId,
                    branchId,
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
        });

        it('should return 400 for invalid email', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'invalid-email',
                    mobile: '9876543211',
                    password: 'Test@123',
                    firstName: 'API',
                    lastName: 'Test',
                    role: 'member',
                    tenantId,
                    branchId,
                });

            expect(response.status).toBe(400);
        });

        it('should return 400 for weak password', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'weakpass@test.com',
                    mobile: '9876543212',
                    password: '123',
                    firstName: 'API',
                    lastName: 'Test',
                    role: 'member',
                    tenantId,
                    branchId,
                });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/auth/login', () => {
        beforeAll(async () => {
            // Register a user for login tests
            await request(app).post('/api/auth/register').send({
                email: 'loginapi@test.com',
                mobile: '9876543220',
                password: 'Test@123',
                firstName: 'Login',
                lastName: 'API',
                role: 'member',
                tenantId,
                branchId,
            });
        });

        it('should login with correct credentials', async () => {
            const response = await request(app).post('/api/auth/login').send({
                identifier: 'loginapi@test.com',
                password: 'Test@123',
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
        });

        it('should return 401 for incorrect password', async () => {
            const response = await request(app).post('/api/auth/login').send({
                identifier: 'loginapi@test.com',
                password: 'WrongPassword',
            });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
        });

        it('should return 401 for non-existent user', async () => {
            const response = await request(app).post('/api/auth/login').send({
                identifier: 'nonexistent@test.com',
                password: 'Test@123',
            });

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/auth/refresh-token', () => {
        let refreshToken: string;

        beforeAll(async () => {
            const response = await request(app).post('/api/auth/register').send({
                email: 'refreshapi@test.com',
                mobile: '9876543230',
                password: 'Test@123',
                firstName: 'Refresh',
                lastName: 'API',
                role: 'member',
                tenantId,
                branchId,
            });
            refreshToken = response.body.data.refreshToken;
        });

        it('should refresh tokens with valid refresh token', async () => {
            const response = await request(app).post('/api/auth/refresh-token').send({
                refreshToken,
            });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
        });

        it('should return 401 for invalid refresh token', async () => {
            const response = await request(app).post('/api/auth/refresh-token').send({
                refreshToken: 'invalid-token',
            });

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/auth/me', () => {
        let accessToken: string;

        beforeAll(async () => {
            const response = await request(app).post('/api/auth/register').send({
                email: 'meapi@test.com',
                mobile: '9876543240',
                password: 'Test@123',
                firstName: 'Me',
                lastName: 'API',
                role: 'member',
                tenantId,
                branchId,
            });
            accessToken = response.body.data.accessToken;
        });

        it('should return user profile with valid token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.email).toBe('meapi@test.com');
        });

        it('should return 401 without token', async () => {
            const response = await request(app).get('/api/auth/me');

            expect(response.status).toBe(401);
        });

        it('should return 401 with invalid token', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid-token');

            expect(response.status).toBe(401);
        });
    });
});
