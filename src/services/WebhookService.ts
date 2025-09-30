/**
 * Webhook Service
 * Business logic layer for webhook delivery, retry mechanisms, and subscription management
 * 
 * Handles webhook subscriptions, reliable delivery with retry logic, and webhook validation
 * for external system integrations and real-time event notifications
 */

// Note: WebhookSubscription model types would be imported here when available
// import type { WebhookSubscription, WebhookDelivery } from '../models/WebhookSubscription.js';

/**
 * Webhook Event Types
 */
export type WebhookEventType = 
  | 'order.created'
  | 'order.updated'
  | 'order.cancelled'
  | 'order.confirmed'
  | 'order.shipped'
  | 'order.delivered'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.refunded'
  | 'inventory.low_stock'
  | 'inventory.out_of_stock'
  | 'customer.created'
  | 'customer.updated';

/**
 * Webhook Subscription Configuration
 */
export interface WebhookSubscription {
  id?: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  active: boolean;
  description?: string;
  headers?: Record<string, string>;
  retryConfig?: {
    maxRetries: number;
    retryDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
  };
  filters?: {
    customerId?: string;
    productId?: string;
    orderStatus?: string[];
  };
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Webhook Delivery Attempt
 */
export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventType: WebhookEventType;
  eventId: string;
  payload: Record<string, any>;
  url: string;
  httpMethod: 'POST';
  headers: Record<string, string>;
  status: 'pending' | 'delivered' | 'failed' | 'cancelled';
  attempts: WebhookAttempt[];
  scheduledAt: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  nextRetryAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Individual Webhook Attempt
 */
export interface WebhookAttempt {
  attemptNumber: number;
  timestamp: Date;
  httpStatus?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  error?: string;
  duration?: number; // milliseconds
  success: boolean;
}

/**
 * Webhook Event Payload
 */
export interface WebhookEventPayload {
  eventId: string;
  eventType: WebhookEventType;
  timestamp: Date;
  data: Record<string, any>;
  metadata?: {
    source: string;
    version: string;
    retryCount?: number;
    correlationId?: string;
  };
}

/**
 * Webhook Delivery Configuration
 */
export interface WebhookDeliveryConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  verifySSL: boolean;
}

/**
 * Webhook Service Errors
 */
export class WebhookServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'WebhookServiceError';
  }
}

export class InvalidWebhookUrlError extends WebhookServiceError {
  constructor(url: string) {
    super(
      `Invalid webhook URL: ${url}`,
      'INVALID_WEBHOOK_URL',
      { url }
    );
  }
}

export class WebhookDeliveryError extends WebhookServiceError {
  constructor(url: string, error: string, httpStatus?: number) {
    super(
      `Webhook delivery failed to ${url}: ${error}`,
      'WEBHOOK_DELIVERY_FAILED',
      { url, error, httpStatus }
    );
  }
}

export class SubscriptionNotFoundError extends WebhookServiceError {
  constructor(subscriptionId: string) {
    super(
      `Webhook subscription not found: ${subscriptionId}`,
      'SUBSCRIPTION_NOT_FOUND',
      { subscriptionId }
    );
  }
}

/**
 * Webhook Service Implementation
 */
export class WebhookService {
  private static subscriptions: Map<string, WebhookSubscription> = new Map();
  private static deliveries: Map<string, WebhookDelivery> = new Map();
  private static deliveryQueue: string[] = [];
  private static isProcessingQueue = false;
  private static subscriptionCounter = 1;
  private static deliveryCounter = 1;

  // Default configuration
  private static defaultConfig: WebhookDeliveryConfig = {
    timeoutMs: 30000, // 30 seconds
    maxRetries: 5,
    retryDelayMs: 1000, // 1 second
    backoffMultiplier: 2,
    maxDelayMs: 300000, // 5 minutes
    verifySSL: true
  };

  /**
   * Create a new webhook subscription
   */
  static async createSubscription(subscription: Omit<WebhookSubscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookSubscription> {
    // Validate URL
    if (!this.isValidUrl(subscription.url)) {
      throw new InvalidWebhookUrlError(subscription.url);
    }

    // Generate subscription ID
    const subscriptionId = `sub_${Date.now()}_${this.subscriptionCounter++}`;
    
    const newSubscription: WebhookSubscription = {
      id: subscriptionId,
      url: subscription.url,
      events: subscription.events,
      secret: subscription.secret,
      active: subscription.active,
      headers: subscription.headers || {},
      retryConfig: subscription.retryConfig || {
        maxRetries: this.defaultConfig.maxRetries,
        retryDelayMs: this.defaultConfig.retryDelayMs,
        backoffMultiplier: this.defaultConfig.backoffMultiplier,
        maxDelayMs: this.defaultConfig.maxDelayMs
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(subscription.description !== undefined && { description: subscription.description }),
      ...(subscription.filters !== undefined && { filters: subscription.filters })
    };

    this.subscriptions.set(subscriptionId, newSubscription);
    
    console.log(`Webhook subscription created: ${subscriptionId} -> ${subscription.url}`);
    
    return newSubscription;
  }

  /**
   * Update an existing webhook subscription
   */
  static async updateSubscription(
    subscriptionId: string, 
    updates: Partial<Omit<WebhookSubscription, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<WebhookSubscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      throw new SubscriptionNotFoundError(subscriptionId);
    }

    // Validate URL if being updated
    if (updates.url && !this.isValidUrl(updates.url)) {
      throw new InvalidWebhookUrlError(updates.url);
    }

    const updatedSubscription: WebhookSubscription = {
      ...subscription,
      ...updates,
      updatedAt: new Date()
    };

    this.subscriptions.set(subscriptionId, updatedSubscription);
    
    return updatedSubscription;
  }

  /**
   * Delete a webhook subscription
   */
  static async deleteSubscription(subscriptionId: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    
    if (!subscription) {
      throw new SubscriptionNotFoundError(subscriptionId);
    }

    this.subscriptions.delete(subscriptionId);
    console.log(`Webhook subscription deleted: ${subscriptionId}`);
    
    return true;
  }

  /**
   * Get all webhook subscriptions
   */
  static getSubscriptions(): WebhookSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Get subscription by ID
   */
  static getSubscription(subscriptionId: string): WebhookSubscription | null {
    return this.subscriptions.get(subscriptionId) || null;
  }

  /**
   * Send webhook event to all matching subscriptions
   */
  static async sendWebhookEvent(eventType: WebhookEventType, data: Record<string, any>, metadata?: Record<string, any>): Promise<WebhookDelivery[]> {
    const matchingSubscriptions = this.getMatchingSubscriptions(eventType, data);
    
    if (matchingSubscriptions.length === 0) {
      console.log(`No webhook subscriptions found for event: ${eventType}`);
      return [];
    }

    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const payload: WebhookEventPayload = {
      eventId,
      eventType,
      timestamp: new Date(),
      data,
      metadata: {
        source: 'redrabbit-orders-api',
        version: '1.0',
        ...metadata
      }
    };

    const deliveries: WebhookDelivery[] = [];

    for (const subscription of matchingSubscriptions) {
      const delivery = await this.createDelivery(subscription, eventType, eventId, payload);
      deliveries.push(delivery);
      
      // Queue for immediate delivery
      this.queueDelivery(delivery.id);
    }

    // Process the delivery queue
    this.processDeliveryQueue();

    return deliveries;
  }

  /**
   * Retry failed webhook delivery
   */
  static async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.get(deliveryId);
    
    if (!delivery) {
      throw new WebhookServiceError(`Webhook delivery not found: ${deliveryId}`, 'DELIVERY_NOT_FOUND');
    }

    if (delivery.status === 'delivered') {
      throw new WebhookServiceError(`Cannot retry delivered webhook: ${deliveryId}`, 'ALREADY_DELIVERED');
    }

    // Reset delivery status and queue for retry
    delivery.status = 'pending';
    delivery.nextRetryAt = new Date();
    this.deliveries.set(deliveryId, delivery);
    
    this.queueDelivery(deliveryId);
    this.processDeliveryQueue();

    return true;
  }

  /**
   * Get webhook delivery by ID
   */
  static getDelivery(deliveryId: string): WebhookDelivery | null {
    return this.deliveries.get(deliveryId) || null;
  }

  /**
   * Get deliveries for a subscription
   */
  static getDeliveriesForSubscription(subscriptionId: string): WebhookDelivery[] {
    return Array.from(this.deliveries.values())
      .filter(delivery => delivery.subscriptionId === subscriptionId);
  }

  /**
   * Get failed deliveries that can be retried
   */
  static getFailedDeliveries(): WebhookDelivery[] {
    return Array.from(this.deliveries.values())
      .filter(delivery => 
        delivery.status === 'failed' && 
        delivery.nextRetryAt && 
        delivery.nextRetryAt <= new Date()
      );
  }

  /**
   * Process pending webhook deliveries
   */
  static async processDeliveryQueue(): Promise<void> {
    if (this.isProcessingQueue || this.deliveryQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.deliveryQueue.length > 0) {
        const deliveryId = this.deliveryQueue.shift();
        if (!deliveryId) continue;

        const delivery = this.deliveries.get(deliveryId);
        if (!delivery || delivery.status !== 'pending') continue;

        await this.attemptDelivery(delivery);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Validate webhook signature (for incoming webhooks)
   */
  static validateSignature(payload: string, signature: string, secret: string): boolean {
    // In a real implementation, this would use HMAC-SHA256 with the secret
    // For now, we'll do a simple check
    const expectedSignature = `sha256=${Buffer.from(payload + secret).toString('base64')}`;
    return signature === expectedSignature;
  }

  /**
   * Generate webhook signature for outgoing webhooks
   */
  static generateSignature(payload: string, secret: string): string {
    // In a real implementation, this would use HMAC-SHA256
    return `sha256=${Buffer.from(payload + secret).toString('base64')}`;
  }

  // Private helper methods

  /**
   * Get subscriptions that match the event type and filters
   */
  private static getMatchingSubscriptions(eventType: WebhookEventType, data: Record<string, any>): WebhookSubscription[] {
    return Array.from(this.subscriptions.values()).filter(subscription => {
      // Must be active
      if (!subscription.active) return false;

      // Must include this event type
      if (!subscription.events.includes(eventType)) return false;

      // Apply filters if present
      if (subscription.filters) {
        const { customerId, productId, orderStatus } = subscription.filters;

        if (customerId && data.customerId !== customerId) return false;
        if (productId && data.productId !== productId) return false;
        if (orderStatus && orderStatus.length > 0 && !orderStatus.includes(data.status)) return false;
      }

      return true;
    });
  }

  /**
   * Create a new webhook delivery record
   */
  private static async createDelivery(
    subscription: WebhookSubscription,
    eventType: WebhookEventType,
    eventId: string,
    payload: WebhookEventPayload
  ): Promise<WebhookDelivery> {
    const deliveryId = `del_${Date.now()}_${this.deliveryCounter++}`;
    
    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'RedRabbit-Webhooks/1.0',
      'X-Webhook-Event': eventType,
      'X-Webhook-Event-ID': eventId,
      'X-Webhook-Delivery': deliveryId,
      ...subscription.headers
    };

    // Add signature header
    const payloadString = JSON.stringify(payload);
    headers['X-Webhook-Signature'] = this.generateSignature(payloadString, subscription.secret);

    const delivery: WebhookDelivery = {
      id: deliveryId,
      subscriptionId: subscription.id!,
      eventType,
      eventId,
      payload,
      url: subscription.url,
      httpMethod: 'POST',
      headers,
      status: 'pending',
      attempts: [],
      scheduledAt: new Date(),
      metadata: {
        retryConfig: subscription.retryConfig
      }
    };

    this.deliveries.set(deliveryId, delivery);
    return delivery;
  }

  /**
   * Queue delivery for processing
   */
  private static queueDelivery(deliveryId: string): void {
    if (!this.deliveryQueue.includes(deliveryId)) {
      this.deliveryQueue.push(deliveryId);
    }
  }

  /**
   * Attempt webhook delivery
   */
  private static async attemptDelivery(delivery: WebhookDelivery): Promise<void> {
    const subscription = this.subscriptions.get(delivery.subscriptionId);
    if (!subscription) {
      delivery.status = 'cancelled';
      delivery.failedAt = new Date();
      this.deliveries.set(delivery.id, delivery);
      return;
    }

    const attemptNumber = delivery.attempts.length + 1;
    const startTime = Date.now();

    try {
      // Simulate HTTP request
      const result = await this.makeHttpRequest(
        delivery.url,
        JSON.stringify(delivery.payload),
        delivery.headers
      );

      const duration = Date.now() - startTime;

      const attempt: WebhookAttempt = {
        attemptNumber,
        timestamp: new Date(),
        httpStatus: result.status,
        responseBody: result.body,
        responseHeaders: result.headers,
        duration,
        success: result.status >= 200 && result.status < 300
      };

      delivery.attempts.push(attempt);

      if (attempt.success) {
        delivery.status = 'delivered';
        delivery.deliveredAt = new Date();
        console.log(`Webhook delivered successfully: ${delivery.id} -> ${delivery.url}`);
      } else {
        await this.handleFailedAttempt(delivery, subscription, attempt);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      const attempt: WebhookAttempt = {
        attemptNumber,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : String(error),
        duration,
        success: false
      };

      delivery.attempts.push(attempt);
      await this.handleFailedAttempt(delivery, subscription, attempt);
    }

    this.deliveries.set(delivery.id, delivery);
  }

  /**
   * Handle failed delivery attempt
   */
  private static async handleFailedAttempt(
    delivery: WebhookDelivery,
    subscription: WebhookSubscription,
    attempt: WebhookAttempt
  ): Promise<void> {
    const retryConfig = subscription.retryConfig!;
    const shouldRetry = delivery.attempts.length < retryConfig.maxRetries;

    if (shouldRetry) {
      // Calculate next retry delay with exponential backoff
      const baseDelay = retryConfig.retryDelayMs;
      const backoffDelay = baseDelay * Math.pow(retryConfig.backoffMultiplier, delivery.attempts.length - 1);
      const delayMs = Math.min(backoffDelay, retryConfig.maxDelayMs);

      delivery.nextRetryAt = new Date(Date.now() + delayMs);
      
      console.log(`Webhook delivery failed (attempt ${attempt.attemptNumber}), retrying in ${delayMs}ms: ${delivery.id} -> ${delivery.url}`);
      
      // Schedule retry
      setTimeout(() => {
        this.queueDelivery(delivery.id);
        this.processDeliveryQueue();
      }, delayMs);
      
    } else {
      delivery.status = 'failed';
      delivery.failedAt = new Date();
      
      console.log(`Webhook delivery failed permanently after ${delivery.attempts.length} attempts: ${delivery.id} -> ${delivery.url}`);
      
      // Could trigger an alert or notification here
    }
  }

  /**
   * Mock HTTP request implementation
   */
  private static async makeHttpRequest(
    url: string,
    payloadString: string,
    headers: Record<string, string>
  ): Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 500));

    // Simulate various HTTP responses
    const random = Math.random();
    
    // Parse payload to get eventId for response
    let eventId = 'unknown';
    try {
      const parsedPayload = JSON.parse(payloadString);
      eventId = parsedPayload.eventId || 'unknown';
    } catch {
      // Ignore parsing errors
    }
    
    if (random < 0.80) {
      // 80% success rate
      return {
        status: 200,
        body: JSON.stringify({ received: true, eventId }),
        headers: { 'content-type': 'application/json' }
      };
    } else if (random < 0.90) {
      // 10% temporary failure (should retry)
      return {
        status: 503,
        body: JSON.stringify({ error: 'Service temporarily unavailable' }),
        headers: { 'content-type': 'application/json' }
      };
    } else {
      // 10% client error (should not retry)
      return {
        status: 400,
        body: JSON.stringify({ error: 'Bad request format' }),
        headers: { 'content-type': 'application/json' }
      };
    }
  }

  /**
   * Validate webhook URL
   */
  private static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get delivery statistics
   */
  static getDeliveryStats(): {
    totalDeliveries: number;
    pendingDeliveries: number;
    deliveredCount: number;
    failedCount: number;
    averageDeliveryTime: number;
    successRate: number;
  } {
    const deliveries = Array.from(this.deliveries.values());
    const totalDeliveries = deliveries.length;
    const pendingDeliveries = deliveries.filter(d => d.status === 'pending').length;
    const deliveredCount = deliveries.filter(d => d.status === 'delivered').length;
    const failedCount = deliveries.filter(d => d.status === 'failed').length;

    // Calculate average delivery time from successful deliveries
    const successfulDeliveries = deliveries.filter(d => d.status === 'delivered' && d.deliveredAt && d.scheduledAt);
    const totalDeliveryTime = successfulDeliveries.reduce((sum, d) => {
      return sum + (d.deliveredAt!.getTime() - d.scheduledAt.getTime());
    }, 0);
    
    const averageDeliveryTime = successfulDeliveries.length > 0 
      ? totalDeliveryTime / successfulDeliveries.length 
      : 0;

    const successRate = totalDeliveries > 0 ? (deliveredCount / totalDeliveries) * 100 : 0;

    return {
      totalDeliveries,
      pendingDeliveries,
      deliveredCount,
      failedCount,
      averageDeliveryTime: Math.round(averageDeliveryTime),
      successRate: Math.round(successRate * 100) / 100
    };
  }

  /**
   * Clean up old delivery records (should be run periodically)
   */
  static cleanupOldDeliveries(olderThanDays = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    let cleanedCount = 0;
    
    for (const [id, delivery] of this.deliveries.entries()) {
      if (delivery.scheduledAt < cutoffDate && 
          (delivery.status === 'delivered' || delivery.status === 'failed')) {
        this.deliveries.delete(id);
        cleanedCount++;
      }
    }
    
    console.log(`Cleaned up ${cleanedCount} old webhook deliveries`);
    return cleanedCount;
  }
}