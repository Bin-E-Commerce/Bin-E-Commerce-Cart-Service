// Service này map cart aggregate và item snapshot thành response public của Cart Service.
// Nó giữ phép tính subtotal ở backend để frontend không thể tự thay đổi tổng tiền hiển thị.

import { Injectable } from "@nestjs/common";
import { Cart } from "../../../../database/entities/cart.entity";
import { CartItem } from "../../../../database/entities/cart-item.entity";
import { fromCents, toCents } from "../utils/cart-money.util";
import type {
  CartItemResponse,
  CartResponse,
} from "../types/cart-response.type";

// Tạo response bất biến từ entity, tính line total và subtotal bằng số nguyên cents.
@Injectable()
export class CartResponseMapper {
  // Map cart cùng các item đã load và chuẩn hóa timestamp về ISO string cho API.
  toResponse(cart: Cart, items: CartItem[]): CartResponse {
    const mappedItems = items.map((item) => this.toItemResponse(item));
    const subtotal = mappedItems.reduce(
      (total, item) => total + toCents(item.lineTotal),
      0n,
    );

    return {
      id: cart.id,
      ownerType: cart.ownerType as CartResponse["ownerType"],
      ownerId: cart.ownerId,
      status: cart.status,
      items: mappedItems,
      totalItems: mappedItems.reduce((total, item) => total + item.quantity, 0),
      subtotal: fromCents(subtotal),
      warnings: [],
      createdAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  // Chuyển một cart item thành dữ liệu UI và tính line total từ snapshot price * quantity.
  private toItemResponse(item: CartItem): CartItemResponse {
    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      sellerShopId: item.sellerShopId,
      sku: item.sku,
      productName: item.productName,
      variantName: item.variantName,
      imageUrl: item.imageUrl,
      unitPrice: fromCents(toCents(item.unitPrice)),
      originalPrice: item.originalPrice
        ? fromCents(toCents(item.originalPrice))
        : null,
      quantity: item.quantity,
      lineTotal: fromCents(toCents(item.unitPrice) * BigInt(item.quantity)),
    };
  }
}
