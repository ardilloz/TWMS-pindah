import type { Permission, User } from "./types";

export const PERM_META: { key: Permission; label: string; desc: string; path: string }[] = [
  { key: "stok", label: "Dashboard Stok", desc: "Lihat stok semua gudang", path: "/" },
  { key: "masuk", label: "Barang Masuk", desc: "Input barang dari supplier", path: "/barang-masuk" },
  { key: "transfer", label: "Transfer Gudang", desc: "Kirim stok ke gudang lain", path: "/barang-keluar" },
  { key: "pribadi", label: "Pemakaian Stok", desc: "Catat penggunaan pribadi", path: "/barang-keluar" },
  { key: "riwayat", label: "Riwayat Transaksi", desc: "Lihat riwayat & ekspor Excel (tanpa edit)", path: "/riwayat" },
  { key: "gudang", label: "Kelola Gudang", desc: "Tambah, ubah, hapus gudang", path: "/gudang" },
  { key: "supplier", label: "Kelola Supplier", desc: "Tambah, ubah, hapus supplier", path: "/supplier" },
  { key: "harga", label: "Internal · Harga", desc: "Kelola harga jual, potongan kuli & out", path: "/internal/harga" },
  { key: "bandul", label: "Internal · Bandul", desc: "Kelola data bandul & foto KTP", path: "/internal/bandul" },
  { key: "pembelian", label: "Internal · Pembelian", desc: "Input transaksi pembelian & nomor seri", path: "/internal/pembelian" },
  { key: "berat_koli", label: "Internal · Berat Koli", desc: "Input bruto & netto per nomor seri", path: "/internal/berat-koli" },
  { key: "kasir", label: "Internal · Kasir", desc: "Hitung & cetak nota per kupon", path: "/internal/kasir" },
  { key: "detail_koli", label: "Internal · Detail Koli", desc: "Laporan detail koli & pencarian", path: "/internal/detail-koli" },
  { key: "dashboard", label: "Internal · Dashboard", desc: "Ringkasan harian pembelian & kode seri", path: "/internal/dashboard" },
  { key: "penjualan", label: "Internal · Penjualan", desc: "Input penjualan per gulungan", path: "/internal/penjualan" },
  { key: "laporan_penjualan", label: "Internal · Laporan Penjualan", desc: "Laporan penjualan & selisih", path: "/internal/laporan-penjualan" },
  { key: "busai", label: "Internal · Busai", desc: "Bongkar, bungkus & busai CC", path: "/internal/busai" },
  { key: "detail_koli_cc", label: "Internal · Detail Koli Busai", desc: "Detail hasil busai & busai CC", path: "/internal/detail-koli-cc" },
  { key: "sisa_stock", label: "Internal · Sisa Stock", desc: "Nomor seri yang belum terjual", path: "/internal/sisa-stock" },
  { key: "out", label: "Internal · Out", desc: "Upload nomor jadi terjual (keluar gudang)", path: "/internal/out" },
  { key: "revisi", label: "Internal · Revisi", desc: "Upload revisi grade & harga penjualan", path: "/internal/revisi" },
  { key: "asisten", label: "Asisten AI", desc: "Tanya jawab data gudang dengan Claude", path: "/asisten" },
];

export function isAdmin(user: User | undefined): boolean {
  return user?.role === "admin";
}

export function can(user: User | undefined, p: Permission): boolean {
  return !!user && (user.role === "admin" || user.permissions.includes(p));
}

export function canAny(user: User | undefined, ps: Permission[]): boolean {
  return ps.some((p) => can(user, p));
}

export function firstAllowedPath(user: User | undefined): string | null {
  return PERM_META.find((m) => can(user, m.key))?.path ?? null;
}
