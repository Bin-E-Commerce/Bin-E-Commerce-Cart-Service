// Test này bảo vệ nghiệp vụ thêm SKU vào cart: xác thực nguồn, cộng quantity và rollback khi không đủ stock.
// Các dependency bên ngoài được mock để test chỉ tập trung vào application service.

import { DataSource } from "typeorm";
import { Cart } from "../../../database/entities/cart.entity";
import { CartStatus } from "../enums/cart-status.enum";
import {
  CartProductNotPurchasableError,
  CartStockExceededError,
} from "../errors/cart-item.errors";
import { CartOwnerType } from "../types/cart-identity.type";
import type { ProductCatalogProduct } from "../types/product-catalog-product.type";
import { AddCartItemDto } from "../dto/add-cart-item.dto";
import { ProductCatalogClient } from "../clients/product-catalog.client";
import { CartItemRepository } from "../repositories/cart-item.repository";
import { CartItemCommandService } from "./cart-item-command.service";
import { CartQueryService } from "./cart-query.service";

// Nhóm test cho application service Add Item.
describe("CartItemCommandService", () => {
  const identity = { ownerType: CartOwnerType.CUSTOMER, ownerId: "user-1" };
  const cart: Cart = {
    id: "cart-1",
    ownerType: CartOwnerType.CUSTOMER,
    ownerId: "user-1",
    status: CartStatus.ACTIVE,
    createdAt: new Date("2026-08-29T00:00:00.000Z"),
    updatedAt: new Date("2026-08-29T00:00:00.000Z"),
  };
  const response = {
    id: "cart-1",
    ownerType: CartOwnerType.CUSTOMER,
    ownerId: "user-1",
    status: CartStatus.ACTIVE,
    items: [],
    totalItems: 0,
    subtotal: "0.00",
    warnings: [],
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };

  // Tạo product snapshot tối thiểu để test không phụ thuộc database Product Service.
  function product(overrides: Partial<ProductCatalogProduct> = {}): ProductCatalogProduct {
    return {
      id: "product-1",
      originType: "INTERNAL",
      status: "ACTIVE",
      sellerShopId: "shop-1",
      name: "Áo thể thao",
      images: [{ imageUrl: "https://cdn.test/product.png", isThumbnail: true }],
      variants: [
        {
          id: "variant-1",
          sku: "SKU-001",
          name: "Đen - XL",
          status: "ACTIVE",
          price: "22000.00",
          originalPrice: "33000.00",
          stockQuantity: 10,
          imageUrl: null,
          inventory: { quantityAvailable: 10 },
        },
      ],
      ...overrides,
    };
  }

  // Tạo target cùng các mock transaction để mỗi test độc lập và kiểm tra được lệnh save.
  function setup(existingItem: { quantity: number } | null = null) {
    const mockProductCatalogClient = {
      getProduct: jest.fn().mockResolvedValue(product()),
    } as unknown as ProductCatalogClient;
    const mockCartQueryService = {
      getOrCreateActiveCartEntity: jest.fn().mockResolvedValue(cart),
      findActiveCartEntity: jest.fn().mockResolvedValue(cart),
      getActiveCartById: jest.fn().mockResolvedValue(response),
    } as unknown as CartQueryService;
    const mockCartItemRepository = {
      findByCartAndId: jest.fn().mockResolvedValue(null),
    } as unknown as CartItemRepository;
    const savedItem = existingItem
      ? { ...existingItem, id: "item-1" }
      : null;
    const itemRepository = {
      findOne: jest.fn().mockResolvedValue(savedItem),
      create: jest.fn((value) => ({ id: "item-1", ...value })),
      save: jest.fn().mockResolvedValue(savedItem),
      remove: jest.fn().mockResolvedValue(savedItem),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(cart),
      getRepository: jest.fn().mockReturnValue(itemRepository),
      save: jest.fn().mockResolvedValue(cart),
    };
    const mockDataSource = {
      transaction: jest.fn(async (callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    } as unknown as DataSource;
    const target = new CartItemCommandService(
      mockCartQueryService,
      mockProductCatalogClient,
      mockCartItemRepository,
      mockDataSource,
    );

    return {
      target,
      mockProductCatalogClient,
      mockCartQueryService,
      mockCartItemRepository,
      itemRepository,
    };
  }

  // Thêm SKU mới phải lưu snapshot từ Product Service và trả lại cart sau mutation.
  it("creates a new cart item from the trusted product snapshot", async () => {
    // Arrange
    const { target, itemRepository, mockCartQueryService } = setup();
    const dto: AddCartItemDto = {
      productId: "product-1",
      variantId: "variant-1",
      quantity: 2,
    };

    // Act
    const result = await target.addItem(identity, dto);

    // Assert
    expect(itemRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cartId: "cart-1",
        productId: "product-1",
        variantId: "variant-1",
        sku: "SKU-001",
        unitPrice: "22000.00",
        quantity: 2,
      }),
    );
    expect(itemRepository.save).toHaveBeenCalledTimes(1);
    expect(mockCartQueryService.getActiveCartById).toHaveBeenCalledWith("cart-1");
    expect(result).toEqual(response);
  });

  // Seller vẫn dùng chung cart như Customer nhưng không được mua sản phẩm thuộc shop của chính mình.
  it("rejects a seller buying from their own shop", async () => {
    // Arrange
    const { target, mockProductCatalogClient, itemRepository } = setup();
    (mockProductCatalogClient.getProduct as jest.Mock).mockResolvedValue(
      product({ sellerOwnerId: identity.ownerId }),
    );
    const dto: AddCartItemDto = {
      productId: "product-1",
      variantId: "variant-1",
      quantity: 1,
    };

    // Act & Assert
    await expect(target.addItem(identity, dto)).rejects.toBeInstanceOf(
      CartProductNotPurchasableError,
    );
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  // SKU trùng phải cộng quantity hiện tại thay vì tạo dòng hàng thứ hai.
  it("increments quantity when the variant already exists", async () => {
    // Arrange
    const { target, itemRepository } = setup({ quantity: 2 });
    const dto: AddCartItemDto = {
      productId: "product-1",
      variantId: "variant-1",
      quantity: 3,
    };

    // Act
    await target.addItem(identity, dto);

    // Assert
    expect(itemRepository.create).not.toHaveBeenCalled();
    expect(itemRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1", quantity: 5 }),
    );
  });

  // Tổng quantity sau khi cộng vượt stock phải dừng trước save để không ghi cart item sai.
  it("rejects when the resulting quantity exceeds available stock", async () => {
    // Arrange
    const { target, itemRepository } = setup({ quantity: 9 });
    const dto: AddCartItemDto = {
      productId: "product-1",
      variantId: "variant-1",
      quantity: 2,
    };

    // Act & Assert
    await expect(target.addItem(identity, dto)).rejects.toBeInstanceOf(
      CartStockExceededError,
    );
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  // Product external không được đưa vào cart nội bộ dù client gửi đúng product/variant ID.
  it("rejects external products", async () => {
    // Arrange
    const { target, itemRepository, mockProductCatalogClient } = setup();
    (mockProductCatalogClient.getProduct as jest.Mock).mockResolvedValue(
      product({ originType: "EXTERNAL" }),
    );

    // Act & Assert
    await expect(
      target.addItem(identity, {
        productId: "product-1",
        variantId: "variant-1",
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(CartProductNotPurchasableError);
    expect(itemRepository.save).not.toHaveBeenCalled();
  });

  // Update quantity phải đọc đúng item thuộc cart hiện tại, kiểm tra stock khi tăng và trả response cart mới.
  it("updates quantity when the requested quantity is available", async () => {
    // Arrange
    const { target, itemRepository, mockCartItemRepository, mockCartQueryService } =
      setup();
    const currentItem = {
      id: "item-1",
      cartId: "cart-1",
      productId: "product-1",
      variantId: "variant-1",
      quantity: 2,
    };
    (mockCartItemRepository.findByCartAndId as jest.Mock).mockResolvedValue(
      currentItem,
    );
    itemRepository.findOne.mockResolvedValue(currentItem);

    // Act
    const result = await target.updateItem(identity, "item-1", { quantity: 4 });

    // Assert
    expect(itemRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1", quantity: 4 }),
    );
    expect(mockCartQueryService.getActiveCartById).toHaveBeenCalledWith("cart-1");
    expect(result).toEqual(response);
  });

  // Remove phải xóa item trong transaction mà không gọi Product Service, để dọn được item đã ngừng bán.
  it("removes the requested item from the owner cart", async () => {
    // Arrange
    const { target, itemRepository } = setup();
    const item = { id: "item-1", cartId: "cart-1", quantity: 2 };
    itemRepository.findOne.mockResolvedValue(item);

    // Act
    const result = await target.removeItem(identity, "item-1");

    // Assert
    expect(itemRepository.remove).toHaveBeenCalledWith(item);
    expect(result).toEqual(response);
  });
});
