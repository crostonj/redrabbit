import type { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';

/**
 * Request Validation Middleware
 * 
 * Provides consistent validation for:
 * - Request body validation
 * - Query parameter validation  
 * - URL parameter validation
 * - Combined validation with custom schemas
 * - Error formatting and response handling
 */

/**
 * Standard validation error response format
 */
interface ValidationErrorResponse {
  success: false;
  error: 'VALIDATION_ERROR';
  message: string;
  details: Array<{
    field: string;
    message: string;
    code: string;
    value?: any;
  }>;
}

/**
 * Format Zod validation errors for consistent API responses
 */
function formatValidationError(error: ZodError): ValidationErrorResponse['details'] {
  return error.errors.map(err => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code
  }));
}

/**
 * Create validation middleware for request body
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.body);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: formatValidationError(validation.error)
        } satisfies ValidationErrorResponse);
        return;
      }

      // Replace request body with validated and transformed data
      req.body = validation.data;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create validation middleware for query parameters
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.query);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: formatValidationError(validation.error)
        } satisfies ValidationErrorResponse);
        return;
      }

      // Replace query with validated and transformed data
      req.query = validation.data as any;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create validation middleware for URL parameters
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validation = schema.safeParse(req.params);
      
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid URL parameters',
          details: formatValidationError(validation.error)
        } satisfies ValidationErrorResponse);
        return;
      }

      // Replace params with validated and transformed data
      req.params = validation.data as any;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Combined validation middleware for multiple request parts
 */
export function validate<TBody = any, TQuery = any, TParams = any>(options: {
  body?: ZodSchema<TBody>;
  query?: ZodSchema<TQuery>;
  params?: ZodSchema<TParams>;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const errors: ValidationErrorResponse['details'] = [];

      // Validate body if schema provided
      if (options.body) {
        const bodyValidation = options.body.safeParse(req.body);
        if (!bodyValidation.success) {
          errors.push(...formatValidationError(bodyValidation.error).map(err => ({
            ...err,
            field: `body.${err.field}`
          })));
        } else {
          req.body = bodyValidation.data;
        }
      }

      // Validate query if schema provided
      if (options.query) {
        const queryValidation = options.query.safeParse(req.query);
        if (!queryValidation.success) {
          errors.push(...formatValidationError(queryValidation.error).map(err => ({
            ...err,
            field: `query.${err.field}`
          })));
        } else {
          req.query = queryValidation.data as any;
        }
      }

      // Validate params if schema provided
      if (options.params) {
        const paramsValidation = options.params.safeParse(req.params);
        if (!paramsValidation.success) {
          errors.push(...formatValidationError(paramsValidation.error).map(err => ({
            ...err,
            field: `params.${err.field}`
          })));
        } else {
          req.params = paramsValidation.data as any;
        }
      }

      // Return error if any validation failed
      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors
        } satisfies ValidationErrorResponse);
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Common validation schemas for reuse
 */
export const commonSchemas = {
  // UUID parameter validation
  uuidParam: z.object({
    id: z.string().uuid('ID must be a valid UUID')
  }),

  // Pagination query validation
  pagination: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  }),

  // Search query validation
  search: z.object({
    search: z.string().min(1).max(255).optional(),
    sortBy: z.string().max(50).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  }),

  // Combined pagination and search
  paginationWithSearch: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().min(1).max(255).optional(),
    sortBy: z.string().max(50).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  }),

  // Date range validation
  dateRange: z.object({
    startDate: z.string().datetime('Start date must be a valid ISO datetime').optional(),
    endDate: z.string().datetime('End date must be a valid ISO datetime').optional()
  }).refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: 'Start date must be before or equal to end date',
      path: ['dateRange']
    }
  ),

  // Money amount validation (in cents)
  money: z.number().int().min(0).max(99999999), // Up to $999,999.99

  // Email validation
  email: z.string().email('Must be a valid email address'),

  // Phone validation (US format)
  phone: z.string().regex(
    /^\+?1?[-.\s]?(\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/,
    'Must be a valid US phone number'
  ),

  // ZIP code validation (US format)
  zipCode: z.string().regex(
    /^\d{5}(-\d{4})?$/,
    'Must be a valid US ZIP code (12345 or 12345-1234)'
  ),

  // State code validation (US)
  stateCode: z.string().length(2, 'Must be a 2-letter state code').toUpperCase(),

  // Country code validation (ISO 3166-1 alpha-2)
  countryCode: z.string().length(2, 'Must be a 2-letter country code').toUpperCase()
};

/**
 * Pre-built validation middleware for common use cases
 */
export const validators = {
  // Validate UUID in params.id
  requireUuidParam: validateParams(commonSchemas.uuidParam),

  // Validate pagination in query
  paginationQuery: validateQuery(commonSchemas.pagination),

  // Validate search in query
  searchQuery: validateQuery(commonSchemas.search),

  // Validate combined pagination and search
  paginationWithSearchQuery: validateQuery(commonSchemas.paginationWithSearch),

  // Validate date range in query
  dateRangeQuery: validateQuery(commonSchemas.dateRange),

  // Custom UUID param validator for different parameter names
  uuidParam: (paramName: string) => validateParams(z.object({
    [paramName]: z.string().uuid(`${paramName} must be a valid UUID`)
  })),

  // Multiple UUID params validator
  uuidParams: (...paramNames: string[]) => {
    const schema = z.object(
      Object.fromEntries(
        paramNames.map(name => [name, z.string().uuid(`${name} must be a valid UUID`)])
      )
    );
    return validateParams(schema);
  }
};

/**
 * Validation middleware with custom error messages
 */
export function createCustomValidator<T>(
  schema: ZodSchema<T>,
  options: {
    target: 'body' | 'query' | 'params';
    errorMessage?: string;
    statusCode?: number;
  }
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = options.target === 'body' ? req.body : 
                   options.target === 'query' ? req.query : req.params;
      
      const validation = schema.safeParse(data);
      
      if (!validation.success) {
        res.status(options.statusCode || 400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: options.errorMessage || `Invalid ${options.target} data`,
          details: formatValidationError(validation.error)
        } satisfies ValidationErrorResponse);
        return;
      }

      // Update the appropriate request property
      if (options.target === 'body') {
        req.body = validation.data;
      } else if (options.target === 'query') {
        req.query = validation.data as any;
      } else {
        req.params = validation.data as any;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Conditional validation middleware
 * Only validates if condition is met
 */
export function conditionalValidation<T>(
  condition: (req: Request) => boolean,
  schema: ZodSchema<T>,
  target: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!condition(req)) {
      next();
      return;
    }

    const validator = target === 'body' ? validateBody(schema) :
                     target === 'query' ? validateQuery(schema) : validateParams(schema);
    
    validator(req, res, next);
  };
}

/**
 * Optional validation middleware
 * Only validates if data is present
 */
export function optionalValidation<T>(
  schema: ZodSchema<T>,
  target: 'body' | 'query' | 'params' = 'body'
) {
  return conditionalValidation(
    (req) => {
      const data = target === 'body' ? req.body : 
                   target === 'query' ? req.query : req.params;
      return data && Object.keys(data).length > 0;
    },
    schema,
    target
  );
}

/**
 * File upload validation middleware
 * Note: Requires multer or similar file upload middleware to be configured first
 */
export function validateFileUpload(options: {
  required?: boolean;
  maxSize?: number; // in bytes
  allowedMimeTypes?: string[];
  maxFiles?: number;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Cast to any to access files property (added by multer or similar middleware)
    const files = (req as any).files;
    
    if (options.required && (!files || Object.keys(files).length === 0)) {
      res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'File upload is required',
        details: [{ field: 'files', message: 'At least one file must be uploaded', code: 'required' }]
      } satisfies ValidationErrorResponse);
      return;
    }

    if (files) {
      const fileArray = Array.isArray(files) ? files : Object.values(files).flat();
      
      // Check file count
      if (options.maxFiles && fileArray.length > options.maxFiles) {
        res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Too many files uploaded',
          details: [{ 
            field: 'files', 
            message: `Maximum ${options.maxFiles} files allowed, got ${fileArray.length}`, 
            code: 'too_big' 
          }]
        } satisfies ValidationErrorResponse);
        return;
      }

      // Validate each file
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        
        // Check file size
        if (options.maxSize && file.size > options.maxSize) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'File too large',
            details: [{ 
              field: `files[${i}]`, 
              message: `File size ${file.size} bytes exceeds maximum ${options.maxSize} bytes`, 
              code: 'too_big' 
            }]
          } satisfies ValidationErrorResponse);
          return;
        }

        // Check MIME type
        if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(file.mimetype)) {
          res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Invalid file type',
            details: [{ 
              field: `files[${i}]`, 
              message: `File type ${file.mimetype} not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`, 
              code: 'invalid_type' 
            }]
          } satisfies ValidationErrorResponse);
          return;
        }
      }
    }

    next();
  };
}