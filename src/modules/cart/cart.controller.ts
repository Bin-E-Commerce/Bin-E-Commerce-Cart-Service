// Controller này công bố endpoint đọc active cart cho Customer và Guest.
// Controller chỉ kết nối HTTP với use case, không tự viết query hay quyết định ownership.

import { Controller, Get, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CartIdentityResolver } from "./services/cart-identity-resolver.service";
import { CartQueryService } from "./services/cart-query.service";
import { CartResponse } from "./types/cart-response.type";

// Route cart cấp cho cả Guest và Customer; Gateway đã đánh dấu route này allow guest.
@ApiTags("cart")
@Controller({ path: "cart", version: "1" })
export class CartController {
  constructor(
    private readonly identityResolver: CartIdentityResolver,
    private readonly cartQueryService: CartQueryService,
  ) {}

  // GET lặp lại nhiều lần vẫn trả cùng active cart nên phù hợp hydrate trang và retry mạng.
  @Get()
  @ApiOperation({ summary: "Get or create the active cart" })
  @ApiResponse({ status: 200, description: "Active cart", type: Object })
  @ApiResponse({ status: 400, description: "Missing or invalid cart identity" })
  async getActiveCart(@Req() request: Request): Promise<CartResponse> {
    const identity = this.identityResolver.resolve(request);
    return this.cartQueryService.getOrCreateActiveCart(identity);
  }
}
