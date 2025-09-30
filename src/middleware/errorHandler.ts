/**
 * Error Handling Middleware
 * 
 * Centralized error handling for Express.js application with:
 * - Standardized error response format
 * - HTTP status code mapping
 * - Development vs production error details
 * - Request/response logging
 * - Error categorization and handling
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError, NotBeforeError } from 'jsonwebtoken';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
    path: string;
    method: string;
  };
  stack?: string; // Only in development
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Capture stack trace
    Error.captureStackTrace(this, AppError);
  }
}

/**
 * Predefined application errors
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * Error type detection utilities
 */
export class ErrorTypeDetector {
  static isZodError(error: any): error is ZodError {
    return error instanceof ZodError;
  }

  static isJWTError(error: any): error is JsonWebTokenError | TokenExpiredError | NotBeforeError {
    return error instanceof JsonWebTokenError || 
           error instanceof TokenExpiredError || 
           error instanceof NotBeforeError;
  }

  static isDatabaseError(error: any): boolean {
    // Common database error patterns
    const dbErrorCodes = [
      'ER_DUP_ENTRY', // MySQL duplicate entry
      'SQLITE_CONSTRAINT', // SQLite constraint
      '23505', // PostgreSQL unique violation
      '23503', // PostgreSQL foreign key violation
      '23502', // PostgreSQL not null violation
      'ECONNREFUSED', // Connection refused
      'ETIMEDOUT', // Connection timeout
    ];

    return error.code && dbErrorCodes.some(code => 
      error.code.includes(code) || error.message?.includes(code)
    );
  }

  static isNetworkError(error: any): boolean {
    const networkErrorCodes = [
      'ENOTFOUND', // DNS lookup failed
      'ECONNRESET', // Connection reset
      'ECONNREFUSED', // Connection refused
      'ETIMEDOUT', // Timeout
      'EHOSTUNREACH', // Host unreachable
    ];

    return error.code && networkErrorCodes.includes(error.code);
  }

  static isOperationalError(error: any): boolean {
    return error instanceof AppError && error.isOperational;
  }
}

/**
 * Error response formatter
 */
export class ErrorFormatter {
  static formatResponse(
    error: any, 
    req: Request, 
    isDevelopment: boolean = false,
    requestId?: string
  ): ErrorResponse {
    const baseResponse: ErrorResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        ...(requestId && { requestId })
      }
    };

    // Handle AppError instances
    if (error instanceof AppError) {
      baseResponse.error.code = error.code;
      baseResponse.error.message = error.message;
      if (error.details) {
        baseResponse.error.details = error.details;
      }
    }
    // Handle Zod validation errors
    else if (ErrorTypeDetector.isZodError(error)) {
      baseResponse.error.code = 'VALIDATION_ERROR';
      baseResponse.error.message = 'Request validation failed';
      baseResponse.error.details = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
        ...(('received' in err) && { received: err.received })
      }));
    }
    // Handle JWT errors
    else if (ErrorTypeDetector.isJWTError(error)) {
      if (error instanceof TokenExpiredError) {
        baseResponse.error.code = 'TOKEN_EXPIRED';
        baseResponse.error.message = 'Authentication token has expired';
      } else if (error instanceof NotBeforeError) {
        baseResponse.error.code = 'TOKEN_NOT_ACTIVE';
        baseResponse.error.message = 'Authentication token is not yet active';
      } else {
        baseResponse.error.code = 'INVALID_TOKEN';
        baseResponse.error.message = 'Invalid authentication token';
      }
    }
    // Handle database errors
    else if (ErrorTypeDetector.isDatabaseError(error)) {
      baseResponse.error.code = 'DATABASE_ERROR';
      baseResponse.error.message = 'Database operation failed';
      
      // Provide specific error details in development
      if (isDevelopment) {
        baseResponse.error.details = {
          code: error.code,
          sqlMessage: error.sqlMessage,
          errno: error.errno
        };
      }
    }
    // Handle network errors
    else if (ErrorTypeDetector.isNetworkError(error)) {
      baseResponse.error.code = 'NETWORK_ERROR';
      baseResponse.error.message = 'Network operation failed';
      
      if (isDevelopment) {
        baseResponse.error.details = {
          code: error.code,
          address: error.address,
          port: error.port
        };
      }
    }
    // Handle generic errors
    else if (error instanceof Error) {
      baseResponse.error.message = isDevelopment ? error.message : 'An unexpected error occurred';
      
      if (isDevelopment) {
        baseResponse.error.details = {
          name: error.name,
          originalMessage: error.message
        };
      }
    }

    // Add stack trace in development
    if (isDevelopment && error.stack) {
      baseResponse.stack = error.stack;
    }

    return baseResponse;
  }

  static getStatusCode(error: any): number {
    // AppError instances have statusCode
    if (error instanceof AppError) {
      return error.statusCode;
    }

    // Zod validation errors
    if (ErrorTypeDetector.isZodError(error)) {
      return 400;
    }

    // JWT errors
    if (ErrorTypeDetector.isJWTError(error)) {
      return 401;
    }

    // Database constraint errors
    if (ErrorTypeDetector.isDatabaseError(error)) {
      if (error.code === 'ER_DUP_ENTRY' || error.code === '23505') {
        return 409; // Conflict
      }
      if (error.code === '23503' || error.code === '23502') {
        return 400; // Bad request
      }
      return 500; // Internal server error
    }

    // Network errors
    if (ErrorTypeDetector.isNetworkError(error)) {
      return 503; // Service unavailable
    }

    // Default to internal server error
    return 500;
  }
}

/**
 * Request ID generator for error tracking
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Request ID middleware - adds unique ID to each request
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  
  // Add to request object for use in other middleware
  (req as any).requestId = requestId;
  
  // Add to response headers
  res.setHeader('X-Request-ID', requestId);
  
  next();
}

/**
 * Main error handling middleware
 * Should be the last middleware in the chain
 */
export const errorHandler: ErrorRequestHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }

  const isDevelopment = process.env.NODE_ENV === 'development';
  const requestId = (req as any).requestId;

  // Log error for monitoring/debugging
  console.error('Error occurred:', {
    requestId,
    path: req.path,
    method: req.method,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error instanceof AppError && { 
        code: error.code, 
        statusCode: error.statusCode,
        isOperational: error.isOperational 
      })
    },
    timestamp: new Date().toISOString()
  });

  // Format error response
  const statusCode = ErrorFormatter.getStatusCode(error);
  const errorResponse = ErrorFormatter.formatResponse(error, req, isDevelopment, requestId);

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * 404 Not Found handler
 * Should be placed after all routes but before error handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
}

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to error handler
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error boundary for critical errors
 * Logs critical errors and optionally shuts down gracefully
 */
export function setupErrorBoundary(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // In production, you might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
      console.error('Shutting down due to uncaught exception...');
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection:', {
      reason: reason instanceof Error ? {
        name: reason.name,
        message: reason.message,
        stack: reason.stack
      } : reason,
      promise: promise.toString(),
      timestamp: new Date().toISOString()
    });

    // In production, you might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
      console.error('Shutting down due to unhandled rejection...');
      process.exit(1);
    }
  });

  // Handle SIGTERM for graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
  });

  // Handle SIGINT (Ctrl+C) for graceful shutdown
  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
  });
}

/**
 * Development error page middleware
 * Shows detailed error information in development
 */
export function developmentErrorPage(req: Request, res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV !== 'development') {
    return next();
  }

  // Override error handler for HTML requests in development
  const originalSend = res.json;
  res.json = function(this: Response, body?: any): Response {
    if (body && !body.success && req.accepts('html')) {
      const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Development Error</title>
          <style>
            body { font-family: monospace; margin: 40px; background: #f5f5f5; }
            .error-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error-title { color: #d32f2f; font-size: 24px; margin-bottom: 20px; }
            .error-details { background: #f8f8f8; padding: 15px; border-radius: 4px; margin: 10px 0; }
            .stack-trace { background: #222; color: #fff; padding: 15px; border-radius: 4px; font-size: 12px; overflow-x: auto; }
            pre { margin: 0; white-space: pre-wrap; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <div class="error-title">${body.error.code}: ${body.error.message}</div>
            <div class="error-details">
              <strong>Path:</strong> ${body.error.method} ${body.error.path}<br>
              <strong>Timestamp:</strong> ${body.error.timestamp}<br>
              ${body.error.requestId ? `<strong>Request ID:</strong> ${body.error.requestId}<br>` : ''}
            </div>
            ${body.error.details ? `
              <div class="error-details">
                <strong>Details:</strong>
                <pre>${JSON.stringify(body.error.details, null, 2)}</pre>
              </div>
            ` : ''}
            ${body.stack ? `
              <div class="stack-trace">
                <strong>Stack Trace:</strong>
                <pre>${body.stack}</pre>
              </div>
            ` : ''}
          </div>
        </body>
        </html>
      `;
      
      this.type('html').send(errorHtml);
      return this;
    }
    
    return originalSend.call(this, body);
  };

  next();
}

/**
 * Error recovery middleware
 * Attempts to recover from certain types of errors
 */
export function errorRecoveryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json;
  
  res.json = function(this: Response, body?: any): Response {
    // If this is an error response, try to add recovery suggestions
    if (body && !body.success) {
      const suggestions: string[] = [];
      
      switch (body.error.code) {
        case 'VALIDATION_ERROR':
          suggestions.push('Check the request format and required fields');
          suggestions.push('Refer to the API documentation for correct schemas');
          break;
        case 'AUTHENTICATION_ERROR':
          suggestions.push('Ensure you have a valid authentication token');
          suggestions.push('Check if your token has expired');
          break;
        case 'AUTHORIZATION_ERROR':
          suggestions.push('Verify you have the required permissions');
          suggestions.push('Contact an administrator if you need access');
          break;
        case 'NOT_FOUND':
          suggestions.push('Check the URL path and parameters');
          suggestions.push('Verify the resource exists');
          break;
        case 'RATE_LIMIT_EXCEEDED':
          suggestions.push('Wait before retrying the request');
          suggestions.push('Consider implementing exponential backoff');
          break;
      }
      
      if (suggestions.length > 0) {
        body.error.suggestions = suggestions;
      }
    }
    
    return originalJson.call(this, body);
  };
  
  next();
}

/**
 * Pre-configured error handlers for common scenarios
 */
export const ErrorHandlers = {
  // Handle validation errors from request body
  validation: (error: any, req: Request, res: Response, next: NextFunction) => {
    if (ErrorTypeDetector.isZodError(error)) {
      const validationError = new ValidationError('Request validation failed', {
        errors: error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }))
      });
      return next(validationError);
    }
    next(error);
  },

  // Handle authentication errors
  authentication: (error: any, req: Request, res: Response, next: NextFunction) => {
    if (ErrorTypeDetector.isJWTError(error)) {
      const authError = error instanceof TokenExpiredError 
        ? new AuthenticationError('Authentication token has expired')
        : new AuthenticationError('Invalid authentication token');
      return next(authError);
    }
    next(error);
  },

  // Handle database errors
  database: (error: any, req: Request, res: Response, next: NextFunction) => {
    if (ErrorTypeDetector.isDatabaseError(error)) {
      const message = process.env.NODE_ENV === 'development' 
        ? `Database error: ${error.message}`
        : 'Database operation failed';
      
      const statusCode = error.code === 'ER_DUP_ENTRY' || error.code === '23505' ? 409 : 500;
      const dbError = new AppError(message, statusCode, 'DATABASE_ERROR');
      return next(dbError);
    }
    next(error);
  }
};