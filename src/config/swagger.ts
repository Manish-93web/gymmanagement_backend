import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Gym Management SaaS API',
            version: '1.0.0',
            description: 'Complete API documentation for Gym Management SaaS platform',
            contact: {
                name: 'API Support',
                email: 'support@yourgym.com',
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT',
            },
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Development server',
            },
            {
                url: 'https://api.yourgym.com',
                description: 'Production server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false,
                        },
                        message: {
                            type: 'string',
                            example: 'Error message',
                        },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string',
                        },
                        email: {
                            type: 'string',
                        },
                        mobile: {
                            type: 'string',
                        },
                        firstName: {
                            type: 'string',
                        },
                        lastName: {
                            type: 'string',
                        },
                        role: {
                            type: 'string',
                            enum: ['super_admin', 'gym_owner', 'branch_manager', 'trainer', 'staff', 'member', 'accountant', 'auditor'],
                        },
                        tenantId: {
                            type: 'string',
                        },
                        branchId: {
                            type: 'string',
                        },
                        isActive: {
                            type: 'boolean',
                        },
                    },
                },
                Member: {
                    type: 'object',
                    properties: {
                        _id: {
                            type: 'string',
                        },
                        membershipNumber: {
                            type: 'string',
                        },
                        firstName: {
                            type: 'string',
                        },
                        lastName: {
                            type: 'string',
                        },
                        email: {
                            type: 'string',
                        },
                        mobile: {
                            type: 'string',
                        },
                        status: {
                            type: 'string',
                            enum: ['lead', 'trial', 'active', 'paused', 'expired', 'cancelled', 'archived'],
                        },
                    },
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export const setupSwagger = (app: Application) => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
};

export default swaggerSpec;
