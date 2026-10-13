// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type ItemKey = "glangse" | "tali" | "kertas";
export type Unit = "gulung" | "koli" | "kg" | "roll";
export type Role = "admin" | "staff";
export type TxType = "masuk" | "transfer" | "pribadi";
export type Permission =
  | "stok"
  | "masuk"
  | "transfer"
  | "pribadi"
  | "riwayat"
  | "gudang"
  | "supplier"
  | "harga"
  | "bandul"
  | "pembelian"
  | "berat_koli"
  | "kasir"
  | "detail_koli"
  | "dashboard"
  | "penjualan"
  | "laporan_penjualan"
  | "busai"
  | "detail_koli_cc"
  | "sisa_stock"
  | "out"
  | "revisi";

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  permissions: Permission[];
  warehouse_ids: string[];
  created_at: string;
}

export interface LoginIn {
  username: string;
  password: string;
}

export interface UserCreate {
  username: string;
  name: string;
  password: string;
  role: Role;
  permissions: Permission[];
  warehouse_ids: string[];
}

export interface UserUpdate {
  username?: string;
  name?: string;
  role?: Role;
  password?: string;
  permissions?: Permission[];
  warehouse_ids?: string[];
}

export interface Warehouse {
  id: string;
  name: string;
  location: string;
  parent_id: string | null;
  logo_url?: string;
  created_at: string;
}

export interface WarehouseIn {
  name: string;
  location: string;
  parent_id: string | null;
  logo_url?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  created_at: string;
}

export interface SupplierIn {
  name: string;
  phone: string;
  address: string;
}

export interface TxMasukIn {
  date: string;
  supplier_id: string;
  warehouse_id: string;
  item: ItemKey;
  qty: number;
  unit: Unit;
  note: string;
  driver_name: string;
  vehicle_number: string;
}

export interface TxKeluarIn {
  date: string;
  type: "transfer" | "pribadi";
  warehouse_id: string;
  target_warehouse_id: string | null;
  item: ItemKey;
  qty: number;
  unit: Unit;
  note: string;
  driver_name: string;
  vehicle_number: string;
}

export interface Transaction {
  id: string;
  date: string;
  type: TxType;
  item: ItemKey;
  qty: number;
  input_qty: number;
  input_unit: Unit;
  warehouse_id: string;
  warehouse_name: string;
  target_warehouse_id: string | null;
  target_warehouse_name: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  note: string;
  driver_name: string;
  vehicle_number: string;
  created_by_name: string;
  created_at: string;
  edited_by_name: string | null;
  edited_at: string | null;
}

export interface TxUpdateIn {
  date: string;
  warehouse_id: string;
  target_warehouse_id: string | null;
  supplier_id: string | null;
  item: ItemKey;
  qty: number;
  unit: Unit;
  note: string;
  driver_name: string;
  vehicle_number: string;
}

export interface StockRow {
  warehouse_id: string;
  warehouse_name: string;
  location: string;
  glangse_lembar: number;
  tali_kg: number;
  kertas_roll: number;
}

export interface StockSummary {
  rows: StockRow[];
  total_glangse_lembar: number;
  total_tali_kg: number;
  total_kertas_roll: number;
}

export interface TodayOut {
  today: string;
}

export interface ItemTotals {
  glangse: number; // lembar
  tali: number; // kg
  kertas: number; // roll
}

export interface ReportRow {
  warehouse_id: string;
  warehouse_name: string;
  parent_id: string | null;
  parent_name: string | null;
  level: number;
  masuk: ItemTotals;
  transfer_in: ItemTotals;
  transfer_out: ItemTotals;
  pribadi: ItemTotals;
  stok: ItemTotals;
}

export interface SupplierWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  totals: ItemTotals;
}

export interface SupplierReport {
  supplier_id: string | null;
  supplier_name: string;
  total: ItemTotals;
  per_warehouse: SupplierWarehouse[];
}

export interface ReportOut {
  date_from: string | null;
  date_to: string | null;
  rows: ReportRow[];
  groups: ReportRow[];
  total: ReportRow;
  suppliers: SupplierReport[];
}
