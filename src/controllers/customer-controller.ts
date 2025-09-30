import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { RepositoryFactory } from '../repositories';
import { RepositoryService, AddressType } from '../repositories';

/**
 * Customer Controller - HTTP Request/Response Layer
 * 
 * Handles all HTTP requests for customer management:
 * - POST /customers - Create new customer
 * - GET /customers/:id - Get customer by ID
 * - PUT /customers/:id - Update customer
 * - DELETE /customers/:id - Delete customer
 * - GET /customers - List/search customers with filtering
 * - GET /customers/:id/orders - Get customer order history
 * - GET /customers/:id/stats - Get customer statistics
 * - POST /customers/:id/addresses - Add customer address
 * - PUT /customers/:id/addresses/:addressId - Update customer address
 * - DELETE /customers/:id/addresses/:addressId - Delete customer address
 * - PUT /customers/:id/addresses/:addressId/default - Set default address
 */

// Validation schemas for customer operations
const CreateCustomerRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  firstName: z.string().min(1, 'First name is required').max(100, 'First name too long'),
  lastName: z.string().min(1, 'Last name is required').max(100, 'Last name too long'),
  phone: z.string().regex(/^\+?[\d\s\-()]{10,15}$/, 'Invalid phone number format').optional(),
  dateOfBirth: z.string().date('Invalid date format').optional(),
  metadata: z.record(z.any()).optional()
});

const UpdateCustomerRequestSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^\+?[\d\s\-()]{10,15}$/).nullable().optional(),
  dateOfBirth: z.string().date().nullable().optional(),
  metadata: z.record(z.any()).optional()
});

const CustomerSearchQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().min(1).optional(),
  sortBy: z.enum(['createdAt', 'firstName', 'lastName', 'email']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
});

const CreateAddressRequestSchema = z.object({
  street1: z.string().min(1, 'Street address is required').max(255, 'Street address too long'),
  street2: z.string().max(255, 'Street address too long').optional(),
  city: z.string().min(2, 'City is required').max(100, 'City name too long'),
  state: z.string().length(2, 'State must be 2-letter code'),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid ZIP code format'),
  country: z.string().length(2, 'Country must be 2-letter ISO code').default('US'),
  isDefault: z.boolean().default(false),
  type: z.nativeEnum(AddressType).default(AddressType.BOTH)
});

const UpdateAddressRequestSchema = z.object({
  street1: z.string().min(1).max(255).optional(),
  street2: z.string().max(255).nullable().optional(),
  city: z.string().min(2).max(100).optional(),
  state: z.string().length(2).optional(),
  zipCode: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  country: z.string().length(2).optional(),
  isDefault: z.boolean().optional(),
  type: z.nativeEnum(AddressType).optional()
});

/**
 * Format validation error for API response
 */
function formatValidationError(error: z.ZodError): any {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * CustomerController - Repository-powered customer management
 */
export class CustomerController {
  private repositoryFactory: RepositoryFactory;
  private repositoryService: RepositoryService;

  constructor(repositoryFactory: RepositoryFactory) {
    this.repositoryFactory = repositoryFactory;
    this.repositoryService = new RepositoryService(repositoryFactory);
  }

  /**
   * Create new customer
   * POST /customers
   */
  async createCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate request body
      const validation = CreateCustomerRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const customerData = validation.data;
      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if email already exists
      const existingCustomer = await customerRepo.findByEmail(customerData.email);
      if (existingCustomer) {
        res.status(409).json({
          success: false,
          error: 'EMAIL_ALREADY_EXISTS',
          message: `Customer with email ${customerData.email} already exists`
        });
        return;
      }

      // Check phone number if provided
      if (customerData.phone) {
        const existingByPhone = await customerRepo.findByPhone(customerData.phone);
        if (existingByPhone) {
          res.status(409).json({
            success: false,
            error: 'PHONE_ALREADY_EXISTS',
            message: `Customer with phone ${customerData.phone} already exists`
          });
          return;
        }
      }

      // Create customer
      const createData: any = {
        email: customerData.email,
        firstName: customerData.firstName,
        lastName: customerData.lastName,
        metadata: customerData.metadata || {}
      };

      if (customerData.phone) {
        createData.phone = customerData.phone;
      }

      if (customerData.dateOfBirth) {
        createData.dateOfBirth = new Date(customerData.dateOfBirth);
      }

      const customer = await customerRepo.create(createData);

      res.status(201).json({
        success: true,
        data: customer,
        message: 'Customer created successfully'
      });

    } catch (error: any) {
      if (error.message?.includes('duplicate key value')) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_CUSTOMER',
          message: 'Customer with this email or phone already exists'
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Get customer by ID
   * GET /customers/:id
   */
  async getCustomerById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      const customerRepo = this.repositoryFactory.getCustomerRepository();
      const customer = await customerRepo.findById(customerId);

      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: customer
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update customer
   * PUT /customers/:id
   */
  async updateCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateCustomerRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const updateData = validation.data;
      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const existingCustomer = await customerRepo.findById(customerId);
      if (!existingCustomer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      // Check phone number uniqueness if updating
      if (updateData.phone && updateData.phone !== existingCustomer.phone) {
        const existingByPhone = await customerRepo.findByPhone(updateData.phone);
        if (existingByPhone && existingByPhone.id !== customerId) {
          res.status(409).json({
            success: false,
            error: 'PHONE_ALREADY_EXISTS',
            message: `Phone number ${updateData.phone} is already in use`
          });
          return;
        }
      }

      // Prepare update data
      const preparedUpdateData: any = {};
      Object.keys(updateData).forEach(key => {
        const value = (updateData as any)[key];
        if (value !== undefined) {
          if (key === 'dateOfBirth' && value) {
            preparedUpdateData[key] = new Date(value);
          } else {
            preparedUpdateData[key] = value;
          }
        }
      });

      const updatedCustomer = await customerRepo.update(customerId, preparedUpdateData);

      if (!updatedCustomer) {
        res.status(404).json({
          success: false,
          error: 'UPDATE_FAILED',
          message: 'Customer update failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedCustomer,
        message: 'Customer updated successfully'
      });

    } catch (error: any) {
      if (error.message?.includes('duplicate key value')) {
        res.status(409).json({
          success: false,
          error: 'DUPLICATE_DATA',
          message: 'Phone number already in use'
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Delete customer (soft delete)
   * DELETE /customers/:id
   */
  async deleteCustomer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const existingCustomer = await customerRepo.findById(customerId);
      if (!existingCustomer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      // Check for active orders before deleting
      const orderStats = await customerRepo.getOrderStats(customerId);
      if (orderStats.totalOrders > 0) {
        res.status(409).json({
          success: false,
          error: 'CANNOT_DELETE_CUSTOMER',
          message: 'Cannot delete customer with existing orders. Customer will be deactivated instead.',
          details: {
            totalOrders: orderStats.totalOrders,
            totalSpent: orderStats.totalSpent
          }
        });
        return;
      }

      const deleted = await customerRepo.delete(customerId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'DELETE_FAILED',
          message: 'Customer deletion failed'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Customer deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * List/search customers with filtering
   * GET /customers
   */
  async getCustomers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Validate query parameters
      const validation = CustomerSearchQuerySchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const queryParams = validation.data;
      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Prepare search options
      const searchOptions: any = {
        page: queryParams.page || 1,
        limit: queryParams.limit || 20,
        sortBy: queryParams.sortBy || 'createdAt',
        sortOrder: queryParams.sortOrder || 'desc'
      };

      if (queryParams.search) {
        searchOptions.search = queryParams.search;
      }

      const result = await customerRepo.search(searchOptions);

      res.status(200).json({
        success: true,
        data: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get customer order history
   * GET /customers/:id/orders
   */
  async getCustomerOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      const { page = 1, limit = 20 } = req.query;
      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      const orderHistory = await customerRepo.getOrderHistory(customerId, {
        page: Number(page),
        limit: Number(limit)
      });

      res.status(200).json({
        success: true,
        data: orderHistory.data,
        pagination: {
          page: orderHistory.page,
          limit: orderHistory.limit,
          total: orderHistory.total,
          totalPages: orderHistory.totalPages
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get customer statistics
   * GET /customers/:id/stats
   */
  async getCustomerStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      const stats = await customerRepo.getOrderStats(customerId);

      res.status(200).json({
        success: true,
        data: {
          customer: {
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            email: customer.email
          },
          stats
        }
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Add customer address
   * POST /customers/:id/addresses
   */
  async addCustomerAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = CreateAddressRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid address data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const addressData = validation.data;
      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      // Prepare create data with proper typing
      const createAddressData: any = {
        type: addressData.type,
        street1: addressData.street1,
        city: addressData.city,
        state: addressData.state,
        zipCode: addressData.zipCode,
        country: addressData.country,
        isDefault: addressData.isDefault
      };

      // Only add street2 if provided
      if (addressData.street2) {
        createAddressData.street2 = addressData.street2;
      }

      const newAddress = await customerRepo.addAddress(customerId, createAddressData);

      res.status(201).json({
        success: true,
        data: newAddress,
        message: 'Address added successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Update customer address
   * PUT /customers/:id/addresses/:addressId
   */
  async updateCustomerAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      const addressId = req.params.addressId;
      
      // Validate parameters exist and are strings
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }

      if (!addressId || typeof addressId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_ID',
          message: 'Address ID parameter is required'
        });
        return;
      }
      
      // Validate UUID formats
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      if (!z.string().uuid().safeParse(addressId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_ID',
          message: 'Address ID must be a valid UUID'
        });
        return;
      }

      // Validate request body
      const validation = UpdateAddressRequestSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid address data',
          details: formatValidationError(validation.error)
        });
        return;
      }

      const updateData = validation.data;
      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      // Prepare update data with proper typing - only include defined values
      const preparedUpdateData: any = {};
      Object.keys(updateData).forEach(key => {
        const value = (updateData as any)[key];
        if (value !== undefined) {
          preparedUpdateData[key] = value;
        }
      });

      const updatedAddress = await customerRepo.updateAddress(customerId, addressId, preparedUpdateData);

      if (!updatedAddress) {
        res.status(404).json({
          success: false,
          error: 'ADDRESS_NOT_FOUND',
          message: `Address with ID ${addressId} not found for customer ${customerId}`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updatedAddress,
        message: 'Address updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete customer address
   * DELETE /customers/:id/addresses/:addressId
   */
  async deleteCustomerAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      const addressId = req.params.addressId;
      
      // Validate parameters exist and are strings
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }

      if (!addressId || typeof addressId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_ID',
          message: 'Address ID parameter is required'
        });
        return;
      }
      
      // Validate UUID formats
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      if (!z.string().uuid().safeParse(addressId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_ID',
          message: 'Address ID must be a valid UUID'
        });
        return;
      }

      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      const deleted = await customerRepo.deleteAddress(customerId, addressId);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'ADDRESS_NOT_FOUND',
          message: `Address with ID ${addressId} not found for customer ${customerId}`
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Address deleted successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Set default customer address
   * PUT /customers/:id/addresses/:addressId/default
   */
  async setDefaultAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      const addressId = req.params.addressId;
      
      // Validate parameters exist and are strings
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }

      if (!addressId || typeof addressId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_ID',
          message: 'Address ID parameter is required'
        });
        return;
      }
      
      // Validate UUID formats
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      if (!z.string().uuid().safeParse(addressId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_ADDRESS_ID',
          message: 'Address ID must be a valid UUID'
        });
        return;
      }

      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      const success = await customerRepo.setDefaultAddress(customerId, addressId);

      if (!success) {
        res.status(404).json({
          success: false,
          error: 'ADDRESS_NOT_FOUND',
          message: `Address with ID ${addressId} not found for customer ${customerId}`
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Default address updated successfully'
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * Get customer addresses
   * GET /customers/:id/addresses
   */
  async getCustomerAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const customerId = req.params.id;
      
      // Validate parameter exists and is string
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID parameter is required'
        });
        return;
      }
      
      // Validate UUID format
      if (!z.string().uuid().safeParse(customerId).success) {
        res.status(400).json({
          success: false,
          error: 'INVALID_CUSTOMER_ID',
          message: 'Customer ID must be a valid UUID'
        });
        return;
      }

      const customerRepo = this.repositoryFactory.getCustomerRepository();

      // Check if customer exists
      const customer = await customerRepo.findById(customerId);
      if (!customer) {
        res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: `Customer with ID ${customerId} not found`
        });
        return;
      }

      const addresses = await customerRepo.getAddresses(customerId);

      res.status(200).json({
        success: true,
        data: addresses
      });

    } catch (error) {
      next(error);
    }
  }
}