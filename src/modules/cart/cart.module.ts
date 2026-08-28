// Module này sở hữu toàn bộ dependency của Cart use case Phase 1.
// Module không import Product, Seller hay Auth Service để giữ bounded context độc lập.

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cart } from "../../database/entities/cart.entity";
import { CartController } from "./cart.controller";
import { CartRepository } from "./repositories/cart.repository";
import { CartIdentityResolver } from "./services/cart-identity-resolver.service";
import { CartQueryService } from "./services/cart-query.service";

// Đăng ký entity, controller và application services của Cart bounded context.
@Module({
  imports: [TypeOrmModule.forFeature([Cart])],
  controllers: [CartController],
  providers: [CartRepository, CartIdentityResolver, CartQueryService],
})
export class CartModule {}
