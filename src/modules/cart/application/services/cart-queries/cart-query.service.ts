// Application service này lấy active cart và dựng response selection từ repository.
// Nó không xác thực giá/tồn kho; Order Service thực hiện các kiểm tra đó trước khi tạo order.

import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { Cart } from '@/database/entities/cart.entity';
import { CartStatus } from '@/database/enums/cart-status.enum';
import { CartIdentity } from '@/modules/cart/application/types/cart-identity.type';
import { CartResponse } from '@/modules/cart/application/types/cart-response.type';
import { CartRepository } from '@/modules/cart/infrastructure/repositories/cart.repository';
import { CartItemRepository } from '@/modules/cart/infrastructure/repositories/cart-item.repository';
import { CartResponseMapper } from '@/modules/cart/application/services/cart-response/cart-response-mapper.service';

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
        const existingCart =
            await this.cartRepository.findActiveByIdentity(identity);
        if (existingCart) return existingCart;

        try {
            const createdCart = await this.dataSource.transaction(
                async (manager) => {
                    const repository = manager.getRepository(Cart);
                    const cart = repository.create({
                        ownerType: identity.ownerType,
                        ownerId: identity.ownerId,
                        status: CartStatus.ACTIVE,
                    });
                    return repository.save(cart);
                },
            );
            return createdCart;
        } catch (error) {
            // Hai tab có thể cùng tạo lần đầu; unique constraint thắng và request này đọc lại cart đã được tab kia tạo.
            if (!this.isUniqueViolation(error)) throw error;
            const concurrentCart =
                await this.cartRepository.findActiveByIdentity(identity);
            if (!concurrentCart) throw error;
            return concurrentCart;
        }
    }

    // Tìm active cart mà không tạo cart mới, phù hợp với update/remove vì mutation không được tạo dữ liệu rỗng ngoài ý muốn.
    findActiveCartEntity(identity: CartIdentity): Promise<Cart | null> {
        return this.cartRepository.findActiveByIdentity(identity);
    }

    // Đọc cart active theo ID và giới hạn selection sau khi controller đã resolve owner.
    // Danh sách phải có đủ item trong cart; không trả partial selection vì có thể làm quote khác với ý định mua.
    async getActiveCartById(
        id: string,
        itemId?: string,
        itemIds?: string[],
    ): Promise<CartResponse> {
        const cart = await this.cartRepository.findActiveById(id);
        if (!cart)
            throw new NotFoundException('Không tìm thấy giỏ hàng active.');
        const items = await this.cartItemRepository.findByCartId(cart.id);
        if (itemId && itemIds?.length) {
            throw new BadRequestException(
                'Chỉ gửi một dạng selection sản phẩm.',
            );
        }
        if (itemIds) {
            if (
                itemIds.length === 0 ||
                itemIds.length > 100 ||
                new Set(itemIds).size !== itemIds.length
            ) {
                throw new BadRequestException(
                    'Danh sách sản phẩm checkout không hợp lệ.',
                );
            }
            const requestedIds = new Set(itemIds);
            const selectedItems = items.filter((item) =>
                requestedIds.has(item.id),
            );
            if (selectedItems.length !== requestedIds.size) {
                throw new NotFoundException(
                    'Một hoặc nhiều sản phẩm không còn trong giỏ hàng active.',
                );
            }
            return this.cartResponseMapper.toResponse(cart, selectedItems);
        }
        if (!itemId) return this.cartResponseMapper.toResponse(cart, items);

        const selectedItem = items.find((item) => item.id === itemId);
        if (!selectedItem) {
            throw new NotFoundException(
                'Không tìm thấy sản phẩm trong giỏ hàng active.',
            );
        }
        return this.cartResponseMapper.toResponse(cart, [selectedItem]);
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
        return driverError.code === '23505';
    }
}
