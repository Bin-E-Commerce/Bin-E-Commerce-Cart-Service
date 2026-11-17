// Migration thêm marker idempotency để retry cleanup sau timeout không xóa/trừ cart lặp.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCartCheckoutCleanups1794110000000 implements MigrationInterface {
    name = 'CreateCartCheckoutCleanups1794110000000';

    // Marker được commit cùng thay đổi cart để response timeout không làm mất trạng thái đã áp dụng.
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "cart_checkout_cleanups" (
                "order_id" uuid PRIMARY KEY,
                "owner_id" varchar(255) NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
    }

    // Chỉ cho rollback khi không còn marker đã xử lý để tránh cùng order bị áp dụng lần hai.
    async down(queryRunner: QueryRunner): Promise<void> {
        const [result] = (await queryRunner.query(`
            SELECT COUNT(*)::int AS count FROM "cart_checkout_cleanups"
        `)) as Array<{ count: number }>;
        if (Number(result?.count ?? 0) > 0) {
            throw new Error(
                'Không thể rollback khi đã có order cleanup được ghi nhận.',
            );
        }

        await queryRunner.query(
            'DROP TABLE IF EXISTS "cart_checkout_cleanups"',
        );
    }
}
