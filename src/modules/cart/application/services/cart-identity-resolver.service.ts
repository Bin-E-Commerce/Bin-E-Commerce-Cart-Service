// Service này chuẩn hóa owner identity từ header do API Gateway forward xuống.
// Service không xác thực JWT và không tự suy đoán user; JWT đã được Gateway kiểm tra.

import { Injectable } from "@nestjs/common";
import type { Request } from "express";
import { InvalidCartIdentityError } from "../errors/cart-identity.errors";
import { CartIdentity, CartOwnerType } from "../types/cart-identity.type";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Đọc giá trị header đơn hoặc phần tử đầu tiên khi adapter HTTP trả về mảng.
function readHeader(value: string | string[] | undefined): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;
  const trimmed = normalized?.trim();
  return trimmed || undefined;
}

// Kiểm tra session id theo UUID v4 để guest không thể dùng chuỗi tùy ý làm owner key.
function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

// Resolve Customer trước Guest để user đăng nhập luôn tiếp tục dùng đúng cart của mình.
@Injectable()
export class CartIdentityResolver {
  // Chuyển request HTTP thành identity nội bộ với thứ tự ưu tiên Customer rồi Guest.
  resolve(request: Request): CartIdentity {
    const userId = readHeader(request.headers["x-user-id"]);
    if (userId) {
      return { ownerType: CartOwnerType.CUSTOMER, ownerId: userId };
    }

    const sessionId = readHeader(request.headers["x-session-id"]);
    if (sessionId && isUuidV4(sessionId)) {
      return { ownerType: CartOwnerType.GUEST, ownerId: sessionId };
    }

    throw new InvalidCartIdentityError();
  }
}
