// Controller này công bố endpoint đọc active cart cho Customer và Guest.
// Controller chỉ kết nối HTTP với use case, không tự viết query hay quyết định ownership.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CartItemCommandService } from "../services/cart-item-command.service";
import { CartQueryService } from "../services/cart-query.service";
import { CartResponse } from "../types/cart-response.type";
import { AddCartItemDto } from "../dto/add-cart-item.dto";
import { UpdateCartItemDto } from "../dto/update-cart-item.dto";
import { CartIdentityResolver } from "../services/cart-identity-resolver.service";

// Route cart cấp cho cả Guest và Customer; Gateway đã đánh dấu route này allow guest.
@ApiTags("cart")
@Controller({ path: "cart", version: "1" })
export class CartController {
  constructor(
    private readonly identityResolver: CartIdentityResolver,
    private readonly cartQueryService: CartQueryService,
    private readonly cartItemCommandService: CartItemCommandService,
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

  // POST chỉ dành cho user đã đăng nhập; identity lấy từ Gateway, còn product snapshot lấy từ Product Service.
  @Post("items")
  @ApiOperation({ summary: "Add a product variant to the active cart" })
  @ApiResponse({ status: 200, description: "Cart after adding item", type: Object })
  @ApiResponse({ status: 404, description: "Product or variant not found" })
  @ApiResponse({ status: 409, description: "Product unavailable or stock exceeded" })
  @ApiResponse({ status: 503, description: "Product Service unavailable" })
  async addItem(
    @Req() request: Request,
    @Body() dto: AddCartItemDto,
  ): Promise<CartResponse> {
    const identity = this.identityResolver.resolve(request);
    return this.cartItemCommandService.addItem(identity, dto);
  }

  // PATCH nhận quantity mới thay vì delta để frontend retry an toàn và backend kiểm soát giới hạn tập trung.
  @Patch("items/:itemId")
  @ApiOperation({ summary: "Update cart item quantity" })
  @ApiResponse({ status: 200, description: "Cart after updating item", type: Object })
  @ApiResponse({ status: 404, description: "Cart item not found" })
  @ApiResponse({ status: 409, description: "Product unavailable or stock exceeded" })
  async updateItem(
    @Req() request: Request,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    const identity = this.identityResolver.resolve(request);
    return this.cartItemCommandService.updateItem(identity, itemId, dto);
  }

  // DELETE xóa đúng item trong cart của owner hiện tại; Cart Service không nhận cartId từ client để tránh sửa chéo cart.
  @Delete("items/:itemId")
  @ApiOperation({ summary: "Remove an item from the active cart" })
  @ApiResponse({ status: 200, description: "Cart after removing item", type: Object })
  @ApiResponse({ status: 404, description: "Cart item not found" })
  async removeItem(
    @Req() request: Request,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ): Promise<CartResponse> {
    const identity = this.identityResolver.resolve(request);
    return this.cartItemCommandService.removeItem(identity, itemId);
  }
}
