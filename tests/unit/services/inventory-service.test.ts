import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert";
import {
  InventoryService,
  InsufficientStockError,
  ProductNotFoundError,
} from "../../../src/services/InventoryService";
import { ProductRepository } from "../../../src/repositories/ProductRepository";
import type { Product } from "../../../src/models/Product";

// A mock product to be used in tests
const getMockProduct = (overrides: Partial<Product>): Product => ({
  id: "prod_1",
  name: "Test Product",
  sku: "TP-001",
  description: "A product for testing",
  type: "simple",
  status: "active",
  retailPriceCents: 1000,
  currency: "USD",
  inventoryManagement: "tracked",
  currentStock: 10,
  reservedStock: 0,
  availableStock: 10,
  lowStockThreshold: 5,
  outOfStockThreshold: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 1,
  ...overrides,
} as Product);

describe("InventoryService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  describe("checkStockAvailability", () => {
    it("should show a product as available when requested quantity is less than available stock", async () => {
      const mockProduct = getMockProduct({ availableStock: 10 });
      mock.method(ProductRepository, "findById", async () => mockProduct);

      const result = await InventoryService.checkStockAvailability("prod_1", 5);

      assert.strictEqual(result.available, true);
      assert.strictEqual(result.requestedQuantity, 5);
      assert.strictEqual(result.availableStock, 10);
      assert.strictEqual(result.shortfall, undefined);
    });

    it("should show a product as unavailable when requested quantity is more than available stock", async () => {
      const mockProduct = getMockProduct({ availableStock: 5 });
      mock.method(ProductRepository, "findById", async () => mockProduct);

      const result = await InventoryService.checkStockAvailability("prod_1", 10);

      assert.strictEqual(result.available, false);
      assert.strictEqual(result.requestedQuantity, 10);
      assert.strictEqual(result.availableStock, 5);
      assert.strictEqual(result.shortfall, 5);
    });

    it("should throw ProductNotFoundError if the product does not exist", async () => {
      mock.method(ProductRepository, "findById", async () => null);
      await assert.rejects(
        InventoryService.checkStockAvailability("prod_nonexistent", 1),
        ProductNotFoundError
      );
    });

    it("should always show products with untracked inventory as available", async () => {
      const mockProduct = getMockProduct({ inventoryManagement: "not_tracked" });
      mock.method(ProductRepository, "findById", async () => mockProduct);

      const result = await InventoryService.checkStockAvailability("prod_1", 1000);

      assert.strictEqual(result.available, true);
      assert.strictEqual(result.currentStock, Infinity);
    });
  });

  describe("createReservation", () => {
    it("should create a reservation for a product with sufficient stock", async () => {
      const mockProduct = getMockProduct({ availableStock: 10 });
      mock.method(ProductRepository, "findById", async () => mockProduct);
      const updateInventoryMock = mock.method(ProductRepository, "updateInventory", async () => getMockProduct({}));

      const reservation = await InventoryService.createReservation({
        productId: "prod_1",
        quantity: 5,
        reason: "Test reservation",
      });

      assert.ok(reservation);
      assert.strictEqual(reservation.productId, "prod_1");
      assert.strictEqual(reservation.quantity, 5);
      assert.strictEqual(reservation.status, "active");

      const updateCall = updateInventoryMock.mock.calls[0];
      assert.deepStrictEqual(updateCall.arguments[1], {
        reservedStock: 5,
        reason: `Reservation ${reservation.id}: Test reservation`,
      });
    });

    it("should throw InsufficientStockError when trying to reserve more than available stock", async () => {
      const mockProduct = getMockProduct({ availableStock: 5 });
      mock.method(ProductRepository, "findById", async () => mockProduct);

      await assert.rejects(
        InventoryService.createReservation({
          productId: "prod_1",
          quantity: 10,
          reason: "Test reservation",
        }),
        InsufficientStockError
      );
    });

    it("should throw ProductNotFoundError if trying to reserve a non-existent product", async () => {
      mock.method(ProductRepository, "findById", async () => null);
      await assert.rejects(
        InventoryService.createReservation({
          productId: "prod_nonexistent",
          quantity: 1,
          reason: "Test reservation",
        }),
        ProductNotFoundError
      );
    });
  });
});


