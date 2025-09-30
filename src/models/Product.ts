/**
 * Product Model
 * Constitution-compliant product entity with inventory tracking and comprehensive validation
 * 
 * Key Features:
 * - Integer cents pricing for precision
 * - Multi-tier pricing support (retail, wholesale, contract)
 * - Comprehensive inventory tracking
 * - Category and attribute management
 * - Variant and bundle support
 * - Lifecycle status management
 */

import { z } from 'zod';

/**
 * Product Type Enumeration
 * Defines the fundamental type of product for business logic
 */
export const ProductType = z.enum([
  'simple',      // Single standalone product
  'configurable', // Product with variants (size, color, etc.)
  'bundle',      // Collection of products sold together
  'virtual',     // Digital/downloadable product
  'service',     // Service-based offering
  'subscription' // Recurring subscription product
]);

/**
 * Product Status Enumeration
 * Manages product lifecycle and availability
 */
export const ProductStatus = z.enum([
  'draft',          // Being created/edited, not visible
  'active',         // Live and available for sale
  'inactive',       // Temporarily unavailable
  'out_of_stock',   // No inventory available
  'discontinued',   // No longer sold, but support continues
  'archived',       // Historical record, no longer relevant
  'pending_review', // Awaiting approval for activation
  'recalled'        // Product recall - remove from sale immediately
]);

/**
 * Inventory Management Status
 * Tracks how inventory is managed for this product
 */
export const InventoryManagement = z.enum([
  'tracked',      // Full inventory tracking enabled
  'not_tracked',  // No inventory management
  'service',      // Service item - no physical inventory
  'pre_order',    // Accept orders before stock available
  'backorder',    // Accept orders when out of stock
  'dropship'      // Fulfilled by vendor/supplier
]);

/**
 * Tax Category for Product
 * Determines tax treatment and rates
 */
export const TaxCategory = z.enum([
  'taxable',        // Standard taxable item
  'exempt',         // Tax exempt (non-profit, etc.)
  'reduced_rate',   // Reduced tax rate (food, books)
  'digital',        // Digital goods tax rules
  'services',       // Service taxation rules
  'shipping_only'   // Only shipping charges taxable
]);

/**
 * Base Product Schema (without refinements)
 * Used for creating derived schemas
 */
const BaseProductSchema = z.object({
  // Identity and Core Information
  id: z.string().uuid('Product ID must be a valid UUID'),
  sku: z.string().min(1, 'SKU is required').max(50, 'SKU too long').regex(
    /^[A-Z0-9\-_]+$/,
    'SKU must contain only uppercase letters, numbers, hyphens, and underscores'
  ),
  
  // Basic Product Information
  name: z.string().min(1, 'Product name is required').max(255, 'Name too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  shortDescription: z.string().max(500, 'Short description too long').optional(),
  
  // Product Classification
  type: ProductType.default('simple'),
  status: ProductStatus.default('draft'),
  
  // Category and Organization
  categoryId: z.string().uuid().optional(),
  categoryPath: z.string().max(500).optional(), // e.g., "Electronics > Computers > Laptops"
  brand: z.string().max(100).optional(),
  manufacturer: z.string().max(100).optional(),
  manufacturerPartNumber: z.string().max(100).optional(),
  
  // Pricing (all in cents for precision)
  // Base pricing tiers
  retailPriceCents: z.number().int().nonnegative('Retail price must be non-negative'),
  wholesalePriceCents: z.number().int().nonnegative('Wholesale price must be non-negative').optional(),
  contractPriceCents: z.number().int().nonnegative('Contract price must be non-negative').optional(),
  
  // Cost and margin information
  costCents: z.number().int().nonnegative('Cost must be non-negative').optional(),
  msrpCents: z.number().int().nonnegative('MSRP must be non-negative').optional(), // Manufacturer Suggested Retail Price
  
  // Currency and international pricing
  currency: z.string().length(3, 'Currency must be 3-letter code').default('USD'),
  
  // Inventory Management
  inventoryManagement: InventoryManagement.default('tracked'),
  currentStock: z.number().int().nonnegative('Stock must be non-negative').default(0),
  reservedStock: z.number().int().nonnegative('Reserved stock must be non-negative').default(0),
  availableStock: z.number().int().nonnegative('Available stock must be non-negative').default(0),
  
  // Stock thresholds and alerts
  lowStockThreshold: z.number().int().nonnegative('Low stock threshold must be non-negative').default(5),
  outOfStockThreshold: z.number().int().nonnegative('Out of stock threshold must be non-negative').default(0),
  maxStockLevel: z.number().int().positive('Max stock level must be positive').optional(),
  
  // Reorder information
  reorderPoint: z.number().int().nonnegative('Reorder point must be non-negative').optional(),
  reorderQuantity: z.number().int().positive('Reorder quantity must be positive').optional(),
  leadTimeDays: z.number().int().nonnegative('Lead time must be non-negative').optional(),
  
  // Physical Properties
  weight: z.number().min(0, 'Weight must be non-negative').optional(), // in grams
  dimensions: z.object({
    length: z.number().min(0, 'Length must be non-negative'), // in cm
    width: z.number().min(0, 'Width must be non-negative'),   // in cm
    height: z.number().min(0, 'Height must be non-negative')  // in cm
  }).optional(),
  
  // Shipping and Logistics
  shippingWeight: z.number().min(0, 'Shipping weight must be non-negative').optional(), // in grams
  shippingDimensions: z.object({
    length: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0)
  }).optional(),
  
  requiresSpecialHandling: z.boolean().default(false),
  specialHandlingInstructions: z.string().max(500).optional(),
  isHazardous: z.boolean().default(false),
  hazardClass: z.string().max(50).optional(),
  unNumber: z.string().max(10).optional(), // UN shipping identification number
  
  // Tax Information
  taxCategory: TaxCategory.default('taxable'),
  taxCode: z.string().max(20).optional(), // External tax system code
  harmonizedCode: z.string().max(20).optional(), // International trade classification
  
  // Digital/Virtual Product Properties
  isDigital: z.boolean().default(false),
  downloadUrl: z.string().url().optional(),
  downloadLimit: z.number().int().positive().optional(), // Max downloads per purchase
  licenseKey: z.string().max(200).optional(),
  
  // Product Variants and Configuration
  parentProductId: z.string().uuid().optional(), // For variants of a configurable product
  variantAttributes: z.record(z.string(), z.string()).default({}), // e.g., {"color": "red", "size": "large"}
  configOptions: z.array(z.object({
    name: z.string().max(100),
    values: z.array(z.string().max(100)),
    required: z.boolean().default(false)
  })).default([]),
  
  // Bundle Information (for bundle products)
  bundleItems: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().positive(),
    isOptional: z.boolean().default(false)
  })).default([]),
  
  // Media and Assets
  images: z.array(z.object({
    url: z.string().url(),
    alt: z.string().max(200).optional(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().nonnegative().default(0)
  })).default([]),
  
  // SEO and Marketing
  slug: z.string().max(200).optional(), // URL-friendly product identifier
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
  keywords: z.array(z.string().max(50)).default([]),
  
  // Custom Attributes (flexible key-value storage)
  attributes: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string())
  ])).default({}),
  
  // Quality and Compliance
  qualityCheckRequired: z.boolean().default(false),
  certifications: z.array(z.string().max(100)).default([]), // e.g., ["ISO9001", "FDA"]
  countryOfOrigin: z.string().length(2).optional(), // ISO country code
  
  // Vendor and Sourcing
  primaryVendorId: z.string().uuid().optional(),
  vendorSku: z.string().max(100).optional(),
  vendorProductUrl: z.string().url().optional(),
  
  // Lifecycle and Availability
  launchDate: z.string().datetime().optional(),
  endOfLifeDate: z.string().datetime().optional(),
  discontinueDate: z.string().datetime().optional(),
  
  // Customer-facing policies
  isReturnable: z.boolean().default(true),
  returnPolicyDays: z.number().int().min(0).default(30),
  warrantyPeriodDays: z.number().int().min(0).optional(),
  warrantyDescription: z.string().max(1000).optional(),
  
  // Age and restriction information
  minimumAge: z.number().int().min(0).optional(),
  maximumAge: z.number().int().max(150).optional(),
  ageVerificationRequired: z.boolean().default(false),
  restrictedStates: z.array(z.string().length(2)).default([]), // US state codes
  restrictedCountries: z.array(z.string().length(2)).default([]), // ISO country codes
  
  // Subscription Information (for subscription products)
  subscriptionInfo: z.object({
    billingInterval: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
    billingIntervalCount: z.number().int().positive().default(1),
    trialPeriodDays: z.number().int().nonnegative().default(0),
    setupFeeCents: z.number().int().nonnegative().default(0)
  }).optional(),
  
  // Analytics and Performance
  totalSales: z.number().int().nonnegative('Total sales must be non-negative').default(0),
  totalRevenueCents: z.number().int().nonnegative('Total revenue must be non-negative').default(0),
  averageRating: z.number().min(0).max(5).optional(),
  totalReviews: z.number().int().nonnegative('Total reviews must be non-negative').default(0),
  
  // Audit and Tracking
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string().uuid().optional(),
  lastModifiedBy: z.string().uuid().optional(),
  
  // Versioning and History
  version: z.number().int().nonnegative().default(1),
  
  // Soft Delete
  deletedAt: z.string().datetime().optional(),
  deletedBy: z.string().uuid().optional(),
});

/**
 * Product Schema with Business Rule Validations
 */
export const ProductSchema = BaseProductSchema.refine(data => {
  // Business Rule: Available stock = current stock - reserved stock
  return data.availableStock === (data.currentStock - data.reservedStock);
}, {
  message: "Available stock must equal current stock minus reserved stock",
  path: ["availableStock"]
}).refine(data => {
  // Business Rule: Reserved stock cannot exceed current stock
  return data.reservedStock <= data.currentStock;
}, {
  message: "Reserved stock cannot exceed current stock",
  path: ["reservedStock"]
}).refine(data => {
  // Business Rule: Wholesale price should not exceed retail price
  return !data.wholesalePriceCents || data.wholesalePriceCents <= data.retailPriceCents;
}, {
  message: "Wholesale price should not exceed retail price",
  path: ["wholesalePriceCents"]
}).refine(data => {
  // Business Rule: Cost should not exceed retail price (margin validation)
  return !data.costCents || data.costCents <= data.retailPriceCents;
}, {
  message: "Cost should not exceed retail price",
  path: ["costCents"]
}).refine(data => {
  // Business Rule: Digital products don't need physical dimensions or weight
  return !data.isDigital || (!data.weight && !data.dimensions && !data.shippingWeight);
}, {
  message: "Digital products should not have physical properties",
  path: ["isDigital"]
}).refine(data => {
  // Business Rule: Bundle products must have bundle items
  return data.type !== 'bundle' || data.bundleItems.length > 0;
}, {
  message: "Bundle products must specify bundle items",
  path: ["bundleItems"]
}).refine(data => {
  // Business Rule: Hazardous items must have hazard classification
  return !data.isHazardous || (data.hazardClass && data.hazardClass.length > 0);
}, {
  message: "Hazardous products must specify hazard class",
  path: ["hazardClass"]
}).refine(data => {
  // Business Rule: Age verification products must have minimum age
  return !data.ageVerificationRequired || (data.minimumAge !== undefined && data.minimumAge >= 18);
}, {
  message: "Age verification products must have minimum age of 18+",
  path: ["minimumAge"]
}).refine(data => {
  // Business Rule: Subscription products must have subscription info
  return data.type !== 'subscription' || data.subscriptionInfo !== undefined;
}, {
  message: "Subscription products must specify subscription information",
  path: ["subscriptionInfo"]
});

/**
 * TypeScript type derived from the schema
 */
export type Product = z.infer<typeof ProductSchema>;

/**
 * Schema for creating new products
 */
export const ProductCreateSchema = BaseProductSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  totalSales: true,
  totalRevenueCents: true,
  totalReviews: true,
  deletedAt: true,
  deletedBy: true,
});

export type ProductCreate = z.infer<typeof ProductCreateSchema>;

/**
 * Schema for updating products
 */
export const ProductUpdateSchema = BaseProductSchema.partial().omit({
  id: true,
  createdAt: true,
});

export type ProductUpdate = z.infer<typeof ProductUpdateSchema>;

/**
 * Schema for product summary/list views
 */
export const ProductSummarySchema = BaseProductSchema.pick({
  id: true,
  sku: true,
  name: true,
  shortDescription: true,
  status: true,
  type: true,
  retailPriceCents: true,
  currentStock: true,
  availableStock: true,
  inventoryManagement: true,
  images: true,
  createdAt: true,
  updatedAt: true,
});

export type ProductSummary = z.infer<typeof ProductSummarySchema>;

/**
 * Utility Functions
 */
export class ProductUtils {
  /**
   * Calculate profit margin based on cost and selling price
   */
  static calculateMargin(costCents: number, sellingPriceCents: number): number {
    if (sellingPriceCents === 0) return 0;
    return ((sellingPriceCents - costCents) / sellingPriceCents) * 100;
  }

  /**
   * Calculate markup based on cost and selling price
   */
  static calculateMarkup(costCents: number, sellingPriceCents: number): number {
    if (costCents === 0) return 0;
    return ((sellingPriceCents - costCents) / costCents) * 100;
  }

  /**
   * Check if product is in stock and available for sale
   */
  static isAvailableForSale(product: Product): boolean {
    return (
      product.status === 'active' &&
      (product.inventoryManagement === 'not_tracked' || 
       product.inventoryManagement === 'service' ||
       product.inventoryManagement === 'dropship' ||
       product.inventoryManagement === 'backorder' ||
       product.availableStock > 0)
    );
  }

  /**
   * Check if product is low on stock
   */
  static isLowStock(product: Product): boolean {
    return (
      product.inventoryManagement === 'tracked' &&
      product.availableStock <= product.lowStockThreshold
    );
  }

  /**
   * Check if product is out of stock
   */
  static isOutOfStock(product: Product): boolean {
    return (
      product.inventoryManagement === 'tracked' &&
      product.availableStock <= product.outOfStockThreshold
    );
  }

  /**
   * Get the appropriate price for a customer type
   */
  static getPriceForCustomerType(product: Product, customerType: 'retail' | 'wholesale' | 'contract'): number {
    switch (customerType) {
      case 'wholesale':
        return product.wholesalePriceCents || product.retailPriceCents;
      case 'contract':
        return product.contractPriceCents || product.wholesalePriceCents || product.retailPriceCents;
      case 'retail':
      default:
        return product.retailPriceCents;
    }
  }

  /**
   * Generate URL-friendly slug from product name
   */
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-')        // Replace spaces with hyphens
      .replace(/-+/g, '-');        // Remove duplicate hyphens
  }

  /**
   * Check if product needs reordering based on current stock levels
   */
  static needsReorder(product: Product): boolean {
    return (
      product.inventoryManagement === 'tracked' &&
      product.reorderPoint !== undefined &&
      product.availableStock <= product.reorderPoint
    );
  }
}

export default ProductSchema;