// Repository này đóng gói các query cart_items để service nghiệp vụ không phụ thuộc trực tiếp TypeORM API.

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CartItem } from "../../../database/entities/cart-item.entity";

// Cung cấp query item theo cart và variant, đồng thời giữ một nơi duy nhất cho ordering response.
@Injectable()
export class CartItemRepository {
  // Nhận TypeORM repository qua DI để lớp này chỉ làm persistence adapter.
  constructor(
    @InjectRepository(CartItem)
    private readonly repository: Repository<CartItem>,
  ) {}

  // Lấy item theo cart để response luôn ổn định theo thời điểm thêm gần nhất.
  findByCartId(cartId: string): Promise<CartItem[]> {
    return this.repository.find({
      where: { cartId },
      order: { createdAt: "ASC" },
    });
  }

  // Tìm đúng một SKU trong cart; unique index vẫn là lớp bảo vệ cuối nếu có request tranh chấp.
  findByCartAndVariant(
    cartId: string,
    variantId: string,
  ): Promise<CartItem | null> {
    return this.repository.findOne({ where: { cartId, variantId } });
  }

  // Tìm item theo cả cartId và itemId để mọi thao tác update/remove luôn bị giới hạn trong cart của owner hiện tại.
  findByCartAndId(cartId: string, itemId: string): Promise<CartItem | null> {
    return this.repository.findOne({ where: { cartId, id: itemId } });
  }
}
