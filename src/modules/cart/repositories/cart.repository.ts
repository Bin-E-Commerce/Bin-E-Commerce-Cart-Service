// Repository này là cổng truy cập bảng carts của Cart Service.
// Repository không chứa quy tắc chọn owner; quy tắc đó nằm ở CartIdentityResolver.

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Cart } from "../../../database/entities/cart.entity";
import { CartStatus } from "../enums/cart-status.enum";
import { CartIdentity } from "../types/cart-identity.type";

// Đóng gói query active cart để application service không phụ thuộc TypeORM API.
@Injectable()
export class CartRepository {
  constructor(
    @InjectRepository(Cart)
    private readonly repository: Repository<Cart>,
  ) {}

  // Tìm active cart theo cặp owner type và opaque owner id.
  findActiveByIdentity(identity: CartIdentity): Promise<Cart | null> {
    return this.repository.findOne({
      where: {
        ownerType: identity.ownerType,
        ownerId: identity.ownerId,
        status: CartStatus.ACTIVE,
      },
    });
  }
}
