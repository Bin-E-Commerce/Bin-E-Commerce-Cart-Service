// Type này là response contract của GET /api/v1/cart trong Phase 1.
// Items để rỗng có chủ đích vì nghiệp vụ Add Item chưa được triển khai.

import { CartOwnerType } from "./cart-identity.type";
import { CartStatus } from "../../../../database/enums/cart-status.enum";

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
  originType: "INTERNAL" | "EXTERNAL";
  sku: string;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  unitPrice: string;
  originalPrice: string | null;
  quantity: number;
  lineTotal: string;
}
