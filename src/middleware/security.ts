/**
 * Security Middleware
 * 
 * Comprehensive security middleware stack including:
 * - CORS (Cross-Origin Resource Sharing) configuration
 * - Security headers (Helmet-style functionality)
 * - Rate limiting with configurable windows and limits
 * - Request sanitization and validation
 * - IP filtering and blocking
 * - Content Security Policy (CSP)
 * - Request size limiting
 */

import type { Request, Response, NextFunction } from 'express';
import { RateLimitError, AppError } from './errorHandler.js';

/**
 * CORS configuration options
 */
export interface CorsOptions {
  origin?: string | string[] | boolean | ((origin?: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
  standardHeaders?: boolean; // Return rate limit info in headers
  legacyHeaders?: boolean; // Return legacy rate limit headers
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersOptions {
  contentSecurityPolicy?: {
    directives?: Record<string, string[]>;
    reportOnly?: boolean;
  };
  xssProtection?: boolean;
  noSniff?: boolean;
  frameguard?: {
    action: 'deny' | 'sameorigin' | 'allow-from';
    domain?: string;
  };
  hsts?: {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  referrerPolicy?: string;
  permissionsPolicy?: Record<string, string[]>;
}

/**
 * Request sanitization options  
 */
export interface SanitizationOptions {
  removeNullBytes?: boolean;
  removeScriptTags?: boolean;
  removeHTMLTags?: boolean;
  trimWhitespace?: boolean;
  maxStringLength?: number;
  maxObjectDepth?: number;
}

/**
 * IP filtering configuration
 */
export interface IpFilterOptions {
  whitelist?: string[];
  blacklist?: string[];
  trustProxy?: boolean;
  blockPrivateRanges?: boolean;
}

/**
 * Rate limiting store interface
 */
interface RateLimitStore {
  get(key: string): Promise<{ count: number; resetTime: number } | null>;
  set(key: string, value: { count: number; resetTime: number }): Promise<void>;
  increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>;
  reset(key: string): Promise<void>;
}

/**
 * In-memory rate limit store implementation
 */
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.store.forEach((value, key) => {
        if (now >= value.resetTime) {
          this.store.delete(key);
        }
      });
    }, 60000);
  }

  async get(key: string): Promise<{ count: number; resetTime: number } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() >= entry.resetTime) {
      this.store.delete(key);
      return null;
    }
    
    return entry;
  }

  async set(key: string, value: { count: number; resetTime: number }): Promise<void> {
    this.store.set(key, value);
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    const existing = await this.get(key);
    
    if (existing) {
      existing.count++;
      this.store.set(key, existing);
      return existing;
    } else {
      const newEntry = {
        count: 1,
        resetTime: now + windowMs
      };
      this.store.set(key, newEntry);
      return newEntry;
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Default rate limit store instance
 */
const defaultRateLimitStore = new MemoryRateLimitStore();

/**
 * CORS middleware implementation
 */
export function cors(options: CorsOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
    exposedHeaders = ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials = false,
    maxAge = 86400, // 24 hours
    preflightContinue = false,
    optionsSuccessStatus = 204
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestOrigin = req.headers.origin;
    
    // Handle origin
    if (typeof origin === 'boolean') {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
      }
    } else if (typeof origin === 'string') {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (Array.isArray(origin)) {
      if (requestOrigin && origin.includes(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      }
    } else if (typeof origin === 'function') {
      if (origin(requestOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', requestOrigin || '*');
      }
    }

    // Handle credentials
    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Handle exposed headers
    if (exposedHeaders.length > 0) {
      res.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(', '));
    }

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', maxAge.toString());
      
      if (preflightContinue) {
        next();
      } else {
        res.status(optionsSuccessStatus).end();
      }
      return;
    }

    next();
  };
}

/**
 * Security headers middleware (Helmet-style)
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const {
    contentSecurityPolicy,
    xssProtection = true,
    noSniff = true,
    frameguard = { action: 'deny' },
    hsts = { maxAge: 31536000, includeSubDomains: true },
    referrerPolicy = 'no-referrer-when-downgrade',
    permissionsPolicy
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Content Security Policy
    if (contentSecurityPolicy) {
      const directives = contentSecurityPolicy.directives || {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'connect-src': ["'self'"],
        'font-src': ["'self'"],
        'object-src': ["'none'"],
        'media-src': ["'self'"],
        'frame-src': ["'none'"],
      };

      const cspValue = Object.entries(directives)
        .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
        .join('; ');

      const headerName = contentSecurityPolicy.reportOnly 
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';
      
      res.setHeader(headerName, cspValue);
    }

    // XSS Protection
    if (xssProtection) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Content Type Options
    if (noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // Frame Options
    if (frameguard) {
      let frameValue = frameguard.action.toUpperCase();
      if (frameguard.action === 'allow-from' && frameguard.domain) {
        frameValue = `ALLOW-FROM ${frameguard.domain}`;
      }
      res.setHeader('X-Frame-Options', frameValue);
    }

    // HTTP Strict Transport Security
    if (hsts && req.secure) {
      let hstsValue = `max-age=${hsts.maxAge}`;
      if (hsts.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (hsts.preload) {
        hstsValue += '; preload';
      }
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Referrer Policy
    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', referrerPolicy);
    }

    // Permissions Policy
    if (permissionsPolicy) {
      const permissionsPolicyValue = Object.entries(permissionsPolicy)
        .map(([feature, allowlist]) => `${feature}=(${allowlist.join(' ')})`)
        .join(', ');
      res.setHeader('Permissions-Policy', permissionsPolicyValue);
    }

    // Additional security headers
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.removeHeader('X-Powered-By');

    next();
  };
}

/**
 * Rate limiting middleware
 */
export function rateLimit(options: RateLimitOptions, store: RateLimitStore = defaultRateLimitStore) {
  const {
    windowMs,
    maxRequests,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req: Request) => req.ip || 'unknown',
    skip = () => false,
    onLimitReached,
    standardHeaders = true,
    legacyHeaders = false
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip if condition is met
      if (skip(req)) {
        return next();
      }

      const key = keyGenerator(req);
      const now = Date.now();
      
      // Get or initialize rate limit data
      const rateLimitData = await store.increment(key, windowMs);
      
      // Set rate limit headers
      if (standardHeaders) {
        res.setHeader('RateLimit-Limit', maxRequests);
        res.setHeader('RateLimit-Remaining', Math.max(0, maxRequests - rateLimitData.count));
        res.setHeader('RateLimit-Reset', new Date(rateLimitData.resetTime).toISOString());
      }

      if (legacyHeaders) {
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - rateLimitData.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimitData.resetTime / 1000));
      }

      // Check if limit exceeded
      if (rateLimitData.count > maxRequests) {
        if (onLimitReached) {
          onLimitReached(req, res);
        }

        // Set additional headers for rate limit exceeded
        res.setHeader('Retry-After', Math.ceil((rateLimitData.resetTime - now) / 1000));
        
        const error = new RateLimitError('Too many requests, please try again later');
        return next(error);
      }

      // Handle response to track successful/failed requests
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalJson = res.json;
        const originalStatus = res.status;
        let statusCode = 200;

        // Track status changes
        res.status = function(code: number) {
          statusCode = code;
          return originalStatus.call(this, code);
        };

        // Track when response is sent
        res.json = function(body?: any) {
          const shouldSkip = (skipSuccessfulRequests && statusCode < 400) ||
                            (skipFailedRequests && statusCode >= 400);
          
          if (shouldSkip) {
            // Decrement the counter since we're skipping this request
            store.increment(key, windowMs).then(data => {
              data.count = Math.max(0, data.count - 1);
              store.set(key, data);
            });
          }

          return originalJson.call(this, body);
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Request sanitization middleware
 */
export function sanitizeRequest(options: SanitizationOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const {
    removeNullBytes = true,
    removeScriptTags = true,
    removeHTMLTags = false,
    trimWhitespace = true,
    maxStringLength = 10000,
    maxObjectDepth = 10
  } = options;

  function sanitizeValue(value: any, depth = 0): any {
    if (depth > maxObjectDepth) {
      throw new AppError('Request data too deeply nested', 400, 'REQUEST_TOO_COMPLEX');
    }

    if (typeof value === 'string') {
      let sanitized = value;

      // Limit string length
      if (sanitized.length > maxStringLength) {
        throw new AppError(`String too long (max ${maxStringLength} characters)`, 400, 'STRING_TOO_LONG');
      }

      // Remove null bytes
      if (removeNullBytes) {
        sanitized = sanitized.replace(/\0/g, '');
      }

      // Remove script tags
      if (removeScriptTags) {
        sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }

      // Remove HTML tags
      if (removeHTMLTags) {
        sanitized = sanitized.replace(/<[^>]*>/g, '');
      }

      // Trim whitespace
      if (trimWhitespace) {
        sanitized = sanitized.trim();
      }

      return sanitized;
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item, depth + 1));
    }

    if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = sanitizeValue(val, depth + 1);
      }
      return sanitized;
    }

    return value;
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Sanitize request body
      if (req.body) {
        req.body = sanitizeValue(req.body);
      }

      // Sanitize query parameters
      if (req.query) {
        req.query = sanitizeValue(req.query);
      }

      // Sanitize path parameters
      if (req.params) {
        req.params = sanitizeValue(req.params);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * IP filtering middleware
 */
export function ipFilter(options: IpFilterOptions = {}): (req: Request, res: Response, next: NextFunction) => void {
  const {
    whitelist = [],
    blacklist = [],
    trustProxy = false,
    blockPrivateRanges = false
  } = options;

  function getClientIp(req: Request): string {
    if (trustProxy) {
      const forwardedFor = req.headers['x-forwarded-for'] as string;
      if (forwardedFor) {
        return forwardedFor.split(',')[0]?.trim() || 'unknown';
      }
      
      const realIp = req.headers['x-real-ip'] as string;
      if (realIp) {
        return realIp;
      }
    }

    return req.socket.remoteAddress || req.ip || 'unknown';
  }

  function isPrivateRange(ip: string): boolean {
    const privateRanges = [
      /^10\./,          // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
      /^192\.168\./,    // 192.168.0.0/16
      /^127\./,         // 127.0.0.0/8 (localhost)
      /^169\.254\./,    // 169.254.0.0/16 (link-local)
      /^::1$/,          // IPv6 localhost
      /^fe80:/,         // IPv6 link-local
      /^fc00:/,         // IPv6 unique local
    ];

    return privateRanges.some(range => range.test(ip));
  }

  function matchesPattern(ip: string, pattern: string): boolean {
    // Exact match
    if (ip === pattern) return true;

    // CIDR notation (basic implementation)
    if (pattern.includes('/')) {
      // This is a simplified CIDR check - in production you'd want a proper IP library
      const [network, prefixLength] = pattern.split('/');
      if (!network || !prefixLength) return false;
      
      const prefix = parseInt(prefixLength, 10);
      if (isNaN(prefix)) return false;
      
      // Convert IPs to binary and compare prefix bits
      // This is a simplified version - use a proper IP library for production
      return ip.startsWith(network.split('.').slice(0, Math.ceil(prefix / 8)).join('.'));
    }

    // Wildcard pattern (basic implementation)
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(ip);
    }

    return false;
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = getClientIp(req);

    // Block private ranges if configured
    if (blockPrivateRanges && isPrivateRange(clientIp)) {
      const error = new AppError('Access denied from private IP ranges', 403, 'IP_BLOCKED');
      return next(error);
    }

    // Check blacklist first
    if (blacklist.length > 0) {
      const isBlacklisted = blacklist.some(pattern => matchesPattern(clientIp, pattern));
      if (isBlacklisted) {
        const error = new AppError('Access denied', 403, 'IP_BLOCKED');
        return next(error);
      }
    }

    // Check whitelist if configured
    if (whitelist.length > 0) {
      const isWhitelisted = whitelist.some(pattern => matchesPattern(clientIp, pattern));
      if (!isWhitelisted) {
        const error = new AppError('Access denied', 403, 'IP_NOT_WHITELISTED');
        return next(error);
      }
    }

    next();
  };
}

/**
 * Request size limiting middleware
 */
export function requestSizeLimit(options: { maxSize: number }): (req: Request, res: Response, next: NextFunction) => void {
  const { maxSize } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      const error = new AppError(`Request too large (max ${maxSize} bytes)`, 413, 'REQUEST_TOO_LARGE');
      return next(error);
    }

    let size = 0;
    const originalOn = req.on;

    req.on = function(event: string, listener: Function) {
      if (event === 'data') {
        const originalListener = listener;
        const wrappedListener = (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxSize) {
            const error = new AppError(`Request too large (max ${maxSize} bytes)`, 413, 'REQUEST_TOO_LARGE');
            return next(error);
          }
          return originalListener(chunk);
        };
        return originalOn.call(this, event, wrappedListener);
      }
      return originalOn.call(this, event, listener as (...args: any[]) => void);
    };

    next();
  };
}

/**
 * Pre-configured security middleware combinations
 */
export const SecurityPresets = {
  /**
   * Basic security setup for most applications
   */
  basic: () => [
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
      credentials: true
    }),
    securityHeaders(),
    sanitizeRequest(),
    requestSizeLimit({ maxSize: 10 * 1024 * 1024 }) // 10MB
  ],

  /**
   * Strict security for sensitive applications
   */
  strict: () => [
    cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || false,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE']
    }),
    securityHeaders({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'"],
          'connect-src': ["'self'"],
          'font-src': ["'self'"],
          'object-src': ["'none'"],
          'media-src': ["'none'"],
          'frame-src': ["'none'"],
        }
      },
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
    }),
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 100
    }),
    sanitizeRequest({
      removeHTMLTags: true,
      maxStringLength: 1000
    }),
    requestSizeLimit({ maxSize: 1024 * 1024 }) // 1MB
  ],

  /**
   * Development-friendly security (less restrictive)
   */
  development: () => [
    cors({ origin: true, credentials: true }),
    securityHeaders({
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:', 'http:'],
          'connect-src': ["'self'", 'ws:', 'wss:']
        }
      }
    }),
    sanitizeRequest({ removeHTMLTags: false }),
    requestSizeLimit({ maxSize: 50 * 1024 * 1024 }) // 50MB
  ]
};

/**
 * Create custom rate limiting by endpoint
 */
export function createEndpointRateLimit(limits: Record<string, RateLimitOptions>) {
  const limiters = Object.entries(limits).map(([path, options]) => ({
    path,
    limiter: rateLimit(options)
  }));

  return (req: Request, res: Response, next: NextFunction): void => {
    const matchingLimiter = limiters.find(({ path }) => 
      req.path.startsWith(path) || new RegExp(path).test(req.path)
    );

    if (matchingLimiter) {
      matchingLimiter.limiter(req, res, next);
      return;
    }

    next();
  };
}

/**
 * Export rate limit store for external use
 */
export { MemoryRateLimitStore };
export type { RateLimitStore };