// DTO này xác thực số lượng mới của một item trước khi Cart Service xử lý mutation.
// DTO không cho phép quantity bằng 0; xóa item là một nghiệp vụ riêng qua DELETE.

import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

// Request contract của PATCH /api/v1/cart/items/:itemId.
export class UpdateCartItemDto {
  // Giới hạn quantity giúp bảo vệ database và giữ cùng quy tắc với API Add Item.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;
}
