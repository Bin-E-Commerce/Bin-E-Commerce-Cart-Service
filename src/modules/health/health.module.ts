// Module này công bố endpoint health của Cart Service cho Gateway và container runtime.
// Module không chứa kiểm tra business data của giỏ hàng.

import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

// Đăng ký controller health độc lập để service luôn có endpoint kiểm tra sống.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
