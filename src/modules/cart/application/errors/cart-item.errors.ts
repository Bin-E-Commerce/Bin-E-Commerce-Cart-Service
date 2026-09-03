// Các lỗi nghiệp vụ của Add Item được tách khỏi controller để HTTP boundary không chứa business decision.

import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

// Báo product hoặc variant không còn đủ điều kiện để đưa vào cart.
export class CartProductNotPurchasableError extends ConflictException {
  constructor(message = "Sản phẩm hiện không thể thêm vào giỏ hàng.") {
    super(message);
  }
}

// Báo số lượng sau khi cộng vượt tồn kho hiện tại của variant.
export class CartStockExceededError extends ConflictException {
  constructor() {
    super("Số lượng sản phẩm vượt quá tồn kho hiện tại.");
  }
}

// Báo Product Service không tìm thấy product hoặc variant được yêu cầu.
export class CartCatalogNotFoundError extends NotFoundException {
  constructor(message = "Không tìm thấy sản phẩm hoặc phân loại.") {
    super(message);
  }
}

// Báo Cart Service không thể xác nhận dữ liệu nguồn vì Product Service tạm thời không sẵn sàng.
export class CartCatalogUnavailableError extends ServiceUnavailableException {
  constructor() {
    super("Product Service hiện không khả dụng. Vui lòng thử lại sau.");
  }
}
