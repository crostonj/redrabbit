import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { RepositoryFactory } from '../repositories/index.js';
import { RepositoryService } from '../repositories/index.js';
import { OrderStatus } from '../repositories/interfaces.js';
import { formatValidationError } from '../utils/validation.js';

/**
 * Order Controller - HTTP Request/Response Layer (Repository Pattern)
 * 
 * Updated to use repository pattern for data access:
 * - POST /orders - Create new order with validation
 * - GET /orders/:id - Get order by ID with full details
 * - PUT /orders/:id - Update order
 * - DELETE /orders/:id - Cancel order
 * - GET /orders - List orders with filtering and pagination
 * - PUT /orders/:id/status - Update order status
 * - GET /orders/stats - Order statistics and analytics
 */

// Request validation schemas using repository types
const CreateOrderRequestSchema = z.object({
  customerId: z.string().uuid('Customer ID must be a valid UUID'),
  items: z.array(z.object({
    productId: z.string().uuid('Product ID must be a valid UUID'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0.01, 'Unit price must be greater than 0').multipleOf(0.01)
  })).min(1, 'Order must contain at least one item'),
  shippingAddressId: z.string().uuid('Shipping address ID must be a valid UUID'),
  billingAddressId: z.string().uuid('Billing address ID must be a valid UUID'),
  paymentMethod: z.enum(['credit_card', 'debit_card', 'bank_transfer', 'paypal']),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional()
});

const UpdateOrderRequestSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid('Product ID must be a valid UUID'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0.01, 'Unit price must be greater than 0').multipleOf(0.01)
  })).optional(),
  shippingAddressId: z.string().uuid('Shipping address ID must be a valid UUID').optional(),
  billingAddressId: z.string().uuid('Billing address ID must be a valid UUID').optional(),
  paymentMethod: z.enum(['credit_card', 'debit_card', 'bank_transfer', 'paypal']).optional(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional()
});

const UpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus, { errorMap: () => ({ message: 'Invalid order status' }) }),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional()
});

const OrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'totalAmount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  customerId: z.string().uuid('Customer ID must be a valid UUID').optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  minTotal: z.coerce.number().min(0, 'Minimum total must be non-negative').optional(),
  maxTotal: z.coerce.number().min(0, 'Maximum total must be non-negative').optional(),
  dateFrom: z.string().datetime('Invalid date format').optional(),
  dateTo: z.string().datetime('Invalid date format').optional()
});

export class OrderController {
  private repositoryFactory: RepositoryFactory;
  private repositoryService: RepositoryService;

  constructor(repositoryFactory: RepositoryFactory) {
    this.repositoryFactory = repositoryFactory;
    this.repositoryService = new RepositoryService(repositoryFactory);
  }

  /**
   * Create a new order with comprehensive validation
   * POST /orders
   */
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const validation = CreateOrderRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const orderData = validation.data;

      // Create order through repository service with full validation
      const orderCreateData: any = {
        customerId: orderData.customerId,
        items: orderData.items,
        shippingAddressId: orderData.shippingAddressId,
        billingAddressId: orderData.billingAddressId,
        paymentMethod: orderData.paymentMethod
      };

      // Only add notes if provided
      if (orderData.notes) {
        orderCreateData.notes = orderData.notes;
      }

      const order = await this.repositoryService.createOrderWithValidation(orderCreateData);

      res.status(201).json({
        success: true,
        data: {
          order,
          message: 'Order created successfully'
        }
      });

    } catch (error: any) {
      // Handle specific repository errors
      if (error.message.includes('Customer') && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Customer not found',
          message: error.message
        });
        return;
      }

      if (error.message.includes('Product') && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
          message: error.message
        });
        return;
      }

      if (error.message.includes('Insufficient stock')) {
        res.status(400).json({
          success: false,
          error: 'Insufficient inventory',
          message: error.message
        });
        return;
      }

      if (error.message.includes('Invalid') && error.message.includes('address')) {
        res.status(400).json({
          success: false,
          error: 'Invalid address',
          message: error.message
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Get order by ID with comprehensive details
   * GET /orders/:id
   */
  async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;
      
      // Validate parameter exists and is string
      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ORDER_ID',
          message: 'Order ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(orderId).success) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format',
          message: 'Order ID must be a valid UUID'
        });
        return;
      }

      // Get comprehensive order details through repository service
      const orderDetails = await this.repositoryService.getOrderDetails(orderId);

      if (!orderDetails) {
        res.status(404).json({
          success: false,
          error: 'Order not found',
          message: `Order with ID ${orderId} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: orderDetails
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update order details
   * PUT /orders/:id
   */
  async updateOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;
      
      // Validate parameter exists and is string
      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ORDER_ID',
          message: 'Order ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(orderId).success) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format',
          message: 'Order ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateOrderRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const updateData = validation.data;
      const orderRepo = this.repositoryFactory.getOrderRepository();

      // Check if order exists and can be updated
      const existingOrder = await orderRepo.findById(orderId);
      if (!existingOrder) {
        res.status(404).json({
          success: false,
          error: 'Order not found',
          message: `Order with ID ${orderId} not found`
        });
        return;
      }

      // Check if order can be modified based on status
      if ([OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED].includes(existingOrder.status)) {
        res.status(400).json({
          success: false,
          error: 'Order cannot be modified',
          message: `Orders with status '${existingOrder.status}' cannot be modified`
        });
        return;
      }

      // Build update object with only provided fields
      const updateOrderData: any = {};
      
      if (updateData.shippingAddressId) {
        updateOrderData.shippingAddressId = updateData.shippingAddressId;
      }
      
      if (updateData.billingAddressId) {
        updateOrderData.billingAddressId = updateData.billingAddressId;
      }
      
      if (updateData.paymentMethod) {
        updateOrderData.paymentMethod = updateData.paymentMethod;
      }
      
      if (updateData.notes !== undefined) {
        updateOrderData.notes = updateData.notes;
      }

      // Update order
      await orderRepo.update(orderId, updateOrderData);

      // Handle order items update if provided
      if (updateData.items && updateData.items.length > 0) {
        // Remove existing items
        const existingItems = await orderRepo.getItems(orderId);
        for (const item of existingItems) {
          await orderRepo.removeItem(orderId, item.id);
        }

        // Add new items
        for (const itemData of updateData.items) {
          await orderRepo.addItem(orderId, {
            productId: itemData.productId,
            quantity: itemData.quantity,
            unitPrice: itemData.unitPrice
          });
        }

        // Recalculate totals
        await orderRepo.recalculateTotals(orderId);
      }

      // Get updated order details
      const orderDetails = await this.repositoryService.getOrderDetails(orderId);

      res.status(200).json({
        success: true,
        data: {
          order: orderDetails,
          message: 'Order updated successfully'
        }
      });

    } catch (error: any) {
      if (error.message.includes('Product') && error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
          message: error.message
        });
        return;
      }

      if (error.message.includes('address')) {
        res.status(400).json({
          success: false,
          error: 'Invalid address',
          message: error.message
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Update order status
   * PUT /orders/:id/status
   */
  async updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;
      
      // Validate parameter exists and is string
      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ORDER_ID',
          message: 'Order ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(orderId).success) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format',
          message: 'Order ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateOrderStatusSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const { status, notes } = validation.data;
      const orderRepo = this.repositoryFactory.getOrderRepository();

      // Update order status
      const updatedOrder = await orderRepo.updateStatus(orderId, status, notes);

      if (!updatedOrder) {
        res.status(404).json({
          success: false,
          error: 'Order not found',
          message: `Order with ID ${orderId} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          order: updatedOrder,
          message: `Order status updated to ${status}`
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel order
   * DELETE /orders/:id
   */
  async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.id;
      
      // Validate parameter exists and is string
      if (!orderId || typeof orderId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ORDER_ID',
          message: 'Order ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(orderId).success) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format',
          message: 'Order ID must be a valid UUID'
        });
        return;
      }

      const orderRepo = this.repositoryFactory.getOrderRepository();

      // Check if order exists and can be cancelled
      const existingOrder = await orderRepo.findById(orderId);
      if (!existingOrder) {
        res.status(404).json({
          success: false,
          error: 'Order not found',
          message: `Order with ID ${orderId} not found`
        });
        return;
      }

      // Check if order can be cancelled
      if ([OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED].includes(existingOrder.status)) {
        res.status(400).json({
          success: false,
          error: 'Order cannot be cancelled',
          message: `Orders with status '${existingOrder.status}' cannot be cancelled`
        });
        return;
      }

      // Mark as cancelled
      const cancelledOrder = await orderRepo.markAsCancelled(orderId, 'Cancelled by user request');

      res.status(200).json({
        success: true,
        data: {
          order: cancelledOrder,
          message: 'Order cancelled successfully'
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * List orders with filtering and pagination
   * GET /orders
   */
  async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate query parameters
      const validation = OrderQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const queryParams = validation.data;
      const orderRepo = this.repositoryFactory.getOrderRepository();

      // Build search options
      const searchOptions: any = {
        page: queryParams.page,
        limit: queryParams.limit,
        sortBy: queryParams.sortBy,
        sortOrder: queryParams.sortOrder
      };

      // Add filters if provided
      const filters: any = {};
      
      if (queryParams.customerId) {
        filters.customerId = queryParams.customerId;
      }
      
      if (queryParams.status) {
        filters.status = queryParams.status;
      }
      
      if (queryParams.minTotal !== undefined || queryParams.maxTotal !== undefined) {
        filters.totalAmount = {};
        if (queryParams.minTotal !== undefined) {
          filters.totalAmount.gte = queryParams.minTotal;
        }
        if (queryParams.maxTotal !== undefined) {
          filters.totalAmount.lte = queryParams.maxTotal;
        }
      }

      if (filters && Object.keys(filters).length > 0) {
        searchOptions.filters = filters;
      }

      // Get orders based on query type
      let orders;
      
      if (queryParams.customerId) {
        orders = await orderRepo.findByCustomerId(queryParams.customerId, searchOptions);
      } else if (queryParams.status) {
        orders = await orderRepo.findByStatus([queryParams.status], searchOptions);
      } else if (queryParams.dateFrom || queryParams.dateTo) {
        const startDate = queryParams.dateFrom ? new Date(queryParams.dateFrom) : new Date(0);
        const endDate = queryParams.dateTo ? new Date(queryParams.dateTo) : new Date();
        orders = await orderRepo.findByDateRange(startDate, endDate, searchOptions);
      } else {
        orders = await orderRepo.findAll(searchOptions);
      }

      res.status(200).json({
        success: true,
        data: orders,
        pagination: {
          page: orders.page,
          limit: orders.limit,
          total: orders.total,
          totalPages: orders.totalPages,
          hasNext: orders.hasNext,
          hasPrev: orders.hasPrev
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order statistics and analytics
   * GET /orders/stats
   */
  async getOrderStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderRepo = this.repositoryFactory.getOrderRepository();

      // Get comprehensive statistics
      const [orderStats, dashboardAnalytics] = await Promise.all([
        orderRepo.getOrderStats(),
        this.repositoryService.getDashboardAnalytics()
      ]);

      res.status(200).json({
        success: true,
        data: {
          statistics: orderStats,
          analytics: dashboardAnalytics
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get daily sales data
   * GET /orders/sales/daily
   */
  async getDailySales(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const orderRepo = this.repositoryFactory.getOrderRepository();
      const dailySales = await orderRepo.getDailySales(startDate, endDate);

      res.status(200).json({
        success: true,
        data: {
          dailySales,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }
}