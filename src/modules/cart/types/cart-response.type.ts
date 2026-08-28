// Type này là response contract của GET /api/v1/cart trong Phase 1.
// Items để rỗng có chủ đích vì nghiệp vụ Add Item chưa được triển khai.

import { CartOwnerType } from "./cart-identity.type";
import { CartStatus } from "../enums/cart-status.enum";

// DTO đọc cart tối thiểu, không để lộ entity TypeORM ra controller.
export interface CartResponse {
  id: string;
  ownerType: CartOwnerType;
  ownerId: string;
  status: CartStatus;
  items: [];
  totalItems: 0;
  warnings: [];
  createdAt: string;
  updatedAt: string;
}
