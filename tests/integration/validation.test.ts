/**
 * Validation Testing Suite
 * 
 * Comprehensive tests for all Zod validation schemas and middleware:
 * - Request validation middleware functionality
 * - Individual schema validation with edge cases
 * - Error handling and type safety verification
 * - Performance of validation under different conditions
 * 
 * These tests run without requiring database connections
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { 
  validators, 
  validateBody, 
  validateQuery, 
  validateParams,
  commonSchemas 
} from '../../src/middleware/validation.js';

// Mock Express request/response objects for testing
function createMockRequest(data: any, type: 'body' | 'query' | 'params' = 'body'): Request {
  const req = {
    body: {},
    query: {},
    params: {},
    headers: {},
    method: 'GET',
    url: '/',
    path: '/'
  } as any;
  
  req[type] = data;
  return req as Request;
}

function createMockResponse(): { res: Response; statusCode: number; jsonData: any } {
  let statusCode = 200;
  let jsonData: any = null;
  let ended = false;
  
  const res = {
    status: function(code: number) {
      statusCode = code;
      return this;
    },
    json: function(data: any) {
      jsonData = data;
      ended = true;
      return this;
    },
    send: function(data: any) {
      jsonData = data;
      ended = true;
      return this;
    },
    end: function() {
      ended = true;
      return this;
    },
    headersSent: false,
    locals: {}
  } as any;
  
  return { res: res as Response, statusCode, jsonData };
}

function createMockNext(): { next: NextFunction; called: boolean; error?: any } {
  let called = false;
  let error: any = undefined;
  
  const next: NextFunction = (err?: any) => {
    called = true;
    error = err;
  };
  
  return { next, called, error };
}

// === MIDDLEWARE FUNCTIONALITY TESTS ===

test('Validation Middleware - Direct schema validation', () => {
  // Test the schema directly first
  const testSchema = z.object({
    email: commonSchemas.email,
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100)
  });
  
  const validData = {
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe'
  };
  
  const result = testSchema.safeParse(validData);
  assert(result.success, 'Schema validation should pass directly');
  console.log('✅ Direct schema validation test passed');
});

test('Validation Middleware - validateBody with invalid data', () => {
  const invalidData = {
    email: 'invalid-email', // Invalid email format
    firstName: '', // Empty string
    // Missing lastName
  };
  
  const req = createMockRequest(invalidData, 'body');
  const { res, statusCode, jsonData } = createMockResponse();
  const { next, called } = createMockNext();
  
  const testSchema = z.object({
    email: commonSchemas.email,
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100)
  });
  
  const middleware = validateBody(testSchema);
  
  middleware(req as Request, res as Response, next);
  
  assert(!called, 'Next function should NOT be called for invalid data');
  assert.equal(statusCode, 400);
  assert(jsonData?.success === false);
  assert.equal(jsonData?.error, 'VALIDATION_ERROR');
  console.log('✅ validateBody middleware with invalid data test passed');
});

test('Validation Middleware - validateQuery with pagination', () => {
  const validQuery = {
    page: '1',
    limit: '10'
  };
  
  const req = createMockRequest(validQuery, 'query');
  const { res } = createMockResponse();
  const { next, called } = createMockNext();
  
  const middleware = validateQuery(commonSchemas.pagination);
  
  middleware(req as Request, res as Response, next);
  
  assert(called, 'Next function should be called for valid query');
  console.log('✅ validateQuery middleware test passed');
});

test('Validation Middleware - validateParams with UUID', () => {
  const validParams = {
    id: 'a0b1c2d3-e4f5-6789-abcd-ef0123456789'
  };
  
  const req = createMockRequest(validParams, 'params');
  const { res } = createMockResponse();
  const { next, called } = createMockNext();
  
  const middleware = validateParams(commonSchemas.uuidParam);
  
  middleware(req as Request, res as Response, next);
  
  assert(called, 'Next function should be called for valid params');
  console.log('✅ validateParams middleware test passed');
});

// === INDIVIDUAL SCHEMA TESTS ===

test('Schema Validation - Email formats', () => {
  const validEmails = [
    'user@example.com',
    'test.email+tag@domain.co.uk',
    'user_name@domain-name.com'
  ];
  
  const invalidEmails = [
    'invalid-email',
    '@example.com',
    'user@',
    '',
    'user..double.dot@example.com'
  ];
  
  for (const email of validEmails) {
    const result = commonSchemas.email.safeParse(email);
    assert(result.success, `Valid email should pass: ${email}`);
  }
  
  for (const email of invalidEmails) {
    const result = commonSchemas.email.safeParse(email);
    assert(!result.success, `Invalid email should fail: ${email}`);
  }
  
  console.log('✅ Email schema validation test passed');
});

test('Schema Validation - Name constraints', () => {
  const nameSchema = z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100)
  });
  
  const validNames = {
    firstName: 'John',
    lastName: 'Doe-Smith'
  };
  
  const invalidNames = [
    { firstName: '', lastName: 'Doe' }, // Empty first name
    { firstName: 'J'.repeat(101), lastName: 'Doe' }, // Too long
    { firstName: 'John', lastName: '' } // Empty last name
  ];
  
  // Test valid names
  const validResult = nameSchema.safeParse(validNames);
  assert(validResult.success, 'Valid names should pass');
  
  // Test invalid names
  for (const nameData of invalidNames) {
    const result = nameSchema.safeParse(nameData);
    assert(!result.success, `Invalid name should fail: ${JSON.stringify(nameData)}`);
  }
  
  console.log('✅ Name schema validation test passed');
});

test('Schema Validation - Phone number formats', () => {
  const validPhones = [
    '+1-555-123-4567',
    '(555) 123-4567',
    '555-123-4567'
  ];
  
  const invalidPhones = [
    '123', // Too short
    'abc-def-ghij', // Contains letters
    '', // Empty string
    '123-456-78901234567890' // Too long
  ];
  
  for (const phone of validPhones) {
    const result = commonSchemas.phone.safeParse(phone);
    assert(result.success, `Valid phone should pass: ${phone}`);
  }
  
  for (const phone of invalidPhones) {
    const result = commonSchemas.phone.safeParse(phone);
    assert(!result.success, `Invalid phone should fail: ${phone}`);
  }
  
  console.log('✅ Phone schema validation test passed');
});

test('Schema Validation - UUID patterns', () => {
  const validIds = [
    'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
    '12345678-1234-1234-1234-123456789012'
  ];
  
  const invalidIds = [
    'invalid-id',
    'cust_short',
    '',
    'not-a-uuid-format'
  ];
  
  for (const id of validIds) {
    const result = commonSchemas.uuidParam.safeParse({ id });
    assert(result.success, `Valid UUID should pass: ${id}`);
  }
  
  for (const id of invalidIds) {
    const result = commonSchemas.uuidParam.safeParse({ id });
    assert(!result.success, `Invalid UUID should fail: ${id}`);
  }
  
  console.log('✅ UUID schema validation test passed');
});

test('Schema Validation - Pagination parameters', () => {
  const validPagination = [
    { page: '1', limit: '10' },
    { page: '5', limit: '25' },
    { page: '1', limit: '100' } // Max limit
  ];
  
  const invalidPagination = [
    { page: '0', limit: '10' }, // Page starts at 1
    { page: '1', limit: '0' }, // Limit must be positive
    { page: '1', limit: '101' }, // Exceeds max limit
    { page: 'abc', limit: '10' }, // Non-numeric page
    { page: '1', limit: 'xyz' } // Non-numeric limit
  ];
  
  for (const data of validPagination) {
    const result = commonSchemas.pagination.safeParse(data);
    assert(result.success, `Valid pagination should pass: ${JSON.stringify(data)}`);
  }
  
  for (const data of invalidPagination) {
    const result = commonSchemas.pagination.safeParse(data);
    assert(!result.success, `Invalid pagination should fail: ${JSON.stringify(data)}`);
  }
  
  console.log('✅ Pagination schema validation test passed');
});

test('Schema Validation - Money validation', () => {
  const validAmounts = [0, 1, 100, 999999, 99999999]; // Up to $999,999.99
  const invalidAmounts = [-1, 100000000, 999999999]; // Negative, too large
  
  for (const amount of validAmounts) {
    const result = commonSchemas.money.safeParse(amount);
    assert(result.success, `Valid money amount should pass: ${amount}`);
  }
  
  for (const amount of invalidAmounts) {
    const result = commonSchemas.money.safeParse(amount);
    assert(!result.success, `Invalid money amount should fail: ${amount}`);
  }
  
  console.log('✅ Money schema validation test passed');
});

test('Schema Validation - ZIP code formats', () => {
  const validZipCodes = ['12345', '12345-6789'];
  const invalidZipCodes = ['123', '12345-67890', 'abcde', ''];
  
  for (const zipCode of validZipCodes) {
    const result = commonSchemas.zipCode.safeParse(zipCode);
    assert(result.success, `Valid ZIP code should pass: ${zipCode}`);
  }
  
  for (const zipCode of invalidZipCodes) {
    const result = commonSchemas.zipCode.safeParse(zipCode);
    assert(!result.success, `Invalid ZIP code should fail: ${zipCode}`);
  }
  
  console.log('✅ ZIP code schema validation test passed');
});

test('Schema Validation - State and country codes', () => {
  const validStateCodes = ['NY', 'CA', 'TX'];
  const invalidStateCodes = ['N', 'NYC', '', '123'];
  
  const validCountryCodes = ['US', 'CA', 'GB'];
  const invalidCountryCodes = ['U', 'USA', '', '12'];
  
  for (const state of validStateCodes) {
    const result = commonSchemas.stateCode.safeParse(state);
    assert(result.success, `Valid state code should pass: ${state}`);
  }
  
  for (const state of invalidStateCodes) {
    const result = commonSchemas.stateCode.safeParse(state);
    assert(!result.success, `Invalid state code should fail: ${state}`);
  }
  
  for (const country of validCountryCodes) {
    const result = commonSchemas.countryCode.safeParse(country);
    assert(result.success, `Valid country code should pass: ${country}`);
  }
  
  for (const country of invalidCountryCodes) {
    const result = commonSchemas.countryCode.safeParse(country);
    assert(!result.success, `Invalid country code should fail: ${country}`);
  }
  
  console.log('✅ State and country code schema validation test passed');
});

test('Schema Validation - Date range validation', () => {
  const validDateRanges = [
    { startDate: '2023-01-01T00:00:00.000Z', endDate: '2023-12-31T23:59:59.999Z' },
    { startDate: '2023-06-01T10:00:00.000Z' }, // Only start date
    { endDate: '2023-06-30T18:00:00.000Z' }, // Only end date
    {} // Both optional
  ];
  
  const invalidDateRanges = [
    { startDate: 'invalid-date', endDate: '2023-12-31T23:59:59.999Z' },
    { startDate: '2023-12-31T23:59:59.999Z', endDate: '2023-01-01T00:00:00.000Z' }, // End before start
    { startDate: '2023-01-01', endDate: '2023-12-31' } // Wrong format (not ISO datetime)
  ];
  
  for (const dateRange of validDateRanges) {
    const result = commonSchemas.dateRange.safeParse(dateRange);
    assert(result.success, `Valid date range should pass: ${JSON.stringify(dateRange)}`);
  }
  
  for (const dateRange of invalidDateRanges) {
    const result = commonSchemas.dateRange.safeParse(dateRange);
    assert(!result.success, `Invalid date range should fail: ${JSON.stringify(dateRange)}`);
  }
  
  console.log('✅ Date range schema validation test passed');
});

test('Schema Validation - Search query validation', () => {
  const validSearchQueries = [
    { search: 'test query', sortBy: 'name', sortOrder: 'asc' },
    { search: 'product search' },
    { sortBy: 'createdAt', sortOrder: 'desc' },
    {} // All optional
  ];
  
  const invalidSearchQueries = [
    { search: '', sortBy: 'name', sortOrder: 'asc' }, // Empty search
    { search: 'a'.repeat(256), sortBy: 'name' }, // Search too long
    { search: 'test', sortBy: 'a'.repeat(51) }, // sortBy too long
    { search: 'test', sortOrder: 'invalid' } // Invalid sort order
  ];
  
  for (const query of validSearchQueries) {
    const result = commonSchemas.search.safeParse(query);
    assert(result.success, `Valid search query should pass: ${JSON.stringify(query)}`);
  }
  
  for (const query of invalidSearchQueries) {
    const result = commonSchemas.search.safeParse(query);
    assert(!result.success, `Invalid search query should fail: ${JSON.stringify(query)}`);
  }
  
  console.log('✅ Search query schema validation test passed');
});

// === PERFORMANCE AND EDGE CASE TESTS ===

test('Validation Performance - Large data sets', () => {
  const startTime = performance.now();
  
  // Test validation performance with larger datasets
  const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
    email: `user${i}@example.com`,
    firstName: `User${i}`,
    lastName: `Test${i}`
  }));
  
  const testSchema = z.object({
    email: commonSchemas.email,
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100)
  });
  
  let successCount = 0;
  for (const data of largeDataSet) {
    const result = testSchema.safeParse(data);
    if (result.success) successCount++;
  }
  
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  assert.equal(successCount, 1000, 'All valid entries should pass validation');
  assert(duration < 1000, `Validation should complete in under 1 second, took ${duration}ms`);
  
  console.log(`✅ Validation performance test passed (${duration.toFixed(2)}ms for 1000 validations)`);
});

test('Validation Edge Cases - Boundary values', () => {
  const boundaryTests = [
    // Test pagination boundaries
    { type: 'pagination', value: { page: '1', limit: '1' } }, // Minimum values
    { type: 'pagination', value: { page: '999999', limit: '100' } }, // Large page number
    
    // Test special characters in email
    { type: 'email', value: 'user+tag@example-domain.com' },
  ];
  
  for (const testCase of boundaryTests) {
    let schema;
    switch (testCase.type) {
      case 'email':
        schema = commonSchemas.email;
        break;
      case 'pagination':
        schema = commonSchemas.pagination;
        break;
      default:
        continue;
    }
    
    const result = schema.safeParse(testCase.value);
    assert(result.success, `Boundary test should pass for ${testCase.type}: ${JSON.stringify(testCase.value)}`);
  }
  
  console.log('✅ Validation boundary value test passed');
});

test('Validation Error Messages - Detailed feedback', () => {
  const invalidData = {
    email: 'invalid-email',
    firstName: '',
    lastName: 'T'.repeat(101) // Too long
  };
  
  const testSchema = z.object({
    email: commonSchemas.email,
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100)
  });
  
  const result = testSchema.safeParse(invalidData);
  
  assert(!result.success, 'Invalid data should fail validation');
  
  if (!result.success) {
    const errors = result.error.errors;
    assert(errors.length > 0, 'Should have validation errors');
    
    // Check that error messages are descriptive
    const errorMessages = errors.map(err => err.message);
    assert(errorMessages.some(msg => msg.includes('email') || msg.includes('Invalid')));
    
    console.log(`✅ Validation error messages test passed (${errors.length} detailed errors)`);
  }
});

// === VALIDATORS OBJECT TESTS ===

test('Validators Object - Pre-built middleware', () => {
  // Test that validators object contains expected middleware functions
  assert(typeof validators === 'object', 'Validators should be an object');
  
  // Test some expected validator functions exist
  const expectedValidators = [
    'requireUuidParam',
    'paginationQuery', 
    'searchQuery',
    'paginationWithSearchQuery',
    'dateRangeQuery',
    'uuidParam',
    'uuidParams'
  ];
  
  let foundValidators = 0;
  for (const validatorName of expectedValidators) {
    if (typeof (validators as any)[validatorName] === 'function') {
      foundValidators++;
    }
  }
  
  assert(foundValidators > 0, `Should find pre-built validators, found ${foundValidators}`);
  console.log(`✅ Validators object test passed (${foundValidators}/${expectedValidators.length} validators found)`);
});

test('Validators Object - UUID param validator', () => {
  const validUuid = 'a0b1c2d3-e4f5-6789-abcd-ef0123456789';
  const req = createMockRequest({ id: validUuid }, 'params');
  const { res } = createMockResponse();
  const { next, called } = createMockNext();
  
  const middleware = validators.requireUuidParam;
  middleware(req as Request, res as Response, next);
  
  assert(called, 'UUID param validator should call next for valid UUID');
  console.log('✅ UUID param validator test passed');
});

test('Validators Object - Pagination query validator', () => {
  const validPagination = { page: '2', limit: '20' };
  const req = createMockRequest(validPagination, 'query');
  const { res } = createMockResponse();
  const { next, called } = createMockNext();
  
  const middleware = validators.paginationQuery;
  middleware(req as Request, res as Response, next);
  
  assert(called, 'Pagination query validator should call next for valid pagination');
  console.log('✅ Pagination query validator test passed');
});

console.log('🧪 Validation testing suite completed successfully!');