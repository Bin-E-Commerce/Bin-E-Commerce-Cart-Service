// Migration này tạo các dòng sản phẩm của cart và snapshot dữ liệu cần cho trang giỏ hàng.
// Product/variant không có foreign key cross-service; chỉ cart_id tham chiếu aggregate nội bộ.

import { MigrationInterface, QueryRunner } from "typeorm";

// Tạo cart_items cùng các constraint bảo vệ quantity, tiền và một SKU trong mỗi cart.
export class CreateCartItems1787987299000 implements MigrationInterface {
  name = "CreateCartItems1787987299000";

  // Tạo bảng item sau bảng carts và cascade khi cart bị xóa.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cart_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cart_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "seller_shop_id" uuid,
        "sku" varchar(160) NOT NULL,
        "product_name" varchar(500) NOT NULL,
        "variant_name" varchar(500) NOT NULL,
        "image_url" text,
        "unit_price" numeric(14,2) NOT NULL,
        "original_price" numeric(14,2),
        "quantity" integer NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_cart_items_id" PRIMARY KEY ("id"),
        CONSTRAINT "ck_cart_items_quantity_positive" CHECK ("quantity" >= 1),
        CONSTRAINT "ck_cart_items_unit_price_non_negative" CHECK ("unit_price" >= 0),
        CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_cart_items_cart_variant"
      ON "cart_items" ("cart_id", "variant_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cart_items_cart_id"
      ON "cart_items" ("cart_id")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'cart_items'::regclass
            AND contype = 'f'
        ) THEN
          ALTER TABLE "cart_items"
          ADD CONSTRAINT "fk_cart_items_cart"
          FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'cart_items'::regclass
            AND conname = 'ck_cart_items_quantity_positive'
        ) THEN
          ALTER TABLE "cart_items"
          ADD CONSTRAINT "ck_cart_items_quantity_positive"
          CHECK ("quantity" >= 1);
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'cart_items'::regclass
            AND conname = 'ck_cart_items_unit_price_non_negative'
        ) THEN
          ALTER TABLE "cart_items"
          ADD CONSTRAINT "ck_cart_items_unit_price_non_negative"
          CHECK ("unit_price" >= 0);
        END IF;
      END $$;
    `);
  }

  // Xóa index và bảng item khi rollback migration ở môi trường phát triển.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_cart_items_cart_id"`);
    await queryRunner.query(`DROP INDEX "uq_cart_items_cart_variant"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
  }
}
