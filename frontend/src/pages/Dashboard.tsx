import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ChevronLeft, ChevronRight, FileSpreadsheet, Printer, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { ITEM_KEYS, ITEM_META, TYPE_META, fmtBase, fmtDate, fmtLongDate, fmtTxQty, txRoute } from "@/lib/format";
import { can } from "@/lib/perms";
import { txQueryString, useMe, useToday, useTransactions, useWarehouses } from "@/lib/queries";
import { warehouseOptions } from "@/lib/warehouses";
import { DateField } from "@/components/DateField";
import type { ItemKey, ItemTotals, ReportOut, ReportRow, Transaction, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type MetricKey = "masuk" | "transfer_in" | "transfer_out" | "pribadi" | "stok";
interface DateRange {
  date_from: string;
  date_to: string;
}

const COLS: { key: MetricKey; label: string }[] = [
  { key: "masuk", label: "Masuk Supplier" },
  { key: "transfer_in", label: "Transfer Masuk" },
  { key: "transfer_out", label: "Transfer Keluar" },
  { key: "pribadi", label: "Pemakaian" },
  { key: "stok", label: "Stok Akhir" },
];
const EMPTY_RANGE: DateRange = { date_from: "", date_to: "" };
const STAT_TONE: Record<ItemKey, string> = {
  glangse: "border-emerald-200 bg-emerald-50 text-emerald-900",
  tali: "border-indigo-200 bg-indigo-50 text-indigo-900",
  kertas: "border-amber-200 bg-amber-50 text-amber-950",
};
const STAT_SUB: Record<ItemKey, string> = { glangse: "", tali: "satuan kilogram", kertas: "satuan roll" };

function Qty({ item, v, strong }: { item: ItemKey; v: number; strong?: boolean }) {
  const f = fmtBase(item, v);
  return (
    <div className="font-mono">
      <p className={cn(strong && "font-semibold", v === 0 && "text-muted-foreground/60")}>{f.main}</p>
      {f.sub && <p className="text-[11px] text-muted-foreground">{f.sub}</p>}
    </div>
  );
}

function StatCard({ item, v }: { item: ItemKey; v: number }) {
  const f = fmtBase(item, v);
  return (
    <div className={cn("rounded-2xl border p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md", STAT_TONE[item])} data-testid={`stat-${item}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Stok {ITEM_META[item].label}</p>
      <p className="mt-2 font-mono text-3xl font-semibold tracking-tight">{f.main}</p>
      <p className="mt-1 font-mono text-sm opacity-80">{f.sub ?? STAT_SUB[item]}</p>
    </div>
  );
}

function DashboardHero({
  user,
  today,
  stok,
  whId,
  onWhChange,
  whOptions,
}: {
  user?: User;
  today?: string;
  stok?: ItemTotals;
  whId: string;
  onWhChange: (v: string) => void;
  whOptions: { value: string; label: string }[];
}) {
  const slides = [{ value: "", label: "Semua Gudang" }, ...whOptions];
  const idx = Math.max(0, slides.findIndex((s) => s.value === whId));
  const go = (dir: number) => {
    const next = (idx + dir + slides.length) % slides.length;
    onWhChange(slides[next].value);
  };
  return (
    <section className="tobacco-texture animate-rise relative overflow-hidden rounded-3xl p-6 text-white md:p-9">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="inline-block rounded-full bg-[#57351A] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#FDE68A]">
            {today ? fmtLongDate(today) : "Dashboard"}
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-5xl" data-testid="dashboard-greeting">
            Hallo, {user?.name ?? ""}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, "masuk") && (
            <Link to="/barang-masuk" className={cn(buttonVariants(), "bg-[#E69C24] text-[#29180C] hover:bg-[#f0ad3d]")} data-testid="hero-barang-masuk-button">
              <ArrowDownToLine className="size-4" /> Barang Masuk
            </Link>
          )}
          {(can(user, "transfer") || can(user, "pribadi")) && (
            <Link to="/barang-keluar" className={cn(buttonVariants({ variant: "outline" }), "border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white")} data-testid="hero-barang-keluar-button">
              <ArrowUpFromLine className="size-4" /> Barang Keluar
            </Link>
          )}
        </div>
      </div>
      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#FDE68A]" data-testid="dashboard-stock-scope-label">
            Total Stok — {slides[idx]?.label ?? "Semua Gudang"}
          </p>
          {slides.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Gudang sebelumnya"
                data-testid="dashboard-stock-prev"
                className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition-colors duration-150 hover:bg-white/20"
              >
                <ChevronLeft className="size-5" />
              </button>
              <span className="min-w-10 text-center text-xs font-medium tabular-nums text-[#E2D3BE]">
                {idx + 1}/{slides.length}
              </span>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Gudang berikutnya"
                data-testid="dashboard-stock-next"
                className="grid size-9 place-items-center rounded-full border border-white/20 bg-white/10 text-white transition-colors duration-150 hover:bg-white/20"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          )}
        </div>
        <div key={whId} className="animate-rise grid grid-cols-1 gap-4 md:grid-cols-3">
          {ITEM_KEYS.map((k) => (
            <StatCard key={k} item={k} v={stok?.[k] ?? 0} />
          ))}
        </div>
        {slides.length > 1 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2" data-testid="dashboard-stock-dots">
            {slides.map((s, i) => (
              <button
                key={s.value || "all"}
                type="button"
                onClick={() => onWhChange(s.value)}
                aria-label={s.label}
                title={s.label}
                data-testid={`dashboard-stock-dot-${i}`}
                className={cn(
                  "h-2 rounded-full transition-all duration-200",
                  i === idx ? "w-6 bg-[#E69C24]" : "w-2 bg-white/30 hover:bg-white/50",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ReportControls({ range, onChange, qs }: { range: DateRange; onChange: (r: DateRange) => void; qs: string }) {
  const suffix = qs ? `?${qs}` : "";
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-white p-4 lg:flex-row lg:items-end lg:justify-between" data-testid="report-controls">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Dari tanggal</Label>
          <DateField className="w-40 bg-white" testId="report-date-from" value={range.date_from} onChange={(v) => onChange({ ...range, date_from: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sampai tanggal</Label>
          <DateField className="w-40 bg-white" testId="report-date-to" value={range.date_to} onChange={(v) => onChange({ ...range, date_to: v })} />
        </div>
        {qs && (
          <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_RANGE)} data-testid="report-reset-button">
            <RotateCcw className="size-3.5" /> Semua periode
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/report/export.pdf${suffix}`} target="_blank" rel="noreferrer" className={cn(buttonVariants(), "bg-[#7A4A1F]")} data-testid="report-print-pdf-button">
          <Printer className="size-4" /> Cetak Laporan
        </a>
        <a href={`/api/report/export.xlsx${suffix}`} className={cn(buttonVariants(), "bg-emerald-700 hover:bg-emerald-800")} data-testid="report-export-excel-button">
          <FileSpreadsheet className="size-4" /> Ekspor Excel
        </a>
      </div>
    </section>
  );
}

function ItemSwitcher({ value, onChange }: { value: ItemKey; onChange: (k: ItemKey) => void }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="report-item-switcher">
      {ITEM_KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          data-testid={`report-item-${k}`}
          className={cn(
            "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-[background-color,border-color] duration-150",
            value === k ? ITEM_META[k].tint : "bg-white text-muted-foreground hover:bg-muted",
          )}
        >
          <span className={cn("size-2 rounded-full", ITEM_META[k].dot)} />
          {ITEM_META[k].label}
        </button>
      ))}
    </div>
  );
}

function WarehouseRowLabel({ row, kind }: { row: ReportRow; kind: "row" | "group" }) {
  if (kind === "group") return <p className="font-semibold text-amber-900">Subtotal {row.warehouse_name}</p>;
  const isRanting = row.level === 1;
  return (
    <>
      <p className="font-semibold">{isRanting ? `↳ ${row.warehouse_name}` : row.warehouse_name}</p>
      <p className="text-xs text-muted-foreground">{isRanting ? `Ranting · induk ${row.parent_name}` : "Gudang induk"}</p>
    </>
  );
}

function WarehouseRow({ row, item, kind }: { row: ReportRow; item: ItemKey; kind: "row" | "group" }) {
  return (
    <TableRow className={cn(kind === "group" && "bg-amber-50/70 hover:bg-amber-50")} data-testid={`report-${kind}-${row.warehouse_id}`}>
      <TableCell className={cn(row.level === 1 && "pl-8")}>
        <WarehouseRowLabel row={row} kind={kind} />
      </TableCell>
      {COLS.map((c) => (
        <TableCell key={c.key} className="text-right">
          <Qty item={item} v={row[c.key][item]} strong={c.key === "stok" || kind === "group"} />
        </TableCell>
      ))}
    </TableRow>
  );
}

/** Rows in display order; each induk's subtotal follows its last ranting. */
function useReportLines(report?: ReportOut) {
  return useMemo(() => {
    const rows = report?.rows ?? [];
    const groups = new Map((report?.groups ?? []).map((g) => [g.warehouse_id, g]));
    return rows.map((row, i) => {
      const next = rows[i + 1];
      const g = groups.get(row.parent_id ?? row.warehouse_id);
      const subtotal = g && (!next || next.level === 0) ? g : undefined;
      return { row, subtotal };
    });
  }, [report]);
}

function WarehouseReportTable({ report, item, loading }: { report?: ReportOut; item: ItemKey; loading: boolean }) {
  const lines = useReportLines(report);
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="border-b px-5 py-4">
        <h2 className="font-heading text-lg font-semibold">Stok &amp; Penggunaan per Gudang — {ITEM_META[item].label}</h2>
        <p className="text-xs text-muted-foreground">Kolom masuk, transfer, dan pemakaian mengikuti periode; stok akhir dihitung sampai akhir periode.</p>
      </div>
      <Table data-testid="report-warehouse-table">
        <TableHeader>
          <TableRow className="bg-muted/60">
            <TableHead>Gudang</TableHead>
            {COLS.map((c) => (
              <TableHead key={c.key} className="text-right">{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map(({ row, subtotal }) => (
            <Fragment key={row.warehouse_id}>
              <WarehouseRow row={row} item={item} kind="row" />
              {subtotal && <WarehouseRow row={subtotal} item={item} kind="group" />}
            </Fragment>
          ))}
          {lines.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                {loading ? "Memuat laporan..." : "Belum ada gudang. Buat gudang pertama di menu Kelola Gudang."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {report && lines.length > 0 && (
          <TableFooter>
            <TableRow className="bg-[#EADCC6]/60" data-testid="report-total-row">
              <TableCell className="font-bold">Total Seluruh Gudang</TableCell>
              {COLS.map((c) => (
                <TableCell key={c.key} className="text-right">
                  <Qty item={item} v={report.total[c.key][item]} strong />
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </section>
  );
}

function SupplierReportTable({ report, item }: { report?: ReportOut; item: ItemKey }) {
  const suppliers = useMemo(
    () => (report?.suppliers ?? []).map((s) => ({ ...s, delivered: s.per_warehouse.filter((pw) => pw.totals[item] > 0) })),
    [report, item],
  );
  return (
    <section className="overflow-hidden rounded-2xl border bg-white">
      <div className="flex flex-col gap-1 border-b px-5 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold">Kiriman Supplier — {ITEM_META[item].label}</h2>
          <p className="text-xs text-muted-foreground">Total kiriman setiap supplier ke masing-masing gudang dan ke seluruh gudang.</p>
        </div>
        {report && (
          <p className="text-sm" data-testid="supplier-grand-total">
            Total semua supplier: <span className="font-mono font-semibold">{fmtBase(item, report.total.masuk[item]).main}</span>
          </p>
        )}
      </div>
      <Table data-testid="report-supplier-table">
        <TableHeader>
          <TableRow className="bg-muted/60">
            <TableHead>Supplier</TableHead>
            <TableHead>Rincian per Gudang</TableHead>
            <TableHead className="text-right">Total ke Seluruh Gudang</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers.map((s) => (
            <TableRow key={s.supplier_id ?? s.supplier_name} data-testid={`report-supplier-${s.supplier_id ?? s.supplier_name}`}>
              <TableCell className="font-semibold">{s.supplier_name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1.5">
                  {s.delivered.map((pw) => (
                    <Badge key={pw.warehouse_id} variant="outline" className="h-auto bg-white py-1 font-normal">
                      {pw.warehouse_name}: <span className="font-mono font-semibold">{fmtBase(item, pw.totals[item]).main}</span>
                    </Badge>
                  ))}
                  {s.total[item] === 0 && <span className="text-xs text-muted-foreground">Tidak ada kiriman {ITEM_META[item].label}</span>}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Qty item={item} v={s.total[item]} strong />
              </TableCell>
            </TableRow>
          ))}
          {report && suppliers.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">Belum ada kiriman supplier pada periode ini.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}

function RecentActivity({ items }: { items?: Transaction[] }) {
  return (
    <section className="rounded-2xl border bg-white p-5" data-testid="recent-activity">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-base font-semibold">Aktivitas Terbaru</h3>
        <Link to="/riwayat" className="flex items-center gap-1 text-sm font-medium text-amber-800 hover:underline" data-testid="dashboard-riwayat-link">
          Semua <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(items ?? []).map((t) => (
          <li key={t.id} className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3">
            <Badge className={cn("mt-0.5 shrink-0", TYPE_META[t.type].badge)}>{TYPE_META[t.type].label}</Badge>
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {ITEM_META[t.item].label} <span className="font-mono text-muted-foreground">· {fmtTxQty(t)}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">{txRoute(t)}</p>
              <p className="text-xs text-muted-foreground">{fmtDate(t.date)}</p>
            </div>
          </li>
        ))}
        {items && items.length === 0 && <li className="text-sm text-muted-foreground">Belum ada transaksi.</li>}
      </ul>
    </section>
  );
}

export default function Dashboard() {
  const me = useMe();
  const today = useToday();
  const whs = useWarehouses();
  const [range, setRange] = useState<DateRange>(EMPTY_RANGE);
  const [item, setItem] = useState<ItemKey>("glangse");
  const [whId, setWhId] = useState("");
  const qs = txQueryString({ ...range });
  const report = useQuery({ queryKey: ["report", qs], queryFn: () => apiGet<ReportOut>(`/report${qs ? `?${qs}` : ""}`) });
  const canRiwayat = can(me.data, "riwayat");
  const recent = useTransactions({ limit: "6" }, canRiwayat);
  const r = report.isError ? undefined : report.data;
  const whOptions = warehouseOptions(whs.isError ? [] : whs.data);
  const heroStok = whId ? r?.rows.find((row) => row.warehouse_id === whId)?.stok : r?.total.stok;

  return (
    <div className="space-y-7">
      <DashboardHero user={me.data} today={today.data?.today} stok={heroStok} whId={whId} onWhChange={setWhId} whOptions={whOptions} />
      <ReportControls range={range} onChange={setRange} qs={qs} />
      <ItemSwitcher value={item} onChange={setItem} />
      <WarehouseReportTable report={r} item={item} loading={report.isLoading} />
      <SupplierReportTable report={r} item={item} />
      {canRiwayat && <RecentActivity items={recent.isError ? [] : recent.data} />}
    </div>
  );
}
