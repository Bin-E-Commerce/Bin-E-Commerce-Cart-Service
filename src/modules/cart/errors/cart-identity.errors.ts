// Các lỗi này biểu diễn identity header không hợp lệ ở ranh giới Cart Service.
// File không xử lý HTTP trực tiếp; controller chuyển lỗi domain boundary thành status 400.

import { BadRequestException } from "@nestjs/common";

// Lỗi khi request không có user id Customer cũng không có guest session hợp lệ.
export class InvalidCartIdentityError extends BadRequestException {
  constructor() {
    super("A valid x-user-id or x-session-id is required");
  }
}
