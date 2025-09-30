import { z } from 'zod';

/**
 * Environment configuration schema with comprehensive validation
 * Validates all environment variables required for the microservice
 */
// Custom boolean coercion to handle common string representations reliably
const booleanFromEnv = () => z.preprocess((val) => {
  if (typeof val === 'boolean') return val;
  if (val == null) return undefined;
  const str = String(val).trim().toLowerCase();
  if (['true','1','yes','y','on','enabled'].includes(str)) return true;
  if (['false','0','no','n','off','disabled'].includes(str)) return false;
  return val; // fall back to let zod attempt normal coercion / fail
}, z.boolean());

const environmentSchema = z.object({
  // Application Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1000).max(65535).default(3000),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Database Configuration (Constitution compliant)
  DATABASE_URL: z.string().url().startsWith('postgres', 'Must be a valid PostgreSQL connection string'),
  DB_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(5000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),

  // Authentication Configuration (Constitution compliant - asymmetric JWT preferred)
  JWT_JWKS_URL: z.string().url().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_ISSUER: z.string().default('redrabbit-orders'),
  API_KEY_SALT: z.string().min(16, 'API key salt must be at least 16 characters'),

  // Security Configuration
  CORS_ORIGINS: z.string().transform(str => str.split(',').map(s => s.trim())).default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  // External Service Configuration (Constitution compliant)
  PAYMENT_PROCESSOR_URL: z.string().url().optional(),
  PAYMENT_PROCESSOR_API_KEY: z.string().optional(),
  WEBHOOK_SIGNATURE_SECRET: z.string().min(32, 'Webhook signature secret must be at least 32 characters'),
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  WEBHOOK_MAX_RETRIES: z.coerce.number().int().min(0).default(3),

  // Email/Notification Configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),

  // Monitoring & Health Configuration
  HEALTH_CHECK_INTERVAL_MS: z.coerce.number().int().min(1000).default(30000),
  METRICS_ENABLED: booleanFromEnv().default(true),
  REQUEST_LOGGING: booleanFromEnv().default(true),

  // Feature Flags
  ENABLE_WEBHOOKS: booleanFromEnv().default(true),
  ENABLE_EMAIL_NOTIFICATIONS: booleanFromEnv().default(false),
  ENABLE_INVENTORY_RESERVATIONS: booleanFromEnv().default(true),
  ENABLE_RATE_LIMITING: booleanFromEnv().default(true),

  // Development/Testing Configuration
  SEED_DATA: booleanFromEnv().default(false),
  DEBUG_SQL: booleanFromEnv().default(false),
  MOCK_PAYMENT_PROCESSOR: booleanFromEnv().default(false),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Cached environment configuration to avoid repeated parsing
 */
let cachedEnvironment: Environment | null = null;

/**
 * Load and validate environment configuration
 * @param reload Force reload of environment variables
 * @returns Validated environment configuration
 */
export function loadEnvironment(reload = false): Environment {
  if (cachedEnvironment && !reload) {
    return cachedEnvironment;
  }

  try {
    // Parse and validate all environment variables
    cachedEnvironment = environmentSchema.parse(process.env);
    
    // Additional validation rules that depend on multiple variables
    validateEnvironmentRules(cachedEnvironment);
    
    return cachedEnvironment;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Environment validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      
      console.error('\nRequired environment variables:');
      console.error('  DATABASE_URL (postgres://...)');
      console.error('  JWT_JWKS_URL or JWT_PUBLIC_KEY');
      console.error('  WEBHOOK_SIGNATURE_SECRET (min 32 chars)');
      console.error('  API_KEY_SALT (min 16 chars)');
      console.error('\nSee .env.example for complete configuration template');
    } else {
      console.error('Unexpected error loading environment:', error);
    }
    
    throw new Error('Environment configuration validation failed');
  }
}

/**
 * Additional validation rules that require cross-variable checks
 */
function validateEnvironmentRules(env: Environment): void {
  // Production environment checks
  if (env.NODE_ENV === 'production') {
    // Ensure JWT verification is configured (either JWKS URL or public key)
    if (!env.JWT_JWKS_URL && !env.JWT_PUBLIC_KEY) {
      throw new Error('Either JWT_JWKS_URL or JWT_PUBLIC_KEY must be provided for JWT verification');
    }
    
    // Ensure webhook signature secret is strong enough
    if (env.WEBHOOK_SIGNATURE_SECRET.length < 64) {
      console.warn('⚠️  WEBHOOK_SIGNATURE_SECRET should be at least 64 characters in production');
    }
    
    if (env.LOG_LEVEL === 'debug') {
      console.warn('⚠️  Debug logging is enabled in production environment');
    }
    
    if (env.SEED_DATA) {
      throw new Error('SEED_DATA cannot be enabled in production environment');
    }
  }

  // JWT configuration validation
  if (env.JWT_JWKS_URL && env.JWT_PUBLIC_KEY) {
    console.warn('⚠️  Both JWT_JWKS_URL and JWT_PUBLIC_KEY are set. JWKS URL will take precedence.');
  }

  // Development environment helpers
  if (env.NODE_ENV === 'development') {
    if (env.DEBUG_SQL) {
      console.log('🔍 SQL debugging is enabled');
    }
    
    if (env.MOCK_PAYMENT_PROCESSOR) {
      console.log('🎭 Payment processor mocking is enabled');
    }
  }

  // Feature flag consistency
  if (env.ENABLE_EMAIL_NOTIFICATIONS && !env.SMTP_HOST) {
    console.warn('⚠️  Email notifications enabled but SMTP not configured');
  }

  // External service validation
  if (!env.MOCK_PAYMENT_PROCESSOR) {
    if (!env.PAYMENT_PROCESSOR_URL) {
      console.warn('⚠️  Payment processor URL not configured, payments will fail');
    }
  }
}

/**
 * Get environment-specific configuration objects
 */
export function getConfig() {
  const env = loadEnvironment();
  
  return {
    app: {
      env: env.NODE_ENV,
      port: env.PORT,
      logLevel: env.LOG_LEVEL,
    },
    
    database: {
      url: env.DATABASE_URL,
      maxConnections: env.DB_MAX_CONNECTIONS,
      idleTimeoutMs: env.DB_IDLE_TIMEOUT_MS,
      connectionTimeoutMs: env.DB_CONNECTION_TIMEOUT_MS,
      statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
    },
    
    auth: {
      jwtJwksUrl: env.JWT_JWKS_URL,
      jwtPublicKey: env.JWT_PUBLIC_KEY,
      jwtExpiresIn: env.JWT_EXPIRES_IN,
      jwtIssuer: env.JWT_ISSUER,
      apiKeySalt: env.API_KEY_SALT,
      bcryptRounds: env.BCRYPT_ROUNDS,
    },
    
    security: {
      corsOrigins: env.CORS_ORIGINS,
      rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      enableRateLimit: env.ENABLE_RATE_LIMITING,
    },
    
    services: {
      paymentProcessor: {
        url: env.PAYMENT_PROCESSOR_URL,
        apiKey: env.PAYMENT_PROCESSOR_API_KEY,
        secret: env.WEBHOOK_SIGNATURE_SECRET,
        mock: env.MOCK_PAYMENT_PROCESSOR,
      },
      
      email: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.FROM_EMAIL,
        enabled: env.ENABLE_EMAIL_NOTIFICATIONS,
      },
      
      webhooks: {
        enabled: env.ENABLE_WEBHOOKS,
        timeoutMs: env.WEBHOOK_TIMEOUT_MS,
        maxRetries: env.WEBHOOK_MAX_RETRIES,
      },
    },
    
    features: {
      enableWebhooks: env.ENABLE_WEBHOOKS,
      enableEmailNotifications: env.ENABLE_EMAIL_NOTIFICATIONS,
      enableInventoryReservations: env.ENABLE_INVENTORY_RESERVATIONS,
      seedData: env.SEED_DATA,
    },
    
    monitoring: {
      healthCheckIntervalMs: env.HEALTH_CHECK_INTERVAL_MS,
      metricsEnabled: env.METRICS_ENABLED,
      requestLogging: env.REQUEST_LOGGING,
      debugSql: env.DEBUG_SQL,
    },
  };
}

/**
 * Check if current environment is production
 */
export function isProduction(): boolean {
  return loadEnvironment().NODE_ENV === 'production';
}

/**
 * Check if current environment is development
 */
export function isDevelopment(): boolean {
  return loadEnvironment().NODE_ENV === 'development';
}

/**
 * Check if current environment is test
 */
export function isTest(): boolean {
  return loadEnvironment().NODE_ENV === 'test';
}

/**
 * Get a summary of the current configuration for logging
 */
export function getConfigSummary() {
  const env = loadEnvironment();
  
  // Parse DATABASE_URL for display purposes (hide credentials)
  const dbUrl = new URL(env.DATABASE_URL);
  const maskedUrl = `${dbUrl.protocol}//*****:*****@${dbUrl.host}${dbUrl.pathname}`;
  
  return {
    environment: env.NODE_ENV,
    database: maskedUrl,
    features: {
      webhooks: env.ENABLE_WEBHOOKS,
      emails: env.ENABLE_EMAIL_NOTIFICATIONS,
      inventory: env.ENABLE_INVENTORY_RESERVATIONS,
      rateLimit: env.ENABLE_RATE_LIMITING,
    },
    security: {
      cors: env.CORS_ORIGINS.length,
      jwtAuth: env.JWT_JWKS_URL ? 'JWKS' : env.JWT_PUBLIC_KEY ? 'PublicKey' : 'None',
    },
  };
}

// Export the environment type for use in other modules
/**
 * Clear cached environment for testing purposes
 */
export function clearEnvironmentCache(): void {
  cachedEnvironment = null;
}

export default loadEnvironment;