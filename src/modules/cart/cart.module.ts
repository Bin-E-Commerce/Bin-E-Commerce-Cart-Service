// File này tổ chức bounded context Cart theo controller, client, repository và service.
// Internal checkout contract chỉ phục vụ Order Service và vẫn bắt buộc shared token.

// Module này sở hữu toàn bộ dependency của Cart use case Phase 1.
// Module không import Product, Seller hay Auth Service để giữ bounded context độc lập.

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Cart } from "../../database/entities/cart.entity";
import { CartItem } from "../../database/entities/cart-item.entity";
import { CartController } from "./controllers/cart.controller";
import { ProductCatalogClient } from "./clients/product-catalog.client";
import { CartItemRepository } from "./repositories/cart-item.repository";
import { CartRepository } from "./repositories/cart.repository";
import { CartItemCommandService } from "./services/cart-item-command.service";
import { CartIdentityResolver } from "./services/cart-identity-resolver.service";
import { CartQueryService } from "./services/cart-query.service";
import { CartResponseMapper } from "./services/cart-response-mapper.service";
import { InternalCartController } from "./controllers/internal-cart.controller";
import { InternalServiceGuard } from "./guards/internal-service.guard";

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
