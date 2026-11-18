// Type này là response contract của Cart API, giữ snapshot mặt hàng riêng với tình trạng tồn kho hiện tại.
// Trạng thái availability chỉ giúp giao diện hiển thị; Order Service vẫn xác minh và giữ hàng khi checkout.

import { CartOwnerType } from '@/modules/cart/application/types/cart-identity.type';
import { CartStatus } from '@/database/enums/cart-status.enum';

// DTO đọc cart tối thiểu, không để lộ entity TypeORM ra controller.
export interface CartResponse {
    id: string;
    ownerType: CartOwnerType;
    ownerId: string;
    status: CartStatus;
    items: CartItemResponse[];
    totalItems: number;
    subtotal: string;
    warnings: string[];
    createdAt: string;
    updatedAt: string;
}

// Dòng hàng đã được map khỏi entity TypeORM để không leak persistence model ra API.
export interface CartItemResponse {
    id: string;
    productId: string;
    variantId: string;
    sellerShopId: string | null;
    sku: string;
    productName: string;
    variantName: string;
    imageUrl: string | null;
    unitPrice: string;
    originalPrice: string | null;
    quantity: number;
    lineTotal: string;
    availabilityStatus?: CartItemAvailabilityStatus;
    availableQuantity?: number | null;
}

// Trạng thái tồn kho phục vụ hiển thị; UNKNOWN không đồng nghĩa với còn hàng.
export type CartItemAvailabilityStatus =
    | 'AVAILABLE'
    | 'OUT_OF_STOCK'
    | 'INSUFFICIENT_STOCK'
    | 'UNAVAILABLE'
    | 'UNKNOWN';
