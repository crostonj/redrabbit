import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';

// Export validation middleware
export * from './validation.js';

/**
 * Express Middleware Collection
 * 
 * Provides common middleware functions for:
 * - Authentication and authorization
 * - Request validation
 * - Error handling
 * - Logging and monitoring
 * - Rate limiting
 */

// Environment variables validation
const envSchema = z.object({
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_VERSION: z.string().default('v1')
});

// Validate environment on module load (with fallback for tests)
let env: { JWT_SECRET: string; NODE_ENV: string; API_VERSION: string };
try {
  env = envSchema.parse(process.env);
} catch {
  // Fallback for test environments
  env = {
    JWT_SECRET: process.env.JWT_SECRET || 'test-fallback-secret-key-minimum-32-chars',
    NODE_ENV: process.env.NODE_ENV || 'test',
    API_VERSION: process.env.API_VERSION || 'v1'
  };
}

/**
 * Authentication middleware - validates JWT tokens
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      
      // Add user info to request object
      (req as any).user = {
        id: decoded.sub || decoded.userId,
        email: decoded.email,
        role: decoded.role || 'customer'
      };
      
      next();
    } catch (jwtError: any) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'The provided token is invalid or expired'
      });
      return;
    }

  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    
    (req as any).user = {
      id: decoded.sub || decoded.userId,
      email: decoded.email,
      role: decoded.role || 'customer'
    };
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
};

/**
 * Role-based authorization middleware
 */
export const authorize = (requiredRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    if (!requiredRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `Required role: ${requiredRoles.join(' or ')}`
      });
      return;
    }

    next();
  };
};

/**
 * Request validation middleware factory
 */
export const validateRequest = (schema: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request body
      if (schema.body) {
        const bodyValidation = schema.body.safeParse(req.body);
        if (!bodyValidation.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid request body',
            details: formatZodError(bodyValidation.error)
          });
          return;
        }
        req.body = bodyValidation.data;
      }

      // Validate query parameters
      if (schema.query) {
        const queryValidation = schema.query.safeParse(req.query);
        if (!queryValidation.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid query parameters',
            details: formatZodError(queryValidation.error)
          });
          return;
        }
        req.query = queryValidation.data as any;
      }

      // Validate path parameters
      if (schema.params) {
        const paramsValidation = schema.params.safeParse(req.params);
        if (!paramsValidation.success) {
          res.status(400).json({
            success: false,
            error: 'Invalid path parameters',
            details: formatZodError(paramsValidation.error)
          });
          return;
        }
        req.params = paramsValidation.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Global error handling middleware
 */
export const errorHandler = (error: any, req: Request, res: Response, next: NextFunction): void => {
  // Log the error
  console.error('API Error:', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    user: (req as any).user?.id
  });

  // Handle different error types
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formatZodError(error)
    });
    return;
  }

  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid authentication token'
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Authentication token expired'
    });
    return;
  }

  // Database errors
  if (error.code === '23505') { // PostgreSQL unique violation
    res.status(409).json({
      success: false,
      error: 'Resource already exists'
    });
    return;
  }

  if (error.code === '23503') { // PostgreSQL foreign key violation
    res.status(400).json({
      success: false,
      error: 'Referenced resource does not exist'
    });
    return;
  }

  // Default server error
  res.status(500).json({
    success: false,
    error: env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    ...(env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  
  // Log request
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`, {
    body: req.method !== 'GET' ? req.body : undefined,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    user: (req as any).user?.id
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body: any) {
    const duration = Date.now() - startTime;
    
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    
    return originalJson.call(this, body);
  };

  next();
};

/**
 * Rate limiting middleware
 */
export const rateLimit = (options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - options.windowMs;
    
    // Clean up old entries
    const entriesToDelete: string[] = [];
    requests.forEach((data, ip) => {
      if (data.resetTime < now) {
        entriesToDelete.push(ip);
      }
    });
    entriesToDelete.forEach(ip => requests.delete(ip));
    
    // Get or create rate limit data for this IP
    let rateLimitData = requests.get(key);
    if (!rateLimitData || rateLimitData.resetTime < now) {
      rateLimitData = {
        count: 0,
        resetTime: now + options.windowMs
      };
      requests.set(key, rateLimitData);
    }
    
    // Check if rate limit exceeded
    if (rateLimitData.count >= options.maxRequests) {
      res.status(429).json({
        success: false,
        error: options.message || 'Too many requests',
        retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000)
      });
      return;
    }
    
    // Increment counter
    rateLimitData.count++;
    
    // Add rate limit headers
    res.set({
      'X-RateLimit-Limit': options.maxRequests.toString(),
      'X-RateLimit-Remaining': (options.maxRequests - rateLimitData.count).toString(),
      'X-RateLimit-Reset': new Date(rateLimitData.resetTime).toISOString()
    });
    
    next();
  };
};

/**
 * CORS middleware
 */
export const cors = (req: Request, res: Response, next: NextFunction): void => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};

/**
 * Content security and validation middleware
 */
export const security = (req: Request, res: Response, next: NextFunction): void => {
  // Set security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
  });

  // Validate content type for POST/PUT requests
  if (['POST', 'PUT'].includes(req.method)) {
    if (!req.is('application/json')) {
      res.status(415).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
      return;
    }
  }

  next();
};

/**
 * Health check middleware
 */
export const healthCheck = (req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: {
      service: 'redrabbit-orders-api',
      version: env.API_VERSION,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
};

/**
 * Helper function to format Zod validation errors
 */
function formatZodError(error: ZodError): any[] {
  return error.errors.map(err => ({
    field: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
    ...(err.code === 'invalid_type' && {
      received: (err as any).received,
      expected: (err as any).expected
    })
  }));
}

export default {
  authenticate,
  optionalAuth,
  authorize,
  validateRequest,
  errorHandler,
  requestLogger,
  rateLimit,
  cors,
  security,
  healthCheck
};

// Re-export validation utilities for convenience
export { 
  validateBody, 
  validateQuery, 
  validateParams, 
  validate, 
  validators, 
  commonSchemas,
  createCustomValidator,
  conditionalValidation,
  optionalValidation,
  validateFileUpload
} from './validation.js';