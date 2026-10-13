// Types + helpers for the Internal module (warehouse-scoped). Mirrors backend/models/internal.py.
import { useState } from "react";

export interface HargaJual { id: string; warehouse_id: string; grade: string; harga: number; created_at: string }
export interface Potongan { id: string; warehouse_id: string; harga: number; created_at: string }
export interface Bandul { id: string; warehouse_id: string; nama: string; alamat: string; ktp_path: string | null; created_at: string }

export interface PembelianItem { nomor_seri: string; harga: number; keterangan: string }
export interface Pembelian {
  id: string; warehouse_id: string; tanggal_beli: string; nomor_kupon: string;
  bandul_id: string | null; bandul_nama: string;
  potongan_kuli_id: string | null; potongan_kuli_harga: number;
  potongan_out_id: string | null; potongan_out_harga: number;
  jumlah_out: number; items: PembelianItem[]; jumlah_seri: number;
  total_potongan_kuli: number; total_out: number;
  created_by_name: string; created_at: string; edited_by_name: string | null; edited_at: string | null;
}
export interface PembelianIn {
  tanggal_beli: string; nomor_kupon: string; bandul_id: string | null;
  potongan_kuli_id: string | null; potongan_out_id: string | null; jumlah_out: number; items: PembelianItem[];
}

export interface BeratKoli { id: string; warehouse_id: string; nomor_seri: string; bruto: number; netto: number; created_at: string; edited_at: string | null; bandul_nama: string; keterangan: string }
export interface BeratPending { nomor_seri: string; nomor_kupon: string; bandul_nama: string; tanggal_beli: string }
export interface BeratLookup { in_pembelian: boolean; existing: BeratKoli | null; bandul_nama: string; keterangan: string }

export interface KasirItem { nomor_seri: string; harga: number; bruto: number; netto: number; subtotal: number; keterangan: string }
export interface KasirNota {
  nomor_kupon: string; label: string; warehouse_nama: string; tanggal_beli: string; bandul_nama: string;
  items: KasirItem[]; total_harga: number; pajak: number; total_potongan_kuli: number; total_out: number;
  jumlah_out: number; jumlah_kuli: number; total_pembayaran: number; can_print: boolean; printed_at: string | null; printed_by: string | null;
}

export interface DetailKoliRow { tanggal_beli: string; nomor_kupon: string; bandul_nama: string; nomor_seri: string; harga: number; bruto: number | null; netto: number | null; keterangan: string }

export interface DaySummary { tanggal: string; jumlah_transaksi: number; jumlah_koli: number; total_bruto: number; total_netto: number; total_pembelian: number; total_pajak: number; total_kuli: number; total_out: number; total_pembayaran: number }
export interface KodeCount { kode: string; jumlah: number }
export interface DashboardTotals { jumlah_koli: number; total_bruto: number; total_netto: number; total_pembelian: number; total_pajak: number; total_kuli: number; total_out: number; total_pembayaran: number }
export interface DashboardOut { date_from: string; date_to: string; days: DaySummary[]; kode: KodeCount[]; totals: DashboardTotals }
export interface SisaStockRow { tanggal_beli: string; nomor_kupon: string; bandul_nama: string; nomor_seri: string; harga_beli: number; bruto_beli: number | null; netto_beli: number | null; bruto_busai: number | null; netto_busai: number | null; keterangan: string }
export interface DetailBusaiRow { tanggal_busai: string | null; nomor_seri: string; jenis: string; bruto_beli: number | null; netto_beli: number | null; bruto_busai: number | null; netto_busai: number | null; keterangan: string }

export interface PenjualanItem {
  nomor_seri: string; nomor_jadi: string; bruto: number; netto: number; grade: string; keterangan: string;
  harga_jual: number; tanggal_beli: string; bandul_nama: string; harga_beli: number; bruto_beli: number | null; netto_beli: number | null;
}
export interface Penjualan { id: string; warehouse_id: string; tanggal_jual: string; gulungan: string; pembeli: string; items: PenjualanItem[]; jumlah_seri: number; total_harga_jual: number; created_by_name: string; created_at: string }
export interface LaporanPenjualanRow {
  tanggal_beli: string; tanggal_jual: string; nomor_seri: string; bandul_nama: string; nomor_jadi: string; grade: string;
  bruto_beli: number | null; netto_beli: number | null; bruto_jual: number; netto_jual: number;
  harga_beli: number; total_harga_beli: number; harga_jual: number; total_harga_jual: number; selisih: number;
}

export interface Busai {
  id: string; warehouse_id: string; nomor_seri: string; status: string; is_cc: boolean;
  tanggal_beli: string; tanggal_busai: string | null; bandul_nama: string; harga_beli: number;
  bruto_beli: number | null; netto_beli: number | null; bruto_busai: number | null; netto_busai: number | null; keterangan: string; created_at: string;
}
export interface BusaiInfo { nomor_seri: string; tanggal_beli: string; bandul_nama: string; harga_beli: number; bruto_beli: number | null; netto_beli: number | null; keterangan_beli: string; busai_status: string | null }

export interface OutRecord {
  id: string; warehouse_id: string; tanggal_out: string; penjualan_id: string; gulungan: string; pembeli: string;
  tanggal_jual: string; tanggal_beli: string; nomor_seri: string; nomor_jadi: string; bandul_nama: string; grade: string;
  bruto_beli: number | null; netto_beli: number | null; bruto_jual: number; netto_jual: number;
  harga_beli: number; total_harga_beli: number; harga_jual: number; total_harga_jual: number; selisih: number;
  created_by_name: string; created_at: string;
}
export interface RevisiRecord {
  id: string; warehouse_id: string; tanggal_revisi: string; penjualan_id: string; gulungan: string; tanggal_jual: string;
  nomor_seri: string; nomor_jadi: string; bandul_nama: string; netto: number;
  grade_lama: string; harga_lama: number; grade_baru: string; harga_baru: number;
  total_lama: number; total_baru: number; selisih: number; created_by_name: string; created_at: string;
}

export const MAX_BRUTO = 50;
export function rupiah(n: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n || 0));
}
export function numId(n: number | null | undefined, max = 2): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: max }).format(n);
}
export function fileUrl(path: string): string { return `/api/internal/files/${path}`; }

/** Increment the trailing number of a serial, preserving width/prefix (26MDR025020 -> 26MDR025021). */
export function nextSerial(s: string): string {
  const m = (s || "").match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return "";
  const [, head, num, tail] = m;
  const inc = (BigInt(num) + 1n).toString().padStart(num.length, "0");
  return head + inc + tail;
}

/** Build a query string with wh plus any non-empty extras. */
export function whqs(wh: string, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams({ wh });
  for (const [k, v] of Object.entries(extra)) if (v && v.trim()) p.set(k, v.trim());
  return p.toString();
}

/** Fetch an .xlsx (cookie auth) and trigger a browser download. */
export async function downloadXlsx(path: string): Promise<void> {
  const res = await fetch(`/api${path}`, { credentials: "same-origin" });
  if (!res.ok) throw new Error("Gagal mengunduh");
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = m ? m[1] : "export.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Simple client-side pagination (default 100 rows/page). */
export function usePaged<T>(rows: T[], size = 100) {
  const [page, setPage] = useState(1);
  const total = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, total);
  return { page: p, setPage, total, slice: rows.slice((p - 1) * size, p * size), count: rows.length };
}
