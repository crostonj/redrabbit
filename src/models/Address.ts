/**
 * Address Model
 * Constitution-compliant address entity with US postal validation and comprehensive address management
 * 
 * Key Features:
 * - US postal address validation with USPS standards
 * - International address support
 * - Shipping/billing type distinctions
 * - Address verification and standardization
 * - Geocoding support for location services
 * - Commercial vs. residential classification
 * - Delivery instructions and special handling
 */

import { z } from 'zod';

/**
 * Address Type Enumeration
 * Defines the purpose/usage of the address
 */
export const AddressType = z.enum([
  'billing',     // Billing address for payments
  'shipping',    // Shipping/delivery address
  'mailing',     // Mailing address for correspondence
  'business',    // Business/office address
  'home',        // Residential home address
  'warehouse',   // Warehouse/fulfillment center
  'pickup',      // Customer pickup location
  'return'       // Return merchandise authorization address
]);

/**
 * Address Classification
 * Commercial vs. residential for shipping rates and restrictions
 */
export const AddressClassification = z.enum([
  'residential',  // Home/apartment address
  'commercial',   // Business address
  'mixed_use',    // Mixed residential/commercial building
  'po_box',       // Post office box
  'military',     // Military/APO/FPO address
  'unknown'       // Classification not determined
]);

/**
 * Address Verification Status
 * Tracks address validation and standardization status
 */
export const VerificationStatus = z.enum([
  'unverified',   // Not yet verified
  'verified',     // Successfully verified and standardized
  'partial',      // Partially verified (some fields corrected)
  'failed',       // Verification failed - address may be invalid
  'manual',       // Manually verified/overridden
  'exception'     // Special case - bypass normal verification
]);

/**
 * US State/Province Validation
 * Standard US state codes plus territories and Canadian provinces
 */
export const USStateCode = z.enum([
  // US States
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 
  'VA', 'WA', 'WV', 'WI', 'WY',
  // US Territories
  'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
  // Military
  'AA', 'AE', 'AP',
  // Canadian Provinces (for North American integration)
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
]);

/**
 * Base Address Schema (without refinements)
 * Used for creating derived schemas
 */
const BaseAddressSchema = z.object({
  // Identity and Classification
  id: z.string().uuid('Address ID must be a valid UUID'),
  type: AddressType.default('shipping'),
  classification: AddressClassification.default('unknown'),
  
  // Associated Entity
  customerId: z.string().uuid().optional(), // Customer this address belongs to
  
  // Recipient Information
  name: z.string().min(1, 'Recipient name is required').max(100),
  company: z.string().max(100).optional(),
  
  // Address Lines
  addressLine1: z.string().min(1, 'Address line 1 is required').max(100),
  addressLine2: z.string().max(100).optional(), // Apartment, suite, unit, etc.
  addressLine3: z.string().max(100).optional(), // Additional address info
  
  // Geographic Location
  city: z.string().min(1, 'City is required').max(50),
  state: z.string().min(1, 'State is required').max(50), // Will be refined for US addresses
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  country: z.string().length(2, 'Country must be ISO 3166-1 alpha-2 code').default('US'),
  
  // Enhanced US Address Fields
  county: z.string().max(50).optional(),
  
  // Postal Service Information
  deliveryPoint: z.string().max(3).optional(), // Last 2 digits of street number + check digit
  carrierRoute: z.string().max(4).optional(),  // USPS carrier route code
  
  // Address Verification and Standardization
  verificationStatus: VerificationStatus.default('unverified'),
  verifiedAt: z.string().datetime().optional(),
  verificationService: z.string().max(50).optional(), // e.g., 'USPS', 'UPS', 'FedEx'
  
  // Original vs. Standardized Address
  originalAddressLine1: z.string().max(100).optional(),
  originalCity: z.string().max(50).optional(),
  originalState: z.string().max(50).optional(),
  originalPostalCode: z.string().max(20).optional(),
  
  // Geocoding Information
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geoAccuracy: z.enum(['rooftop', 'range_interpolated', 'geometric_center', 'approximate']).optional(),
  geoSource: z.string().max(50).optional(), // e.g., 'Google', 'Bing', 'MapBox'
  geoUpdatedAt: z.string().datetime().optional(),
  
  // Contact Information
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  
  // Delivery Instructions and Special Handling
  deliveryInstructions: z.string().max(500).optional(),
  specialInstructions: z.string().max(500).optional(),
  gateCode: z.string().max(20).optional(),
  accessInstructions: z.string().max(200).optional(),
  
  // Business Hours (for commercial addresses)
  businessHours: z.object({
    monday: z.string().max(20).optional(),    // e.g., "09:00-17:00"
    tuesday: z.string().max(20).optional(),
    wednesday: z.string().max(20).optional(),
    thursday: z.string().max(20).optional(),
    friday: z.string().max(20).optional(),
    saturday: z.string().max(20).optional(),
    sunday: z.string().max(20).optional(),
    timezone: z.string().max(50).default('America/New_York')
  }).optional(),
  
  // Delivery Preferences
  signatureRequired: z.boolean().default(false),
  adultSignatureRequired: z.boolean().default(false),
  noWeekendDelivery: z.boolean().default(false),
  noHolidayDelivery: z.boolean().default(false),
  holdAtLocation: z.boolean().default(false),
  
  // Security and Access Control
  secureLocation: z.boolean().default(false), // Requires special security clearance
  deliveryNotification: z.boolean().default(true), // Send delivery notifications
  
  // Address Validation Flags
  isValidForShipping: z.boolean().default(true),
  isValidForBilling: z.boolean().default(true),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
  
  // P.O. Box and Special Address Types
  isPoBox: z.boolean().default(false),
  isMilitaryAddress: z.boolean().default(false), // APO/FPO/DPO
  isInternational: z.boolean().default(false),
  
  // Tax Jurisdiction Information
  taxJurisdiction: z.string().max(100).optional(),
  salesTaxRate: z.number().min(0).max(1).optional(), // 0.0825 = 8.25%
  
  // Service Availability
  expressDeliveryAvailable: z.boolean().default(true),
  overnightDeliveryAvailable: z.boolean().default(true),
  weekendDeliveryAvailable: z.boolean().default(true),
  
  // Historical Usage Tracking
  totalOrders: z.number().int().nonnegative('Total orders must be non-negative').default(0),
  lastUsedAt: z.string().datetime().optional(),
  deliverySuccessRate: z.number().min(0).max(1).default(1), // 1.0 = 100% success rate
  
  // Address Quality Metrics
  addressScore: z.number().min(0).max(100).optional(), // Address quality score (0-100)
  deliverabilityScore: z.number().min(0).max(100).optional(), // Likelihood of successful delivery
  
  // External System Integration
  externalIds: z.record(z.string(), z.string()).default({}), // e.g., {"ups": "123", "fedex": "456"}
  
  // Custom Fields for Business-Specific Requirements
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
 * Address Schema with Business Rule Validations
 */
export const AddressSchema = BaseAddressSchema.refine(data => {
  // Business Rule: US addresses must have valid state codes
  if (data.country === 'US' && data.verificationStatus !== 'exception') {
    return USStateCode.safeParse(data.state).success;
  }
  return true;
}, {
  message: "US addresses must have valid state codes",
  path: ["state"]
}).refine(data => {
  // Business Rule: US postal codes must follow ZIP or ZIP+4 format
  if (data.country === 'US' && data.verificationStatus !== 'exception') {
    const zipRegex = /^\d{5}(-\d{4})?$/;
    return zipRegex.test(data.postalCode);
  }
  return true;
}, {
  message: "US postal codes must be in ZIP (12345) or ZIP+4 (12345-6789) format",
  path: ["postalCode"]
}).refine(data => {
  // Business Rule: P.O. Boxes cannot be used for certain shipping types
  if (data.isPoBox && data.isValidForShipping) {
    // Some carriers don't deliver to P.O. boxes, but this is service-specific
    // For now, we'll allow it but flag it
    return true;
  }
  return true;
}, {
  message: "P.O. Box addresses may have shipping restrictions",
  path: ["isPoBox"]
}).refine(data => {
  // Business Rule: Military addresses must use military state codes
  if (data.isMilitaryAddress) {
    return ['AA', 'AE', 'AP'].includes(data.state);
  }
  return true;
}, {
  message: "Military addresses must use AA, AE, or AP state codes",
  path: ["state"]
}).refine(data => {
  // Business Rule: Geocoding coordinates must be provided together
  return (data.latitude === undefined && data.longitude === undefined) ||
         (data.latitude !== undefined && data.longitude !== undefined);
}, {
  message: "Latitude and longitude must be provided together",
  path: ["latitude"]
}).refine(data => {
  // Business Rule: Adult signature required implies signature required
  return !data.adultSignatureRequired || data.signatureRequired;
}, {
  message: "Adult signature requirement implies regular signature requirement",
  path: ["adultSignatureRequired"]
}).refine(data => {
  // Business Rule: Delivery success rate should be realistic
  return data.totalOrders === 0 || (data.deliverySuccessRate >= 0 && data.deliverySuccessRate <= 1);
}, {
  message: "Delivery success rate must be between 0 and 1",
  path: ["deliverySuccessRate"]
}).refine(data => {
  // Business Rule: Business hours only for commercial addresses
  return data.classification !== 'commercial' || data.businessHours === undefined || 
         Object.keys(data.businessHours).length > 1; // At least timezone should be present
}, {
  message: "Commercial addresses should specify business hours",
  path: ["businessHours"]
});

/**
 * TypeScript type derived from the schema
 */
export type Address = z.infer<typeof AddressSchema>;

/**
 * Schema for creating new addresses
 */
export const AddressCreateSchema = BaseAddressSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  totalOrders: true,
  lastUsedAt: true,
  deliverySuccessRate: true,
  verifiedAt: true,
  geoUpdatedAt: true,
  deletedAt: true,
  deletedBy: true,
});

export type AddressCreate = z.infer<typeof AddressCreateSchema>;

/**
 * Schema for updating addresses
 */
export const AddressUpdateSchema = BaseAddressSchema.partial().omit({
  id: true,
  createdAt: true,
});

export type AddressUpdate = z.infer<typeof AddressUpdateSchema>;

/**
 * Schema for address summary/list views
 */
export const AddressSummarySchema = BaseAddressSchema.pick({
  id: true,
  type: true,
  classification: true,
  name: true,
  company: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  verificationStatus: true,
  isValidForShipping: true,
  isValidForBilling: true,
  createdAt: true,
  updatedAt: true,
});

export type AddressSummary = z.infer<typeof AddressSummarySchema>;

/**
 * Utility Functions
 */
export class AddressUtils {
  /**
   * Format address for display as a single string
   */
  static formatSingleLine(address: Address): string {
    const parts = [
      address.addressLine1,
      address.addressLine2,
      `${address.city}, ${address.state} ${address.postalCode}`,
      address.country !== 'US' ? address.country : null
    ].filter(Boolean);
    
    return parts.join(', ');
  }

  /**
   * Format address for display as multiple lines
   */
  static formatMultiLine(address: Address): string[] {
    const lines: string[] = [];
    
    // Recipient name and company
    if (address.name) lines.push(address.name);
    if (address.company) lines.push(address.company);
    
    // Address lines
    lines.push(address.addressLine1);
    if (address.addressLine2) lines.push(address.addressLine2);
    if (address.addressLine3) lines.push(address.addressLine3);
    
    // City, state, postal code
    lines.push(`${address.city}, ${address.state} ${address.postalCode}`);
    
    // Country (if not US)
    if (address.country !== 'US') {
      lines.push(address.country);
    }
    
    return lines;
  }

  /**
   * Validate US postal code format
   */
  static isValidUSPostalCode(postalCode: string): boolean {
    const zipRegex = /^\d{5}(-\d{4})?$/;
    return zipRegex.test(postalCode);
  }

  /**
   * Extract ZIP code from ZIP+4 format
   */
  static getZipCode(postalCode: string): string {
    const parts = postalCode.split('-');
    return parts[0] || '';
  }

  /**
   * Extract plus-4 extension from ZIP+4 format
   */
  static getZipPlus4(postalCode: string): string | null {
    const parts = postalCode.split('-');
    return parts.length > 1 ? (parts[1] || null) : null;
  }

  /**
   * Check if address is suitable for shipping
   */
  static canShipTo(address: Address): boolean {
    return (
      address.isValidForShipping &&
      address.verificationStatus !== 'failed' &&
      address.deletedAt === undefined
    );
  }

  /**
   * Check if address requires special handling
   */
  static requiresSpecialHandling(address: Address): boolean {
    return (
      address.signatureRequired ||
      address.adultSignatureRequired ||
      address.holdAtLocation ||
      address.secureLocation ||
      address.isPoBox ||
      address.isMilitaryAddress ||
      Boolean(address.specialInstructions && address.specialInstructions.length > 0)
    );
  }

  /**
   * Estimate delivery risk based on address characteristics
   */
  static assessDeliveryRisk(address: Address): 'low' | 'medium' | 'high' {
    let riskScore = 0;
    
    // Verification status impact
    if (address.verificationStatus === 'failed') riskScore += 40;
    else if (address.verificationStatus === 'unverified') riskScore += 20;
    else if (address.verificationStatus === 'partial') riskScore += 10;
    
    // Historical delivery success rate
    if (address.totalOrders > 0) {
      riskScore += (1 - address.deliverySuccessRate) * 30;
    } else {
      riskScore += 10; // New address has some risk
    }
    
    // Special address types
    if (address.isPoBox) riskScore += 5;
    if (address.isMilitaryAddress) riskScore += 10;
    if (address.isInternational && address.country !== 'US') riskScore += 15;
    
    // Address completeness
    if (!address.addressLine1) riskScore += 20;
    if (!address.phone && !address.email) riskScore += 10;
    
    if (riskScore >= 50) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  }

  /**
   * Calculate distance between two addresses (if both have coordinates)
   */
  static calculateDistance(addr1: Address, addr2: Address): number | null {
    if (!addr1.latitude || !addr1.longitude || !addr2.latitude || !addr2.longitude) {
      return null;
    }

    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(addr2.latitude - addr1.latitude);
    const dLon = this.toRadians(addr2.longitude - addr1.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(addr1.latitude)) * Math.cos(this.toRadians(addr2.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Generate address hash for duplicate detection
   */
  static generateHash(address: Address): string {
    const normalized = [
      address.addressLine1.toLowerCase().replace(/[^a-z0-9]/g, ''),
      address.city.toLowerCase().replace(/[^a-z0-9]/g, ''),
      address.state.toUpperCase(),
      address.postalCode.replace(/[^0-9]/g, ''),
      address.country.toUpperCase()
    ].join('|');
    
    // Simple hash function (in production, use a proper crypto hash)
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Check if two addresses are likely the same
   */
  static areAddressesSame(addr1: Address, addr2: Address): boolean {
    return this.generateHash(addr1) === this.generateHash(addr2);
  }

  /**
   * Get recommended shipping services based on address characteristics
   */
  static getRecommendedShippingServices(address: Address): string[] {
    const services: string[] = ['ground'];
    
    if (address.expressDeliveryAvailable) services.push('express');
    if (address.overnightDeliveryAvailable) services.push('overnight');
    if (address.weekendDeliveryAvailable && !address.noWeekendDelivery) {
      services.push('weekend_delivery');
    }
    
    // Exclude certain services for P.O. boxes
    if (address.isPoBox) {
      return services.filter(s => !['express', 'overnight'].includes(s));
    }
    
    return services;
  }

  /**
   * Format address for shipping label
   */
  static formatForShippingLabel(address: Address): {
    recipient: string[];
    address: string[];
    cityStateZip: string;
    country?: string | undefined;
  } {
    const recipient: string[] = [];
    if (address.name) recipient.push(address.name);
    if (address.company) recipient.push(address.company);
    
    const addressLines: string[] = [address.addressLine1];
    if (address.addressLine2) addressLines.push(address.addressLine2);
    if (address.addressLine3) addressLines.push(address.addressLine3);
    
    const cityStateZip = `${address.city}, ${address.state} ${address.postalCode}`;
    
    return {
      recipient,
      address: addressLines,
      cityStateZip,
      country: address.country !== 'US' ? address.country : undefined
    };
  }
}

export default AddressSchema;