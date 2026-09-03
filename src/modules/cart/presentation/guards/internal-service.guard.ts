// Guard này bảo vệ các endpoint Cart chỉ dành cho service nội bộ.
// Token được so sánh constant-time để giảm rủi ro lộ secret qua timing.
// User context vẫn phải đi kèm để Cart Service tự giới hạn thao tác theo owner.

import { timingSafeEqual } from "crypto";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

// Chỉ cho phép request có shared token cấu hình ở cả hai service.
@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  // Xác thực token nội bộ trước khi controller đọc hoặc thay đổi cart.
  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>("INTERNAL_SERVICE_TOKEN", "");
    if (!expected) throw new ServiceUnavailableException("Internal service token chưa được cấu hình.");

    const request = context.switchToHttp().getRequest<Request>();
    const received = request.headers["x-internal-service-token"];
    if (typeof received !== "string" || !this.tokensMatch(received, expected)) {
      throw new UnauthorizedException("Invalid internal service token");
    }
    return true;
  }

  // timingSafeEqual yêu cầu hai buffer cùng độ dài nên cần kiểm tra trước khi so sánh.
  private tokensMatch(received: string, expected: string): boolean {
    const receivedBuffer = Buffer.from(received);
    const expectedBuffer = Buffer.from(expected);
    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
  }
}
