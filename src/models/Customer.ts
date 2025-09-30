/**
 * Customer Model
 * Constitution-compliant customer entity with retail/commercial distinctions and comprehensive management
 * 
 * Key Features:
 * - Retail vs. Commercial customer types
 * - Contact information management
 * - Billing preferences and payment methods
 * - Address management with multiple address types
 * - Customer lifecycle and status tracking
 * - Marketing preferences and consent management
 * - Credit and payment terms for commercial customers
 */

import { z } from 'zod';

/**
 * Customer Type Enumeration
 * Distinguishes between individual consumers and business customers
 */
export const CustomerType = z.enum([
  'retail',      // Individual consumer/end-user
  'commercial',  // Business customer (B2B)
  'wholesale',   // Bulk/wholesale purchaser
  'distributor', // Reseller/distributor
  'government',  // Government entity
  'nonprofit'    // Non-profit organization
]);

/**
 * Customer Status Enumeration
 * Manages customer account lifecycle and access
 */
export const CustomerStatus = z.enum([
  'active',         // Active customer in good standing
  'inactive',       // Temporarily inactive account
  'pending',        // Account created but not yet verified
  'suspended',      // Account suspended due to issues
  'blocked',        // Account blocked (fraud, abuse, etc.)
  'archived',       // Historical record, no longer active
  'prospect',       // Potential customer (lead)
  'churned'         // Previously active, now inactive
]);

/**
 * Communication Preferences
 * How customer prefers to be contacted
 */
export const CommunicationMethod = z.enum([
  'email',
  'phone',
  'sms',
  'mail',
  'fax',
  'none'
]);

/**
 * Marketing Consent Status
 * Tracks opt-in/opt-out for various marketing channels
 */
export const ConsentStatus = z.enum([
  'granted',     // Customer has opted in
  'denied',      // Customer has explicitly opted out
  'unknown',     // Consent status unknown/not collected
  'withdrawn'    // Previously granted, now withdrawn
]);

/**
 * Credit Status for Commercial Customers
 * Tracks creditworthiness and payment behavior
 */
export const CreditStatus = z.enum([
  'excellent',   // Perfect payment history
  'good',        // Generally pays on time
  'fair',        // Some late payments
  'poor',        // Frequent late payments
  'bad',         // Significant payment issues
  'not_rated',   // No credit history or too new
  'under_review' // Currently being evaluated
]);

/**
 * Payment Terms for Commercial Customers
 */
export const PaymentTerms = z.enum([
  'immediate',    // Payment due immediately (COD, prepaid)
  'net_15',      // Payment due within 15 days
  'net_30',      // Payment due within 30 days
  'net_45',      // Payment due within 45 days
  'net_60',      // Payment due within 60 days
  'net_90',      // Payment due within 90 days
  '2_10_net_30', // 2% discount if paid in 10 days, otherwise net 30
  'custom'       // Custom terms specified in contract
]);

/**
 * Base Customer Schema (without refinements)
 * Used for creating derived schemas
 */
const BaseCustomerSchema = z.object({
  // Identity and Classification
  id: z.string().uuid('Customer ID must be a valid UUID'),
  customerNumber: z.string().min(1, 'Customer number is required').max(50),
  type: CustomerType.default('retail'),
  status: CustomerStatus.default('active'),
  
  // Personal Information (for retail customers)
  firstName: z.string().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).optional(),
  middleName: z.string().max(50).optional(),
  title: z.string().max(20).optional(), // Mr., Ms., Dr., etc.
  suffix: z.string().max(10).optional(), // Jr., Sr., III, etc.
  dateOfBirth: z.string().datetime().optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  
  // Company Information (for commercial customers)
  companyName: z.string().max(200).optional(),
  companyLegalName: z.string().max(200).optional(), // Full legal entity name
  businessType: z.string().max(100).optional(), // Corporation, LLC, Partnership, etc.
  industry: z.string().max(100).optional(),
  dbaName: z.string().max(200).optional(), // "Doing Business As" name
  
  // Tax Information
  taxIdNumber: z.string().max(20).optional(), // EIN for businesses, SSN for individuals
  taxExempt: z.boolean().default(false),
  taxExemptCertificate: z.string().max(100).optional(),
  vatNumber: z.string().max(20).optional(), // Value Added Tax number (EU)
  
  // Contact Information
  primaryEmail: z.string().email('Must be a valid email address').optional(),
  secondaryEmail: z.string().email('Must be a valid email address').optional(),
  primaryPhone: z.string().max(20).optional(),
  secondaryPhone: z.string().max(20).optional(),
  mobilePhone: z.string().max(20).optional(),
  faxNumber: z.string().max(20).optional(),
  website: z.string().url().optional(),
  
  // Communication Preferences
  preferredCommunicationMethod: CommunicationMethod.default('email'),
  preferredLanguage: z.string().length(2, 'Language must be ISO 639-1 code').default('en'),
  timezone: z.string().max(50).default('America/New_York'), // IANA timezone
  
  // Marketing Preferences and Consent
  marketingConsent: z.object({
    email: ConsentStatus.default('unknown'),
    sms: ConsentStatus.default('unknown'),
    phone: ConsentStatus.default('unknown'),
    mail: ConsentStatus.default('unknown'),
    analytics: ConsentStatus.default('unknown'),
    thirdParty: ConsentStatus.default('denied') // Default to denied for privacy
  }).default({}),
  
  consentDate: z.string().datetime().optional(),
  consentVersion: z.string().max(20).optional(), // Version of terms/privacy policy
  unsubscribeToken: z.string().max(100).optional(), // For one-click unsubscribe
  
  // Address Management
  billingAddressId: z.string().uuid().optional(),
  shippingAddressId: z.string().uuid().optional(),
  additionalAddresses: z.array(z.string().uuid()).default([]), // Other addresses on file
  
  // Account Security
  emailVerified: z.boolean().default(false),
  phoneVerified: z.boolean().default(false),
  twoFactorEnabled: z.boolean().default(false),
  lastLoginAt: z.string().datetime().optional(),
  passwordChangedAt: z.string().datetime().optional(),
  
  // Commercial Customer Financial Information
  creditStatus: CreditStatus.default('not_rated'),
  creditLimitCents: z.number().int().nonnegative('Credit limit must be non-negative').default(0),
  creditUsedCents: z.number().int().nonnegative('Credit used must be non-negative').default(0),
  creditAvailableCents: z.number().int().nonnegative('Available credit must be non-negative').default(0),
  paymentTerms: PaymentTerms.default('immediate'),
  customPaymentTermsDays: z.number().int().positive().optional(), // For custom terms
  
  // Account Balances (in cents)
  currentBalanceCents: z.number().int().default(0), // Can be negative for credit balance
  pastDueBalanceCents: z.number().int().nonnegative('Past due balance must be non-negative').default(0),
  
  // Purchase History and Analytics
  totalOrderCount: z.number().int().nonnegative('Order count must be non-negative').default(0),
  totalPurchaseAmountCents: z.number().int().nonnegative('Total purchase must be non-negative').default(0),
  averageOrderValueCents: z.number().int().nonnegative('Average order value must be non-negative').default(0),
  firstPurchaseDate: z.string().datetime().optional(),
  lastPurchaseDate: z.string().datetime().optional(),
  
  // Customer Lifetime Value and Segmentation
  lifetimeValueCents: z.number().int().nonnegative('Lifetime value must be non-negative').default(0),
  customerSegment: z.string().max(50).optional(), // VIP, Regular, New, etc.
  loyaltyLevel: z.string().max(50).optional(), // Bronze, Silver, Gold, Platinum
  loyaltyPoints: z.number().int().nonnegative('Loyalty points must be non-negative').default(0),
  
  // Risk and Compliance
  riskScore: z.number().min(0).max(100).optional(), // 0 = low risk, 100 = high risk
  fraudAlerts: z.array(z.object({
    date: z.string().datetime(),
    type: z.string().max(50),
    description: z.string().max(500),
    resolved: z.boolean().default(false)
  })).default([]),
  
  // Customer Service and Support
  accountManagerId: z.string().uuid().optional(), // Assigned sales rep/account manager
  customerServiceNotes: z.array(z.object({
    id: z.string().uuid(),
    date: z.string().datetime(),
    agentId: z.string().uuid(),
    category: z.string().max(50), // complaint, inquiry, compliment, etc.
    summary: z.string().max(200),
    details: z.string().max(2000),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    resolved: z.boolean().default(false)
  })).default([]),
  
  // Referral Program
  referredById: z.string().uuid().optional(), // Customer who referred this customer
  referralCode: z.string().max(20).optional(), // Unique referral code for this customer
  totalReferrals: z.number().int().nonnegative('Total referrals must be non-negative').default(0),
  referralRewardsCents: z.number().int().nonnegative('Referral rewards must be non-negative').default(0),
  
  // External System Integration
  externalIds: z.record(z.string(), z.string()).default({}), // e.g., {"salesforce": "003XX000004TmiY", "quickbooks": "QB123"}
  
  // Privacy and Data Management
  dataProcessingConsent: z.boolean().default(false),
  dataRetentionDate: z.string().datetime().optional(), // When to delete customer data
  rightToBeforgotten: z.boolean().default(false), // GDPR "right to be forgotten" request
  
  // Subscription and Recurring Services
  activeSubscriptions: z.array(z.object({
    subscriptionId: z.string().uuid(),
    productId: z.string().uuid(),
    status: z.enum(['active', 'paused', 'cancelled', 'expired']),
    nextBillingDate: z.string().datetime().optional()
  })).default([]),
  
  // Geographic and Demographic Information
  birthCountry: z.string().length(2).optional(), // ISO country code
  nationality: z.string().length(2).optional(), // ISO country code
  occupation: z.string().max(100).optional(),
  incomeRange: z.string().max(50).optional(), // e.g., "50000-75000"
  householdSize: z.number().int().min(1).max(20).optional(),
  
  // Custom Fields (flexible storage for business-specific data)
  customFields: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string())
  ])).default({}),
  
  // Audit and Tracking
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().optional(),
  lastModifiedBy: z.string().uuid().optional(),
  
  // Versioning
  version: z.number().int().nonnegative().default(1),
  
  // Soft Delete
  deletedAt: z.string().datetime().optional(),
  deletedBy: z.string().uuid().optional(),
});

/**
 * Customer Schema with Business Rule Validations
 */
export const CustomerSchema = BaseCustomerSchema.refine(data => {
  // Business Rule: Retail customers must have first and last name
  if (data.type === 'retail') {
    return data.firstName && data.lastName;
  }
  return true;
}, {
  message: "Retail customers must have first and last name",
  path: ["firstName"]
}).refine(data => {
  // Business Rule: Commercial customers must have company name
  if (['commercial', 'wholesale', 'distributor', 'government', 'nonprofit'].includes(data.type)) {
    return data.companyName && data.companyName.length > 0;
  }
  return true;
}, {
  message: "Commercial customers must have company name",
  path: ["companyName"]
}).refine(data => {
  // Business Rule: Available credit = credit limit - credit used
  return data.creditAvailableCents === (data.creditLimitCents - data.creditUsedCents);
}, {
  message: "Available credit must equal credit limit minus credit used",
  path: ["creditAvailableCents"]
}).refine(data => {
  // Business Rule: Credit used cannot exceed credit limit
  return data.creditUsedCents <= data.creditLimitCents;
}, {
  message: "Credit used cannot exceed credit limit",
  path: ["creditUsedCents"]
}).refine(data => {
  // Business Rule: Tax exempt customers must have certificate
  return !data.taxExempt || (data.taxExemptCertificate && data.taxExemptCertificate.length > 0);
}, {
  message: "Tax exempt customers must provide tax exempt certificate",
  path: ["taxExemptCertificate"]
}).refine(data => {
  // Business Rule: Custom payment terms require days specification
  return data.paymentTerms !== 'custom' || data.customPaymentTermsDays !== undefined;
}, {
  message: "Custom payment terms must specify number of days",
  path: ["customPaymentTermsDays"]
}).refine(data => {
  // Business Rule: Active customers should have verified email for digital communications
  if (data.status === 'active' && data.preferredCommunicationMethod === 'email') {
    return data.emailVerified === true;
  }
  return true;
}, {
  message: "Active customers with email communication preference must have verified email",
  path: ["emailVerified"]
}).refine(data => {
  // Business Rule: Average order value calculation consistency
  if (data.totalOrderCount > 0 && data.totalPurchaseAmountCents > 0) {
    const calculatedAverage = Math.round(data.totalPurchaseAmountCents / data.totalOrderCount);
    return Math.abs(data.averageOrderValueCents - calculatedAverage) <= 1; // Allow 1 cent rounding difference
  }
  return data.averageOrderValueCents === 0;
}, {
  message: "Average order value must be consistent with total purchase amount and order count",
  path: ["averageOrderValueCents"]
});

/**
 * TypeScript type derived from the schema
 */
export type Customer = z.infer<typeof CustomerSchema>;

/**
 * Schema for creating new customers
 */
export const CustomerCreateSchema = BaseCustomerSchema.omit({
  id: true,
  customerNumber: true, // Auto-generated
  createdAt: true,
  updatedAt: true,
  version: true,
  totalOrderCount: true,
  totalPurchaseAmountCents: true,
  averageOrderValueCents: true,
  lifetimeValueCents: true,
  totalReferrals: true,
  referralRewardsCents: true,
  creditUsedCents: true,
  creditAvailableCents: true,
  pastDueBalanceCents: true,
  currentBalanceCents: true,
  loyaltyPoints: true,
  deletedAt: true,
  deletedBy: true,
});

export type CustomerCreate = z.infer<typeof CustomerCreateSchema>;

/**
 * Schema for updating customers
 */
export const CustomerUpdateSchema = BaseCustomerSchema.partial().omit({
  id: true,
  customerNumber: true,
  createdAt: true,
});

export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;

/**
 * Schema for customer summary/list views
 */
export const CustomerSummarySchema = BaseCustomerSchema.pick({
  id: true,
  customerNumber: true,
  type: true,
  status: true,
  firstName: true,
  lastName: true,
  companyName: true,
  primaryEmail: true,
  primaryPhone: true,
  totalOrderCount: true,
  totalPurchaseAmountCents: true,
  lastPurchaseDate: true,
  creditStatus: true,
  createdAt: true,
  updatedAt: true,
});

export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;

/**
 * Utility Functions
 */
export class CustomerUtils {
  /**
   * Generate a unique customer number
   */
  static generateCustomerNumber(type: string, id: string): string {
    const prefix = type === 'retail' ? 'R' : 'C';
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const idSuffix = id.replace(/-/g, '').slice(-4).toUpperCase(); // Last 4 chars of UUID
    return `${prefix}${timestamp}${idSuffix}`;
  }

  /**
   * Get customer's full name or company name
   */
  static getDisplayName(customer: Customer): string {
    if (customer.type === 'retail' && customer.firstName && customer.lastName) {
      const parts = [customer.title, customer.firstName, customer.middleName, customer.lastName, customer.suffix];
      return parts.filter(Boolean).join(' ');
    }
    return customer.companyName || customer.primaryEmail || customer.customerNumber || 'Unknown Customer';
  }

  /**
   * Check if customer is eligible for credit terms
   */
  static isEligibleForCredit(customer: Customer): boolean {
    return (
      customer.type !== 'retail' &&
      customer.creditStatus !== 'bad' &&
      customer.creditStatus !== 'poor' &&
      customer.status === 'active'
    );
  }

  /**
   * Calculate customer risk score based on various factors
   */
  static calculateRiskScore(customer: Customer): number {
    let score = 0;
    
    // Credit status impact
    switch (customer.creditStatus) {
      case 'bad': score += 40; break;
      case 'poor': score += 25; break;
      case 'fair': score += 15; break;
      case 'good': score += 5; break;
      case 'excellent': score += 0; break;
      default: score += 20; // Unknown/not rated
    }
    
    // Past due balance impact
    if (customer.pastDueBalanceCents > 0) {
      score += Math.min(20, customer.pastDueBalanceCents / 10000); // Add up to 20 points for past due
    }
    
    // Fraud alerts impact
    score += Math.min(25, customer.fraudAlerts.filter(alert => !alert.resolved).length * 5);
    
    // Account age factor (newer accounts are riskier)
    const accountAgeDays = (Date.now() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays < 30) score += 15;
    else if (accountAgeDays < 90) score += 10;
    else if (accountAgeDays < 180) score += 5;
    
    // Purchase history factor (no history = risk)
    if (customer.totalOrderCount === 0) score += 20;
    else if (customer.totalOrderCount < 3) score += 10;
    
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Check if customer can place orders
   */
  static canPlaceOrders(customer: Customer): boolean {
    return (
      customer.status === 'active' &&
      customer.emailVerified === true &&
      !customer.rightToBeforgotten
    );
  }

  /**
   * Get customer's preferred contact method with fallback
   */
  static getContactMethod(customer: Customer): string {
    switch (customer.preferredCommunicationMethod) {
      case 'email':
        return customer.emailVerified && customer.primaryEmail ? 'email' : 'phone';
      case 'phone':
        return customer.phoneVerified && customer.primaryPhone ? 'phone' : 'email';
      case 'sms':
        return customer.mobilePhone ? 'sms' : 'email';
      default:
        return customer.primaryEmail ? 'email' : 'phone';
    }
  }

  /**
   * Check if customer has given marketing consent for a specific channel
   */
  static hasMarketingConsent(customer: Customer, channel: keyof typeof customer.marketingConsent): boolean {
    return customer.marketingConsent[channel] === 'granted';
  }

  /**
   * Calculate customer lifetime value based on purchase history
   */
  static calculateLifetimeValue(customer: Customer): number {
    // Simple LTV calculation: average order value * order frequency * customer lifespan estimate
    if (customer.totalOrderCount === 0) return 0;
    
    const avgOrderValue = customer.averageOrderValueCents;
    const accountAgeDays = (Date.now() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const orderFrequency = customer.totalOrderCount / Math.max(1, accountAgeDays / 365); // Orders per year
    
    // Estimate 3-year customer lifespan for calculation
    const estimatedLifespanYears = 3;
    
    return Math.round(avgOrderValue * orderFrequency * estimatedLifespanYears);
  }

  /**
   * Check if customer qualifies for loyalty program tier
   */
  static getLoyaltyTier(customer: Customer): string {
    const totalSpent = customer.totalPurchaseAmountCents;
    
    if (totalSpent >= 500000) return 'Platinum'; // $5,000+
    if (totalSpent >= 200000) return 'Gold';     // $2,000+
    if (totalSpent >= 50000) return 'Silver';    // $500+
    if (totalSpent > 0) return 'Bronze';
    return 'New';
  }

  /**
   * Format customer for display in UI
   */
  static formatForDisplay(customer: Customer): {
    name: string;
    subtitle: string;
    status: string;
    type: string;
  } {
    return {
      name: this.getDisplayName(customer),
      subtitle: customer.primaryEmail || customer.primaryPhone || '',
      status: customer.status,
      type: customer.type
    };
  }
}

export default CustomerSchema;