"""Models for the Internal module (all scoped per warehouse). Mirrors routers/internal.py."""

from typing import Optional

from pydantic import BaseModel, Field

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
MAX_BRUTO = 50.0


# ---------- Harga ----------
class HargaJualIn(BaseModel):
    grade: str = Field(min_length=1, max_length=60)
    harga: float = Field(ge=0)


class HargaJual(HargaJualIn):
    id: str
    warehouse_id: str
    created_at: str


class PotonganIn(BaseModel):
    harga: float = Field(ge=0)


class Potongan(BaseModel):
    id: str
    warehouse_id: str
    harga: float
    created_at: str


# ---------- Bandul ----------
class BandulIn(BaseModel):
    nama: str = Field(min_length=1, max_length=120)
    alamat: str = ""
    ktp_path: Optional[str] = None


class Bandul(BandulIn):
    id: str
    warehouse_id: str
    created_at: str


# ---------- Pembelian ----------
class PembelianItem(BaseModel):
    nomor_seri: str = ""
    harga: float = 0
    keterangan: str = ""


class PembelianIn(BaseModel):
    tanggal_beli: str = Field(pattern=DATE_PATTERN)
    nomor_kupon: str = ""
    bandul_id: Optional[str] = None
    potongan_kuli_id: Optional[str] = None
    potongan_out_id: Optional[str] = None
    jumlah_out: int = Field(default=0, ge=0)
    items: list[PembelianItem] = []


class Pembelian(BaseModel):
    id: str
    warehouse_id: str
    tanggal_beli: str
    nomor_kupon: str = ""
    bandul_id: Optional[str] = None
    bandul_nama: str = ""
    potongan_kuli_id: Optional[str] = None
    potongan_kuli_harga: float = 0
    potongan_out_id: Optional[str] = None
    potongan_out_harga: float = 0
    jumlah_out: int = 0
    items: list[PembelianItem] = []
    jumlah_seri: int = 0
    total_potongan_kuli: float = 0
    total_out: float = 0
    created_by_name: str = ""
    created_at: str = ""
    edited_by_name: Optional[str] = None
    edited_at: Optional[str] = None


# ---------- Berat Koli ----------
class BeratKoliIn(BaseModel):
    nomor_seri: str = Field(min_length=1)
    bruto: float = Field(gt=0, le=MAX_BRUTO)


class BeratKoli(BaseModel):
    id: str
    warehouse_id: str
    nomor_seri: str
    bruto: float
    netto: float
    created_at: str
    edited_at: Optional[str] = None
    bandul_nama: str = ""
    keterangan: str = ""


# ---------- Kasir ----------
class KasirItem(BaseModel):
    nomor_seri: str
    harga: float
    bruto: float = 0
    netto: float
    subtotal: float
    keterangan: str = ""


class KasirNota(BaseModel):
    nomor_kupon: str
    label: str
    warehouse_nama: str = ""
    tanggal_beli: str
    bandul_nama: str = ""
    items: list[KasirItem] = []
    total_harga: float = 0
    pajak: float = 0
    total_potongan_kuli: float = 0
    total_out: float = 0
    jumlah_out: int = 0
    jumlah_kuli: int = 0
    total_pembayaran: float = 0
    can_print: bool = True
    printed_at: Optional[str] = None
    printed_by: Optional[str] = None


class PrintIn(BaseModel):
    nomor_kupon: str


class PajakIn(BaseModel):
    pajak_rate: float = Field(ge=0, le=1)


# ---------- Detail Koli ----------
class DetailKoliRow(BaseModel):
    tanggal_beli: str
    nomor_kupon: str = ""
    bandul_nama: str = ""
    nomor_seri: str = ""
    harga: float = 0
    bruto: Optional[float] = None
    netto: Optional[float] = None
    keterangan: str = ""


# ---------- Dashboard ----------
class DaySummary(BaseModel):
    tanggal: str
    jumlah_transaksi: int
    jumlah_koli: int
    total_bruto: float
    total_netto: float
    total_pembelian: float
    total_pajak: float
    total_kuli: float
    total_out: float
    total_pembayaran: float


class KodeCount(BaseModel):
    kode: str
    jumlah: int


class DashboardTotals(BaseModel):
    jumlah_koli: int = 0
    total_bruto: float = 0
    total_netto: float = 0
    total_pembelian: float = 0
    total_pajak: float = 0
    total_kuli: float = 0
    total_out: float = 0
    total_pembayaran: float = 0


class DashboardOut(BaseModel):
    date_from: str
    date_to: str
    days: list[DaySummary]
    kode: list[KodeCount]
    totals: DashboardTotals


# ---------- Penjualan ----------
class PenjualanItemIn(BaseModel):
    nomor_seri: str
    nomor_jadi: str
    bruto: float = Field(gt=0, le=MAX_BRUTO)
    grade: str


class PenjualanIn(BaseModel):
    tanggal_jual: str = Field(pattern=DATE_PATTERN)
    gulungan: str = ""
    pembeli: str = ""
    items: list[PenjualanItemIn] = []


class PenjualanItem(BaseModel):
    nomor_seri: str
    nomor_jadi: str
    bruto: float
    netto: float
    grade: str
    keterangan: str = ""
    harga_jual: float = 0
    # snapshots from pembelian/berat for reporting
    tanggal_beli: str = ""
    bandul_nama: str = ""
    harga_beli: float = 0
    bruto_beli: Optional[float] = None
    netto_beli: Optional[float] = None


class Penjualan(BaseModel):
    id: str
    warehouse_id: str
    tanggal_jual: str
    gulungan: str = ""
    pembeli: str = ""
    items: list[PenjualanItem] = []
    jumlah_seri: int = 0
    total_harga_jual: float = 0
    created_by_name: str = ""
    created_at: str = ""


class LaporanPenjualanRow(BaseModel):
    tanggal_beli: str = ""
    tanggal_jual: str = ""
    nomor_seri: str = ""
    bandul_nama: str = ""
    nomor_jadi: str = ""
    grade: str = ""
    bruto_beli: Optional[float] = None
    netto_beli: Optional[float] = None
    bruto_jual: float = 0
    netto_jual: float = 0
    harga_beli: float = 0
    total_harga_beli: float = 0
    harga_jual: float = 0
    total_harga_jual: float = 0
    selisih: float = 0


# ---------- Busai ----------
class BusaiBongkarIn(BaseModel):
    nomor_seri: str = Field(min_length=1)


class BusaiBungkusIn(BaseModel):
    nomor_seri: str = Field(min_length=1)
    bruto: float = Field(gt=0, le=MAX_BRUTO)


class BusaiCCIn(BaseModel):
    nomor_seri: str = Field(min_length=1)
    bruto: float = Field(gt=0, le=MAX_BRUTO)


class BusaiUpdateIn(BaseModel):
    bruto: float = Field(gt=0, le=MAX_BRUTO)
    keterangan: str = ""


class Busai(BaseModel):
    id: str
    warehouse_id: str
    nomor_seri: str
    status: str  # bongkar | bungkus | cc
    is_cc: bool = False
    tanggal_beli: str = ""
    tanggal_busai: Optional[str] = None
    bandul_nama: str = ""
    harga_beli: float = 0
    bruto_beli: Optional[float] = None
    netto_beli: Optional[float] = None
    bruto_busai: Optional[float] = None
    netto_busai: Optional[float] = None
    keterangan: str = ""
    created_at: str = ""


# ---------- Out ----------
class OutRecord(BaseModel):
    id: str
    warehouse_id: str
    tanggal_out: str
    penjualan_id: str = ""
    gulungan: str = ""
    pembeli: str = ""
    tanggal_jual: str = ""
    tanggal_beli: str = ""
    nomor_seri: str = ""
    nomor_jadi: str = ""
    bandul_nama: str = ""
    grade: str = ""
    bruto_beli: Optional[float] = None
    netto_beli: Optional[float] = None
    bruto_jual: float = 0
    netto_jual: float = 0
    harga_beli: float = 0
    total_harga_beli: float = 0
    harga_jual: float = 0
    total_harga_jual: float = 0
    selisih: float = 0
    item: dict = {}
    created_by_name: str = ""
    created_at: str = ""


# ---------- Revisi ----------
class RevisiRecord(BaseModel):
    id: str
    warehouse_id: str
    tanggal_revisi: str
    penjualan_id: str = ""
    gulungan: str = ""
    tanggal_jual: str = ""
    nomor_seri: str = ""
    nomor_jadi: str = ""
    bandul_nama: str = ""
    netto: float = 0
    grade_lama: str = ""
    harga_lama: float = 0
    grade_baru: str = ""
    harga_baru: float = 0
    total_lama: float = 0
    total_baru: float = 0
    selisih: float = 0
    created_by_name: str = ""
    created_at: str = ""
