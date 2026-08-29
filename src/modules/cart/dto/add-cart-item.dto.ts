// DTO này xác thực input tối thiểu để thêm một SKU vào cart.
// DTO không nhận giá, tên, ảnh hoặc tồn kho vì các dữ liệu đó phải lấy từ Product Service.

import { Type } from "class-transformer";
import { IsInt, IsUUID, Max, Min } from "class-validator";

// Request contract của POST /api/v1/cart/items.
export class AddCartItemDto {
  // Product ID giúp Cart Service kiểm tra variant thuộc đúng product mà UI đang hiển thị.
  @IsUUID()
  productId!: string;

  // Variant ID là khóa định danh thực tế của dòng hàng trong cart.
  @IsUUID()
  variantId!: string;

  // Giới hạn quantity ở DTO để chặn input bất thường trước khi vào transaction.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}
