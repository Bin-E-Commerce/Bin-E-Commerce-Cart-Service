import { MigrationInterface, QueryRunner } from "typeorm";

// Migration bo sung snapshot nguon goc de gio hang nhan dien san pham noi bo va san pham crawl.
export class AddCartItemOriginType1787987300000 implements MigrationInterface {
  name = "AddCartItemOriginType1787987300000";

  // Cot mac dinh INTERNAL giup cac cart item da ton tai van giu hanh vi mua hang hien tai.
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cart_items"
      ADD COLUMN IF NOT EXISTS "origin_type" varchar(16) NOT NULL DEFAULT 'INTERNAL'
    `);
  }

  // Rollback cot snapshot nguon goc trong moi truong phat trien.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cart_items"
      DROP COLUMN IF EXISTS "origin_type"
    `);
  }
}
