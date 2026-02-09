# Testing Guide

## Overview

This project uses **Jest** as the testing framework with **ts-jest** for TypeScript support and **Supertest** for API testing.

## Test Structure

```
tests/
├── setup.ts              # Global test setup
├── unit/                 # Unit tests for services
│   ├── auth.service.test.ts
│   ├── member.service.test.ts
│   └── payment.service.test.ts
├── integration/          # API integration tests
│   ├── auth.api.test.ts
│   ├── member.api.test.ts
│   └── payment.api.test.ts
└── e2e/                  # End-to-end tests
    └── user-flow.test.ts
```

## Running Tests

```bash
# Run all tests with coverage
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run only e2e tests
npm run test:e2e
```

## Test Coverage

Coverage reports are generated in the `coverage/` directory:
- `coverage/lcov-report/index.html` - HTML coverage report
- `coverage/lcov.info` - LCOV format for CI/CD

Target coverage: **80%+**

## Writing Tests

### Unit Tests

Unit tests focus on testing individual services in isolation:

```typescript
import AuthService from '../../src/services/auth.service';

describe('AuthService', () => {
  it('should register a new user', async () => {
    const result = await AuthService.register({...});
    expect(result).toHaveProperty('user');
  });
});
```

### Integration Tests

Integration tests test API endpoints end-to-end:

```typescript
import request from 'supertest';
import app from '../../src/server';

describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({...});
    
    expect(response.status).toBe(201);
  });
});
```

## Test Database

Tests use **MongoDB Memory Server** for isolated testing:
- Each test suite gets a fresh database
- Automatic cleanup after each test
- No need for external MongoDB instance

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `afterEach` to clean up test data
3. **Descriptive**: Use clear test descriptions
4. **Coverage**: Aim for high coverage on critical paths
5. **Fast**: Keep tests fast by mocking external services

## Mocking

Mock external services in tests:

```typescript
jest.mock('../../src/services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Commits to main branch
- Before deployment

Minimum coverage requirement: **80%**
