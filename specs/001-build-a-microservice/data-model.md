# Data Model: Retail Orders Microservice

**Date**: September 19, 2025
**Technology**: TypeScript with PostgreSQL
**Validation**: Zod schemas for runtime validation

## Core Domain Entities

### Order
Primary aggregate for order management and processing.

```typescript
interface Order {
  // Identity & Metadata
  id: string;                    // UUID v4
  orderNumber: string;           // Human-readable order number (e.g., "ORD-2025-001234")
  createdAt: Date;
  updatedAt: Date;
  
  // Customer Information
  customerId: string;            // UUID reference to Customer
  customerType: 'retail' | 'commercial';
  
  // Order Details
  status: OrderStatus;
  totalAmount: number;           // Total in cents (USD)
  subtotal: number;              // Subtotal before tax/shipping
  taxAmount: number;             // Tax in cents
  shippingAmount: number;        // Shipping in cents
  discountAmount: number;        // Discount in cents
  
  // Addresses
  billingAddressId: string;      // UUID reference
  shippingAddressId: string;     // UUID reference
  
  // Payment
  paymentMethodId: string | null; // UUID reference (null for purchase orders)
  paymentStatus: PaymentStatus;
  
  // Fulfillment
  shippingMethod: ShippingMethod;
  estimatedDeliveryDate: Date | null;
  actualDeliveryDate: Date | null;
  
  // Metadata
  notes: string | null;          // Customer or internal notes
  source: 'web' | 'api' | 'phone' | 'email'; // Order origin
}

type OrderStatus = 
  | 'pending'        // Order created, payment not processed
  | 'processing'     // Payment confirmed, preparing shipment
  | 'shipped'        // Items shipped
  | 'delivered'      // Delivery confirmed
  | 'cancelled'      // Order cancelled
  | 'returned';      // Order returned

type PaymentStatus =
  | 'pending'        // Payment not processed
  | 'authorized'     // Payment authorized but not captured
  | 'captured'       // Payment captured successfully
  | 'failed'         // Payment failed
  | 'refunded';      // Payment refunded

type ShippingMethod =
  | 'standard'       // 5-7 business days
  | 'expedited'      // 2-3 business days  
  | 'freight';       // Large items, varies by location
```

### OrderLineItem
Individual products within an order with pricing and quantity details.

```typescript
interface OrderLineItem {
  id: string;                    // UUID v4
  orderId: string;               // UUID reference to Order
  
  // Product Information
  productId: string;             // UUID reference to Product
  productSku: string;            // Product SKU for reference
  productName: string;           // Snapshot of product name
  productDescription: string | null; // Snapshot of description
  
  // Pricing & Quantity
  quantity: number;              // Quantity ordered (positive integer)
  unitPrice: number;             // Price per unit in cents at time of order
  totalPrice: number;            // quantity * unitPrice
  
  // Fulfillment
  quantityShipped: number;       // Quantity actually shipped
  quantityReturned: number;      // Quantity returned
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

### Product
Home improvement supplies and tools available for purchase.

```typescript
interface Product {
  id: string;                    // UUID v4
  sku: string;                   // Unique product identifier
  name: string;                  // Product name
  description: string | null;    // Detailed description
  
  // Categorization
  category: ProductCategory;
  subcategory: string | null;
  brand: string | null;
  
  // Pricing
  retailPrice: number;           // Regular retail price in cents
  commercialPrice: number | null; // Bulk/commercial price in cents
  costPrice: number | null;      // Internal cost (for margin calculation)
  
  // Physical Properties
  weight: number | null;         // Weight in pounds for shipping
  dimensions: ProductDimensions | null;
  
  // Inventory
  availableQuantity: number;     // Current available stock
  reservedQuantity: number;      // Quantity reserved for pending orders
  reorderLevel: number;          // Minimum stock level for reordering
  
  // Status
  isActive: boolean;             // Whether product can be ordered
  isHazardous: boolean;          // Requires special shipping handling
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

type ProductCategory =
  | 'tools-power'        // Power tools (drills, saws, etc.)
  | 'tools-hand'         // Hand tools (hammers, screwdrivers, etc.)
  | 'lumber'             // Wood products
  | 'hardware'           // Screws, bolts, fasteners
  | 'plumbing'           // Pipes, fittings, fixtures
  | 'electrical'         // Wire, outlets, switches
  | 'paint-supplies'     // Paint, brushes, rollers
  | 'garden'             // Outdoor and garden supplies
  | 'safety'             // Safety equipment and gear
  | 'other';

interface ProductDimensions {
  length: number;         // Length in inches
  width: number;          // Width in inches  
  height: number;         // Height in inches
}
```

### Customer
Person or business placing orders with contact and billing information.

```typescript
interface Customer {
  id: string;                    // UUID v4
  customerNumber: string;        // Human-readable customer number
  type: CustomerType;
  
  // Basic Information
  firstName: string;
  lastName: string;
  companyName: string | null;    // Required for commercial customers
  email: string;
  phone: string | null;
  
  // Commercial Customer Details
  taxId: string | null;          // Tax ID for commercial customers
  creditLimit: number | null;    // Credit limit in cents
  paymentTerms: PaymentTerms | null; // NET 30, etc.
  
  // Preferences
  preferredShippingMethod: ShippingMethod | null;
  emailMarketingOptIn: boolean;
  
  // Status
  isActive: boolean;
  creditStatus: CreditStatus;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  lastOrderDate: Date | null;
}

type CustomerType = 'retail' | 'commercial';

type PaymentTerms = 'net_30' | 'net_60' | 'cod' | 'prepaid';

type CreditStatus = 'good' | 'watch' | 'hold';
```

### Address
Shipping and billing locations for customers and orders.

```typescript
interface Address {
  id: string;                    // UUID v4
  customerId: string | null;     // UUID reference (null for one-time addresses)
  
  // Address Components
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;                 // 2-letter state code
  postalCode: string;            // ZIP code
  country: string;               // ISO 3166-1 alpha-2 code (default: "US")
  
  // Address Type & Validation
  type: AddressType;
  isValidated: boolean;          // Whether address passed validation service
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

type AddressType = 'billing' | 'shipping' | 'both';
```

### Payment
Payment method and transaction information for order settlement.

```typescript
interface Payment {
  id: string;                    // UUID v4
  orderId: string;               // UUID reference to Order
  customerId: string;            // UUID reference to Customer
  
  // Payment Details
  paymentMethod: PaymentMethodType;
  amount: number;                // Amount in cents
  currency: string;              // ISO 4217 currency code (default: "USD")
  
  // Transaction Information
  transactionId: string | null;  // External payment processor transaction ID
  authorizationCode: string | null; // Authorization code from processor
  
  // Status & Timing
  status: PaymentStatus;
  processedAt: Date | null;
  
  // Failure Information
  failureReason: string | null;  // Reason for payment failure
  failureCode: string | null;    // Error code from payment processor
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

type PaymentMethodType = 
  | 'credit_card'
  | 'debit_card'
  | 'purchase_order'
  | 'bank_transfer';
```

## Audit & System Entities

### OrderEvent
Audit trail of all order state changes with context and timestamps.

```typescript
interface OrderEvent {
  id: string;                    // UUID v4
  orderId: string;               // UUID reference to Order
  
  // Event Details
  eventType: OrderEventType;
  oldStatus: OrderStatus | null; // Previous status (null for creation)
  newStatus: OrderStatus;        // New status after event
  
  // Context
  triggeredBy: EventTrigger;
  userId: string | null;         // UUID of user who triggered (if applicable)
  reason: string | null;         // Human-readable reason for change
  
  // Metadata
  createdAt: Date;
  metadata: Record<string, any> | null; // Additional event-specific data
}

type OrderEventType =
  | 'created'
  | 'payment_authorized'
  | 'payment_captured'
  | 'payment_failed'
  | 'processing_started'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded'
  | 'modified';

type EventTrigger = 
  | 'customer'          // Customer action
  | 'system'            // Automated system action
  | 'admin'             // Administrative action
  | 'integration';      // External system integration
```

### APIKey
Authentication credentials for external system access with permissions and tracking.

```typescript
interface APIKey {
  id: string;                    // UUID v4
  keyHash: string;               // Hashed API key (never store plain text)
  name: string;                  // Human-readable name
  description: string | null;    // Purpose description
  
  // Permissions
  permissions: APIPermission[];
  
  // Usage & Limits
  usageCount: number;            // Total requests made
  lastUsedAt: Date | null;       // Last usage timestamp
  rateLimit: number;             // Requests per minute limit
  
  // Status
  isActive: boolean;
  expiresAt: Date | null;        // Expiration date (null = no expiration)
  
  // Metadata
  createdAt: Date;
  createdBy: string;             // UUID of user who created the key
}

type APIPermission = 
  | 'orders:read'
  | 'orders:write'
  | 'customers:read'
  | 'customers:write'
  | 'products:read'
  | 'webhooks:manage'
  | 'reports:read';
```

### WebhookSubscription
External system endpoints registered to receive order status notifications.

```typescript
interface WebhookSubscription {
  id: string;                    // UUID v4
  url: string;                   // Target webhook URL
  events: WebhookEventType[];    // Events to subscribe to
  
  // Authentication
  secret: string | null;         // Webhook signing secret
  authHeader: string | null;     // Custom auth header value
  
  // Delivery Configuration
  isActive: boolean;
  maxRetries: number;            // Maximum retry attempts (default: 3)
  retryDelay: number;            // Delay between retries in seconds
  
  // Statistics
  successCount: number;          // Successful deliveries
  failureCount: number;          // Failed deliveries
  lastDeliveryAt: Date | null;   // Last successful delivery
  lastFailureAt: Date | null;    // Last failed delivery
  
  // Metadata
  createdAt: Date;
  createdBy: string;             // UUID of user who created subscription
}

type WebhookEventType =
  | 'order.created'
  | 'order.payment.authorized'
  | 'order.payment.captured'
  | 'order.processing'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.cancelled'
  | 'order.returned';
```

### InventoryReservation
Temporary allocation of product quantities during order processing.

```typescript
interface InventoryReservation {
  id: string;                    // UUID v4
  orderId: string;               // UUID reference to Order
  productId: string;             // UUID reference to Product
  
  // Reservation Details
  quantity: number;              // Reserved quantity
  reservedAt: Date;              // When reservation was made
  expiresAt: Date;               // When reservation expires
  
  // Status
  status: ReservationStatus;
  
  // Resolution
  releasedAt: Date | null;       // When reservation was released
  reason: string | null;         // Reason for release (if applicable)
}

type ReservationStatus = 
  | 'active'         // Reservation is active
  | 'fulfilled'      // Reservation fulfilled by order processing
  | 'expired'        // Reservation expired
  | 'cancelled';     // Reservation manually cancelled
```

## Database Relationships

### Primary Relationships
- Order 1:N OrderLineItem
- Order N:1 Customer  
- Order N:1 Address (billing)
- Order N:1 Address (shipping)
- Order 1:N Payment
- Order 1:N OrderEvent
- OrderLineItem N:1 Product
- Customer 1:N Address
- Product 1:N InventoryReservation

### Indexes Required
- Order: customerId, status, createdAt
- OrderLineItem: orderId, productId
- Product: sku, category, isActive
- Customer: email, customerNumber, type
- OrderEvent: orderId, createdAt
- InventoryReservation: productId, status, expiresAt

## Validation Rules

### Business Logic Constraints
1. Order total must equal sum of line items + tax + shipping - discount
2. Product quantity must be positive integer
3. Reserved quantity cannot exceed available quantity
4. Order modifications only allowed in 'pending' status
5. Commercial customers require company name and tax ID
6. Payment amount must match order total
7. Shipping address required for all orders
8. Billing address defaults to shipping if not provided

### Data Integrity
1. All monetary amounts stored in cents (integers)
2. All UUIDs must be version 4
3. Email addresses must be valid format
4. Phone numbers stored in E.164 format
5. Postal codes validated against country standards
6. SKUs must be unique per product
7. Order numbers must be unique and sequential
8. API keys must be cryptographically secure

## Zod Validation Schemas

Key validation schemas will be defined for:
- Order creation and updates
- Customer registration and updates  
- Product catalog management
- Payment processing
- API request/response validation
- Webhook payload validation

Each schema will provide both compile-time TypeScript types and runtime validation for API endpoints and data processing pipelines.