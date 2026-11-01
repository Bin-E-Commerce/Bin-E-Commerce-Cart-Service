// Migration bỏ cột phân loại nguồn khỏi cart item và giữ nguyên toàn bộ dòng giỏ hàng.
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveExternalCartItems1788350000000 implements MigrationInterface {
    name = 'RemoveExternalCartItems1788350000000';

    // Chỉ bỏ cột nguồn; mọi cart item vẫn còn để người mua không mất giỏ hàng.
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cart_items"
            DROP COLUMN IF EXISTS "origin_type"
        `);
    }

    // Không thể phục hồi nguồn đã xóa từ cart item hiện có.
    // Gán nguồn mặc định sẽ làm sai lệch dữ liệu nên migration bị khóa ngược.
    public async down(_queryRunner: QueryRunner): Promise<void> {
        throw new Error(
            'Migration bỏ metadata nguồn cart item là không thể rollback an toàn.',
        );
    }
}
