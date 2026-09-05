// Controller này cung cấp contract nội bộ cho Order Service.
// Các route không đi qua API Gateway và không nhận cartId từ client công khai.
// Cart Service vẫn resolve owner từ x-user-id để không cho service caller thao tác chéo tài khoản.

import { Controller, Get, NotFoundException, Post, UseGuards } from "@nestjs/common";
import { CartIdentityResolver } from "../../application/services/cart-identity/cart-identity-resolver.service";
import { CartItemCommandService } from "../../application/services/cart-items/cart-item-command.service";
import { CartQueryService } from "../../application/services/cart-queries/cart-query.service";
import { InternalServiceGuard } from "../guards/internal-service.guard";
import type { CartResponse } from "../../application/types/cart-response.type";
import type { Request } from "express";
import { Req } from "@nestjs/common";

// Chỉ service nội bộ có token hợp lệ mới được gọi contract checkout.
@Controller("internal/carts")
@UseGuards(InternalServiceGuard)
export class InternalCartController {
  constructor(
    private readonly identityResolver: CartIdentityResolver,
    private readonly cartQueryService: CartQueryService,
    private readonly cartItemCommandService: CartItemCommandService,
  ) {}

  // Lấy active cart hiện tại mà không tạo cart rỗng khi user chưa từng thêm sản phẩm.
  @Get("active")
  async getActiveCart(@Req() request: Request): Promise<CartResponse> {
    const identity = this.identityResolver.resolve(request);
    const cart = await this.cartQueryService.findActiveCartEntity(identity);
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng đang hoạt động.");
    return this.cartQueryService.getActiveCartById(cart.id);
  }

  // Đánh dấu active cart đã checkout để lần đọc tiếp theo tạo một cart rỗng mới.
  @Post("checkout")
  async checkoutCart(@Req() request: Request): Promise<{ status: string }> {
    const identity = this.identityResolver.resolve(request);
    await this.cartItemCommandService.checkoutCart(identity);
    return { status: "CHECKED_OUT" };
  }
}
