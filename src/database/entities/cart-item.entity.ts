// Entity này lưu từng SKU trong cart cùng snapshot dữ liệu cần cho trải nghiệm xem giỏ hàng.
// Entity không sở hữu product hoặc inventory; các ID đó chỉ là tham chiếu logic đến Product Service.
// Giá và thông tin hiển thị là snapshot tại lúc thêm, còn checkout sau này phải xác thực lại nguồn chính thức.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Cart } from "./cart.entity";

// Bản ghi này đại diện cho một variant duy nhất trong một active cart.
@Entity({ name: "cart_items" })
@Index("uq_cart_items_cart_variant", ["cartId", "variantId"], {
  unique: true,
})
export class CartItem {
  // ID ổn định của dòng hàng, dùng để mở rộng thao tác update/remove ở phase sau.
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Cart sở hữu dòng hàng; xóa cart sẽ cascade xuống các item ở database.
  @Column({ name: "cart_id", type: "uuid" })
  cartId!: string;

  @ManyToOne(() => Cart, { onDelete: "CASCADE" })
  @JoinColumn({ name: "cart_id" })
  cart!: Cart;

  // Các ID này là opaque reference, không tạo foreign key cross-service.
  @Column({ name: "product_id", type: "uuid" })
  productId!: string;

  @Column({ name: "variant_id", type: "uuid" })
  variantId!: string;

  @Column({ name: "seller_shop_id", type: "uuid", nullable: true })
  sellerShopId!: string | null;

  // Snapshot giúp trang cart render ổn định ngay cả khi Product Service thay đổi dữ liệu hiển thị.
  @Column({ type: "varchar", length: 160 })
  sku!: string;

  @Column({ name: "product_name", type: "varchar", length: 500 })
  productName!: string;

  @Column({ name: "variant_name", type: "varchar", length: 500 })
  variantName!: string;

  @Column({ name: "image_url", type: "text", nullable: true })
  imageUrl!: string | null;

  @Column({ name: "unit_price", type: "numeric", precision: 14, scale: 2 })
  unitPrice!: string;

  @Column({
    name: "original_price",
    type: "numeric",
    precision: 14,
    scale: 2,
    nullable: true,
  })
  originalPrice!: string | null;

  @Column({ type: "int" })
  quantity!: number;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
