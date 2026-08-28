// Migration này tạo aggregate cart cho Phase 1 và unique guard chống hai active cart cùng owner.
// Migration không tạo item, tồn kho hay Kafka outbox vì các nghiệp vụ đó thuộc phase kế tiếp.

import { MigrationInterface, QueryRunner } from "typeorm";

// Tạo cấu trúc dữ liệu cart có thể chạy lặp qua cơ chế migration của TypeORM.
export class CreateCarts202608280001 implements MigrationInterface {
  name = "CreateCarts202608280001";

  // Tạo bảng và constraint cần thiết cho việc lấy hoặc tạo active cart.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "owner_type" varchar(20) NOT NULL,
        "owner_id" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "pk_carts_id" PRIMARY KEY ("id"),
        CONSTRAINT "ck_carts_status" CHECK ("status" IN ('ACTIVE', 'CHECKED_OUT', 'ABANDONED'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_carts_active_owner"
      ON "carts" ("owner_type", "owner_id")
      WHERE "status" = 'ACTIVE'
    `);
  }

  // Xóa bảng do migration này sở hữu khi rollback ở môi trường phát triển.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "carts"`);
  }
}
