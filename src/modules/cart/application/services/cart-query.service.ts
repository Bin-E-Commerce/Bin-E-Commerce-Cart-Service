// Application service này thực hiện use case Phase 1: lấy hoặc tạo active cart.
// Service chưa xử lý item, giá, tồn kho, merge guest hay checkout.

import { Injectable, NotFoundException } from "@nestjs/common";
import { DataSource, QueryFailedError } from "typeorm";
import { Cart } from "../../../../database/entities/cart.entity";
import { CartStatus } from "../../../../database/enums/cart-status.enum";
import { CartIdentity } from "../types/cart-identity.type";
import { CartResponse } from "../types/cart-response.type";
import { CartRepository } from "../../infrastructure/repositories/cart.repository";
import { CartItemRepository } from "../../infrastructure/repositories/cart-item.repository";
import { CartResponseMapper } from "./cart-response-mapper.service";

// Tạo hoặc lấy active cart có tính idempotent dù client gọi GET nhiều lần.
@Injectable()
export class CartQueryService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly cartItemRepository: CartItemRepository,
    private readonly cartResponseMapper: CartResponseMapper,
    private readonly dataSource: DataSource,
  ) {}

  // Trả cart hiện có; nếu chưa có thì tạo một cart rỗng trong transaction.
  async getOrCreateActiveCart(identity: CartIdentity): Promise<CartResponse> {
    const cart = await this.getOrCreateActiveCartEntity(identity);
    return this.toResponse(cart);
  }

  // Resolve entity để các command dùng chung quy tắc tạo cart mà không lặp lại race-condition handling.
  async getOrCreateActiveCartEntity(identity: CartIdentity): Promise<Cart> {
    const existingCart = await this.cartRepository.findActiveByIdentity(identity);
    if (existingCart) return existingCart;

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
      return createdCart;
    } catch (error) {
      // Hai tab có thể cùng tạo lần đầu; unique constraint thắng và request này đọc lại cart đã được tab kia tạo.
      if (!this.isUniqueViolation(error)) throw error;
      const concurrentCart = await this.cartRepository.findActiveByIdentity(
        identity,
      );
      if (!concurrentCart) throw error;
      return concurrentCart;
    }
  }

  // Tìm active cart mà không tạo cart mới, phù hợp với update/remove vì mutation không được tạo dữ liệu rỗng ngoài ý muốn.
  findActiveCartEntity(identity: CartIdentity): Promise<Cart | null> {
    return this.cartRepository.findActiveByIdentity(identity);
  }

  // Đọc cart active theo ID sau command để trả response có item mới nhất.
  async getActiveCartById(id: string): Promise<CartResponse> {
    const cart = await this.cartRepository.findActiveById(id);
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng active.");
    return this.toResponse(cart);
  }

  // Tách entity khỏi response và load item qua repository riêng để không leak persistence model.
  private async toResponse(cart: Cart): Promise<CartResponse> {
    const items = await this.cartItemRepository.findByCartId(cart.id);
    return this.cartResponseMapper.toResponse(cart, items);
  }

  // PostgreSQL báo mã 23505 khi unique active-cart constraint bị tranh chấp.
  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string };
    return driverError.code === "23505";
  }
}
