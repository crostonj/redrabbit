/**
 * Repository Interfaces and Base Classes
 * 
 * Defines contracts for data access layer with CRUD operations and domain-specific queries.
 * Provides type-safe database interactions with proper error handling and validation.
 */

// Common types for pagination and filtering
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SearchOptions extends PaginationOptions {
  query?: string;
  filters?: Record<string, any>;
}

// Base repository interface with common CRUD operations
export interface BaseRepository<T, CreateData, UpdateData> {
  // Create operations
  create(data: CreateData): Promise<T>;
  createMany(data: CreateData[]): Promise<T[]>;
  
  // Read operations
  findById(id: string): Promise<T | null>;
  findAll(options?: PaginationOptions): Promise<PaginatedResult<T>>;
  exists(id: string): Promise<boolean>;
  count(filters?: Record<string, any>): Promise<number>;
  
  // Update operations  
  update(id: string, data: UpdateData): Promise<T | null>;
  updateMany(ids: string[], data: UpdateData): Promise<T[]>;
  
  // Delete operations
  delete(id: string): Promise<boolean>;
  deleteMany(ids: string[]): Promise<number>;
  
  // Soft delete operations
  softDelete?(id: string): Promise<boolean>;
  restore?(id: string): Promise<boolean>;
}

// Customer-specific repository interface
export interface CustomerRepository extends BaseRepository<Customer, CreateCustomerData, UpdateCustomerData> {
  // Customer-specific queries
  findByEmail(email: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  search(options: SearchOptions): Promise<PaginatedResult<Customer>>;
  
  // Address management
  addAddress(customerId: string, address: CreateAddressData): Promise<Address>;
  updateAddress(customerId: string, addressId: string, address: UpdateAddressData): Promise<Address | null>;
  deleteAddress(customerId: string, addressId: string): Promise<boolean>;
  getAddresses(customerId: string): Promise<Address[]>;
  setDefaultAddress(customerId: string, addressId: string): Promise<boolean>;
  
  // Customer analytics
  getOrderHistory(customerId: string, options?: PaginationOptions): Promise<PaginatedResult<Order>>;
  getOrderStats(customerId: string): Promise<CustomerOrderStats>;
  getTopCustomers(limit: number): Promise<Customer[]>;
}

// Product-specific repository interface
export interface ProductRepository extends BaseRepository<Product, CreateProductData, UpdateProductData> {
  // Product-specific queries
  findBySku(sku: string): Promise<Product | null>;
  findByCategory(categoryId: string, options?: PaginationOptions): Promise<PaginatedResult<Product>>;
  search(options: SearchOptions): Promise<PaginatedResult<Product>>;
  findFeatured(limit: number): Promise<Product[]>;
  
  // Inventory management
  updateStock(productId: string, quantity: number, reason: string): Promise<Product | null>;
  checkStock(productId: string): Promise<number>;
  getLowStockProducts(threshold?: number): Promise<Product[]>;
  getInventoryHistory(productId: string, options?: PaginationOptions): Promise<PaginatedResult<InventoryMovement>>;
  
  // Category management
  getCategories(): Promise<Category[]>;
  createCategory(category: CreateCategoryData): Promise<Category>;
  updateCategory(categoryId: string, category: UpdateCategoryData): Promise<Category | null>;
  deleteCategory(categoryId: string): Promise<boolean>;
  
  // Product analytics
  getPopularProducts(limit: number): Promise<Product[]>;
  getProductStats(productId: string): Promise<ProductStats>;
}

// Order-specific repository interface
export interface OrderRepository extends BaseRepository<Order, CreateOrderData, UpdateOrderData> {
  // Order-specific queries
  findByCustomerId(customerId: string, options?: PaginationOptions): Promise<PaginatedResult<Order>>;
  findByStatus(status: OrderStatus[], options?: PaginationOptions): Promise<PaginatedResult<Order>>;
  findByDateRange(startDate: Date, endDate: Date, options?: PaginationOptions): Promise<PaginatedResult<Order>>;
  
  // Order management
  updateStatus(orderId: string, status: OrderStatus, notes?: string): Promise<Order | null>;
  addItem(orderId: string, item: CreateOrderItemData): Promise<OrderItem>;
  updateItem(orderId: string, itemId: string, item: UpdateOrderItemData): Promise<OrderItem | null>;
  removeItem(orderId: string, itemId: string): Promise<boolean>;
  getItems(orderId: string): Promise<OrderItem[]>;
  
  // Order calculations
  calculateTotals(orderId: string): Promise<OrderTotals>;
  recalculateTotals(orderId: string): Promise<Order | null>;
  
  // Order fulfillment
  markAsShipped(orderId: string, trackingNumber?: string): Promise<Order | null>;
  markAsDelivered(orderId: string, deliveredAt?: Date): Promise<Order | null>;
  markAsCancelled(orderId: string, reason: string): Promise<Order | null>;
  
  // Order analytics
  getDailySales(startDate: Date, endDate: Date): Promise<DailySalesData[]>;
  getOrderStats(startDate?: Date, endDate?: Date): Promise<OrderStats>;
  getRevenueByPeriod(period: 'day' | 'week' | 'month' | 'year'): Promise<RevenueData[]>;
}

// Payment-specific repository interface
export interface PaymentRepository extends BaseRepository<Payment, CreatePaymentData, UpdatePaymentData> {
  // Payment-specific queries
  findByOrderId(orderId: string): Promise<Payment[]>;
  findByCustomerId(customerId: string, options?: PaginationOptions): Promise<PaginatedResult<Payment>>;
  findByStatus(status: PaymentStatus[], options?: PaginationOptions): Promise<PaginatedResult<Payment>>;
  
  // Payment management
  updateStatus(paymentId: string, status: PaymentStatus): Promise<Payment | null>;
  refund(paymentId: string, amount: number, reason: string): Promise<Payment | null>;
  
  // Payment analytics
  getPaymentStats(startDate?: Date, endDate?: Date): Promise<PaymentStats>;
  getPaymentMethodStats(): Promise<PaymentMethodStats[]>;
}

// Type definitions for data models
export interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateCustomerData {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: Date;
  metadata?: Record<string, any>;
}

export interface UpdateCustomerData {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  dateOfBirth?: Date;
  metadata?: Record<string, any>;
}

export interface Address {
  id: string;
  customerId: string;
  type: AddressType;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddressData {
  type: AddressType;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  isDefault?: boolean;
}

export interface UpdateAddressData {
  type?: AddressType;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  isDefault?: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  costPrice: number;
  stock: number;
  minStock: number;
  maxStock: number;
  weight?: number;
  dimensions?: Record<string, number>;
  images?: string[];
  tags?: string[];
  isActive: boolean;
  isFeatured: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateProductData {
  sku: string;
  name: string;
  description?: string;
  categoryId: string;
  price: number;
  costPrice: number;
  stock: number;
  minStock?: number;
  maxStock?: number;
  weight?: number;
  dimensions?: Record<string, number>;
  images?: string[];
  tags?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateProductData {
  sku?: string;
  name?: string;
  description?: string;
  categoryId?: string;
  price?: number;
  costPrice?: number;
  stock?: number;
  minStock?: number;
  maxStock?: number;
  weight?: number;
  dimensions?: Record<string, number>;
  images?: string[];
  tags?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
  metadata?: Record<string, any>;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCategoryData {
  name: string;
  description?: string;
  parentId?: string;
  slug: string;
  isActive?: boolean;
}

export interface UpdateCategoryData {
  name?: string;
  description?: string;
  parentId?: string;
  slug?: string;
  isActive?: boolean;
}

export interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  subtotalAmount: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: Currency;
  shippingAddressId: string;
  billingAddressId: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderData {
  customerId: string;
  status?: OrderStatus;
  subtotalAmount: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  totalAmount: number;
  currency?: Currency;
  shippingAddressId: string;
  billingAddressId: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface UpdateOrderData {
  status?: OrderStatus;
  subtotalAmount?: number;
  taxAmount?: number;
  shippingAmount?: number;
  discountAmount?: number;
  totalAmount?: number;
  notes?: string;
  trackingNumber?: string;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  metadata?: Record<string, any>;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderItemData {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface UpdateOrderItemData {
  quantity?: number;
  unitPrice?: number;
}

export interface Payment {
  id: string;
  orderId: string;
  customerId: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  refundAmount?: number;
  refundReason?: string;
  processedAt?: Date;
  refundedAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentData {
  orderId: string;
  customerId: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  transactionId?: string;
  metadata?: Record<string, any>;
}

export interface UpdatePaymentData {
  status?: PaymentStatus;
  transactionId?: string;
  processedAt?: Date;
  refundAmount?: number;
  refundReason?: string;
  refundedAt?: Date;
  metadata?: Record<string, any>;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  reason: string;
  reference?: string;
  createdAt: Date;
}

// Enums
export enum AddressType {
  SHIPPING = 'shipping',
  BILLING = 'billing',
  BOTH = 'both'
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned'
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_TRANSFER = 'bank_transfer',
  PAYPAL = 'paypal',
  CASH = 'cash'
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  CANCELLED = 'cancelled'
}

export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  CAD = 'CAD'
}

export enum InventoryMovementType {
  IN = 'in',
  OUT = 'out',
  ADJUSTMENT = 'adjustment',
  RESERVATION = 'reservation',
  RELEASE = 'release',
  SALE = 'sale'
}

// Analytics interfaces
export interface CustomerOrderStats {
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderDate?: Date;
  lastOrderDate?: Date;
}

export interface ProductStats {
  totalSold: number;
  totalRevenue: number;
  averageRating?: number;
  reviewCount?: number;
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

export interface DailySalesData {
  date: Date;
  orderCount: number;
  totalRevenue: number;
  averageOrderValue: number;
}

export interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersByStatus: Record<OrderStatus, number>;
}

export interface RevenueData {
  period: string;
  revenue: number;
  orderCount: number;
}

export interface PaymentStats {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
  paymentsByStatus: Record<PaymentStatus, number>;
}

export interface PaymentMethodStats {
  method: PaymentMethod;
  count: number;
  amount: number;
  percentage: number;
}