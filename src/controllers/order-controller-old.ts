import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OrderService, type CreateOrderRequest, type UpdateOrderRequest } from '../services/order-service.js';
import { DatabaseService } from '../services/database.js';
import { OrderSchema, CreateOrderSchema, UpdateOrderSchema, OrderStatus } from '../models/order.js';
import { formatValidationError } from '../utils/validation.js';

/**
 * Order Controller - HTTP Request/Response Layer
 * 
 * Handles all HTTP requests for order management:
 * - POST /orders - Create new order
 * - GET /orders/:id - Get order by ID  
 * - PUT /orders/:id - Update order
 * - DELETE /orders/:id - Cancel order
 * - GET /orders - List orders with filtering
 * - PUT /orders/:id/status - Update order status
 */

// Request validation schemas
const CreateOrderRequestSchema = z.object({
  customerId: z.string().regex(/^cust_[a-zA-Z0-9_]+$/, 'Invalid customer ID format'),
  customerEmail: z.string().email('Invalid email format'),
  items: z.array(z.object({
    productId: z.string().regex(/^prod_[a-zA-Z0-9_]+$/, 'Invalid product ID format'),
    productName: z.string().min(1).max(255),
    productSku: z.string().optional(),
    quantity: z.number().int().min(1).max(999),
    unitPrice: z.number().min(0.01).multipleOf(0.01),
    totalPrice: z.number().min(0.01).multipleOf(0.01),
    taxAmount: z.number().min(0).multipleOf(0.01).optional(),
    discountAmount: z.number().min(0).multipleOf(0.01).optional()
  })).min(1, 'Order must contain at least one item'),
  shippingAddress: z.object({
    street: z.string().min(1).max(255),
    city: z.string().min(2).max(100),
    state: z.string().length(2, 'State must be 2-letter code'),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
    country: z.string().length(2, 'Country must be 2-letter ISO code')
  }),
  billingAddress: z.object({
    street: z.string().min(1).max(255),
    city: z.string().min(2).max(100),
    state: z.string().length(2, 'State must be 2-letter code'),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
    country: z.string().length(2, 'Country must be 2-letter ISO code')
  }),
  subtotalAmount: z.number().min(0).multipleOf(0.01),
  taxAmount: z.number().min(0).multipleOf(0.01).optional(),
  shippingAmount: z.number().min(0).multipleOf(0.01).optional(),
  discountAmount: z.number().min(0).multipleOf(0.01).optional(),
  totalAmount: z.number().min(0.01).multipleOf(0.01),
  paymentMethod: z.enum(['credit_card', 'debit_card', 'bank_transfer', 'paypal']),
  notes: z.string().max(1000).optional()
});

const UpdateOrderStatusSchema = z.object({
  status: OrderStatus,
  notes: z.string().max(1000).optional()
});

const OrderQuerySchema = z.object({
  customerId: z.string().optional(),
  status: OrderStatus.optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional()
});

export class OrderController {
  private orderService: OrderService;

  constructor(databaseService: DatabaseService) {
    this.orderService = new OrderService(databaseService);
  }

  /**
   * Create a new order
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

      const orderData = validation.data as CreateOrderRequest;

      // Create order through service
      const result = await this.orderService.createOrder(orderData);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error,
          details: result.details
        });
        return;
      }

      // Return success response
      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Order created successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order by ID
   * GET /orders/:id
   */
  async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !id.match(/^ord_[a-zA-Z0-9_]+$/)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format'
        });
        return;
      }

      const result = await this.orderService.getOrderById(id);

      if (!result.success) {
        res.status(404).json({
          success: false,
          error: result.error
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.data
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update order
   * PUT /orders/:id
   */
  async updateOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !id.match(/^ord_[a-zA-Z0-9_]+$/)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format'
        });
        return;
      }

      // Validate update data
      const updateSchema = z.object({
        notes: z.string().max(1000).optional(),
        shippingAddress: z.object({
          street: z.string().min(1).max(255),
          city: z.string().min(2).max(100),
          state: z.string().length(2),
          zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
          country: z.string().length(2)
        }).optional(),
        billingAddress: z.object({
          street: z.string().min(1).max(255),
          city: z.string().min(2).max(100),
          state: z.string().length(2),
          zipCode: z.string().regex(/^\d{5}(-\d{4})?$/),
          country: z.string().length(2)
        }).optional()
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid update data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const updateData: any = {};
      if (validation.data.notes) updateData.notes = validation.data.notes;
      if (validation.data.shippingAddress) updateData.shippingAddress = validation.data.shippingAddress;
      if (validation.data.billingAddress) updateData.billingAddress = validation.data.billingAddress;

      const result = await this.orderService.updateOrder(id, updateData);

      if (!result.success) {
        const statusCode = result.error.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
          success: false,
          error: result.error
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Order updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update order status
   * PUT /orders/:id/status
   */
  async updateOrderStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id || !id.match(/^ord_[a-zA-Z0-9_]+$/)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format'
        });
        return;
      }

      const validation = UpdateOrderStatusSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid status update data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const { status, notes } = validation.data;

      try {
        const result = await this.orderService.updateOrderStatus(id, status, notes);

        res.status(200).json({
          success: true,
          data: result,
          message: `Order status updated to ${status}`
        });

      } catch (serviceError) {
        const message = serviceError instanceof Error ? serviceError.message : 'Unknown error';
        
        if (message.includes('not found')) {
          res.status(404).json({
            success: false,
            error: message
          });
        } else if (message.includes('Invalid status transition')) {
          res.status(400).json({
            success: false,
            error: message
          });
        } else {
          throw serviceError;
        }
      }

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
      const { id } = req.params;
      const { reason } = req.body;

      if (!id || !id.match(/^ord_[a-zA-Z0-9_]+$/)) {
        res.status(400).json({
          success: false,
          error: 'Invalid order ID format'
        });
        return;
      }

      const result = await this.orderService.cancelOrder(id, reason);

      if (!result.success) {
        const statusCode = result.error.includes('not found') ? 404 : 400;
        res.status(statusCode).json({
          success: false,
          error: result.error
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: 'Order cancelled successfully'
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
      const validation = OrderQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const query = validation.data;
      const options: any = {
        limit: query.limit || 50,
        offset: query.offset || 0
      };

      if (query.customerId) options.customerId = query.customerId;
      if (query.status) options.status = query.status;
      if (query.dateFrom) options.dateFrom = new Date(query.dateFrom);
      if (query.dateTo) options.dateTo = new Date(query.dateTo);

      const result = await this.orderService.searchOrders(options);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          limit: options.limit,
          offset: options.offset,
          hasMore: result.total > (options.offset + options.limit)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order statistics
   * GET /orders/stats
   */
  async getOrderStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { customerId, dateFrom, dateTo } = req.query;

      // Get all orders for stats calculation
      const options: any = {
        limit: 1000 // High limit for stats
      };

      if (customerId) options.customerId = customerId as string;
      if (dateFrom) options.dateFrom = new Date(dateFrom as string);
      if (dateTo) options.dateTo = new Date(dateTo as string);

      const result = await this.orderService.searchOrders(options);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: result.error
        });
        return;
      }

      // Calculate statistics
      const orders = result.data;
      const stats = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, order) => sum + order.totalAmount, 0),
        averageOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + order.totalAmount, 0) / orders.length : 0,
        statusBreakdown: orders.reduce((acc, order) => {
          acc[order.status] = (acc[order.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        recentOrders: orders.slice(0, 5) // Most recent 5 orders
      };

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      next(error);
    }
  }
}

export default OrderController;