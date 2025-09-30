import { z } from 'zod';

/**
 * Inventory Model with Zod Validation
 * 
 * Defines inventory management data structures for the retail microservice.
 */

// Inventory item schema
export const InventoryItemSchema = z.object({
  productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/, 'Invalid product ID format'),
  productName: z.string().min(1).max(255),
  productSku: z.string().min(1).max(100),
  category: z.string().min(1).max(100),
  
  // Stock levels
  stockQuantity: z.number().int().min(0, 'Stock quantity cannot be negative'),
  reservedQuantity: z.number().int().min(0, 'Reserved quantity cannot be negative').default(0),
  availableQuantity: z.number().int().min(0, 'Available quantity cannot be negative'),
  
  // Reorder management
  reorderLevel: z.number().int().min(0).default(10),
  reorderQuantity: z.number().int().min(1).default(100),
  maxStockLevel: z.number().int().min(1).default(1000),
  
  // Supplier information
  supplierId: z.string().regex(/^sup_[a-zA-Z0-9_]+$/).optional(),
  supplierSku: z.string().max(100).optional(),
  leadTimeDays: z.number().int().min(0).default(7),
  
  // Pricing
  costPrice: z.number().min(0).multipleOf(0.01).optional(),
  sellingPrice: z.number().min(0).multipleOf(0.01),
  
  // Physical attributes
  weight: z.number().min(0).optional(),
  dimensions: z.object({
    length: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0),
    unit: z.enum(['cm', 'in']).default('cm')
  }).optional(),
  
  // Status
  isActive: z.boolean().default(true),
  isTrackingEnabled: z.boolean().default(true),
  
  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastStockUpdate: z.string().datetime().optional()
}).refine(
  (item) => item.availableQuantity === (item.stockQuantity - item.reservedQuantity),
  { message: 'Available quantity must equal stock quantity minus reserved quantity' }
).refine(
  (item) => item.reorderLevel < item.maxStockLevel,
  { message: 'Reorder level must be less than max stock level' }
);

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

// Stock update request schema
export const StockUpdateRequestSchema = z.object({
  productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/, 'Invalid product ID format'),
  quantityChange: z.number().int(), // Can be positive (restock) or negative (sale/damage)
  reason: z.enum([
    'sale',
    'return', 
    'restock',
    'adjustment',
    'damaged',
    'expired',
    'theft',
    'transfer',
    'initial_stock'
  ]),
  referenceId: z.string().optional(), // Order ID, transfer ID, etc.
  notes: z.string().max(500).optional(),
  updatedBy: z.string().min(1).max(100)
});

export type StockUpdateRequest = z.infer<typeof StockUpdateRequestSchema>;

// Stock update result schema
export const StockUpdateResultSchema = z.object({
  productId: z.string(),
  previousStockLevel: z.number().int(),
  newStockLevel: z.number().int(),
  quantityChange: z.number().int(),
  success: z.boolean(),
  timestamp: z.string().datetime(),
  auditId: z.string().optional()
});

export type StockUpdateResult = z.infer<typeof StockUpdateResultSchema>;

// Inventory reservation schema
export const InventoryReservationSchema = z.object({
  id: z.string().regex(/^res_[a-zA-Z0-9]+$/).optional(),
  orderId: z.string().regex(/^ord_[a-zA-Z0-9]+$/, 'Invalid order ID format'),
  customerId: z.string().regex(/^cust_[a-zA-Z0-9]+$/, 'Invalid customer ID format'),
  items: z.array(z.object({
    productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/),
    quantity: z.number().int().min(1),
    reservedAt: z.string().datetime(),
    expiresAt: z.string().datetime()
  })).min(1),
  status: z.enum(['active', 'fulfilled', 'expired', 'cancelled']).default('active'),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(), // Overall reservation expiry
  fulfilledAt: z.string().datetime().optional(),
  cancelledAt: z.string().datetime().optional()
});

export type InventoryReservation = z.infer<typeof InventoryReservationSchema>;

// Inventory audit log schema
export const InventoryAuditSchema = z.object({
  id: z.string().regex(/^audit_[a-zA-Z0-9]+$/).optional(),
  productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/),
  changeType: z.enum([
    'stock_adjustment',
    'sale',
    'return',
    'restock',
    'reservation',
    'release_reservation',
    'transfer_in',
    'transfer_out',
    'write_off'
  ]),
  quantityChange: z.number().int(),
  previousQuantity: z.number().int(),
  newQuantity: z.number().int(),
  reason: z.string().max(200),
  referenceId: z.string().optional(),
  userId: z.string().min(1).max(100),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string()).optional()
});

export type InventoryAudit = z.infer<typeof InventoryAuditSchema>;

// Low stock alert schema
export const LowStockAlertSchema = z.object({
  productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/),
  productName: z.string(),
  currentStock: z.number().int(),
  reorderLevel: z.number().int(),
  reorderQuantity: z.number().int(),
  supplierId: z.string().optional(),
  leadTimeDays: z.number().int(),
  estimatedStockoutDate: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  alertCreatedAt: z.string().datetime()
});

export type LowStockAlert = z.infer<typeof LowStockAlertSchema>;

// Inventory valuation schema
export const InventoryValuationSchema = z.object({
  category: z.string(),
  totalValue: z.number().multipleOf(0.01),
  itemCount: z.number().int(),
  averageValue: z.number().multipleOf(0.01),
  lastUpdated: z.string().datetime()
});

export type InventoryValuation = z.infer<typeof InventoryValuationSchema>;

// Inventory movement history schema
export const InventoryMovementSchema = z.object({
  date: z.string().date(),
  changeType: z.string(),
  quantityChange: z.number().int(),
  reason: z.string(),
  runningBalance: z.number().int(),
  referenceId: z.string().optional()
});

export type InventoryMovement = z.infer<typeof InventoryMovementSchema>;

// Reorder suggestion schema
export const ReorderSuggestionSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  currentStock: z.number().int(),
  reorderLevel: z.number().int(),
  suggestedOrderQuantity: z.number().int(),
  dailySalesRate: z.number().min(0),
  leadTimeDays: z.number().int(),
  estimatedStockoutDays: z.number().int(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  supplierId: z.string().optional(),
  estimatedCost: z.number().multipleOf(0.01).optional()
});

export type ReorderSuggestion = z.infer<typeof ReorderSuggestionSchema>;

/**
 * Inventory validation and utility functions
 */
export class InventoryValidator {
  /**
   * Validate stock update request
   */
  static validateStockUpdate(data: unknown): { success: true; data: StockUpdateRequest } | { success: false; error: z.ZodError } {
    const result = StockUpdateRequestSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Validate inventory item data
   */
  static validateInventoryItem(data: unknown): { success: true; data: InventoryItem } | { success: false; error: z.ZodError } {
    const result = InventoryItemSchema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
  }

  /**
   * Check if stock level is sufficient for order
   */
  static checkStockAvailability(availableQuantity: number, requestedQuantity: number): boolean {
    return availableQuantity >= requestedQuantity;
  }

  /**
   * Calculate reorder priority based on stock levels and sales velocity
   */
  static calculateReorderPriority(
    currentStock: number, 
    reorderLevel: number, 
    dailySalesRate: number, 
    leadTimeDays: number
  ): 'low' | 'medium' | 'high' | 'urgent' {
    const daysUntilStockout = dailySalesRate > 0 ? currentStock / dailySalesRate : Infinity;
    
    if (currentStock <= 0) return 'urgent';
    if (daysUntilStockout <= leadTimeDays) return 'urgent';
    if (currentStock <= reorderLevel * 0.5) return 'high';
    if (currentStock <= reorderLevel) return 'medium';
    return 'low';
  }

  /**
   * Calculate suggested reorder quantity
   */
  static calculateReorderQuantity(
    currentStock: number,
    reorderLevel: number,
    maxStockLevel: number,
    dailySalesRate: number,
    leadTimeDays: number
  ): number {
    // Calculate stock needed for lead time + buffer
    const leadTimeStock = Math.ceil(dailySalesRate * leadTimeDays);
    const bufferStock = Math.ceil(leadTimeStock * 0.2); // 20% buffer
    const targetStock = Math.min(leadTimeStock + bufferStock, maxStockLevel);
    
    return Math.max(0, targetStock - currentStock);
  }

  /**
   * Validate that stock update won't result in negative inventory
   */
  static validateStockChange(currentStock: number, quantityChange: number): boolean {
    return (currentStock + quantityChange) >= 0;
  }

  /**
   * Generate reservation ID
   */
  static generateReservationId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `res_${timestamp}_${random}`;
  }

  /**
   * Generate audit ID
   */
  static generateAuditId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `audit_${timestamp}_${random}`;
  }

  /**
   * Calculate inventory turnover rate
   */
  static calculateTurnoverRate(soldQuantity: number, averageStock: number, periodDays: number): number {
    if (averageStock <= 0) return 0;
    const dailyTurnover = soldQuantity / periodDays;
    return (dailyTurnover * 365) / averageStock; // Annual turnover
  }

  /**
   * Check if item needs reordering
   */
  static needsReordering(currentStock: number, reorderLevel: number, reservedQuantity: number = 0): boolean {
    const effectiveStock = currentStock - reservedQuantity;
    return effectiveStock <= reorderLevel;
  }

  /**
   * Calculate days until stockout
   */
  static calculateDaysUntilStockout(currentStock: number, dailySalesRate: number): number | null {
    if (dailySalesRate <= 0) return null;
    return Math.floor(currentStock / dailySalesRate);
  }

  /**
   * Validate reservation expiry time
   */
  static validateReservationExpiry(expiresAt: string): boolean {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    return expiryDate > now;
  }

  /**
   * Calculate inventory value
   */
  static calculateInventoryValue(items: Array<{ quantity: number; costPrice?: number }>): number {
    return items.reduce((total, item) => {
      const cost = item.costPrice || 0;
      return total + (item.quantity * cost);
    }, 0);
  }

  /**
   * Check if stock adjustment reason is valid for quantity change
   */
  static isValidAdjustmentReason(quantityChange: number, reason: string): boolean {
    const positiveReasons = ['return', 'restock', 'adjustment', 'transfer', 'initial_stock'];
    const negativeReasons = ['sale', 'adjustment', 'damaged', 'expired', 'theft', 'transfer'];
    
    if (quantityChange > 0) {
      return positiveReasons.includes(reason);
    } else if (quantityChange < 0) {
      return negativeReasons.includes(reason);
    }
    
    return reason === 'adjustment'; // Zero change only valid for adjustments
  }
}