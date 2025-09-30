import { z } from 'zod';

/**
 * OrderLineItem Entity
 * Represents individual items within an order with quantity and pricing validation
 * Following constitution principles: integer cents for monetary precision
 */

/**
 * OrderLineItem Status Enumeration
 * Tracks the fulfillment status of individual line items
 */
export const LineItemStatus = z.enum([
  'pending',        // Awaiting processing
  'reserved',       // Inventory reserved
  'allocated',      // Assigned to fulfillment
  'picked',         // Retrieved from inventory
  'packed',         // Ready for shipping
  'shipped',        // Dispatched with carrier
  'delivered',      // Received by customer
  'returned',       // Returned by customer
  'exchanged',      // Exchanged for different item
  'cancelled',      // Cancelled before fulfillment
  'backordered',    // Out of stock, awaiting restock
  'damaged',        // Damaged during fulfillment
  'missing'         // Missing from shipment
]);

export type LineItemStatusType = z.infer<typeof LineItemStatus>;

/**
 * Base OrderLineItem Schema (without refinements)
 * Used for creating derived schemas
 */
const BaseOrderLineItemSchema = z.object({
  // Identity and References
  id: z.string().uuid('LineItem ID must be a valid UUID'),
  orderId: z.string().uuid('Order ID must be a valid UUID'),
  productId: z.string().uuid('Product ID must be a valid UUID'),
  
  // Product Information (captured at time of order for audit trail)
  productSku: z.string().min(1, 'Product SKU is required').max(50),
  productName: z.string().min(1, 'Product name is required').max(255),
  productDescription: z.string().max(1000).optional(),
  
  // Category and Classification
  categoryId: z.string().uuid().optional(),
  categoryName: z.string().max(100).optional(),
  brand: z.string().max(100).optional(),
  
  // Quantity and Fulfillment
  quantity: z.number().int().positive('Quantity must be positive').max(9999, 'Quantity too large'),
  quantityShipped: z.number().int().nonnegative('Shipped quantity must be non-negative').default(0),
  quantityDelivered: z.number().int().nonnegative('Delivered quantity must be non-negative').default(0),
  quantityReturned: z.number().int().nonnegative('Returned quantity must be non-negative').default(0),
  quantityCancelled: z.number().int().nonnegative('Cancelled quantity must be non-negative').default(0),
  
  // Status and Processing
  status: LineItemStatus.default('pending'),
  fulfillmentPriority: z.number().int().min(1).max(10).default(5), // 1=highest, 10=lowest
  
  // Pricing (all in cents for precision)
  unitPriceCents: z.number().int().positive('Unit price must be positive'),
  listPriceCents: z.number().int().positive('List price must be positive'),
  subtotalCents: z.number().int().nonnegative('Subtotal must be non-negative'),
  
  // Discounts and Adjustments
  discountCents: z.number().int().nonnegative('Discount must be non-negative').default(0),
  discountPercent: z.number().min(0).max(100).default(0),
  discountReason: z.string().max(255).optional(),
  couponCode: z.string().max(50).optional(),
  
  // Tax Information
  taxCents: z.number().int().nonnegative('Tax must be non-negative').default(0),
  taxRate: z.number().min(0).max(1).default(0), // 0.0825 = 8.25%
  taxCategory: z.string().max(50).optional(), // 'taxable', 'exempt', 'reduced_rate'
  
  // Total Pricing
  totalCents: z.number().int().positive('Total must be positive'),
  
  // Physical Properties
  weight: z.number().min(0).optional(), // in grams
  dimensions: z.object({
    length: z.number().min(0),    // in cm
    width: z.number().min(0),     // in cm  
    height: z.number().min(0)     // in cm
  }).optional(),
  
  // Inventory and Warehousing
  warehouseId: z.string().uuid().optional(),
  binLocation: z.string().max(50).optional(),
  serialNumbers: z.array(z.string().max(100)).default([]),
  lotNumber: z.string().max(50).optional(),
  expirationDate: z.string().datetime().optional(),
  
  // Shipping and Logistics
  requiresSpecialHandling: z.boolean().default(false),
  specialHandlingInstructions: z.string().max(500).optional(),
  isHazardous: z.boolean().default(false),
  hazardClass: z.string().max(50).optional(),
  
  // Customization and Personalization
  customizationOptions: z.record(z.string(), z.string()).default({}),
  personalizedText: z.string().max(200).optional(),
  giftWrapRequested: z.boolean().default(false),
  giftMessage: z.string().max(500).optional(),
  
  // Vendor and Sourcing (for drop-ship or special orders)
  vendorId: z.string().uuid().optional(),
  vendorSku: z.string().max(50).optional(),
  dropshipInfo: z.object({
    vendorOrderId: z.string().max(100),
    estimatedShipDate: z.string().datetime().optional(),
    trackingNumber: z.string().max(100).optional()
  }).optional(),
  
  // Return and Exchange
  isReturnable: z.boolean().default(true),
  returnPolicyDays: z.number().int().min(0).default(30),
  returnReason: z.string().max(255).optional(),
  exchangeItemId: z.string().uuid().optional(), // If this item is an exchange
  
  // Quality and Inspection
  qualityCheckRequired: z.boolean().default(false),
  qualityCheckStatus: z.enum(['pending', 'passed', 'failed', 'skipped']).default('pending'),
  qualityNotes: z.string().max(1000).optional(),
  
  // Audit and Tracking
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().optional(),
  lastModifiedBy: z.string().uuid().optional(),
  
  // Versioning
  version: z.number().int().nonnegative().default(1),
  
  // Soft Delete
  deletedAt: z.string().datetime().optional(),
  deletedBy: z.string().uuid().optional(),
});

/**
 * OrderLineItem Schema with Business Rule Validations
 */
export const OrderLineItemSchema = BaseOrderLineItemSchema.refine(data => {
  // Business Rule: Subtotal = quantity * unitPrice
  return data.subtotalCents === data.quantity * data.unitPriceCents;
}, {
  message: "Subtotal must equal quantity × unit price",
  path: ["subtotalCents"]
}).refine(data => {
  // Business Rule: Total = subtotal + tax - discount
  const expectedTotal = data.subtotalCents + data.taxCents - data.discountCents;
  return data.totalCents === expectedTotal;
}, {
  message: "Total must equal subtotal + tax - discount",
  path: ["totalCents"]
}).refine(data => {
  // Business Rule: Shipped quantity cannot exceed ordered quantity
  return data.quantityShipped <= data.quantity;
}, {
  message: "Shipped quantity cannot exceed ordered quantity",
  path: ["quantityShipped"]
}).refine(data => {
  // Business Rule: Delivered quantity cannot exceed shipped quantity
  return data.quantityDelivered <= data.quantityShipped;
}, {
  message: "Delivered quantity cannot exceed shipped quantity", 
  path: ["quantityDelivered"]
}).refine(data => {
  // Business Rule: Sum of fulfilled/cancelled quantities cannot exceed ordered
  const totalProcessed = data.quantityShipped + data.quantityCancelled;
  return totalProcessed <= data.quantity;
}, {
  message: "Sum of processed quantities cannot exceed ordered quantity",
  path: ["quantityShipped"]
}).refine(data => {
  // Business Rule: Gift message only if gift wrap requested
  return !data.giftMessage || data.giftWrapRequested;
}, {
  message: "Gift message can only be set when gift wrap is requested",
  path: ["giftMessage"]
}).refine(data => {
  // Business Rule: Hazard class only if hazardous
  return !data.hazardClass || data.isHazardous;
}, {
  message: "Hazard class can only be set for hazardous items",
  path: ["hazardClass"]
});

/**
 * TypeScript type inference from Zod schema
 */
export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;

/**
 * Schema for creating new line items
 */
export const OrderLineItemCreateSchema = BaseOrderLineItemSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  quantityShipped: true,
  quantityDelivered: true,
  quantityReturned: true,
  quantityCancelled: true
});

export type OrderLineItemCreate = z.infer<typeof OrderLineItemCreateSchema>;

/**
 * Schema for updating line items
 */
export const OrderLineItemUpdateSchema = BaseOrderLineItemSchema.partial().omit({
  id: true,
  orderId: true,
  productId: true,
  createdAt: true,
  createdBy: true
});

export type OrderLineItemUpdate = z.infer<typeof OrderLineItemUpdateSchema>;

/**
 * Schema for line item summary/list views
 */
export const OrderLineItemSummarySchema = BaseOrderLineItemSchema.pick({
  id: true,
  orderId: true,
  productId: true,
  productSku: true,
  productName: true,
  quantity: true,
  quantityShipped: true,
  status: true,
  unitPriceCents: true,
  totalCents: true,
  createdAt: true,
  updatedAt: true
});

export type OrderLineItemSummary = z.infer<typeof OrderLineItemSummarySchema>;

/**
 * Schema for line item fulfillment updates
 */
export const LineItemFulfillmentSchema = z.object({
  id: z.string().uuid(),
  status: LineItemStatus,
  quantityShipped: z.number().int().nonnegative().optional(),
  quantityDelivered: z.number().int().nonnegative().optional(),
  quantityCancelled: z.number().int().nonnegative().optional(),
  warehouseId: z.string().uuid().optional(),
  binLocation: z.string().max(50).optional(),
  serialNumbers: z.array(z.string().max(100)).optional(),
  trackingNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional()
});

export type LineItemFulfillment = z.infer<typeof LineItemFulfillmentSchema>;

/**
 * Utility Functions for OrderLineItem
 */

/**
 * Calculate line item pricing with tax and discounts
 */
export function calculateLineItemTotals(
  quantity: number,
  unitPriceCents: number,
  taxRate: number = 0,
  discountCents: number = 0
): {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
} {
  const subtotalCents = quantity * unitPriceCents;
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents - discountCents;
  
  return { subtotalCents, taxCents, totalCents };
}

/**
 * Check if line item can be cancelled
 */
export function canCancelLineItem(status: LineItemStatusType): boolean {
  const cancellableStatuses: LineItemStatusType[] = [
    'pending', 'reserved', 'allocated', 'picked', 'backordered'
  ];
  return cancellableStatuses.includes(status);
}

/**
 * Check if line item can be returned
 */
export function canReturnLineItem(
  status: LineItemStatusType,
  isReturnable: boolean,
  deliveredAt: Date,
  returnPolicyDays: number
): boolean {
  if (!isReturnable || status !== 'delivered') return false;
  
  const daysSinceDelivery = (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceDelivery <= returnPolicyDays;
}

/**
 * Get valid status transitions for line item
 */
export function getValidLineItemStatusTransitions(currentStatus: LineItemStatusType): LineItemStatusType[] {
  const transitions: Record<LineItemStatusType, LineItemStatusType[]> = {
    'pending': ['reserved', 'cancelled', 'backordered'],
    'reserved': ['allocated', 'cancelled', 'backordered'],
    'allocated': ['picked', 'cancelled'],
    'picked': ['packed', 'cancelled'],
    'packed': ['shipped'],
    'shipped': ['delivered', 'damaged', 'missing'],
    'delivered': ['returned', 'exchanged'],
    'backordered': ['reserved', 'cancelled'],
    'cancelled': [], // Terminal
    'returned': ['exchanged'], 
    'exchanged': [], // Terminal
    'damaged': ['returned', 'exchanged'],
    'missing': ['returned', 'exchanged']
  };
  
  return transitions[currentStatus] || [];
}

/**
 * Validate line item status transition
 */
export function isValidLineItemStatusTransition(
  from: LineItemStatusType,
  to: LineItemStatusType
): boolean {
  const validTransitions = getValidLineItemStatusTransitions(from);
  return validTransitions.includes(to);
}

/**
 * Calculate fulfillment completion percentage
 */
export function calculateFulfillmentPercentage(lineItem: OrderLineItem): number {
  const totalFulfilled = lineItem.quantityDelivered + lineItem.quantityReturned;
  return Math.round((totalFulfilled / lineItem.quantity) * 100);
}

/**
 * Get remaining quantity to fulfill
 */
export function getRemainingQuantity(lineItem: OrderLineItem): number {
  const processed = lineItem.quantityShipped + lineItem.quantityCancelled;
  return Math.max(0, lineItem.quantity - processed);
}

/**
 * Apply discount to line item
 */
export function applyDiscount(
  lineItem: OrderLineItem,
  discountCents: number,
  discountReason?: string,
  couponCode?: string
): Partial<OrderLineItem> {
  const newTotalCents = lineItem.subtotalCents + lineItem.taxCents - discountCents;
  
  return {
    discountCents,
    discountPercent: Math.round((discountCents / lineItem.subtotalCents) * 10000) / 100, // 2 decimal places
    discountReason,
    couponCode,
    totalCents: Math.max(0, newTotalCents) // Ensure total doesn't go negative
  };
}