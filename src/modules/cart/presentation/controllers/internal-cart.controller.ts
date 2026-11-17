// Controller này cung cấp contract nội bộ cho Order Service.
// Các route không đi qua API Gateway và không nhận cartId từ client công khai.
// Cart Service vẫn resolve owner từ x-user-id để không cho service caller thao tác chéo tài khoản.

import {
    Body,
    Controller,
    Get,
    NotFoundException,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { CartIdentityResolver } from '@/modules/cart/application/services/cart-identity/cart-identity-resolver.service';
import { CartItemCommandService } from '@/modules/cart/application/services/cart-items/cart-item-command.service';
import { CartQueryService } from '@/modules/cart/application/services/cart-queries/cart-query.service';
import { InternalServiceGuard } from '@/modules/cart/presentation/guards/internal-service.guard';
import type { CartResponse } from '@/modules/cart/application/types/cart-response.type';
import { CheckoutCartItemsDto } from '@/modules/cart/presentation/dto/checkout-cart-items.dto';
import type { Request } from 'express';
import { Req } from '@nestjs/common';

// Chỉ service nội bộ có token hợp lệ mới được gọi contract checkout.
@Controller('internal/carts')
@UseGuards(InternalServiceGuard)
export class InternalCartController {
    constructor(
        private readonly identityResolver: CartIdentityResolver,
        private readonly cartQueryService: CartQueryService,
        private readonly cartItemCommandService: CartItemCommandService,
    ) {}

    // Lấy toàn cart, legacy một item hoặc tập item đã chọn; owner luôn được resolve từ header nội bộ.
    @Get('active')
    async getActiveCart(
        @Req() request: Request,
        @Query('itemId') itemId?: string,
        @Query('itemIds') itemIdsValue?: string,
    ): Promise<CartResponse> {
        const identity = this.identityResolver.resolve(request);
        const cart = await this.cartQueryService.findActiveCartEntity(identity);
        if (!cart)
            throw new NotFoundException(
                'Không tìm thấy giỏ hàng đang hoạt động.',
            );
        const itemIds = itemIdsValue?.split(',').map((value) => value.trim());
        return this.cartQueryService.getActiveCartById(
            cart.id,
            itemId,
            itemIds,
        );
    }

    // Đánh dấu active cart đã checkout để lần đọc tiếp theo tạo một cart rỗng mới.
    @Post('checkout')
    async checkoutCart(@Req() request: Request): Promise<{ status: string }> {
        const identity = this.identityResolver.resolve(request);
        await this.cartItemCommandService.checkoutCart(identity);
        return { status: 'CHECKED_OUT' };
    }

    // Xóa đúng item sau khi order Mua ngay đã commit, không đóng toàn bộ active cart.
    @Post('checkout-item')
    async checkoutCartItem(
        @Req() request: Request,
        @Query('itemId') itemId?: string,
    ): Promise<{ status: string }> {
        if (!itemId) throw new NotFoundException('Thiếu item cần checkout.');
        const identity = this.identityResolver.resolve(request);
        await this.cartItemCommandService.checkoutCartItem(identity, itemId);
        return { status: 'ITEM_CHECKED_OUT' };
    }

    // Dọn snapshot, ID legacy hoặc cart cũ chưa thay đổi kể từ lúc order được tạo.
    @Post('checkout-items')
    async checkoutCartItems(
        @Req() request: Request,
        @Body() dto: CheckoutCartItemsDto,
    ): Promise<{ status: string }> {
        const identity = this.identityResolver.resolve(request);
        await this.cartItemCommandService.checkoutCartItems(
            identity,
            dto.orderId,
            dto.items,
            dto.itemIds,
            dto.checkoutAllBefore,
        );
        return { status: 'ITEMS_CHECKED_OUT' };
    }
}
