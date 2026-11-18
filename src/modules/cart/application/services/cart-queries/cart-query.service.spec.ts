// Test này bảo vệ use case idempotent của Phase 1: đọc cart cũ hoặc tạo cart rỗng đúng một lần.
// Test dùng mock repository/data source để không phụ thuộc PostgreSQL khi chạy unit test.

import { DataSource } from 'typeorm';
import { Cart } from '@/database/entities/cart.entity';
import { CartItem } from '@/database/entities/cart-item.entity';
import { CartStatus } from '@/database/enums/cart-status.enum';
import { CartOwnerType } from '@/modules/cart/application/types/cart-identity.type';
import { CartRepository } from '@/modules/cart/infrastructure/repositories/cart.repository';
import { CartItemRepository } from '@/modules/cart/infrastructure/repositories/cart-item.repository';
import { CartResponseMapper } from '@/modules/cart/application/services/cart-response/cart-response-mapper.service';
import { CartQueryService } from '@/modules/cart/application/services/cart-queries/cart-query.service';
import { ProductCatalogClient } from '@/modules/cart/application/clients/product-catalog.client';

// Nhóm test cho application service Cart Query.
describe('CartQueryService', () => {
    const identity = { ownerType: CartOwnerType.GUEST, ownerId: 'guest-1' };

    // Tạo entity giả đầy đủ field mà mapper response cần dùng.
    function cart(): Cart {
        return {
            id: 'cart-1',
            ownerType: CartOwnerType.GUEST,
            ownerId: 'guest-1',
            status: CartStatus.ACTIVE,
            createdAt: new Date('2026-08-28T00:00:00.000Z'),
            updatedAt: new Date('2026-08-28T00:00:00.000Z'),
        };
    }

    // Fixture giỏ cũ có hai dòng cùng product để kiểm tra chọn đúng variant và chỉ gọi catalog một lần.
    function priceFixture() {
        const items = [
            {
                id: 'item-1',
                productId: 'product-1',
                variantId: 'variant-1',
                quantity: 3,
                unitPrice: '100.00',
                originalPrice: '150.00',
            },
            {
                id: 'item-2',
                productId: 'product-1',
                variantId: 'variant-2',
                quantity: 2,
                unitPrice: '50.00',
                originalPrice: null,
            },
        ] as CartItem[];
        const mockCatalog = { getProduct: jest.fn() };
        const target = new CartQueryService(
            {
                findActiveByIdentity: jest.fn().mockResolvedValue(cart()),
                findActiveById: jest.fn().mockResolvedValue(cart()),
            } as unknown as CartRepository,
            {
                findByCartId: jest.fn().mockResolvedValue(items),
            } as unknown as CartItemRepository,
            new CartResponseMapper(),
            mockCatalog as unknown as ProductCatalogClient,
            {} as DataSource,
        );
        return { target, mockCatalog, items };
    }

    // Giá tăng/giảm và số lẻ phải cập nhật cả đơn giá, thành tiền, subtotal; giá gốc bị xóa không được giữ lại.
    it.each([
        ['125.25', '375.75', '495.95'],
        ['75.10', '225.30', '345.50'],
    ])(
        'should refresh current price %s and totals without changing stored items',
        async (price, lineTotal, subtotal) => {
            // Arrange
            const { target, mockCatalog, items } = priceFixture();
            mockCatalog.getProduct.mockResolvedValue({
                status: 'ACTIVE',
                variants: [
                    {
                        id: 'variant-2',
                        status: 'ACTIVE',
                        price: '60.10',
                        originalPrice: '80',
                        inventory: { quantityAvailable: 5 },
                    },
                    {
                        id: 'variant-1',
                        status: 'ACTIVE',
                        price,
                        originalPrice: null,
                        inventory: { quantityAvailable: 0 },
                    },
                ],
            });

            // Act
            const result = await target.getOrCreateActiveCart(identity);

            // Assert: hàng hết vẫn giữ trong giỏ và nhận giá mới nhưng không còn được chọn mua.
            expect(result.items).toMatchObject([
                {
                    id: 'item-1',
                    unitPrice: price,
                    originalPrice: null,
                    lineTotal,
                    availabilityStatus: 'OUT_OF_STOCK',
                },
                {
                    id: 'item-2',
                    unitPrice: '60.10',
                    originalPrice: '80.00',
                    lineTotal: '120.20',
                    availabilityStatus: 'AVAILABLE',
                },
            ]);
            expect(result.subtotal).toBe(subtotal);
            expect(result.totalItems).toBe(5);
            expect(items[0]?.unitPrice).toBe('100.00');
            expect(mockCatalog.getProduct).toHaveBeenCalledTimes(1);
            expect(mockCatalog.getProduct).toHaveBeenCalledWith('product-1');
        },
    );

    // Catalog lỗi phải giữ giá đã lưu và đánh dấu chưa xác minh, không biến giỏ thành miễn phí hoặc xóa hàng.
    it('should retain saved prices with UNKNOWN status when catalog fails', async () => {
        // Arrange
        const { target, mockCatalog } = priceFixture();
        mockCatalog.getProduct.mockRejectedValue(new Error('timeout'));

        // Act
        const result = await target.getOrCreateActiveCart(identity);

        // Assert
        expect(result.subtotal).toBe('400.00');
        expect(result.items).toMatchObject([
            {
                unitPrice: '100.00',
                lineTotal: '300.00',
                availabilityStatus: 'UNKNOWN',
            },
            {
                unitPrice: '50.00',
                lineTotal: '100.00',
                availabilityStatus: 'UNKNOWN',
            },
        ]);
        expect(mockCatalog.getProduct).toHaveBeenCalledTimes(1);
    });

    // Checkout nội bộ tự xác minh giá ở Order Service nên không thêm request catalog trong Cart Service.
    it('should return selected snapshot without catalog calls for internal checkout', async () => {
        // Arrange
        const { target, mockCatalog } = priceFixture();

        // Act
        const result = await target.getActiveCartById(
            'cart-1',
            undefined,
            ['item-2'],
            false,
        );

        // Assert
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
            id: 'item-2',
            unitPrice: '50.00',
        });
        expect(result.subtotal).toBe('100.00');
        expect(mockCatalog.getProduct).not.toHaveBeenCalled();
    });

    // Khi cart tồn tại, use case không được mở transaction hay tạo record mới.
    it('returns the existing active cart', async () => {
        const existingCart = cart();
        const repository = {
            findActiveByIdentity: jest.fn().mockResolvedValue(existingCart),
        } as unknown as CartRepository;
        const itemRepository = {
            findByCartId: jest.fn().mockResolvedValue([]),
        } as unknown as CartItemRepository;
        const productCatalogClient = {
            getProduct: jest.fn(),
        } as unknown as ProductCatalogClient;
        const dataSource = { transaction: jest.fn() } as unknown as DataSource;
        const target = new CartQueryService(
            repository,
            itemRepository,
            new CartResponseMapper(),
            productCatalogClient,
            dataSource,
        );

        await expect(
            target.getOrCreateActiveCart(identity),
        ).resolves.toMatchObject({
            id: 'cart-1',
            totalItems: 0,
            items: [],
        });
        expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    // Khi chưa có cart, use case phải save active cart rỗng trong transaction.
    it('creates an active empty cart when none exists', async () => {
        const createdCart = cart();
        const repository = {
            findActiveByIdentity: jest.fn().mockResolvedValue(null),
        } as unknown as CartRepository;
        const itemRepository = {
            findByCartId: jest.fn().mockResolvedValue([]),
        } as unknown as CartItemRepository;
        const productCatalogClient = {
            getProduct: jest.fn(),
        } as unknown as ProductCatalogClient;
        const transactionalRepository = {
            create: jest.fn().mockReturnValue(createdCart),
            save: jest.fn().mockResolvedValue(createdCart),
        };
        const dataSource = {
            transaction: jest.fn(
                async (callback: (manager: unknown) => unknown) =>
                    callback({ getRepository: () => transactionalRepository }),
            ),
        } as unknown as DataSource;
        const target = new CartQueryService(
            repository,
            itemRepository,
            new CartResponseMapper(),
            productCatalogClient,
            dataSource,
        );

        await expect(
            target.getOrCreateActiveCart(identity),
        ).resolves.toMatchObject({
            id: 'cart-1',
            ownerType: CartOwnerType.GUEST,
            status: CartStatus.ACTIVE,
            totalItems: 0,
        });
        expect(transactionalRepository.create).toHaveBeenCalledWith({
            ownerType: CartOwnerType.GUEST,
            ownerId: 'guest-1',
            status: CartStatus.ACTIVE,
        });
    });
});
