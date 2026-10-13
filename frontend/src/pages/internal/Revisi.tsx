import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Download, Pencil, Scale, Trash2, TrendingUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { Paginator, Toolbar } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiDelete, apiGet } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { downloadXlsx, numId, rupiah, usePaged, whqs } from "@/lib/internal";
import type { RevisiRecord } from "@/lib/internal";
import { useWh } from "./InternalLayout";

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white px-5 py-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon className="size-5" /></div>
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-lg font-bold">{value}</p></div>
    </div>
  );
}

export default function RevisiPage() {
  const wh = useWh();
  const qc = useQueryClient();
  const today = useToday();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<RevisiRecord | null>(null);

  const params = useMemo(() => ({ date_from: effFrom, date_to: effTo }), [effFrom, effTo]);
  const list = useQuery({ queryKey: ["revisi", wh, params], enabled: !!wh && !!effFrom, queryFn: () => apiGet<RevisiRecord[]>(`/internal/revisi?${whqs(wh, params)}`) });
  const data = list.data ?? [];
  const sort = useSort<RevisiRecord>(data);
  const paged = usePaged(sort.sorted, 100);

  const totals = useMemo(() => {
    let koli = 0, netto = 0, lama = 0, baru = 0, selisih = 0;
    for (const r of data) { koli += 1; netto += r.netto || 0; lama += r.total_lama || 0; baru += r.total_baru || 0; selisih += r.selisih || 0; }
    return { koli, netto, lama, baru, selisih };
  }, [data]);

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/internal/revisi/import?${whqs(wh)}`, { method: "POST", body: fd });
      const body = await res.json(); if (!res.ok) throw new Error(body.detail || "gagal");
      toast.success(`${body.created} nomor jadi direvisi`);
      qc.invalidateQueries({ queryKey: ["revisi", wh] });
      qc.invalidateQueries({ queryKey: ["penjualan", wh] });
      qc.invalidateQueries({ queryKey: ["laporan-penjualan", wh] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal impor"); } finally { setImporting(false); }
  };

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/internal/revisi/${id}?${whqs(wh)}`),
    onSuccess: () => { toast.success("Revisi dibatalkan, grade kembali semula"); setToDelete(null); qc.invalidateQueries({ queryKey: ["revisi", wh] }); qc.invalidateQueries({ queryKey: ["penjualan", wh] }); qc.invalidateQueries({ queryKey: ["laporan-penjualan", wh] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Revisi" actions={<>
        <Button variant="outline" onClick={() => downloadXlsx(`/internal/revisi/template?${whqs(wh)}`).catch(() => toast.error("Gagal"))} data-testid="revisi-template-button"><Download className="size-4" /> Format Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onImport(e.currentTarget)} data-testid="revisi-import-input" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} data-testid="revisi-import-button"><Upload className="size-4" /> {importing ? "Mengimpor..." : "Upload Excel"}</Button>
        <Button variant="outline" onClick={() => downloadXlsx(`/internal/revisi/export?${whqs(wh, params)}`).catch(() => toast.error("Gagal"))} data-testid="revisi-export-button"><Download className="size-4" /> Export</Button>
      </>} />

      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="revisi-filter-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><DateField testId="revisi-filter-to" value={effTo} onChange={setTo} /></div>
      </Toolbar>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="revisi-summary">
        <Stat icon={Boxes} label="Jumlah Nomor Jadi" value={numId(totals.koli, 0)} />
        <Stat icon={Scale} label="Total Netto (kg)" value={numId(totals.netto)} />
        <Stat icon={TrendingUp} label="Total Harga Lama" value={rupiah(totals.lama)} />
        <Stat icon={TrendingUp} label="Total Harga Baru" value={rupiah(totals.baru)} />
        <Stat icon={TrendingUp} label="Total Selisih" value={rupiah(totals.selisih)} />
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="revisi-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tgl Revisi" sortKey="tanggal_revisi" state={sort} onToggle={sort.toggle} />
            <SortHead label="Tgl Jual" sortKey="tanggal_jual" state={sort} onToggle={sort.toggle} />
            <SortHead label="Gulungan" sortKey="gulungan" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Jadi" sortKey="nomor_jadi" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
            <SortHead label="Netto" sortKey="netto" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Grade Lama" sortKey="grade_lama" state={sort} onToggle={sort.toggle} />
            <SortHead label="Harga Lama" sortKey="harga_lama" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Grade Baru" sortKey="grade_baru" state={sort} onToggle={sort.toggle} />
            <SortHead label="Harga Baru" sortKey="harga_baru" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Lama" sortKey="total_lama" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Baru" sortKey="total_baru" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Selisih" sortKey="selisih" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead className="w-12 text-right">Aksi</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((r) => (
              <TableRow key={r.id} data-testid={`revisi-row-${r.id}`}>
                <TableCell>{fmtDate(r.tanggal_revisi)}</TableCell>
                <TableCell>{fmtDate(r.tanggal_jual)}</TableCell>
                <TableCell className="font-semibold">{r.gulungan || "—"}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_seri}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_jadi}</TableCell>
                <TableCell>{r.bandul_nama || "—"}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.netto)}</TableCell>
                <TableCell className="font-semibold text-muted-foreground">{r.grade_lama || "—"}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">{rupiah(r.harga_lama)}</TableCell>
                <TableCell className="font-semibold text-amber-800">{r.grade_baru || "—"}</TableCell>
                <TableCell className="text-right font-mono text-amber-800">{rupiah(r.harga_baru)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.total_lama)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{rupiah(r.total_baru)}</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${r.selisih < 0 ? "text-red-600" : "text-emerald-700"}`}>{rupiah(r.selisih)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon-sm" onClick={() => setToDelete(r)} data-testid={`revisi-delete-${r.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={15} className="py-12 text-center text-muted-foreground"><Pencil className="mx-auto mb-2 size-8 opacity-40" />{list.isLoading ? "Memuat..." : "Belum ada data revisi."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="revisi" />
      </section>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Batalkan revisi ini?" description="Grade & harga akan dikembalikan ke nilai semula." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="revisi-delete-dialog" />
    </div>
  );
}
