// Entity này lưu đúng một active cart cho mỗi Customer hoặc Guest identity.
// Entity không chứa cart items ở Phase 1; item và snapshot giá sẽ được thêm ở phase Add Item.

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CartStatus } from "../enums/cart-status.enum";

// Bảng cart là aggregate root tối thiểu, tách owner identity khỏi user database của Auth Service.
@Entity({ name: "carts" })
@Index("uq_carts_active_owner", ["ownerType", "ownerId"], {
  unique: true,
  where: `"status" = 'ACTIVE'`,
})
export class Cart {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "owner_type", type: "varchar", length: 20 })
  ownerType!: string;

  @Column({ name: "owner_id", type: "varchar", length: 255 })
  ownerId!: string;

  @Column({ type: "varchar", length: 20, default: CartStatus.ACTIVE })
  status!: CartStatus;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
