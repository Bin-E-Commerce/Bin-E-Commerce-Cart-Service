// Kiểu selection checkout do Order Service gửi sang để Cart chỉ trừ đúng phần số lượng đã mua.
// Không mang dữ liệu giá hay owner; Cart tự resolve active cart theo identity của service caller.

// Mỗi selection ghép ID dòng hàng với số lượng đã được snapshot lúc tạo order.
export interface CartCheckoutItemSelection {
    itemId: string;
    quantity: number;
}
