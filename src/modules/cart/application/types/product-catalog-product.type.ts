// Type này là boundary response tối thiểu Cart Service đọc từ Product Service.
// Không import entity của Product Service để giữ database ownership và tránh coupling persistence model.

export interface ProductCatalogImage {
  imageUrl: string;
  isThumbnail?: boolean;
  sortOrder?: number;
}

export interface ProductCatalogInventory {
  quantityAvailable?: number | null;
}

export interface ProductCatalogVariant {
  id: string;
  sku: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  price: string;
  originalPrice?: string | null;
  stockQuantity: number;
  imageUrl?: string | null;
  inventory?: ProductCatalogInventory | null;
}

export interface ProductCatalogProduct {
  id: string;
  originType?: "INTERNAL" | "EXTERNAL";
  status: "DRAFT" | "ACTIVE" | "INACTIVE" | "DELETED";
  sellerShopId?: string | null;
  sellerOwnerId?: string | null;
  name: string;
  images?: ProductCatalogImage[];
  variants: ProductCatalogVariant[];
}
