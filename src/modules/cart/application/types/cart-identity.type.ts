// Type này mô tả owner identity đã được Gateway hoặc client cung cấp qua header.
// Cart Service chỉ lưu opaque id, không gọi Auth Service để lookup trong Phase 1.

// Phân biệt cart của tài khoản đăng nhập và cart của trình duyệt chưa đăng nhập.
export enum CartOwnerType {
  CUSTOMER = "CUSTOMER",
  GUEST = "GUEST",
}

// Identity chuẩn hóa để repository không phải biết format HTTP header.
export interface CartIdentity {
  ownerType: CartOwnerType;
  ownerId: string;
}
