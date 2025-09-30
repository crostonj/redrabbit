/**
 * Notification Service
 * Business logic layer for order status updates, customer communications, and event broadcasting
 * 
 * Handles multi-channel notifications (email, SMS, push), template management, 
 * notification preferences, and delivery tracking for customer communications
 */

// Note: NotificationTemplate model types would be imported here when available
// import type { NotificationTemplate, NotificationDelivery } from '../models/NotificationTemplate.js';

/**
 * Notification Channel Types
 */
export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook' | 'in_app';

/**
 * Notification Template Types
 */
export type NotificationTemplateType = 
  | 'order_confirmation'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'payment_confirmation'
  | 'payment_failed'
  | 'low_stock_alert'
  | 'out_of_stock_alert'
  | 'welcome_customer'
  | 'password_reset'
  | 'account_verification'
  | 'promotional_offer'
  | 'order_reminder'
  | 'review_request';

/**
 * Notification Priority Levels
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notification Template Configuration
 */
export interface NotificationTemplate {
  id?: string;
  name: string;
  type: NotificationTemplateType;
  channel: NotificationChannel;
  subject: string;
  body: string;
  htmlBody?: string;
  variables: string[]; // Template variables like {{customerName}}, {{orderNumber}}
  priority: NotificationPriority;
  active: boolean;
  metadata?: {
    senderName?: string;
    senderEmail?: string;
    replyTo?: string;
    category?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Customer Notification Preferences
 */
export interface NotificationPreferences {
  customerId: string;
  channels: {
    email?: {
      enabled: boolean;
      address: string;
      verified: boolean;
    };
    sms?: {
      enabled: boolean;
      phoneNumber: string;
      verified: boolean;
    };
    push?: {
      enabled: boolean;
      deviceTokens: string[];
    };
    in_app?: {
      enabled: boolean;
    };
  };
  templatePreferences: {
    [key in NotificationTemplateType]?: {
      enabled: boolean;
      preferredChannels: NotificationChannel[];
    };
  };
  quietHours?: {
    enabled: boolean;
    startTime: string; // HH:mm format
    endTime: string; // HH:mm format
    timezone: string;
  };
  frequency?: {
    promotional: 'never' | 'weekly' | 'monthly';
    transactional: 'immediate' | 'daily_digest';
  };
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Notification Request
 */
export interface NotificationRequest {
  templateType: NotificationTemplateType;
  customerId: string;
  channels?: NotificationChannel[]; // If not specified, uses customer preferences
  priority?: NotificationPriority;
  variables: Record<string, any>;
  metadata?: Record<string, any>;
  scheduledAt?: Date; // For scheduled notifications
  expiresAt?: Date; // When notification becomes irrelevant
}

/**
 * Notification Delivery Record
 */
export interface NotificationDelivery {
  id: string;
  templateId: string;
  templateType: NotificationTemplateType;
  customerId: string;
  channel: NotificationChannel;
  recipient: string; // email address, phone number, etc.
  subject: string;
  body: string;
  htmlBody?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'cancelled';
  priority: NotificationPriority;
  attempts: NotificationAttempt[];
  scheduledAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  metadata?: Record<string, any>;
  error?: string;
}

/**
 * Notification Attempt Record
 */
export interface NotificationAttempt {
  attemptNumber: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  providerResponse?: any;
  duration?: number; // milliseconds
}

/**
 * Notification Service Errors
 */
export class NotificationServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'NotificationServiceError';
  }
}

export class TemplateNotFoundError extends NotificationServiceError {
  constructor(templateType: NotificationTemplateType, channel: NotificationChannel) {
    super(
      `Notification template not found: ${templateType} for ${channel}`,
      'TEMPLATE_NOT_FOUND',
      { templateType, channel }
    );
  }
}

export class InvalidRecipientError extends NotificationServiceError {
  constructor(channel: NotificationChannel, recipient: string) {
    super(
      `Invalid recipient for ${channel}: ${recipient}`,
      'INVALID_RECIPIENT',
      { channel, recipient }
    );
  }
}

export class NotificationDeliveryError extends NotificationServiceError {
  constructor(deliveryId: string, error: string) {
    super(
      `Notification delivery failed: ${deliveryId} - ${error}`,
      'DELIVERY_FAILED',
      { deliveryId, error }
    );
  }
}

/**
 * Notification Service Implementation
 */
export class NotificationService {
  private static templates: Map<string, NotificationTemplate> = new Map();
  private static preferences: Map<string, NotificationPreferences> = new Map();
  private static deliveries: Map<string, NotificationDelivery> = new Map();
  private static deliveryQueue: string[] = [];
  private static isProcessingQueue = false;
  private static templateCounter = 1;
  private static deliveryCounter = 1;

  // Default templates - would normally be loaded from database
  private static defaultTemplates: NotificationTemplate[] = [
    {
      name: 'Order Confirmation Email',
      type: 'order_confirmation',
      channel: 'email',
      subject: 'Order Confirmed - #{{orderNumber}}',
      body: `Dear {{customerName}},

Thank you for your order! We've received your order #{{orderNumber}} and it's being processed.

Order Details:
- Order Number: ${'{{orderNumber}}'}
- Order Total: ${'{{orderTotal}}'}
- Estimated Delivery: ${'{{estimatedDelivery}}'}

We'll send you another notification when your order ships.

Best regards,
The RedRabbit Team`,
      htmlBody: `<html><body>
<h2>Order Confirmed</h2>
<p>Dear {{customerName}},</p>
<p>Thank you for your order! We've received your order #{{orderNumber}} and it's being processed.</p>
<h3>Order Details:</h3>
<ul>
<li>Order Number: ${'{{orderNumber}}'}</li>
<li>Order Total: $${'{{orderTotal}}'}</li>
<li>Estimated Delivery: ${'{{estimatedDelivery}}'}</li>
</ul>
<p>We'll send you another notification when your order ships.</p>
<p>Best regards,<br>The RedRabbit Team</p>
</body></html>`,
      variables: ['customerName', 'orderNumber', 'orderTotal', 'estimatedDelivery'],
      priority: 'normal',
      active: true,
      metadata: {
        senderName: 'RedRabbit Orders',
        senderEmail: 'orders@redrabbit.com',
        category: 'transactional'
      }
    },
    {
      name: 'Order Shipped SMS',
      type: 'order_shipped',
      channel: 'sms',
      subject: 'Order Shipped',
      body: 'Great news {{customerName}}! Your order #{{orderNumber}} has shipped. Track: {{trackingNumber}}',
      variables: ['customerName', 'orderNumber', 'trackingNumber'],
      priority: 'high',
      active: true
    },
    {
      name: 'Low Stock Alert Email',
      type: 'low_stock_alert',
      channel: 'email',
      subject: 'Low Stock Alert - {{productName}}',
      body: `Alert: Product "{{productName}}" is running low.

Current Stock: {{currentStock}} units
Minimum Threshold: {{minThreshold}} units
Reorder Recommended: {{reorderQuantity}} units

Please review inventory levels and consider restocking.`,
      variables: ['productName', 'currentStock', 'minThreshold', 'reorderQuantity'],
      priority: 'urgent',
      active: true,
      metadata: {
        senderEmail: 'inventory@redrabbit.com',
        category: 'operational'
      }
    }
  ];

  /**
   * Initialize the service with default templates
   */
  static initialize(): void {
    // Load default templates
    this.defaultTemplates.forEach(template => {
      const templateId = `tpl_${this.templateCounter++}`;
      const fullTemplate: NotificationTemplate = {
        ...template,
        id: templateId,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.templates.set(templateId, fullTemplate);
    });

    console.log(`NotificationService initialized with ${this.defaultTemplates.length} default templates`);
  }

  /**
   * Create a new notification template
   */
  static async createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
    const templateId = `tpl_${Date.now()}_${this.templateCounter++}`;
    
    const newTemplate: NotificationTemplate = {
      id: templateId,
      name: template.name,
      type: template.type,
      channel: template.channel,
      subject: template.subject,
      body: template.body,
      variables: template.variables,
      priority: template.priority,
      active: template.active,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(template.htmlBody !== undefined && { htmlBody: template.htmlBody }),
      ...(template.metadata !== undefined && { metadata: template.metadata })
    };

    this.templates.set(templateId, newTemplate);
    console.log(`Notification template created: ${templateId} - ${template.name}`);
    
    return newTemplate;
  }

  /**
   * Update an existing notification template
   */
  static async updateTemplate(
    templateId: string, 
    updates: Partial<Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<NotificationTemplate> {
    const template = this.templates.get(templateId);
    
    if (!template) {
      throw new NotificationServiceError(`Template not found: ${templateId}`, 'TEMPLATE_NOT_FOUND');
    }

    const updatedTemplate: NotificationTemplate = {
      ...template,
      ...updates,
      updatedAt: new Date()
    };

    this.templates.set(templateId, updatedTemplate);
    return updatedTemplate;
  }

  /**
   * Get all notification templates
   */
  static getTemplates(): NotificationTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  static getTemplate(templateId: string): NotificationTemplate | null {
    return this.templates.get(templateId) || null;
  }

  /**
   * Find templates by type and channel
   */
  static findTemplate(type: NotificationTemplateType, channel: NotificationChannel): NotificationTemplate | null {
    return Array.from(this.templates.values()).find(
      template => template.type === type && template.channel === channel && template.active
    ) || null;
  }

  /**
   * Set customer notification preferences
   */
  static async setCustomerPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
    const updatedPreferences: NotificationPreferences = {
      ...preferences,
      updatedAt: new Date(),
      ...(preferences.createdAt === undefined && { createdAt: new Date() })
    };

    this.preferences.set(preferences.customerId, updatedPreferences);
    console.log(`Notification preferences updated for customer: ${preferences.customerId}`);
    
    return updatedPreferences;
  }

  /**
   * Get customer notification preferences
   */
  static getCustomerPreferences(customerId: string): NotificationPreferences | null {
    return this.preferences.get(customerId) || null;
  }

  /**
   * Send notification based on request
   */
  static async sendNotification(request: NotificationRequest): Promise<NotificationDelivery[]> {
    // Get customer preferences
    const preferences = this.getCustomerPreferences(request.customerId);
    
    // Determine channels to use
    const channels = this.determineChannels(request, preferences);
    
    if (channels.length === 0) {
      console.log(`No notification channels enabled for customer ${request.customerId} and template ${request.templateType}`);
      return [];
    }

    const deliveries: NotificationDelivery[] = [];

    // Create deliveries for each channel
    for (const channel of channels) {
      try {
        const delivery = await this.createDelivery(request, channel, preferences);
        deliveries.push(delivery);
        
        // Queue for immediate delivery unless scheduled
        if (!request.scheduledAt || request.scheduledAt <= new Date()) {
          this.queueDelivery(delivery.id);
        }
      } catch (error) {
        console.error(`Failed to create delivery for ${channel}:`, error);
      }
    }

    // Process the delivery queue
    this.processDeliveryQueue();

    return deliveries;
  }

  /**
   * Send bulk notifications (e.g., promotional campaigns)
   */
  static async sendBulkNotification(
    templateType: NotificationTemplateType,
    customerIds: string[],
    variables: Record<string, any>,
    options?: {
      channels?: NotificationChannel[];
      priority?: NotificationPriority;
      scheduledAt?: Date;
    }
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];

    for (const customerId of customerIds) {
      const request: NotificationRequest = {
        templateType,
        customerId,
        variables,
        ...(options?.channels !== undefined && { channels: options.channels }),
        ...(options?.priority !== undefined && { priority: options.priority }),
        ...(options?.scheduledAt !== undefined && { scheduledAt: options.scheduledAt })
      };

      const customerDeliveries = await this.sendNotification(request);
      deliveries.push(...customerDeliveries);
    }

    return deliveries;
  }

  /**
   * Process scheduled notifications
   */
  static async processScheduledNotifications(): Promise<void> {
    const now = new Date();
    const scheduledDeliveries = Array.from(this.deliveries.values())
      .filter(delivery => 
        delivery.status === 'pending' && 
        delivery.scheduledAt <= now &&
        !this.deliveryQueue.includes(delivery.id)
      );

    for (const delivery of scheduledDeliveries) {
      this.queueDelivery(delivery.id);
    }

    if (scheduledDeliveries.length > 0) {
      this.processDeliveryQueue();
    }
  }

  /**
   * Get delivery by ID
   */
  static getDelivery(deliveryId: string): NotificationDelivery | null {
    return this.deliveries.get(deliveryId) || null;
  }

  /**
   * Get deliveries for a customer
   */
  static getCustomerDeliveries(customerId: string): NotificationDelivery[] {
    return Array.from(this.deliveries.values())
      .filter(delivery => delivery.customerId === customerId);
  }

  /**
   * Get failed deliveries that can be retried
   */
  static getFailedDeliveries(): NotificationDelivery[] {
    return Array.from(this.deliveries.values())
      .filter(delivery => delivery.status === 'failed');
  }

  /**
   * Retry failed notification delivery
   */
  static async retryDelivery(deliveryId: string): Promise<boolean> {
    const delivery = this.deliveries.get(deliveryId);
    
    if (!delivery) {
      throw new NotificationServiceError(`Delivery not found: ${deliveryId}`, 'DELIVERY_NOT_FOUND');
    }

    if (delivery.status === 'delivered' || delivery.status === 'sent') {
      throw new NotificationServiceError(`Cannot retry delivered notification: ${deliveryId}`, 'ALREADY_DELIVERED');
    }

    // Reset delivery status and queue for retry
    delivery.status = 'pending';
    this.deliveries.set(deliveryId, delivery);
    
    this.queueDelivery(deliveryId);
    this.processDeliveryQueue();

    return true;
  }

  // Private helper methods

  /**
   * Determine which channels to use for notification
   */
  private static determineChannels(
    request: NotificationRequest, 
    preferences: NotificationPreferences | null
  ): NotificationChannel[] {
    // If channels specified in request, use those
    if (request.channels && request.channels.length > 0) {
      return request.channels;
    }

    // If no preferences, use email as default
    if (!preferences) {
      return ['email'];
    }

    // Check template preferences
    const templatePrefs = preferences.templatePreferences[request.templateType];
    if (templatePrefs && !templatePrefs.enabled) {
      return []; // Customer has disabled this template type
    }

    // Get preferred channels from template preferences
    if (templatePrefs && templatePrefs.preferredChannels.length > 0) {
      return templatePrefs.preferredChannels.filter(channel => 
        this.isChannelEnabled(channel, preferences)
      );
    }

    // Fall back to all enabled channels
    const enabledChannels: NotificationChannel[] = [];
    
    if (preferences.channels.email?.enabled) enabledChannels.push('email');
    if (preferences.channels.sms?.enabled) enabledChannels.push('sms');
    if (preferences.channels.push?.enabled) enabledChannels.push('push');
    if (preferences.channels.in_app?.enabled) enabledChannels.push('in_app');

    return enabledChannels;
  }

  /**
   * Check if a specific channel is enabled for customer
   */
  private static isChannelEnabled(channel: NotificationChannel, preferences: NotificationPreferences): boolean {
    switch (channel) {
      case 'email':
        return preferences.channels.email?.enabled === true;
      case 'sms':
        return preferences.channels.sms?.enabled === true;
      case 'push':
        return preferences.channels.push?.enabled === true;
      case 'in_app':
        return preferences.channels.in_app?.enabled === true;
      default:
        return false;
    }
  }

  /**
   * Create a notification delivery record
   */
  private static async createDelivery(
    request: NotificationRequest,
    channel: NotificationChannel,
    preferences: NotificationPreferences | null
  ): Promise<NotificationDelivery> {
    // Find appropriate template
    const template = this.findTemplate(request.templateType, channel);
    if (!template) {
      throw new TemplateNotFoundError(request.templateType, channel);
    }

    // Get recipient address
    const recipient = this.getRecipientAddress(channel, preferences, request.customerId);
    if (!recipient) {
      throw new InvalidRecipientError(channel, 'not configured');
    }

    // Process template variables
    const processedSubject = this.processTemplate(template.subject, request.variables);
    const processedBody = this.processTemplate(template.body, request.variables);
    const processedHtmlBody = template.htmlBody 
      ? this.processTemplate(template.htmlBody, request.variables)
      : undefined;

    const deliveryId = `ntf_${Date.now()}_${this.deliveryCounter++}`;
    const scheduledAt = request.scheduledAt || new Date();

    const delivery: NotificationDelivery = {
      id: deliveryId,
      templateId: template.id!,
      templateType: request.templateType,
      customerId: request.customerId,
      channel,
      recipient,
      subject: processedSubject,
      body: processedBody,
      status: 'pending',
      priority: request.priority || template.priority,
      attempts: [],
      scheduledAt,
      metadata: {
        ...request.metadata,
        templateName: template.name
      },
      ...(processedHtmlBody !== undefined && { htmlBody: processedHtmlBody })
    };

    this.deliveries.set(deliveryId, delivery);
    return delivery;
  }

  /**
   * Get recipient address for channel
   */
  private static getRecipientAddress(
    channel: NotificationChannel, 
    preferences: NotificationPreferences | null, 
    customerId: string
  ): string | null {
    if (!preferences) {
      // Default fallback addresses for testing
      switch (channel) {
        case 'email':
          return `customer-${customerId}@example.com`;
        case 'sms':
          return `+1555${customerId.slice(-7)}`;
        default:
          return null;
      }
    }

    switch (channel) {
      case 'email':
        return preferences.channels.email?.address || null;
      case 'sms':
        return preferences.channels.sms?.phoneNumber || null;
      case 'push':
        return preferences.channels.push?.deviceTokens?.[0] || null;
      case 'in_app':
        return customerId; // Use customer ID for in-app notifications
      default:
        return null;
    }
  }

  /**
   * Process template with variables
   */
  private static processTemplate(template: string, variables: Record<string, any>): string {
    let processed = template;
    
    // Replace {{variable}} patterns
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, String(value));
    });

    return processed;
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
   * Process notification delivery queue
   */
  private static async processDeliveryQueue(): Promise<void> {
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
   * Attempt to deliver notification
   */
  private static async attemptDelivery(delivery: NotificationDelivery): Promise<void> {
    const attemptNumber = delivery.attempts.length + 1;
    const startTime = Date.now();

    try {
      // Simulate delivery based on channel
      const success = await this.deliverToChannel(delivery);
      
      const duration = Date.now() - startTime;
      
      const attempt: NotificationAttempt = {
        attemptNumber,
        timestamp: new Date(),
        success,
        duration
      };

      delivery.attempts.push(attempt);

      if (success) {
        delivery.status = 'sent';
        delivery.sentAt = new Date();
        
        // Simulate delivery confirmation after some delay
        setTimeout(() => {
          delivery.status = 'delivered';
          delivery.deliveredAt = new Date();
          this.deliveries.set(delivery.id, delivery);
        }, 1000 + Math.random() * 5000); // 1-6 seconds

        console.log(`Notification sent successfully: ${delivery.id} via ${delivery.channel} to ${delivery.recipient}`);
      } else {
        delivery.status = 'failed';
        delivery.failedAt = new Date();
        delivery.error = 'Simulated delivery failure';
        
        attempt.error = 'Simulated delivery failure';
        
        console.log(`Notification delivery failed: ${delivery.id} via ${delivery.channel}`);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      
      const attempt: NotificationAttempt = {
        attemptNumber,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration
      };

      delivery.attempts.push(attempt);
      delivery.status = 'failed';
      delivery.failedAt = new Date();
      if (attempt.error !== undefined) {
        delivery.error = attempt.error;
      }
    }

    this.deliveries.set(delivery.id, delivery);
  }

  /**
   * Simulate delivery to specific channel
   */
  private static async deliverToChannel(delivery: NotificationDelivery): Promise<boolean> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 1000));

    // Simulate different success rates by channel
    const random = Math.random();
    
    switch (delivery.channel) {
      case 'email':
        return random < 0.95; // 95% success rate
      case 'sms':
        return random < 0.90; // 90% success rate
      case 'push':
        return random < 0.85; // 85% success rate (devices may be offline)
      case 'in_app':
        return random < 0.99; // 99% success rate
      default:
        return random < 0.80; // 80% success rate for other channels
    }
  }

  /**
   * Get notification delivery statistics
   */
  static getDeliveryStats(): {
    totalNotifications: number;
    pendingCount: number;
    sentCount: number;
    deliveredCount: number;
    failedCount: number;
    channelBreakdown: Record<NotificationChannel, number>;
    deliveryRate: number;
  } {
    const deliveries = Array.from(this.deliveries.values());
    const totalNotifications = deliveries.length;
    const pendingCount = deliveries.filter(d => d.status === 'pending').length;
    const sentCount = deliveries.filter(d => d.status === 'sent').length;
    const deliveredCount = deliveries.filter(d => d.status === 'delivered').length;
    const failedCount = deliveries.filter(d => d.status === 'failed').length;

    // Channel breakdown
    const channelBreakdown: Record<string, number> = {};
    deliveries.forEach(delivery => {
      channelBreakdown[delivery.channel] = (channelBreakdown[delivery.channel] || 0) + 1;
    });

    const deliveryRate = totalNotifications > 0 
      ? ((sentCount + deliveredCount) / totalNotifications) * 100 
      : 0;

    return {
      totalNotifications,
      pendingCount,
      sentCount,
      deliveredCount,
      failedCount,
      channelBreakdown: channelBreakdown as Record<NotificationChannel, number>,
      deliveryRate: Math.round(deliveryRate * 100) / 100
    };
  }

  /**
   * Clean up old notification records
   */
  static cleanupOldNotifications(olderThanDays = 90): number {
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
    
    console.log(`Cleaned up ${cleanedCount} old notification deliveries`);
    return cleanedCount;
  }
}

// Initialize the service with default templates
NotificationService.initialize();