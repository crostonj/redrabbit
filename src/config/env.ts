import { z } from 'zod';

/**
 * Environment configuration schema with validation
 * Uses Zod for runtime validation and TypeScript inference
 */
const envSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()).default('3000'),
  HOST: z.string().default('localhost'),

  // Database configuration
  DATABASE_URL: z.string().url().describe('PostgreSQL connection string').default('postgresql://postgres:password@localhost:5432/orders_test'),
  DATABASE_POOL_MIN: z.string().transform(Number).pipe(z.number().int().min(0)).default('2'),
  DATABASE_POOL_MAX: z.string().transform(Number).pipe(z.number().int().positive()).default('10'),
  DATABASE_TIMEOUT: z.string().transform(Number).pipe(z.number().int().positive()).default('30000'),

  // Authentication
  JWT_SECRET: z.string().min(32).describe('JWT signing secret - minimum 32 characters').default('test-fallback-secret-key-minimum-32-characters!!'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // API Configuration
  API_RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().int().positive()).default('900000'), // 15 minutes
  API_RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().int().positive()).default('100'),
  
  // CORS Configuration
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001')
    .transform(val => val.split(',')),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // External services (optional)
  PAYMENT_PROCESSOR_URL: z.string().url().optional(),
  PAYMENT_PROCESSOR_API_KEY: z.string().optional(),
  INVENTORY_SERVICE_URL: z.string().url().optional(),
  INVENTORY_SERVICE_API_KEY: z.string().optional(),
  
  // Webhook configuration
  WEBHOOK_SECRET: z.string().min(16).optional(),
  WEBHOOK_TIMEOUT_MS: z.string().transform(Number).pipe(z.number().int().positive()).default('5000'),
  
  // Monitoring (optional)
  MONITORING_ENABLED: z.string().transform(val => val === 'true').default('false'),
  HEALTH_CHECK_TIMEOUT_MS: z.string().transform(Number).pipe(z.number().int().positive()).default('5000')
});

/**
 * Validated environment configuration
 * Type is automatically inferred from the Zod schema
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws detailed error if validation fails
 */
export function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      throw new Error(
        `Environment validation failed:\n${errorMessages}\n\n` +
        'Please check your environment variables and .env file.'
      );
    }
    throw error;
  }
}

/**
 * Get validated environment configuration
 * Caches result after first validation
 */
let cachedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

/**
 * Check if running in development mode
 */
export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === 'development';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return getConfig().NODE_ENV === 'production';
}

/**
 * Check if running in test mode
 */
export function isTest(): boolean {
  return getConfig().NODE_ENV === 'test';
}