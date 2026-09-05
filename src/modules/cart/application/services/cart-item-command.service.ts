// File này chứa command use case của Cart, gồm add/update/remove và đóng cart sau checkout.
// Product Service vẫn là nguồn sự thật cho product snapshot và tồn kho; Cart không sở hữu inventory.

// Application service này thực hiện use case Add Item cho user đã đăng nhập.
// Product Service là nguồn sự thật; Cart Service chỉ lưu snapshot sau khi xác nhận product, variant và tồn kho.

import { Injectable, NotFoundException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Cart } from "../../../../database/entities/cart.entity";
import { CartItem } from "../../../../database/entities/cart-item.entity";
import { ProductCatalogClient } from "../clients/product-catalog.client";
import {
  CartProductNotPurchasableError,
  CartStockExceededError,
} from "../errors/cart-item.errors";
import { CartIdentity, CartOwnerType } from "../types/cart-identity.type";
import { CartResponse } from "../types/cart-response.type";
import { AddCartItemDto } from "../../presentation/dto/add-cart-item.dto";
import { UpdateCartItemDto } from "../../presentation/dto/update-cart-item.dto";
import { CartItemRepository } from "../../infrastructure/repositories/cart-item.repository";
import { CartQueryService } from "./cart-query.service";
import { CartStatus } from "../../../../database/enums/cart-status.enum";

// Thêm item theo transaction và khóa cart để hai request đồng thời không làm mất phép cộng quantity.
@Injectable()
export class CartItemCommandService {
  // Inject các boundary cần thiết nhưng giữ business decision trong application service này.
  constructor(
    private readonly cartQueryService: CartQueryService,
    private readonly productCatalogClient: ProductCatalogClient,
    private readonly cartItemRepository: CartItemRepository,
    private readonly dataSource: DataSource,
  ) {}

  // Đóng active cart sau khi Order Service đã commit order; transaction khóa aggregate để tránh double checkout.
  async checkoutCart(identity: CartIdentity): Promise<void> {
    const cart = await this.cartQueryService.findActiveCartEntity(identity);
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng active.");

    await this.dataSource.transaction(async (manager) => {
      const lockedCart = await manager.findOne(Cart, {
        where: {
          id: cart.id,
          ownerType: identity.ownerType,
          ownerId: identity.ownerId,
          status: CartStatus.ACTIVE,
        },
        lock: { mode: "pessimistic_write" },
      });
      if (!lockedCart) throw new NotFoundException("Giỏ hàng không còn active.");

      // Đổi trạng thái thay vì xóa item để giữ dữ liệu phục vụ audit/debug; query active sẽ không đọc lại cart này.
      lockedCart.status = CartStatus.CHECKED_OUT;
      lockedCart.updatedAt = new Date();
      await manager.save(Cart, lockedCart);
    });
  }

  // Validate dữ liệu nguồn trước, sau đó lock cart và cộng quantity hiện tại trong một transaction.
  async addItem(
    identity: CartIdentity,
    dto: AddCartItemDto,
  ): Promise<CartResponse> {
    const product = await this.productCatalogClient.getProduct(dto.productId);
    const variant = product.variants.find(
      (candidate) => candidate.id === dto.variantId,
    );

    if (!variant) {
      throw new NotFoundException("Không tìm thấy phân loại sản phẩm.");
    }
    // Sản phẩm crawl vẫn được lưu như một lựa chọn tham khảo; chỉ sản phẩm không active mới bị chặn khỏi cart.
    // Tồn kho của dữ liệu crawl không phải tồn kho fulfillment của Bin nên không được dùng để khóa thao tác lưu.
    if (product.status !== "ACTIVE") {
      throw new CartProductNotPurchasableError();
    }
    if (identity.ownerType === CartOwnerType.CUSTOMER && product.sellerOwnerId === identity.ownerId) {
      throw new CartProductNotPurchasableError("Bạn không thể mua sản phẩm của shop mình.");
    }
    if (variant.status !== "ACTIVE") {
      throw new CartProductNotPurchasableError(
        "Phân loại sản phẩm hiện không thể thêm vào giỏ hàng.",
      );
    }

    const isInternalProduct = product.originType !== "EXTERNAL";
    const availableStock = Math.max(0, variant.inventory?.quantityAvailable ?? 0);
    if (isInternalProduct && availableStock < dto.quantity) {
      throw new CartStockExceededError();
    }

    const cart = await this.cartQueryService.getOrCreateActiveCartEntity(identity);

    await this.dataSource.transaction(async (manager) => {
      const lockedCart = await manager.findOne(Cart, {
        where: { id: cart.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!lockedCart) throw new NotFoundException("Không tìm thấy giỏ hàng.");

      const itemRepository = manager.getRepository(CartItem);
      const existingItem = await itemRepository.findOne({
        where: { cartId: lockedCart.id, variantId: dto.variantId },
      });
      const nextQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

      // Chỉ giới hạn stock với hàng nội bộ; hàng crawl không được coi là nguồn tồn kho để đặt hàng.
      if (isInternalProduct && nextQuantity > availableStock) {
        throw new CartStockExceededError();
      }

      // Chạm updated_at của aggregate để cache và client biết cart vừa thay đổi dù cart row không có item count.
      lockedCart.updatedAt = new Date();
      await manager.save(Cart, lockedCart);

      if (existingItem) {
        existingItem.quantity = nextQuantity;
        await itemRepository.save(existingItem);
        return;
      }

      const imageUrl =
        variant.imageUrl ??
        product.images?.find((image) => image.isThumbnail)?.imageUrl ??
        product.images?.[0]?.imageUrl ??
        null;
      const item = itemRepository.create({
        cartId: lockedCart.id,
        productId: product.id,
        variantId: variant.id,
        sellerShopId: product.sellerShopId ?? null,
        originType: product.originType ?? "INTERNAL",
        sku: variant.sku,
        productName: product.name,
        variantName: variant.name,
        imageUrl,
        unitPrice: variant.price,
        originalPrice: variant.originalPrice ?? null,
        quantity: dto.quantity,
      });
      await itemRepository.save(item);
    });

    return this.cartQueryService.getActiveCartById(cart.id);
  }

  // Cập nhật quantity tuyệt đối của item thuộc owner hiện tại rồi trả lại toàn bộ cart sau mutation.
  // Khi quantity tăng, Product Service được gọi để xác nhận product/variant còn bán và tồn kho đủ.
  // Khi quantity giảm, không chặn thao tác bởi trạng thái mới của product để user vẫn dọn được item cũ trong cart.
  async updateItem(
    identity: CartIdentity,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    const cart = await this.cartQueryService.findActiveCartEntity(identity);
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng active.");

    const currentItem = await this.cartItemRepository.findByCartAndId(
      cart.id,
      itemId,
    );
    if (!currentItem) {
      throw new NotFoundException("Không tìm thấy sản phẩm trong giỏ hàng.");
    }

    // Chỉ gọi Product Service khi tăng quantity; giảm quantity luôn được phép để xử lý item đã lỗi thời.
    if (dto.quantity > currentItem.quantity) {
      const product = await this.productCatalogClient.getProduct(
        currentItem.productId,
      );
      const variant = product.variants.find(
        (candidate) => candidate.id === currentItem.variantId,
      );

      if (!variant) {
        throw new NotFoundException("Không tìm thấy phân loại sản phẩm.");
      }
      // Item crawl đã lưu vẫn có thể được tăng/giảm như một danh sách tham khảo khi variant còn active.
      if (product.status !== "ACTIVE") {
        throw new CartProductNotPurchasableError();
      }
      if (variant.status !== "ACTIVE") {
        throw new CartProductNotPurchasableError(
          "Phân loại sản phẩm hiện không thể thêm vào giỏ hàng.",
        );
      }

      const isInternalProduct = product.originType !== "EXTERNAL";
      const availableStock = Math.max(0, variant.inventory?.quantityAvailable ?? 0);
      if (isInternalProduct && availableStock < dto.quantity) {
        throw new CartStockExceededError();
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const lockedCart = await manager.findOne(Cart, {
        where: { id: cart.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!lockedCart) throw new NotFoundException("Không tìm thấy giỏ hàng.");

      const itemRepository = manager.getRepository(CartItem);
      const lockedItem = await itemRepository.findOne({
        where: { id: itemId, cartId: lockedCart.id },
      });
      if (!lockedItem) {
        throw new NotFoundException("Không tìm thấy sản phẩm trong giỏ hàng.");
      }

      // Lock cart trước khi save để response sau đó luôn phản ánh một mutation trọn vẹn.
      lockedItem.quantity = dto.quantity;
      lockedCart.updatedAt = new Date();
      await manager.save(Cart, lockedCart);
      await itemRepository.save(lockedItem);
    });

    return this.cartQueryService.getActiveCartById(cart.id);
  }

  // Xóa item thuộc đúng active cart của owner hiện tại và trả cart mới nhất cho frontend cập nhật cache.
  async removeItem(identity: CartIdentity, itemId: string): Promise<CartResponse> {
    const cart = await this.cartQueryService.findActiveCartEntity(identity);
    if (!cart) throw new NotFoundException("Không tìm thấy giỏ hàng active.");

    await this.dataSource.transaction(async (manager) => {
      const lockedCart = await manager.findOne(Cart, {
        where: { id: cart.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!lockedCart) throw new NotFoundException("Không tìm thấy giỏ hàng.");

      const itemRepository = manager.getRepository(CartItem);
      const item = await itemRepository.findOne({
        where: { id: itemId, cartId: lockedCart.id },
      });
      if (!item) {
        throw new NotFoundException("Không tìm thấy sản phẩm trong giỏ hàng.");
      }

      lockedCart.updatedAt = new Date();
      await manager.save(Cart, lockedCart);
      await itemRepository.remove(item);
    });

    return this.cartQueryService.getActiveCartById(cart.id);
  }
}
