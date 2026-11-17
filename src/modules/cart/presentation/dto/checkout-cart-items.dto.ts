// Contract nội bộ cho Order Service dọn các dòng đã checkout theo orderId idempotent.
// Payload mới mang quantity đã mua; itemIds chỉ giữ compatibility cho cleanup từ order legacy.

import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayNotEmpty,
    ArrayUnique,
    IsInt,
    IsArray,
    IsDateString,
    IsOptional,
    IsUUID,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

// Xác thực quantity snapshot trước khi repository khóa cart và điều chỉnh dòng hàng.
export class CheckoutCartItemSelectionDto {
    @IsUUID('4')
    itemId!: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(2_147_483_647)
    quantity!: number;
}

// Bắt buộc orderId để Cart ghi nhận cleanup đúng một lần trong transaction.
export class CheckoutCartItemsDto {
    @IsUUID('4')
    orderId!: string;

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(1_000)
    @ArrayUnique()
    @IsUUID('4', { each: true })
    itemIds?: string[];

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @ArrayMaxSize(1_000)
    @ArrayUnique((selection: CheckoutCartItemSelectionDto) => selection.itemId)
    @ValidateNested({ each: true })
    @Type(() => CheckoutCartItemSelectionDto)
    items?: CheckoutCartItemSelectionDto[];

    @IsOptional()
    @IsDateString()
    checkoutAllBefore?: string;
}
