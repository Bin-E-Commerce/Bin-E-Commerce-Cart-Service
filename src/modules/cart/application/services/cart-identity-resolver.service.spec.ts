// Test này bảo vệ quy tắc chọn Customer trước Guest và validation guest session của Cart Service.
// Test không cần database vì đây là logic boundary thuần request header.

import type { Request } from "express";
import { InvalidCartIdentityError } from "../errors/cart-identity.errors";
import { CartIdentityResolver } from "./cart-identity-resolver.service";
import { CartOwnerType } from "../types/cart-identity.type";

// Nhóm test cho identity resolver, nền tảng của ownership trong mọi phase cart.
describe("CartIdentityResolver", () => {
  const resolver = new CartIdentityResolver();

  // Tạo request giả tối thiểu để test không phụ thuộc Express runtime.
  function request(headers: Record<string, string>): Request {
    return { headers } as Request;
  }

  // Customer phải được ưu tiên kể cả khi request còn giữ session id của trình duyệt.
  it("resolves a logged-in customer before guest session", () => {
    expect(
      resolver.resolve(
        request({
          "x-user-id": "customer-123",
          "x-session-id": "550e8400-e29b-41d4-a716-446655440000",
        }),
      ),
    ).toEqual({ ownerType: CartOwnerType.CUSTOMER, ownerId: "customer-123" });
  });

  // Guest hợp lệ phải dùng UUID v4 ổn định để client có thể gọi lại đúng cart.
  it("resolves a valid guest session", () => {
    expect(
      resolver.resolve(
        request({ "x-session-id": "550e8400-e29b-41d4-a716-446655440000" }),
      ),
    ).toEqual({
      ownerType: CartOwnerType.GUEST,
      ownerId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  // Không có identity hoặc session sai format thì không được tạo cart mồ côi.
  it("rejects missing or invalid identity", () => {
    expect(() => resolver.resolve(request({}))).toThrow(InvalidCartIdentityError);
    expect(() =>
      resolver.resolve(request({ "x-session-id": "not-a-uuid" })),
    ).toThrow(InvalidCartIdentityError);
  });
});
