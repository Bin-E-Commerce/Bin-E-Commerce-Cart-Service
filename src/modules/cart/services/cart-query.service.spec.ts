// Test này bảo vệ use case idempotent của Phase 1: đọc cart cũ hoặc tạo cart rỗng đúng một lần.
// Test dùng mock repository/data source để không phụ thuộc PostgreSQL khi chạy unit test.

import { DataSource } from "typeorm";
import { Cart } from "../../../database/entities/cart.entity";
import { CartStatus } from "../enums/cart-status.enum";
import { CartOwnerType } from "../types/cart-identity.type";
import { CartRepository } from "../repositories/cart.repository";
import { CartItemRepository } from "../repositories/cart-item.repository";
import { CartResponseMapper } from "./cart-response-mapper.service";
import { CartQueryService } from "./cart-query.service";

// Nhóm test cho application service Cart Query.
describe("CartQueryService", () => {
  const identity = { ownerType: CartOwnerType.GUEST, ownerId: "guest-1" };

  // Tạo entity giả đầy đủ field mà mapper response cần dùng.
  function cart(): Cart {
    return {
      id: "cart-1",
      ownerType: CartOwnerType.GUEST,
      ownerId: "guest-1",
      status: CartStatus.ACTIVE,
      createdAt: new Date("2026-08-28T00:00:00.000Z"),
      updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    };
  }

  // Khi cart tồn tại, use case không được mở transaction hay tạo record mới.
  it("returns the existing active cart", async () => {
    const existingCart = cart();
    const repository = {
      findActiveByIdentity: jest.fn().mockResolvedValue(existingCart),
    } as unknown as CartRepository;
    const itemRepository = {
      findByCartId: jest.fn().mockResolvedValue([]),
    } as unknown as CartItemRepository;
    const dataSource = { transaction: jest.fn() } as unknown as DataSource;
    const target = new CartQueryService(
      repository,
      itemRepository,
      new CartResponseMapper(),
      dataSource,
    );

    await expect(target.getOrCreateActiveCart(identity)).resolves.toMatchObject({
      id: "cart-1",
      totalItems: 0,
      items: [],
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  // Khi chưa có cart, use case phải save active cart rỗng trong transaction.
  it("creates an active empty cart when none exists", async () => {
    const createdCart = cart();
    const repository = {
      findActiveByIdentity: jest.fn().mockResolvedValue(null),
    } as unknown as CartRepository;
    const itemRepository = {
      findByCartId: jest.fn().mockResolvedValue([]),
    } as unknown as CartItemRepository;
    const transactionalRepository = {
      create: jest.fn().mockReturnValue(createdCart),
      save: jest.fn().mockResolvedValue(createdCart),
    };
    const dataSource = {
      transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
        callback({ getRepository: () => transactionalRepository }),
      ),
    } as unknown as DataSource;
    const target = new CartQueryService(
      repository,
      itemRepository,
      new CartResponseMapper(),
      dataSource,
    );

    await expect(target.getOrCreateActiveCart(identity)).resolves.toMatchObject({
      id: "cart-1",
      ownerType: CartOwnerType.GUEST,
      status: CartStatus.ACTIVE,
      totalItems: 0,
    });
    expect(transactionalRepository.create).toHaveBeenCalledWith({
      ownerType: CartOwnerType.GUEST,
      ownerId: "guest-1",
      status: CartStatus.ACTIVE,
    });
  });
});
