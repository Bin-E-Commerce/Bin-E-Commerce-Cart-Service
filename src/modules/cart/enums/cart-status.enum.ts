// Enum này giới hạn vòng đời cart mà Cart Service được phép lưu.
// Phase 1 chỉ sử dụng ACTIVE; các trạng thái còn lại dành cho checkout sau này.

// Trạng thái aggregate cart dùng chung cho entity, service và response contract.
export enum CartStatus {
  ACTIVE = "ACTIVE",
  CHECKED_OUT = "CHECKED_OUT",
  ABANDONED = "ABANDONED",
}
