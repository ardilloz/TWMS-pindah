from typing import Literal, Optional

from pydantic import BaseModel, Field

ItemKey = Literal["glangse", "tali", "kertas"]
Unit = Literal["gulung", "koli", "kg", "roll"]
Role = Literal["admin", "staff"]
TxType = Literal["masuk", "transfer", "pribadi"]
Permission = Literal[
    "stok", "masuk", "transfer", "pribadi", "riwayat", "gudang", "supplier",
    "harga", "bandul", "pembelian", "berat_koli", "kasir", "detail_koli",
    "dashboard", "penjualan", "laporan_penjualan", "busai", "detail_koli_cc", "sisa_stock",
    "out", "revisi", "asisten",
]
DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"


# ---------- Auth / users ----------
class UserPublic(BaseModel):
    id: str
    username: str
    name: str
    role: Role
    permissions: list[Permission] = []
    warehouse_ids: list[str] = []  # empty = akses semua gudang; admin selalu semua
    created_at: str


class LoginIn(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserCreate(BaseModel):
    """role=admin gets full access (permissions ignored); staff uses `permissions`."""
    username: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=6)
    role: Role = "staff"
    permissions: list[Permission] = []
    warehouse_ids: list[str] = []


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=40)
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    role: Optional[Role] = None
    password: Optional[str] = Field(default=None, min_length=6)  # admin reset
    permissions: Optional[list[Permission]] = None
    warehouse_ids: Optional[list[str]] = None


# ---------- Warehouses / suppliers ----------
class Warehouse(BaseModel):
    id: str
    name: str
    location: str = ""
    parent_id: Optional[str] = None  # None = gudang induk; set = ranting of that induk
    logo_url: str = ""
    created_at: str


class WarehouseIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    location: str = ""
    parent_id: Optional[str] = None
    logo_url: Optional[str] = None


class Supplier(BaseModel):
    id: str
    name: str
    phone: str = ""
    address: str = ""
    created_at: str


class SupplierIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = ""
    address: str = ""


# ---------- Transactions / stock ----------
class TxMasukIn(BaseModel):
    date: str = Field(pattern=DATE_PATTERN)
    supplier_id: str
    warehouse_id: str
    item: ItemKey
    qty: float = Field(gt=0)
    unit: Unit
    note: str = ""
    driver_name: str = ""
    vehicle_number: str = ""


class TxKeluarIn(BaseModel):
    date: str = Field(pattern=DATE_PATTERN)
    type: Literal["transfer", "pribadi"]
    warehouse_id: str
    target_warehouse_id: Optional[str] = None
    item: ItemKey
    qty: float = Field(gt=0)
    unit: Unit
    note: str = ""
    driver_name: str = ""
    vehicle_number: str = ""


class Transaction(BaseModel):
    id: str
    date: str
    type: TxType
    item: ItemKey
    qty: float  # base unit: glangse=lembar, tali=kg, kertas=roll
    input_qty: float
    input_unit: Unit
    warehouse_id: str
    warehouse_name: str
    target_warehouse_id: Optional[str] = None
    target_warehouse_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    note: str = ""
    driver_name: str = ""
    vehicle_number: str = ""
    receipt_seq: int = 0
    created_by_name: str
    created_at: str
    edited_by_name: Optional[str] = None
    edited_at: Optional[str] = None


class TxUpdateIn(BaseModel):
    """Admin-only revision of an existing transaction. Type is fixed."""
    date: str = Field(pattern=DATE_PATTERN)
    warehouse_id: str
    target_warehouse_id: Optional[str] = None
    supplier_id: Optional[str] = None
    item: ItemKey
    qty: float = Field(gt=0)
    unit: Unit
    note: str = ""
    driver_name: str = ""
    vehicle_number: str = ""


class StockRow(BaseModel):
    warehouse_id: str
    warehouse_name: str
    location: str = ""
    glangse_lembar: float
    tali_kg: float
    kertas_roll: float


class StockSummary(BaseModel):
    rows: list[StockRow]
    total_glangse_lembar: float
    total_tali_kg: float
    total_kertas_roll: float


class TodayOut(BaseModel):
    today: str


# ---------- Dashboard report ----------
class ItemTotals(BaseModel):
    glangse: float = 0  # lembar
    tali: float = 0  # kg
    kertas: float = 0  # roll


class ReportRow(BaseModel):
    warehouse_id: str
    warehouse_name: str
    parent_id: Optional[str] = None
    parent_name: Optional[str] = None
    level: int = 0  # 0 = induk, 1 = ranting
    masuk: ItemTotals
    transfer_in: ItemTotals
    transfer_out: ItemTotals
    pribadi: ItemTotals
    stok: ItemTotals


class SupplierWarehouse(BaseModel):
    warehouse_id: str
    warehouse_name: str
    totals: ItemTotals


class SupplierReport(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: str
    total: ItemTotals
    per_warehouse: list[SupplierWarehouse]


class ReportOut(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    rows: list[ReportRow]
    groups: list[ReportRow]  # induk + its ranting combined (only induk that have ranting)
    total: ReportRow
    suppliers: list[SupplierReport]
