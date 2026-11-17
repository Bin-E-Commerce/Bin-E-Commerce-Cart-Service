// Repository này đọc cart_items và dọn selection trong transaction thay mặt Cart Service.
// Mọi thao tác xóa đều khóa active cart theo owner trước, không nhận cartId từ client.

import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Cart } from '@/database/entities/cart.entity';
import { CartItem } from '@/database/entities/cart-item.entity';
import { CartStatus } from '@/database/enums/cart-status.enum';
import type { CartIdentity } from '@/modules/cart/application/types/cart-identity.type';
import type { CartCheckoutItemSelection } from '@/modules/cart/application/types/cart-checkout-selection.type';

// Cung cấp query item theo cart và variant, đồng thời giữ một nơi duy nhất cho ordering response.
@Injectable()
export class CartItemRepository {
    // Nhận TypeORM repository qua DI để lớp này chỉ làm persistence adapter.
    constructor(
        @InjectRepository(CartItem)
        private readonly repository: Repository<CartItem>,
        private readonly dataSource: DataSource,
    ) {}

    // Lấy item theo cart để response luôn ổn định theo thời điểm thêm gần nhất.
    findByCartId(cartId: string): Promise<CartItem[]> {
        return this.repository.find({
            where: { cartId },
            order: { createdAt: 'ASC' },
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

    // Ghi marker order và dọn cart trong cùng transaction để retry không trừ/xóa lặp sau timeout.
    // Với snapshot mới, quantity bằng số đã mua thì xóa; quantity lớn hơn thì chỉ trừ phần đã mua.
    // Quantity nhỏ hơn snapshot được giữ nguyên; cleanup legacy giữ dòng hàng tạo hoặc sửa sau order.
    async checkoutItems(
        identity: CartIdentity,
        orderId: string,
        items?: CartCheckoutItemSelection[],
        itemIds?: string[],
        checkoutAllBefore?: string,
    ): Promise<void> {
        return this.dataSource.transaction(async (manager) => {
            const inserted = (await manager.query(
                `INSERT INTO cart_checkout_cleanups (order_id, owner_id)
                 VALUES ($1, $2)
                 ON CONFLICT (order_id) DO NOTHING
                 RETURNING order_id`,
                [orderId, identity.ownerId],
            )) as Array<{ order_id: string }>;
            // Gọi lại cùng order sau timeout là no-op; một order ID không thể dọn cart của owner khác.
            if (inserted.length === 0) {
                const [existing] = (await manager.query(
                    'SELECT owner_id FROM cart_checkout_cleanups WHERE order_id = $1',
                    [orderId],
                )) as Array<{ owner_id: string }>;
                if (existing?.owner_id !== identity.ownerId) {
                    throw new ConflictException(
                        'Order đã được dùng để dọn giỏ của tài khoản khác.',
                    );
                }
                return;
            }

            const cartRepository = manager.getRepository(Cart);
            const cartQuery = cartRepository
                .createQueryBuilder('cart')
                .where('cart.ownerType = :ownerType', {
                    ownerType: identity.ownerType,
                })
                .andWhere('cart.ownerId = :ownerId', {
                    ownerId: identity.ownerId,
                })
                .andWhere('cart.status = :status', {
                    status: CartStatus.ACTIVE,
                })
                .setLock('pessimistic_write');
            if (checkoutAllBefore) {
                // Ràng buộc mốc ngay trong SQL để không mất độ chính xác microsecond của timestamptz.
                cartQuery.andWhere('cart.createdAt < :checkoutAllBefore', {
                    checkoutAllBefore,
                });
            }
            const cart = await cartQuery.getOne();
            // Không có active cart cũ thì vẫn giữ marker để retry không chạm cart tạo sau order.
            if (!cart) return;

            const itemRepository = manager.getRepository(CartItem);
            if (checkoutAllBefore) {
                // Chỉ xóa dòng có cả createdAt và updatedAt trước order; ID giới hạn selection legacy nếu có.
                const unchangedItemsQuery = itemRepository
                    .createQueryBuilder('cartItem')
                    .where('cartItem.cartId = :cartId', { cartId: cart.id })
                    .andWhere('cartItem.createdAt < :checkoutAllBefore', {
                        checkoutAllBefore,
                    })
                    .andWhere('cartItem.updatedAt < :checkoutAllBefore', {
                        checkoutAllBefore,
                    });
                if (itemIds) {
                    unchangedItemsQuery.andWhere(
                        'cartItem.id IN (:...itemIds)',
                        { itemIds },
                    );
                }
                const unchangedItems = await unchangedItemsQuery
                    .setLock('pessimistic_write')
                    .getMany();
                if (unchangedItems.length > 0) {
                    await itemRepository.remove(unchangedItems);
                    const remainingItems = await itemRepository.count({
                        where: { cartId: cart.id },
                    });
                    if (remainingItems === 0)
                        cart.status = CartStatus.CHECKED_OUT;
                    cart.updatedAt = new Date();
                    await cartRepository.save(cart);
                }
                return;
            }

            let changed = false;
            if (items) {
                // Cart lock tuần tự hóa cleanup với add/update/remove để quantity snapshot được áp dụng đúng một lần.
                const selectedItems = await itemRepository
                    .createQueryBuilder('cartItem')
                    .where('cartItem.cartId = :cartId', { cartId: cart.id })
                    .andWhere('cartItem.id IN (:...itemIds)', {
                        itemIds: items.map((item) => item.itemId),
                    })
                    .setLock('pessimistic_write')
                    .getMany();
                const selectedById = new Map(
                    items.map((selection) => [
                        selection.itemId,
                        selection.quantity,
                    ]),
                );
                for (const item of selectedItems) {
                    const purchasedQuantity = selectedById.get(item.id);
                    if (!purchasedQuantity) continue;
                    if (item.quantity < purchasedQuantity) continue;
                    if (item.quantity === purchasedQuantity) {
                        await itemRepository.remove(item);
                    } else {
                        item.quantity -= purchasedQuantity;
                        await itemRepository.save(item);
                    }
                    changed = true;
                }
            } else if (itemIds) {
                // Order legacy chỉ lưu ID nên vẫn xóa đúng các dòng cũ theo contract trước khi có quantity snapshot.
                const result = await itemRepository.delete({
                    cartId: cart.id,
                    id: In(itemIds),
                });
                changed = Boolean(result.affected);
            }

            if (changed) {
                const remainingItems = await manager
                    .getRepository(CartItem)
                    .count({ where: { cartId: cart.id } });
                if (remainingItems === 0) cart.status = CartStatus.CHECKED_OUT;
                cart.updatedAt = new Date();
                await manager.save(Cart, cart);
            }
        });
    }
}
