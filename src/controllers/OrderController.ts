/**
 * Order Controller
 * Express.js route handlers for Orders API with request validation
 * 
 * Handles HTTP requests for order operations including creation, retrieval,
 * updates, and cancellation with proper error handling and response formatting
 */

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OrderService, type CreateOrderRequest, type UpdateOrderRequest } from '../services/OrderService.js';
import { AddressSchema } from '../models/order.js';

/**
 * Request validation schemas
 */
export const CreateOrderRequestSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  customerEmail: z.string().email('Invalid email format'),
  items: z.array(z.object({
    productId: z.string().min(1, 'Product ID is required'),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    unitPrice: z.number().positive('Unit price must be positive').optional()
  })).min(1, 'Order must contain at least one item'),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  paymentMethod: z.enum(['credit_card', 'debit_card', 'paypal', 'bank_transfer']),
  notes: z.string().optional()
});

export const UpdateOrderRequestSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
  paymentStatus: z.enum(['pending', 'completed', 'failed', 'refunded']).optional(),
  paymentId: z.string().optional(),
  notes: z.string().optional()
});

export const GetOrdersQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'totalAmount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional()
});

/**
 * Response formatting utilities
 */
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Order Controller Class
 */
export class OrderController {
  /**
   * Create a new order
   * POST /v1/orders
   */
  static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const validatedData = CreateOrderRequestSchema.parse(req.body);
      
      // Build create order request with conditional properties
      const createRequest: CreateOrderRequest = {
        customerId: validatedData.customerId,
        customerEmail: validatedData.customerEmail,
        items: validatedData.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          ...(item.unitPrice !== undefined && { unitPrice: item.unitPrice })
        })),
        shippingAddress: validatedData.shippingAddress,
        paymentMethod: validatedData.paymentMethod,
        ...(validatedData.billingAddress !== undefined && { billingAddress: validatedData.billingAddress }),
        ...(validatedData.notes !== undefined && { notes: validatedData.notes })
      };
      
      // Create order using service
      const result = await OrderService.createOrder(createRequest);

      if (!result.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'ORDER_CREATION_FAILED',
            message: result.error || 'Failed to create order',
            details: result.validationResult
          }
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          order: result.order,
          validationResult: result.validationResult
        }
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get orders with filtering and pagination
   * GET /v1/orders
   */
  static async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate query parameters
      const queryParams = GetOrdersQuerySchema.parse(req.query);
      
      // Build filter options
      const filters: any = {};
      if (queryParams.customerId) filters.customerId = queryParams.customerId;
      if (queryParams.status) filters.status = queryParams.status;
      if (queryParams.startDate) filters.startDate = queryParams.startDate;
      if (queryParams.endDate) filters.endDate = queryParams.endDate;

      // Get orders from service
      const result = await OrderService.findOrders(filters);

      const response: ApiResponse = {
        success: true,
        data: {
          orders: result.orders
        },
        pagination: {
          page: queryParams.page,
          limit: queryParams.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / queryParams.limit)
        }
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a specific order by ID
   * GET /v1/orders/:orderId
   */
  static async getOrderById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId;
      
      // Validate order ID format
      if (!z.string().uuid().safeParse(orderId).success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_ORDER_ID',
            message: 'Order ID must be a valid UUID format'
          }
        };
        res.status(400).json(response);
        return;
      }

      // Get order from service
      const order = await OrderService.getOrderDetails(orderId!);
      
      if (!order) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'ORDER_NOT_FOUND',
            message: `Order with ID ${orderId} not found`
          }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { order }
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an existing order
   * PUT /v1/orders/:orderId
   */
  static async updateOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId;
      
      // Validate order ID format
      if (!z.string().uuid().safeParse(orderId).success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_ORDER_ID',
            message: 'Order ID must be a valid UUID format'
          }
        };
        res.status(400).json(response);
        return;
      }

      // Validate request body
      const validatedData = UpdateOrderRequestSchema.parse(req.body);
      
      // Build update request with conditional properties
      const updateRequest: UpdateOrderRequest = {};
      if (validatedData.status !== undefined) updateRequest.status = validatedData.status;
      if (validatedData.paymentStatus !== undefined) updateRequest.paymentStatus = validatedData.paymentStatus;
      if (validatedData.paymentId !== undefined) updateRequest.paymentId = validatedData.paymentId;
      if (validatedData.notes !== undefined) updateRequest.notes = validatedData.notes;
      
      // Update order using service
      const result = await OrderService.updateOrder(orderId!, updateRequest);

      if (!result.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'ORDER_UPDATE_FAILED',
            message: result.error || 'Failed to update order'
          }
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { order: result.order }
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel an order
   * DELETE /v1/orders/:orderId
   */
  static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orderId = req.params.orderId;
      const { reason } = req.body;
      
      // Validate order ID format
      if (!z.string().uuid().safeParse(orderId).success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'INVALID_ORDER_ID',
            message: 'Order ID must be a valid UUID format'
          }
        };
        res.status(400).json(response);
        return;
      }

      // Cancel order using service
      const result = await OrderService.cancelOrder(orderId!, reason);

      if (!result.success) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'ORDER_CANCELLATION_FAILED',
            message: result.error || 'Failed to cancel order'
          }
        };
        res.status(400).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          order: result.order,
          message: 'Order cancelled successfully'
        }
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Health check endpoint for order service
   * GET /v1/orders/health
   */
  static async healthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const response: ApiResponse = {
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'orders'
        }
      };

      res.status(200).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'SERVICE_UNHEALTHY',
          message: 'Order service health check failed'
        }
      };
      res.status(503).json(response);
    }
  }
}

/**
 * Route definitions for Express.js
 * To be used in the main server file
 */
export const orderRoutes = {
  'POST /v1/orders': OrderController.createOrder,
  'GET /v1/orders': OrderController.getOrders,
  'GET /v1/orders/:orderId': OrderController.getOrderById,
  'PUT /v1/orders/:orderId': OrderController.updateOrder,
  'DELETE /v1/orders/:orderId': OrderController.cancelOrder,
  'GET /v1/orders/health': OrderController.healthCheck
};