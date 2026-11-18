// Application service này lấy cart và bổ sung giá, tồn kho hiện tại từ catalog để hiển thị giỏ hàng.
// Availability chỉ là thông tin trình bày, không giữ hàng hoặc thay thế kiểm tra giá/tồn kho của Order Service.

import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { CartItem } from '@/database/entities/cart-item.entity';
import { Cart } from '@/database/entities/cart.entity';
import { CartStatus } from '@/database/enums/cart-status.enum';
import { CartIdentity } from '@/modules/cart/application/types/cart-identity.type';
import { CartResponse } from '@/modules/cart/application/types/cart-response.type';
import { CartRepository } from '@/modules/cart/infrastructure/repositories/cart.repository';
import { CartItemRepository } from '@/modules/cart/infrastructure/repositories/cart-item.repository';
import { ProductCatalogClient } from '@/modules/cart/application/clients/product-catalog.client';
import { CartCatalogNotFoundError } from '@/modules/cart/application/errors/cart-item.errors';
import { CartResponseMapper } from '@/modules/cart/application/services/cart-response/cart-response-mapper.service';
import type { ProductCatalogProduct } from '@/modules/cart/application/types/product-catalog-product.type';
import {
    fromCents,
    toCents,
} from '@/modules/cart/application/utils/cart-money.util';

// Tạo hoặc lấy active cart có tính idempotent dù client gọi GET nhiều lần.
@Injectable()
export class CartQueryService {
    constructor(
        private readonly cartRepository: CartRepository,
        private readonly cartItemRepository: CartItemRepository,
        private readonly cartResponseMapper: CartResponseMapper,
        private readonly productCatalogClient: ProductCatalogClient,
        private readonly dataSource: DataSource,
    ) {}

    // Trả cart hiện có hoặc tạo cart rỗng; response public kèm availability nhưng không loại item khỏi giỏ.
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
    // Response public mặc định có availability; checkout nội bộ tắt enrich để không thêm Product Service vào đường tạo order.
    // Danh sách selection phải đủ ID hợp lệ để quote và tạo order cùng phản ánh chính xác ý định mua.
    async getActiveCartById(
        id: string,
        itemId?: string,
        itemIds?: string[],
        includeAvailability = true,
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
            return this.toResponse(cart, selectedItems, includeAvailability);
        }
        if (!itemId) return this.toResponse(cart, items, includeAvailability);

        const selectedItem = items.find((item) => item.id === itemId);
        if (!selectedItem) {
            throw new NotFoundException(
                'Không tìm thấy sản phẩm trong giỏ hàng active.',
            );
        }
        return this.toResponse(cart, [selectedItem], includeAvailability);
    }

    // Map snapshot cart ra contract public rồi chỉ gọi Product Service khi caller cần hiển thị availability hiện tại.
    private async toResponse(
        cart: Cart,
        selectedItems?: CartItem[],
        includeAvailability = true,
    ): Promise<CartResponse> {
        const items =
            selectedItems ??
            (await this.cartItemRepository.findByCartId(cart.id));
        const response = this.cartResponseMapper.toResponse(cart, items);
        return includeAvailability ? this.enrichCatalog(response) : response;
    }

    // Lấy snapshot mỗi product một lần để cập nhật giá và tồn kho; giữ item với giá đã lưu khi catalog không truy cập được.
    // Product/variant bị ngừng bán thành UNAVAILABLE; số lượng tồn so với quantity trong cart quyết định trạng thái có thể checkout.
    // Các request độc lập chạy song song để độ trễ bị giới hạn bởi request chậm nhất thay vì cộng dồn theo số sản phẩm.
    private async enrichCatalog(response: CartResponse): Promise<CartResponse> {
        const productIds = new Set(
            response.items.map((item) => item.productId),
        );
        const productSnapshots = new Map<
            string,
            ProductCatalogProduct | null | undefined
        >();

        await Promise.all(
            [...productIds].map(async (productId) => {
                try {
                    productSnapshots.set(
                        productId,
                        await this.productCatalogClient.getProduct(productId),
                    );
                } catch (error) {
                    // 404 xác nhận mặt hàng không còn tồn tại; lỗi mạng/auth không được suy diễn thành hết hàng.
                    productSnapshots.set(
                        productId,
                        error instanceof CartCatalogNotFoundError
                            ? null
                            : undefined,
                    );
                }
            }),
        );

        const items = response.items.map((item) => {
            const product = productSnapshots.get(item.productId);
            if (product === null) {
                return {
                    ...item,
                    availabilityStatus: 'UNAVAILABLE' as const,
                    availableQuantity: 0,
                };
            }
            if (!product) {
                return {
                    ...item,
                    availabilityStatus: 'UNKNOWN' as const,
                    availableQuantity: null,
                };
            }

            // Product hoặc variant không còn ACTIVE vẫn được giữ lại trong cart nhưng không thể chọn thanh toán.
            const variant = product.variants.find(
                (candidate) => candidate.id === item.variantId,
            );
            if (product.status !== 'ACTIVE' || variant?.status !== 'ACTIVE') {
                return {
                    ...item,
                    availabilityStatus: 'UNAVAILABLE' as const,
                    availableQuantity: 0,
                };
            }

            // Giá thuộc đúng variant được chuẩn hóa trước khi tính tiền; không ghi ngược vào snapshot đã lưu.
            // Catalog sai định dạng không được biến giá thành 0 hoặc làm hỏng cả giỏ.
            if (!/^\d+(\.\d{1,2})?$/.test(String(variant.price))) {
                return {
                    ...item,
                    availabilityStatus: 'UNKNOWN' as const,
                    availableQuantity: null,
                };
            }
            const unitPrice = fromCents(toCents(String(variant.price)));
            const originalPrice =
                variant.originalPrice != null &&
                /^\d+(\.\d{1,2})?$/.test(String(variant.originalPrice))
                    ? fromCents(toCents(String(variant.originalPrice)))
                    : null;

            // Dùng đúng inventory.quantityAvailable như Add Item; thiếu inventory được xem là không có tồn khả dụng.
            const reportedQuantity = variant.inventory?.quantityAvailable ?? 0;
            const availableQuantity = Number.isFinite(reportedQuantity)
                ? Math.max(0, Math.floor(reportedQuantity))
                : 0;
            const availabilityStatus =
                availableQuantity === 0
                    ? ('OUT_OF_STOCK' as const)
                    : availableQuantity < item.quantity
                      ? ('INSUFFICIENT_STOCK' as const)
                      : ('AVAILABLE' as const);

            return {
                ...item,
                unitPrice,
                originalPrice,
                lineTotal: fromCents(
                    toCents(unitPrice) * BigInt(item.quantity),
                ),
                availabilityStatus,
                availableQuantity,
            };
        });
        // Tính lại tổng từ các dòng đã cập nhật; không cộng giá mới với subtotal snapshot cũ.
        return {
            ...response,
            items,
            subtotal: fromCents(
                items.reduce(
                    (total, item) => total + toCents(item.lineTotal),
                    0n,
                ),
            ),
        };
    }

    // PostgreSQL báo mã 23505 khi unique active-cart constraint bị tranh chấp.
    private isUniqueViolation(error: unknown): boolean {
        if (!(error instanceof QueryFailedError)) return false;
        const driverError = error.driverError as { code?: string };
        return driverError.code === '23505';
    }
}
