// Enum này định nghĩa vòng đời mà aggregate Cart được phép lưu trong database.
// Entity, repository và application service dùng chung contract này để bảo toàn trạng thái ACTIVE, CHECKED_OUT và ABANDONED.
export enum CartStatus {
  ACTIVE = "ACTIVE",
  CHECKED_OUT = "CHECKED_OUT",
  ABANDONED = "ABANDONED",
}
