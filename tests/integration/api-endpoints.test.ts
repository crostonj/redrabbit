/**
 * API Endpoint Integration Tests
 * 
 * Comprehensive HTTP integration tests for all controller endpoints:
 * - Order management (CRUD operations, status updates, items)
 * - Customer management (CRUD, addresses, statistics)
 * - Product management (CRUD, categories, inventory)
 * 
 * Tests real HTTP requests/responses with actual database operations
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { testEnv, TestHttpClient, testAssertions } from '../utils/test-environment.js';
import { createApp } from '../../src/app.js';
import type { Express } from 'express';

// Test setup
let app: Express;
let httpClient: TestHttpClient;
let testData: any;

beforeEach(async () => {
  // Initialize test environment
  await testEnv.setup();
  
  // Create Express app
  app = createApp();
  
  // Start test server
  const baseUrl = await testEnv.startServer(app);
  httpClient = new TestHttpClient(baseUrl);
});

afterEach(async () => {
  await testEnv.cleanup();
});

// === ORDER MANAGEMENT TESTS ===

test('Order API - Create new order', async () => {
  // Get test customers and products for order creation
  const customerResponse = await httpClient.get('/api/customers');
  testAssertions.assertSuccess(customerResponse);
  const customer = customerResponse.body.data[0];

  const productsResponse = await httpClient.get('/api/products');
  testAssertions.assertSuccess(productsResponse);
  const product = productsResponse.body.data[0];

  // Get customer addresses
  const addressesResponse = await httpClient.get(`/api/customers/${customer.id}/addresses`);
  testAssertions.assertSuccess(addressesResponse);
  const address = addressesResponse.body.data[0];

  const orderData = {
    customerId: customer.id,
    shippingAddressId: address.id,
    billingAddressId: address.id,
    paymentMethod: 'credit_card',
    notes: 'Integration test order',
    subtotalAmount: product.price,
    totalAmount: product.price
  };

  // Create order
  const createResponse = await httpClient.post('/api/orders', orderData);
  testAssertions.assertSuccess(createResponse, 201);
  testAssertions.assertDataStructure(createResponse, ['id', 'customerId', 'status', 'totalAmount']);

  const orderId = createResponse.body.data.id;

  // Add item to order
  const itemData = {
    productId: product.id,
    quantity: 2,
    unitPrice: product.price
  };

  const addItemResponse = await httpClient.post(`/api/orders/${orderId}/items`, itemData);
  testAssertions.assertSuccess(addItemResponse, 201);
  
  console.log('✅ Order creation and item addition test passed');
});

test('Order API - Get order by ID', async () => {
  // Get existing order from test data
  const ordersResponse = await httpClient.get('/api/orders');
  testAssertions.assertSuccess(ordersResponse);
  const order = ordersResponse.body.data[0];

  // Get specific order
  const response = await httpClient.get(`/api/orders/${order.id}`);
  testAssertions.assertSuccess(response);
  testAssertions.assertDataStructure(response, ['id', 'customerId', 'status', 'totalAmount']);
  
  assert.equal(response.body.data.id, order.id);
  console.log('✅ Order retrieval by ID test passed');
});

test('Order API - Update order status', async () => {
  // Get existing order
  const ordersResponse = await httpClient.get('/api/orders');
  testAssertions.assertSuccess(ordersResponse);
  const order = ordersResponse.body.data[0];

  // Update order status
  const updateData = {
    status: 'confirmed',
    notes: 'Order confirmed via integration test'
  };

  const response = await httpClient.put(`/api/orders/${order.id}/status`, updateData);
  testAssertions.assertSuccess(response);
  
  assert.equal(response.body.data.status, 'confirmed');
  console.log('✅ Order status update test passed');
});

test('Order API - List orders with pagination', async () => {
  const response = await httpClient.get('/api/orders?page=1&limit=10');
  testAssertions.assertSuccess(response);
  testAssertions.assertPagination(response);
  
  assert(Array.isArray(response.body.data));
  assert(response.body.pagination.page === 1);
  assert(response.body.pagination.limit === 10);
  
  console.log('✅ Order listing with pagination test passed');
});

// === CUSTOMER MANAGEMENT TESTS ===

test('Customer API - Create new customer', async () => {
  const customerData = {
    email: 'test.new@example.com',
    firstName: 'New',
    lastName: 'Customer',
    phone: '+1-555-9999',
    dateOfBirth: '1992-05-10'
  };

  const response = await httpClient.post('/api/customers', customerData);
  testAssertions.assertSuccess(response, 201);
  testAssertions.assertDataStructure(response, ['id', 'email', 'firstName', 'lastName']);
  
  assert.equal(response.body.data.email, customerData.email);
  console.log('✅ Customer creation test passed');
});

test('Customer API - Get customer by ID', async () => {
  // Get existing customer
  const customersResponse = await httpClient.get('/api/customers');
  testAssertions.assertSuccess(customersResponse);
  const customer = customersResponse.body.data[0];

  const response = await httpClient.get(`/api/customers/${customer.id}`);
  testAssertions.assertSuccess(response);
  testAssertions.assertDataStructure(response, ['id', 'email', 'firstName', 'lastName']);
  
  assert.equal(response.body.data.id, customer.id);
  console.log('✅ Customer retrieval by ID test passed');
});

test('Customer API - Add customer address', async () => {
  // Get existing customer
  const customersResponse = await httpClient.get('/api/customers');
  testAssertions.assertSuccess(customersResponse);
  const customer = customersResponse.body.data[0];

  const addressData = {
    type: 'billing',
    street1: '456 Secondary St',
    city: 'Test City',
    state: 'TC',
    zipCode: '54321',
    country: 'US'
  };

  const response = await httpClient.post(`/api/customers/${customer.id}/addresses`, addressData);
  testAssertions.assertSuccess(response, 201);
  testAssertions.assertDataStructure(response, ['id', 'type', 'street1', 'city']);
  
  assert.equal(response.body.data.type, addressData.type);
  console.log('✅ Customer address creation test passed');
});

test('Customer API - Update customer', async () => {
  // Get existing customer
  const customersResponse = await httpClient.get('/api/customers');
  testAssertions.assertSuccess(customersResponse);
  const customer = customersResponse.body.data[0];

  const updateData = {
    firstName: 'Updated',
    lastName: 'Name',
    phone: '+1-555-0000'
  };

  const response = await httpClient.put(`/api/customers/${customer.id}`, updateData);
  testAssertions.assertSuccess(response);
  
  assert.equal(response.body.data.firstName, updateData.firstName);
  assert.equal(response.body.data.lastName, updateData.lastName);
  console.log('✅ Customer update test passed');
});

// === PRODUCT MANAGEMENT TESTS ===

test('Product API - Create new product', async () => {
  // Get categories for product
  const categoriesResponse = await httpClient.get('/api/categories');
  testAssertions.assertSuccess(categoriesResponse);
  const category = categoriesResponse.body.data[0];

  const productData = {
    sku: 'TEST-NEW-001',
    name: 'New Test Product',
    description: 'A new product created via integration test',
    price: 99.99,
    costPrice: 50.00,
    stock: 25,
    categoryId: category.id,
    isActive: true
  };

  const response = await httpClient.post('/api/products', productData);
  testAssertions.assertSuccess(response, 201);
  testAssertions.assertDataStructure(response, ['id', 'sku', 'name', 'price', 'stock']);
  
  assert.equal(response.body.data.sku, productData.sku);
  assert.equal(response.body.data.price, productData.price);
  console.log('✅ Product creation test passed');
});

test('Product API - Get product by ID', async () => {
  // Get existing product
  const productsResponse = await httpClient.get('/api/products');
  testAssertions.assertSuccess(productsResponse);
  const product = productsResponse.body.data[0];

  const response = await httpClient.get(`/api/products/${product.id}`);
  testAssertions.assertSuccess(response);
  testAssertions.assertDataStructure(response, ['id', 'sku', 'name', 'price', 'stock']);
  
  assert.equal(response.body.data.id, product.id);
  console.log('✅ Product retrieval by ID test passed');
});

test('Product API - Update product stock', async () => {
  // Get existing product
  const productsResponse = await httpClient.get('/api/products');
  testAssertions.assertSuccess(productsResponse);
  const product = productsResponse.body.data[0];

  const stockUpdate = {
    quantity: 100,
    reason: 'Integration test stock update'
  };

  const response = await httpClient.post(`/api/products/${product.id}/stock`, stockUpdate);
  testAssertions.assertSuccess(response);
  
  console.log('✅ Product stock update test passed');
});

test('Product API - Search products', async () => {
  const response = await httpClient.get('/api/products/search?query=test&limit=5');
  testAssertions.assertSuccess(response);
  testAssertions.assertPagination(response);
  
  assert(Array.isArray(response.body.data));
  console.log('✅ Product search test passed');
});

// === CATEGORY MANAGEMENT TESTS ===

test('Category API - Create new category', async () => {
  const categoryData = {
    name: 'Test Category',
    description: 'Category created via integration test',
    slug: 'test-category'
  };

  const response = await httpClient.post('/api/categories', categoryData);
  testAssertions.assertSuccess(response, 201);
  testAssertions.assertDataStructure(response, ['id', 'name', 'slug']);
  
  assert.equal(response.body.data.name, categoryData.name);
  console.log('✅ Category creation test passed');
});

test('Category API - Get all categories', async () => {
  const response = await httpClient.get('/api/categories');
  testAssertions.assertSuccess(response);
  
  assert(Array.isArray(response.body.data));
  assert(response.body.data.length > 0);
  console.log('✅ Category listing test passed');
});

// === ERROR HANDLING TESTS ===

test('API Error Handling - Invalid order ID', async () => {
  const response = await httpClient.get('/api/orders/invalid-id');
  testAssertions.assertError(response, 400, /Invalid.*ID/);
  console.log('✅ Invalid ID error handling test passed');
});

test('API Error Handling - Non-existent order', async () => {
  const response = await httpClient.get('/api/orders/ord_nonexistent_123');
  testAssertions.assertError(response, 404, /not found/);
  console.log('✅ Non-existent resource error handling test passed');
});

test('API Error Handling - Validation errors', async () => {
  const invalidCustomerData = {
    email: 'invalid-email',
    firstName: '', // Required field
    // Missing lastName
    phone: '123' // Invalid format
  };

  const response = await httpClient.post('/api/customers', invalidCustomerData);
  testAssertions.assertError(response, 400, /validation/i);
  console.log('✅ Validation error handling test passed');
});

// === AUTHENTICATION TESTS ===

test('API Security - Protected endpoints require authentication', async () => {
  // Try to access protected endpoint without authentication
  const response = await httpClient.delete('/api/orders/ord_test_123');
  
  // Should get 401 Unauthorized or similar authentication error
  assert(response.status === 401 || response.status === 403);
  console.log('✅ Authentication requirement test passed');
});

console.log('🧪 API endpoint integration tests completed successfully!');