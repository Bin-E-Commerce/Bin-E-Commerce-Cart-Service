// Utility này tính tiền bằng cents/BigInt để tránh sai số floating-point khi cộng subtotal.
// Cart Service chỉ hỗ trợ giá scale 2 theo schema numeric(14,2), nên mọi phép tính đều chuẩn hóa về hai chữ số thập phân.

// Chuyển chuỗi tiền decimal thành cents mà không đi qua Number.
export function toCents(value: string): bigint {
  const normalized = value.trim();
  const [wholePart, fractionPart = ""] = normalized.split(".");
  const fraction = `${fractionPart}00`.slice(0, 2);
  return BigInt(wholePart || "0") * 100n + BigInt(fraction);
}

// Chuyển cents về response string có đúng hai chữ số thập phân.
export function fromCents(value: bigint): string {
  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}
