// Client này đọc dữ liệu mua hàng từ Product Service qua HTTP nội bộ.
// Client không ghi product database và không đi qua API Gateway để tránh tạo vòng proxy.

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CartCatalogNotFoundError,
  CartCatalogUnavailableError,
} from "../errors/cart-item.errors";
import type { ProductCatalogProduct } from "../types/product-catalog-product.type";

// Lấy product detail làm nguồn sự thật cho trạng thái, variant, giá và tồn kho trước khi ghi cart.
@Injectable()
export class ProductCatalogClient {
  private readonly targetBase: string;

  // Đọc URL Product Service từ config để local, Docker và production dùng cùng một client contract.
  constructor(private readonly config: ConfigService) {
    this.targetBase = config.get<string>(
      "PRODUCT_SERVICE_URL",
      "http://localhost:3008",
    );
  }

  // Gọi endpoint nội bộ hiện có và chuẩn hóa lỗi upstream thành lỗi nghiệp vụ của Cart Service.
  async getProduct(productId: string): Promise<ProductCatalogProduct> {
    const targetUrl = `${this.targetBase}/api/v1/products/${productId}`;

    try {
      const response = await fetch(targetUrl, {
        signal: AbortSignal.timeout(5000),
        headers: { accept: "application/json" },
      });

      if (response.status === 404) {
        throw new CartCatalogNotFoundError("Không tìm thấy sản phẩm.");
      }
      if (!response.ok) throw new CartCatalogUnavailableError();

      return (await response.json()) as ProductCatalogProduct;
    } catch (error) {
      if (
        error instanceof CartCatalogNotFoundError ||
        error instanceof CartCatalogUnavailableError
      ) {
        throw error;
      }

      throw new CartCatalogUnavailableError();
    }
  }
}
