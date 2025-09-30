/**
 * Inventory Service
 * Business logic layer for real-time stock management, reservation handling, and inventory validation
 * 
 * Handles stock checking, inventory reservations, stock adjustments, and availability validation
 * with support for multiple inventory management strategies and concurrent order processing
 */

import { ProductRepository } from '../repositories/ProductRepository.js';
import type { Product } from '../models/Product.js';

/**
 * Inventory Reservation Interface
 */
export interface InventoryReservation {
  id?: string;
  productId: string;
  orderId?: string;
  customerId?: string;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
  status: 'active' | 'fulfilled' | 'expired' | 'cancelled';
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Stock Availability Check Result
 */
export interface StockAvailability {
  productId: string;
  available: boolean;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  requestedQuantity: number;
  shortfall?: number;
  estimatedRestockDate?: Date;
  alternativeProducts?: string[];
}

/**
 * Inventory Adjustment Request
 */
export interface InventoryAdjustment {
  productId: string;
  adjustmentType: 'increase' | 'decrease' | 'set';
  quantity: number;
  reason: string;
  adjustedBy: string;
  reference?: string; // Order ID, PO number, etc.
  metadata?: Record<string, any>;
}

/**
 * Inventory Adjustment Result
 */
export interface InventoryAdjustmentResult {
  success: boolean;
  productId: string;
  previousStock: number;
  newStock: number;
  adjustmentId?: string;
  error?: string;
}

/**
 * Bulk Stock Check Request
 */
export interface BulkStockCheckRequest {
  items: {
    productId: string;
    quantity: number;
  }[];
  reserveStock?: boolean;
  reservationTtl?: number; // Minutes
  orderId?: string;
  customerId?: string;
}

/**
 * Bulk Stock Check Result
 */
export interface BulkStockCheckResult {
  success: boolean;
  allAvailable: boolean;
  items: StockAvailability[];
  reservations?: InventoryReservation[];
  totalShortfall: number;
  suggestions?: {
    alternativeProducts?: Array<{
      originalProductId: string;
      alternatives: string[];
    }>;
    partialFulfillment?: Array<{
      productId: string;
      availableQuantity: number;
    }>;
  };
}

/**
 * Low Stock Alert Configuration
 */
export interface LowStockAlert {
  productId: string;
  productName: string;
  currentStock: number;
  lowStockThreshold: number;
  outOfStockThreshold: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  lastOrderedAt?: Date;
  averageDailySales?: number;
  daysOfStockRemaining?: number;
}

/**
 * Inventory Service Errors
 */
export class InventoryServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'InventoryServiceError';
  }
}

export class InsufficientStockError extends InventoryServiceError {
  constructor(productId: string, requested: number, available: number) {
    super(
      `Insufficient stock for product ${productId}. Requested: ${requested}, Available: ${available}`,
      'INSUFFICIENT_STOCK',
      { productId, requested, available }
    );
  }
}

export class ProductNotFoundError extends InventoryServiceError {
  constructor(productId: string) {
    super(
      `Product not found: ${productId}`,
      'PRODUCT_NOT_FOUND',
      { productId }
    );
  }
}

export class ReservationNotFoundError extends InventoryServiceError {
  constructor(reservationId: string) {
    super(
      `Reservation not found: ${reservationId}`,
      'RESERVATION_NOT_FOUND',
      { reservationId }
    );
  }
}

/**
 * Inventory Service Implementation
 */
export class InventoryService {
  private static reservations: Map<string, InventoryReservation> = new Map();
  private static reservationCounter = 1;

  /**
   * Check stock availability for a single product
   */
  static async checkStockAvailability(productId: string, quantity: number): Promise<StockAvailability> {
    const product = await ProductRepository.findById(productId);
    
    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    // For products without tracked inventory, they're always available
    if (product.inventoryManagement !== 'tracked') {
      return {
        productId,
        available: true,
        currentStock: Infinity,
        availableStock: Infinity,
        reservedStock: 0,
        requestedQuantity: quantity
      };
    }

    const available = product.availableStock >= quantity;
    const shortfall = available ? 0 : quantity - product.availableStock;

    return {
      productId,
      available,
      currentStock: product.currentStock,
      availableStock: product.availableStock,
      reservedStock: product.reservedStock,
      requestedQuantity: quantity,
      ...(shortfall > 0 && { shortfall }),
      // TODO: Add estimated restock date logic
      // estimatedRestockDate: await this.estimateRestockDate(productId),
      // alternativeProducts: await this.findAlternativeProducts(productId)
    };
  }

  /**
   * Check stock availability for multiple products at once
   */
  static async checkBulkStockAvailability(request: BulkStockCheckRequest): Promise<BulkStockCheckResult> {
    const results: StockAvailability[] = [];
    let totalShortfall = 0;
    let allAvailable = true;

    // Check availability for each item
    for (const item of request.items) {
      try {
        const availability = await this.checkStockAvailability(item.productId, item.quantity);
        results.push(availability);
        
        if (!availability.available) {
          allAvailable = false;
          totalShortfall += availability.shortfall || 0;
        }
      } catch (error) {
        allAvailable = false;
        results.push({
          productId: item.productId,
          available: false,
          currentStock: 0,
          availableStock: 0,
          reservedStock: 0,
          requestedQuantity: item.quantity,
          shortfall: item.quantity
        });
        totalShortfall += item.quantity;
      }
    }

    let reservations: InventoryReservation[] | undefined;

    // Create reservations if requested and all items are available
    if (request.reserveStock && allAvailable) {
      reservations = [];
      
      for (const item of request.items) {
        try {
          const reservation = await this.createReservation({
            productId: item.productId,
            quantity: item.quantity,
            ...(request.orderId && { orderId: request.orderId }),
            ...(request.customerId && { customerId: request.customerId }),
            ttlMinutes: request.reservationTtl || 30,
            reason: 'Order processing reservation'
          });
          
          if (reservation) {
            reservations.push(reservation);
          }
        } catch (error) {
          // If we can't create all reservations, cancel the ones we did create
          for (const existingReservation of reservations) {
            await this.cancelReservation(existingReservation.id!);
          }
          
          allAvailable = false;
          reservations = undefined;
          break;
        }
      }
    }

    const result: BulkStockCheckResult = {
      success: allAvailable || totalShortfall === 0,
      allAvailable,
      items: results,
      totalShortfall
    };

    if (reservations) {
      result.reservations = reservations;
    }

    if (!allAvailable) {
      const suggestions = await this.generateStockSuggestions(results);
      if (suggestions) {
        result.suggestions = suggestions;
      }
    }

    return result;
  }

  /**
   * Create inventory reservation
   */
  static async createReservation(request: {
    productId: string;
    quantity: number;
    orderId?: string;
    customerId?: string;
    ttlMinutes?: number;
    reason: string;
    metadata?: Record<string, any>;
  }): Promise<InventoryReservation | null> {
    const product = await ProductRepository.findById(request.productId);
    
    if (!product) {
      throw new ProductNotFoundError(request.productId);
    }

    // Check if we can reserve the requested quantity
    if (product.inventoryManagement === 'tracked' && product.availableStock < request.quantity) {
      throw new InsufficientStockError(request.productId, request.quantity, product.availableStock);
    }

    const reservationId = `res_${Date.now()}_${this.reservationCounter++}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (request.ttlMinutes || 30) * 60 * 1000);

    const reservationBase = {
      id: reservationId,
      productId: request.productId,
      quantity: request.quantity,
      reservedAt: now,
      expiresAt,
      status: 'active' as const,
      reason: request.reason
    };

    const reservation: InventoryReservation = {
      ...reservationBase,
      ...(request.orderId && { orderId: request.orderId }),
      ...(request.customerId && { customerId: request.customerId }),
      ...(request.metadata && { metadata: request.metadata })
    };

    // Update product reserved stock
    if (product.inventoryManagement === 'tracked') {
      await ProductRepository.updateInventory(request.productId, {
        reservedStock: product.reservedStock + request.quantity,
        reason: `Reservation ${reservationId}: ${request.reason}`
      });
    }

    // Store reservation
    this.reservations.set(reservationId, reservation);

    // Schedule expiration cleanup
    setTimeout(() => {
      this.expireReservation(reservationId);
    }, (request.ttlMinutes || 30) * 60 * 1000);

    return reservation;
  }

  /**
   * Fulfill inventory reservation (convert to actual stock reduction)
   */
  static async fulfillReservation(reservationId: string, actualQuantity?: number): Promise<boolean> {
    const reservation = this.reservations.get(reservationId);
    
    if (!reservation) {
      throw new ReservationNotFoundError(reservationId);
    }

    if (reservation.status !== 'active') {
      throw new InventoryServiceError(
        `Cannot fulfill reservation ${reservationId} with status: ${reservation.status}`,
        'INVALID_RESERVATION_STATUS'
      );
    }

    const quantityToFulfill = actualQuantity || reservation.quantity;
    const product = await ProductRepository.findById(reservation.productId);
    
    if (!product) {
      throw new ProductNotFoundError(reservation.productId);
    }

    // Update inventory: reduce current stock, reduce reserved stock
    if (product.inventoryManagement === 'tracked') {
      await ProductRepository.updateInventory(reservation.productId, {
        adjustment: -quantityToFulfill,
        reservedStock: Math.max(0, product.reservedStock - reservation.quantity),
        reason: `Fulfilled reservation ${reservationId}`
      });
    }

    // Mark reservation as fulfilled
    reservation.status = 'fulfilled';
    this.reservations.set(reservationId, reservation);

    // If partial fulfillment, create a new reservation for the remaining quantity
    if (actualQuantity && actualQuantity < reservation.quantity) {
      const remainingQuantity = reservation.quantity - actualQuantity;
      
      try {
        const remainderRequest = {
          productId: reservation.productId,
          quantity: remainingQuantity,
          ttlMinutes: 30,
          reason: `Partial fulfillment remainder from ${reservationId}`,
          ...(reservation.orderId && { orderId: reservation.orderId }),
          ...(reservation.customerId && { customerId: reservation.customerId }),
          ...(reservation.metadata && { metadata: reservation.metadata })
        };
        
        await this.createReservation(remainderRequest);
      } catch (error) {
        // Log error but don't fail the fulfillment
        console.error(`Failed to create remainder reservation:`, error);
      }
    }

    return true;
  }

  /**
   * Cancel inventory reservation
   */
  static async cancelReservation(reservationId: string): Promise<boolean> {
    const reservation = this.reservations.get(reservationId);
    
    if (!reservation) {
      throw new ReservationNotFoundError(reservationId);
    }

    if (reservation.status === 'fulfilled') {
      throw new InventoryServiceError(
        `Cannot cancel fulfilled reservation ${reservationId}`,
        'RESERVATION_ALREADY_FULFILLED'
      );
    }

    const product = await ProductRepository.findById(reservation.productId);
    
    if (product && product.inventoryManagement === 'tracked') {
      // Release reserved stock
      await ProductRepository.updateInventory(reservation.productId, {
        reservedStock: Math.max(0, product.reservedStock - reservation.quantity),
        reason: `Cancelled reservation ${reservationId}`
      });
    }

    // Mark reservation as cancelled
    reservation.status = 'cancelled';
    this.reservations.set(reservationId, reservation);

    return true;
  }

  /**
   * Adjust inventory levels
   */
  static async adjustInventory(adjustment: InventoryAdjustment): Promise<InventoryAdjustmentResult> {
    const product = await ProductRepository.findById(adjustment.productId);
    
    if (!product) {
      throw new ProductNotFoundError(adjustment.productId);
    }

    if (product.inventoryManagement !== 'tracked') {
      return {
        success: false,
        productId: adjustment.productId,
        previousStock: 0,
        newStock: 0,
        error: 'Product does not have tracked inventory'
      };
    }

    const previousStock = product.currentStock;
    let newStock: number;

    switch (adjustment.adjustmentType) {
      case 'increase':
        newStock = previousStock + adjustment.quantity;
        break;
      case 'decrease':
        newStock = Math.max(0, previousStock - adjustment.quantity);
        break;
      case 'set':
        newStock = adjustment.quantity;
        break;
    }

    // Update product inventory
    const updatedProduct = await ProductRepository.updateInventory(adjustment.productId, {
      currentStock: newStock,
      reason: adjustment.reason,
      updatedBy: adjustment.adjustedBy
    });

    if (!updatedProduct) {
      return {
        success: false,
        productId: adjustment.productId,
        previousStock,
        newStock: previousStock,
        error: 'Failed to update inventory'
      };
    }

    const adjustmentId = `adj_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

    return {
      success: true,
      productId: adjustment.productId,
      previousStock,
      newStock,
      adjustmentId
    };
  }

  /**
   * Get low stock alerts
   */
  static async getLowStockAlerts(): Promise<LowStockAlert[]> {
    const lowStockProducts = await ProductRepository.findLowStockProducts();
    
    const alerts: LowStockAlert[] = lowStockProducts.map(product => {
      const alert: LowStockAlert = {
        productId: product.id,
        productName: product.name,
        currentStock: product.currentStock,
        lowStockThreshold: product.lowStockThreshold,
        outOfStockThreshold: product.outOfStockThreshold
      };

      if (product.reorderPoint !== undefined) {
        alert.reorderPoint = product.reorderPoint;
      }

      if (product.reorderQuantity !== undefined) {
        alert.reorderQuantity = product.reorderQuantity;
      }

      return alert;
    });

    return alerts;
  }

  /**
   * Get products that need reordering
   */
  static async getReorderAlerts(): Promise<LowStockAlert[]> {
    const reorderProducts = await ProductRepository.findProductsNeedingReorder();
    
    return reorderProducts.map(product => {
      const alert: LowStockAlert = {
        productId: product.id,
        productName: product.name,
        currentStock: product.currentStock,
        lowStockThreshold: product.lowStockThreshold,
        outOfStockThreshold: product.outOfStockThreshold,
        reorderPoint: product.reorderPoint!
      };

      if (product.reorderQuantity !== undefined) {
        alert.reorderQuantity = product.reorderQuantity;
      }

      return alert;
    });
  }

  /**
   * Get out of stock products
   */
  static async getOutOfStockProducts(): Promise<Product[]> {
    return ProductRepository.findOutOfStockProducts();
  }

  /**
   * Get active reservations for a product
   */
  static getActiveReservations(productId: string): InventoryReservation[] {
    const activeReservations: InventoryReservation[] = [];
    
    for (const reservation of this.reservations.values()) {
      if (reservation.productId === productId && 
          reservation.status === 'active' && 
          reservation.expiresAt > new Date()) {
        activeReservations.push(reservation);
      }
    }
    
    return activeReservations;
  }

  /**
   * Get inventory statistics
   */
  static async getInventoryStats(): Promise<{
    totalProducts: number;
    trackedProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    needReorderProducts: number;
    totalInventoryValue: number;
    activeReservations: number;
    totalReservedStock: number;
  }> {
    const [stats, lowStock, outOfStock, needReorder] = await Promise.all([
      ProductRepository.getStats(),
      ProductRepository.findLowStockProducts(),
      ProductRepository.findOutOfStockProducts(),
      ProductRepository.findProductsNeedingReorder()
    ]);

    const activeReservations = Array.from(this.reservations.values())
      .filter(r => r.status === 'active' && r.expiresAt > new Date());

    const totalReservedStock = activeReservations.reduce((sum, r) => sum + r.quantity, 0);

    return {
      totalProducts: stats.totalProducts,
      trackedProducts: stats.totalProducts, // Assuming all products are tracked for now
      lowStockProducts: lowStock.length,
      outOfStockProducts: outOfStock.length,
      needReorderProducts: needReorder.length,
      totalInventoryValue: stats.totalInventoryValue,
      activeReservations: activeReservations.length,
      totalReservedStock
    };
  }

  // Private helper methods

  /**
   * Expire a reservation
   */
  private static async expireReservation(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    
    if (reservation && reservation.status === 'active') {
      try {
        await this.cancelReservation(reservationId);
        reservation.status = 'expired';
        console.log(`Reservation ${reservationId} expired and released`);
      } catch (error) {
        console.error(`Error expiring reservation ${reservationId}:`, error);
      }
    }
  }

  /**
   * Generate stock availability suggestions
   */
  private static async generateStockSuggestions(results: StockAvailability[]): Promise<BulkStockCheckResult['suggestions']> {
    const partialFulfillment = results
      .filter(r => !r.available && r.availableStock > 0)
      .map(r => ({
        productId: r.productId,
        availableQuantity: r.availableStock
      }));

    const result: BulkStockCheckResult['suggestions'] = {};

    if (partialFulfillment.length > 0) {
      result.partialFulfillment = partialFulfillment;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Clean up expired reservations (should be run periodically)
   */
  static async cleanupExpiredReservations(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [id, reservation] of this.reservations.entries()) {
      if (reservation.status === 'active' && reservation.expiresAt <= now) {
        try {
          await this.expireReservation(id);
          cleanedCount++;
        } catch (error) {
          console.error(`Error cleaning up reservation ${id}:`, error);
        }
      }
    }

    return cleanedCount;
  }
}