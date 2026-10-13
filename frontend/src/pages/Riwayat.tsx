import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { SimpleSelect } from "@/components/SimpleSelect";
import { TxEditDialog } from "@/components/TxEditDialog";
import { DateField } from "@/components/DateField";
import { apiDelete } from "@/lib/api";
import { ITEM_META, TYPE_META, errMsg, fmtDate, fmtTxQty } from "@/lib/format";
import { txQueryString, useMe, useSuppliers, useTransactions, useWarehouses } from "@/lib/queries";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { warehouseOptions } from "@/lib/warehouses";

const TYPE_OPTIONS = [
  { value: "all", label: "Semua jenis" },
  { value: "masuk", label: "Barang Masuk" },
  { value: "transfer", label: "Transfer Gudang" },
  { value: "pribadi", label: "Penggunaan Pribadi" },
];
const ITEM_OPTIONS = [
  { value: "all", label: "Semua barang" },
  { value: "glangse", label: "Glangse" },
  { value: "tali", label: "Tali Putih" },
  { value: "kertas", label: "Kertas Coklat" },
];

const EMPTY = { date_from: "", date_to: "", warehouse_id: "all", type: "all", item: "all", supplier_id: "all" };

export default function Riwayat() {
  const qc = useQueryClient();
  const me = useMe();
  const whs = useWarehouses();
  const sups = useSuppliers();
  const [f, setF] = useState(EMPTY);
  const txs = useTransactions(f);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const isAdmin = me.data?.role === "admin";
  const warehouseFilterOptions = useMemo(() => [{ value: "all", label: "Semua gudang" }, ...warehouseOptions(whs.data)], [whs.data]);
  const supplierFilterOptions = useMemo(
    () => [{ value: "all", label: "Semua supplier" }, ...(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))],
    [sups.data],
  );

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/transactions/${id}`),
    onSuccess: () => {
      toast.success("Transaksi dihapus");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["report"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const qs = txQueryString(f);
  const rows = txs.isError ? [] : txs.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Riwayat Transaksi"
        actions={
          <a
            href={`/api/transactions/export${qs ? `?${qs}` : ""}`}
            className={cn(buttonVariants(), "bg-emerald-700 hover:bg-emerald-800")}
            data-testid="export-excel-button"
          >
            <FileSpreadsheet className="size-4" /> Ekspor Excel
          </a>
        }
      />

      <section className="mb-5 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-6" data-testid="riwayat-filters">
        <div className="space-y-1">
          <Label className="text-xs">Dari tanggal</Label>
          <DateField className="bg-white" testId="filter-date-from" value={f.date_from} onChange={(v) => setF({ ...f, date_from: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sampai tanggal</Label>
          <DateField className="bg-white" testId="filter-date-to" value={f.date_to} onChange={(v) => setF({ ...f, date_to: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gudang</Label>
          <SimpleSelect
            value={f.warehouse_id}
            onChange={(v) => setF({ ...f, warehouse_id: v })}
            placeholder="Semua gudang"
            testId="filter-warehouse"
            options={warehouseFilterOptions}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Jenis</Label>
          <SimpleSelect
            value={f.type}
            onChange={(v) => setF({ ...f, type: v })}
            placeholder="Semua jenis"
            testId="filter-type"
options={TYPE_OPTIONS}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Barang</Label>
          <SimpleSelect
            value={f.item}
            onChange={(v) => setF({ ...f, item: v })}
            placeholder="Semua barang"
            testId="filter-item"
options={ITEM_OPTIONS}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Supplier</Label>
          <SimpleSelect
            value={f.supplier_id}
            onChange={(v) => setF({ ...f, supplier_id: v })}
            placeholder="Semua supplier"
            testId="filter-supplier"
            options={supplierFilterOptions}
          />
        </div>
        <div className="flex items-center justify-between sm:col-span-2 lg:col-span-6">
          <p className="text-sm text-muted-foreground" data-testid="riwayat-count">
            {rows.length} transaksi
          </p>
          <Button variant="ghost" size="sm" onClick={() => setF(EMPTY)} data-testid="filter-reset-button">
            <RotateCcw className="size-3.5" /> Reset filter
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="riwayat-table">
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead>Tanggal</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Barang</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Gudang</TableHead>
              <TableHead>Supplier / Keterangan</TableHead>
              <TableHead>Oleh</TableHead>
              <TableHead className="w-28 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} data-testid={`tx-row-${t.id}`}>
                <TableCell className="whitespace-nowrap">{fmtDate(t.date)}</TableCell>
                <TableCell>
                  <Badge className={TYPE_META[t.type].badge}>{TYPE_META[t.type].label}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={ITEM_META[t.item].badge}>
                    {ITEM_META[t.item].label}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono font-semibold">
                  <span className={t.type === "masuk" ? "text-emerald-700" : "text-orange-700"}>{t.type === "masuk" ? "+" : "−"}</span>{" "}
                  {fmtTxQty(t)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {t.type === "transfer" ? `${t.warehouse_name} → ${t.target_warehouse_name}` : t.warehouse_name}
                </TableCell>
                <TableCell className="max-w-[260px]">
                  {t.supplier_name && <p className="font-medium">{t.supplier_name}</p>}
                  {t.note && <p className="truncate text-xs text-muted-foreground">{t.note}</p>}
                  {t.edited_by_name && (
                    <p className="text-[11px] font-medium text-amber-700" data-testid={`tx-edited-${t.id}`}>
                      Direvisi oleh {t.edited_by_name}
                    </p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{t.created_by_name}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <a
                    href={`/api/transactions/${t.id}/receipt.pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                    data-testid={`tx-receipt-${t.id}`}
                    aria-label="Cetak tanda terima"
                    title="Cetak tanda terima"
                  >
                    <Printer className="size-4 text-emerald-700" />
                  </a>
                  {isAdmin && (
                    <>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditing(t)} data-testid={`tx-edit-${t.id}`} aria-label="Revisi transaksi">
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(t)} data-testid={`tx-delete-${t.id}`} aria-label="Hapus transaksi">
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                  {txs.isLoading ? "Memuat..." : "Tidak ada transaksi sesuai filter."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      {editing && <TxEditDialog key={editing.id} tx={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Hapus transaksi?"
        description="Stok akan dikembalikan seperti sebelum transaksi ini. Tindakan ini tidak dapat dibatalkan."
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        pending={del.isPending}
        testId="tx-delete-dialog"
      />
    </div>
  );
}
