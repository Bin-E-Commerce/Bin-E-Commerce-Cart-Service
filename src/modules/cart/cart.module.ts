// File này tổ chức bounded context Cart theo controller, client, repository và service.
// Internal checkout contract chỉ phục vụ Order Service và vẫn bắt buộc shared token.

// Module này sở hữu toàn bộ dependency của Cart use case Phase 1.
// Module không import Product, Seller hay Auth Service để giữ bounded context độc lập.

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cart } from "../../database/entities/cart.entity";
import { CartItem } from "../../database/entities/cart-item.entity";
import { CartController } from "./presentation/controllers/cart.controller";
import { ProductCatalogClient } from "./application/clients/product-catalog.client";
import { CartItemRepository } from "./infrastructure/repositories/cart-item.repository";
import { CartRepository } from "./infrastructure/repositories/cart.repository";
import { CartItemCommandService } from "./application/services/cart-items/cart-item-command.service";
import { CartIdentityResolver } from "./application/services/cart-identity/cart-identity-resolver.service";
import { CartQueryService } from "./application/services/cart-queries/cart-query.service";
import { CartResponseMapper } from "./application/services/cart-response/cart-response-mapper.service";
import { InternalCartController } from "./presentation/controllers/internal-cart.controller";
import { InternalServiceGuard } from "./presentation/guards/internal-service.guard";

// Đăng ký entity, controller và application services của Cart bounded context.
@Module({
  imports: [TypeOrmModule.forFeature([Cart, CartItem])],
  controllers: [CartController, InternalCartController],
  providers: [
    CartRepository,
    CartItemRepository,
    CartIdentityResolver,
    CartResponseMapper,
    CartQueryService,
    CartItemCommandService,
    ProductCatalogClient,
    InternalServiceGuard,
  ],
})
export class CartModule {}
