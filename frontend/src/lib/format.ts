import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ApiError } from "./api";
import type { ItemKey, StockRow, Transaction, TxType, Unit } from "./types";

export const LEMBAR_PER_GULUNG = 5;

export const ITEM_META: Record<
  ItemKey,
  { label: string; units: Unit[]; badge: string; tint: string; dot: string; desc: string }
> = {
  glangse: {
    label: "Glangse",
    units: ["gulung", "koli"],
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    tint: "bg-emerald-50 border-emerald-200 text-emerald-900",
    dot: "bg-emerald-600",
    desc: "1 gulung = 5 koli",
  },
  tali: {
    label: "Tali Putih",
    units: ["kg"],
    badge: "bg-indigo-100 text-indigo-800 border-indigo-300",
    tint: "bg-indigo-50 border-indigo-200 text-indigo-900",
    dot: "bg-indigo-600",
    desc: "Satuan kg (boleh desimal)",
  },
  kertas: {
    label: "Kertas Coklat",
    units: ["roll"],
    badge: "bg-amber-100 text-amber-900 border-amber-300",
    tint: "bg-amber-50 border-amber-200 text-amber-950",
    dot: "bg-amber-600",
    desc: "Satuan roll (bilangan bulat)",
  },
};

export const ITEM_KEYS: ItemKey[] = ["glangse", "tali", "kertas"];

export const TYPE_META: Record<TxType, { label: string; badge: string }> = {
  masuk: { label: "Masuk", badge: "bg-emerald-600 text-white border-transparent" },
  transfer: { label: "Transfer", badge: "bg-sky-600 text-white border-transparent" },
  pribadi: { label: "Pribadi", badge: "bg-orange-600 text-white border-transparent" },
};

export function nf(n: number, max = 2): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: max }).format(n);
}

/** Accepts both "10,4" and "10.4". Returns NaN on empty/invalid. */
export function parseQty(s: string): number {
  const t = s.trim().replace(",", ".");
  if (!t) return NaN;
  return Number(t);
}

export function toBase(item: ItemKey, qty: number, unit: Unit): number {
  return item === "glangse" && unit === "gulung" ? qty * LEMBAR_PER_GULUNG : qty;
}

/** Stock value for an item from a stock row, in its base unit. */
export function stockOf(row: StockRow | undefined, item: ItemKey): number {
  if (!row) return 0;
  return item === "glangse" ? row.glangse_lembar : item === "tali" ? row.tali_kg : row.kertas_roll;
}

export function fmtBase(item: ItemKey, base: number): { main: string; sub?: string } {
  if (item === "glangse") {
    return { main: `${nf(base / LEMBAR_PER_GULUNG)} gulung`, sub: `${nf(base)} koli` };
  }
  return { main: `${nf(base)} ${item === "tali" ? "kg" : "roll"}` };
}

export function fmtTxQty(t: Transaction): string {
  const f = fmtBase(t.item, t.qty);
  return f.sub ? `${f.main} · ${f.sub}` : f.main;
}

export function fmtDate(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yyyy", { locale: localeId });
  } catch {
    return iso;
  }
}

export function fmtLongDate(iso: string): string {
  try {
    return format(parseISO(iso), "EEEE, d MMMM yyyy", { locale: localeId });
  } catch {
    return iso;
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body as { detail?: unknown } | null;
    const d = body?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0] as { msg?: string };
      return first.msg ?? "Data tidak valid";
    }
    return `Permintaan gagal (${e.status})`;
  }
  return "Tidak dapat terhubung ke server";
}

/** "From → to" description of a transaction, for compact lists. */
export function txRoute(t: Transaction): string {
  if (t.type === "masuk") return `${t.supplier_name} → ${t.warehouse_name}`;
  if (t.type === "transfer") return `${t.warehouse_name} → ${t.target_warehouse_name}`;
  return t.note ? `${t.warehouse_name} · ${t.note}` : t.warehouse_name;
}
