// Application service này thực hiện use case Phase 1: lấy hoặc tạo active cart.
// Service chưa xử lý item, giá, tồn kho, merge guest hay checkout.

import { Injectable } from "@nestjs/common";
import { DataSource, QueryFailedError } from "typeorm";
import { Cart } from "../../../database/entities/cart.entity";
import { CartStatus } from "../enums/cart-status.enum";
import { CartIdentity } from "../types/cart-identity.type";
import { CartResponse } from "../types/cart-response.type";
import { CartRepository } from "../repositories/cart.repository";

// Tạo hoặc lấy active cart có tính idempotent dù client gọi GET nhiều lần.
@Injectable()
export class CartQueryService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly dataSource: DataSource,
  ) {}

  // Trả cart hiện có; nếu chưa có thì tạo một cart rỗng trong transaction.
  async getOrCreateActiveCart(identity: CartIdentity): Promise<CartResponse> {
    const existingCart = await this.cartRepository.findActiveByIdentity(identity);
    if (existingCart) return this.toResponse(existingCart);

    try {
      const createdCart = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Cart);
        const cart = repository.create({
          ownerType: identity.ownerType,
          ownerId: identity.ownerId,
          status: CartStatus.ACTIVE,
        });
        return repository.save(cart);
      });
      return this.toResponse(createdCart);
    } catch (error) {
      // Hai tab có thể cùng tạo lần đầu; unique constraint thắng và request này đọc lại cart đã được tab kia tạo.
      if (!this.isUniqueViolation(error)) throw error;
      const concurrentCart = await this.cartRepository.findActiveByIdentity(
        identity,
      );
      if (!concurrentCart) throw error;
      return this.toResponse(concurrentCart);
    }
  }

  // Tách entity khỏi response để sau này có thể bổ sung items mà không leak persistence model.
  private toResponse(cart: Cart): CartResponse {
    return {
      id: cart.id,
      ownerType: cart.ownerType as CartResponse["ownerType"],
      ownerId: cart.ownerId,
      status: cart.status,
      items: [],
      totalItems: 0,
      warnings: [],
      createdAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  // PostgreSQL báo mã 23505 khi unique active-cart constraint bị tranh chấp.
  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === "23505";
  }
}
