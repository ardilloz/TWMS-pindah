import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Download, LogOut, Scale, Trash2, TrendingUp, Upload, Wallet } from "lucide-react";
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
import type { OutRecord } from "@/lib/internal";
import { useWh } from "./InternalLayout";

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white px-5 py-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon className="size-5" /></div>
      <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-lg font-bold">{value}</p></div>
    </div>
  );
}

export default function OutPage() {
  const wh = useWh();
  const qc = useQueryClient();
  const today = useToday();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<OutRecord | null>(null);

  const params = useMemo(() => ({ date_from: effFrom, date_to: effTo }), [effFrom, effTo]);
  const list = useQuery({ queryKey: ["out", wh, params], enabled: !!wh && !!effFrom, queryFn: () => apiGet<OutRecord[]>(`/internal/out?${whqs(wh, params)}`) });
  const data = list.data ?? [];
  const sort = useSort<OutRecord>(data);
  const paged = usePaged(sort.sorted, 100);

  const totals = useMemo(() => {
    let koli = 0, netto = 0, beli = 0, jual = 0, selisih = 0;
    for (const r of data) { koli += 1; netto += r.netto_jual || 0; beli += r.total_harga_beli || 0; jual += r.total_harga_jual || 0; selisih += r.selisih || 0; }
    return { koli, netto, beli, jual, selisih };
  }, [data]);

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/internal/out/import?${whqs(wh)}`, { method: "POST", body: fd });
      const body = await res.json(); if (!res.ok) throw new Error(body.detail || "gagal");
      toast.success(`${body.created} nomor jadi di-OUT`);
      qc.invalidateQueries({ queryKey: ["out", wh] });
      qc.invalidateQueries({ queryKey: ["penjualan", wh] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal impor"); } finally { setImporting(false); }
  };

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/internal/out/${id}?${whqs(wh)}`),
    onSuccess: () => { toast.success("Nomor jadi dikembalikan ke penjualan"); setToDelete(null); qc.invalidateQueries({ queryKey: ["out", wh] }); qc.invalidateQueries({ queryKey: ["penjualan", wh] }); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Out" actions={<>
        <Button variant="outline" onClick={() => downloadXlsx(`/internal/out/template?${whqs(wh)}`).catch(() => toast.error("Gagal"))} data-testid="out-template-button"><Download className="size-4" /> Format Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onImport(e.currentTarget)} data-testid="out-import-input" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} data-testid="out-import-button"><Upload className="size-4" /> {importing ? "Mengimpor..." : "Upload Excel"}</Button>
        <Button variant="outline" onClick={() => downloadXlsx(`/internal/out/export?${whqs(wh, params)}`).catch(() => toast.error("Gagal"))} data-testid="out-export-button"><Download className="size-4" /> Export</Button>
      </>} />

      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="out-filter-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><DateField testId="out-filter-to" value={effTo} onChange={setTo} /></div>
      </Toolbar>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="out-summary">
        <Stat icon={Boxes} label="Jumlah Koli Out" value={numId(totals.koli, 0)} />
        <Stat icon={Scale} label="Total Netto Jual (kg)" value={numId(totals.netto)} />
        <Stat icon={Wallet} label="Total Harga Beli" value={rupiah(totals.beli)} />
        <Stat icon={Wallet} label="Total Harga Jual" value={rupiah(totals.jual)} />
        <Stat icon={TrendingUp} label="Total Selisih" value={rupiah(totals.selisih)} />
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="out-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tgl Out" sortKey="tanggal_out" state={sort} onToggle={sort.toggle} />
            <SortHead label="Tgl Beli" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
            <SortHead label="Tgl Jual" sortKey="tanggal_jual" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Jadi" sortKey="nomor_jadi" state={sort} onToggle={sort.toggle} />
            <SortHead label="Grade" sortKey="grade" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bruto Beli" sortKey="bruto_beli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Netto Beli" sortKey="netto_beli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Bruto Jual" sortKey="bruto_jual" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Netto Jual" sortKey="netto_jual" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Harga Beli" sortKey="harga_beli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Beli" sortKey="total_harga_beli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Harga Jual" sortKey="harga_jual" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Jual" sortKey="total_harga_jual" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Selisih" sortKey="selisih" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead className="w-12 text-right">Aksi</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((r) => (
              <TableRow key={r.id} data-testid={`out-row-${r.id}`}>
                <TableCell>{fmtDate(r.tanggal_out)}</TableCell>
                <TableCell>{fmtDate(r.tanggal_beli)}</TableCell>
                <TableCell>{fmtDate(r.tanggal_jual)}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_seri}</TableCell>
                <TableCell>{r.bandul_nama || "—"}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_jadi}</TableCell>
                <TableCell className="font-semibold">{r.grade || "—"}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto_beli)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.netto_beli)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto_jual)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.netto_jual)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.harga_beli)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.total_harga_beli)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.harga_jual)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{rupiah(r.total_harga_jual)}</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${r.selisih < 0 ? "text-red-600" : "text-emerald-700"}`}>{rupiah(r.selisih)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon-sm" onClick={() => setToDelete(r)} data-testid={`out-delete-${r.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={17} className="py-12 text-center text-muted-foreground"><LogOut className="mx-auto mb-2 size-8 opacity-40" />{list.isLoading ? "Memuat..." : "Belum ada data out."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="out" />
      </section>

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Hapus data out ini?" description="Nomor jadi akan dikembalikan ke penjualan." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="out-delete-dialog" />
    </div>
  );
}
