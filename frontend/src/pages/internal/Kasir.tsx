import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { DateField } from "@/components/DateField";
import { Paginator, Toolbar } from "@/components/internal/Paginator";
import { apiGet, apiPost } from "@/lib/api";
import { errMsg, fmtDate, fmtLongDate } from "@/lib/format";
import { useToday, useWarehouses } from "@/lib/queries";
import { numId, rupiah, usePaged, whqs, fileUrl } from "@/lib/internal";
import type { KasirItem, KasirNota } from "@/lib/internal";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { useWh } from "./InternalLayout";

function fmtPrinted(iso: string): string {
  try { return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
}
const koliBruto = (items: KasirItem[]) => items.reduce((s, i) => s + (i.bruto || 0), 0);
const koliNetto = (items: KasirItem[]) => items.reduce((s, i) => s + (i.netto || 0), 0);

function NotaView({ nota, logoUrl }: { nota: KasirNota; logoUrl?: string }) {
  return (
    <div>
      <div className="mb-3 flex items-start justify-between border-b pb-3">
        <div>
          <h3 className="font-heading text-xl font-bold">Nota Pembayaran {nota.warehouse_nama}</h3>
          <p className="text-sm text-muted-foreground">Kupon: <span className="font-mono font-semibold text-foreground">{nota.label}</span></p>
          {nota.bandul_nama && <p className="text-sm text-muted-foreground">Bandul: {nota.bandul_nama}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-16 max-w-[160px] object-contain" data-testid="nota-logo" />}
          {nota.printed_by && <div className="text-xs text-muted-foreground"><p>Dicetak oleh</p><p className="font-semibold text-foreground">{nota.printed_by}</p></div>}
        </div>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead className="w-10">No</TableHead><TableHead>Nomor Seri</TableHead><TableHead className="text-right">Harga/kg</TableHead><TableHead className="text-right">Bruto (kg)</TableHead><TableHead className="text-right">Netto (kg)</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
        <TableBody>
          {nota.items.map((it, i) => (
            <TableRow key={`${it.nomor_seri}-${i}`}>
              <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="font-mono">{it.nomor_seri}</TableCell>
              <TableCell className="text-right font-mono">{rupiah(it.harga)}</TableCell>
              <TableCell className="text-right font-mono">{numId(it.bruto)}</TableCell>
              <TableCell className="text-right font-mono">{numId(it.netto)}</TableCell>
              <TableCell className="text-right font-mono">{rupiah(it.subtotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <Line label="Total Harga" value={rupiah(nota.total_harga)} bold />
        <Line label={`Pajak (${nota.total_harga > 0 ? (nota.pajak / nota.total_harga * 100).toLocaleString("id-ID", { maximumFractionDigits: 3 }) : "0"}%)`} value={`- ${rupiah(nota.pajak)}`} />
        <Line label={`Potongan Kuli (${nota.jumlah_kuli})`} value={`- ${rupiah(nota.total_potongan_kuli)}`} />
        <Line label={`Potongan Out (${nota.jumlah_out})`} value={`- ${rupiah(nota.total_out)}`} />
        <div className="mt-2 border-t pt-2"><Line label="Total Pembayaran" value={rupiah(nota.total_pembayaran)} bold big /></div>
      </div>
      <div className="mt-8 text-left text-xs text-muted-foreground">
        <p>Tanggal: {fmtLongDate(nota.tanggal_beli)}</p>
        <p>Dicetak: {new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })}</p>
      </div>
    </div>
  );
}
function Line({ label, value, bold, big }: { label: string; value: string; bold?: boolean; big?: boolean }) {
  return <div className="flex items-center justify-between gap-6"><span className={bold ? "font-semibold" : "text-muted-foreground"}>{label}</span><span className={`font-mono ${bold ? "font-bold" : ""} ${big ? "text-lg text-amber-800" : ""}`}>{value}</span></div>;
}
function SumCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono text-base font-bold text-amber-950">{value}</p></div>;
}

export default function Kasir() {
  const wh = useWh();
  const qc = useQueryClient();
  const today = useToday();
  const whs = useWarehouses();
  const logo = (() => { const w = whs.data?.find((x) => x.id === wh); return w?.logo_url ? fileUrl(w.logo_url) : ""; })();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";
  const notas = useQuery({ queryKey: ["kasir", wh, effFrom, effTo], enabled: !!wh && !!effFrom, queryFn: () => apiGet<KasirNota[]>(`/internal/kasir?${whqs(wh, { date_from: effFrom, date_to: effTo })}`) });
  const [qKupon, setQKupon] = useState("");
  const [qBandul, setQBandul] = useState("");
  const [detail, setDetail] = useState<KasirNota | null>(null);
  const [printing, setPrinting] = useState<KasirNota | null>(null);

  const printMut = useMutation({
    mutationFn: (nomor_kupon: string) => apiPost<KasirNota>(`/internal/kasir/print?${whqs(wh)}`, { nomor_kupon }),
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["kasir", wh] }); setPrinting(n); },
    onError: (e) => toast.error(errMsg(e)),
  });

  useEffect(() => {
    if (!printing) return;
    const t = setTimeout(() => { window.print(); setPrinting(null); }, 250);
    return () => clearTimeout(t);
  }, [printing]);

  const filtered = useMemo(() => (notas.data ?? []).filter((n) => n.label.toLowerCase().includes(qKupon.trim().toLowerCase()) && n.bandul_nama.toLowerCase().includes(qBandul.trim().toLowerCase())), [notas.data, qKupon, qBandul]);
  const augmented = useMemo(() => filtered.map((n) => ({ ...n, _koli: n.items.length, _bruto: koliBruto(n.items), _netto: koliNetto(n.items), _status: n.printed_at || "" })), [filtered]);
  const sort = useSort(augmented);
  const paged = usePaged(sort.sorted, 100);

  const sum = useMemo(() => {
    const s = { koli: 0, bruto: 0, netto: 0, harga: 0, pajak: 0, tk: 0, to: 0, bayar: 0 };
    for (const n of filtered) {
      s.koli += n.items.length; s.bruto += koliBruto(n.items); s.netto += koliNetto(n.items);
      s.harga += n.total_harga; s.pajak += n.pajak; s.tk += n.total_potongan_kuli; s.to += n.total_out; s.bayar += n.total_pembayaran;
    }
    return s;
  }, [filtered]);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Kasir" />
      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="kasir-date-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><DateField testId="kasir-date-to" value={effTo} onChange={setTo} /></div>
        <div className="space-y-1.5"><Label>Cari Nomor Kupon</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="kasir-search-kupon" className="pl-8" value={qKupon} onChange={(e) => { setQKupon(e.target.value); paged.setPage(1); }} /></div></div>
        <div className="space-y-1.5"><Label>Cari Nama Bandul</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="kasir-search-bandul" className="pl-8" value={qBandul} onChange={(e) => { setQBandul(e.target.value); paged.setPage(1); }} /></div></div>
      </Toolbar>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" data-testid="kasir-summary">
        <SumCard label="Total Koli" value={numId(sum.koli, 0)} />
        <SumCard label="Total Bruto (kg)" value={numId(sum.bruto)} />
        <SumCard label="Total Netto (kg)" value={numId(sum.netto)} />
        <SumCard label="Total Harga" value={rupiah(sum.harga)} />
        <SumCard label="Total Pajak" value={rupiah(sum.pajak)} />
        <SumCard label="Pot. Kuli" value={rupiah(sum.tk)} />
        <SumCard label="Pot. Out" value={rupiah(sum.to)} />
        <SumCard label="Total Pembayaran" value={rupiah(sum.bayar)} />
      </div>

      <section className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="kasir-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tanggal" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Kupon" sortKey="label" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
            <SortHead label="Total Koli" sortKey="_koli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Bruto" sortKey="_bruto" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Netto" sortKey="_netto" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Harga" sortKey="total_harga" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Pajak" sortKey="pajak" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Pot. Kuli" sortKey="total_potongan_kuli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Pot. Out" sortKey="total_out" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Total Pembayaran" sortKey="total_pembayaran" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Status Cetak" sortKey="_status" state={sort} onToggle={sort.toggle} />
            <TableHead className="text-right">Aksi</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((n) => (
              <TableRow key={n.nomor_kupon} data-testid={`kasir-row-${n.nomor_kupon}`}>
                <TableCell>{fmtDate(n.tanggal_beli)}</TableCell>
                <TableCell className="font-mono font-semibold">{n.label}</TableCell>
                <TableCell>{n.bandul_nama || "—"}</TableCell>
                <TableCell className="text-right font-mono">{n.items.length}</TableCell>
                <TableCell className="text-right font-mono">{numId(koliBruto(n.items))}</TableCell>
                <TableCell className="text-right font-mono">{numId(koliNetto(n.items))}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(n.total_harga)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(n.pajak)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(n.total_potongan_kuli)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(n.total_out)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{rupiah(n.total_pembayaran)}</TableCell>
                <TableCell className="text-xs" data-testid={`kasir-print-status-${n.nomor_kupon}`}>{n.printed_at ? `${fmtPrinted(n.printed_at)} · ${n.printed_by}` : <span className={n.can_print ? "text-muted-foreground" : "font-semibold text-red-600"}>{n.can_print ? "Belum dicetak" : "Periksa kembali"}</span>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => setDetail(n)} data-testid={`kasir-detail-${n.nomor_kupon}`} aria-label="Detail"><Eye className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => printMut.mutate(n.nomor_kupon)} disabled={printMut.isPending || !n.can_print} title={n.can_print ? "Cetak" : "Ada bruto < 5kg"} data-testid={`kasir-print-${n.nomor_kupon}`} aria-label="Cetak"><Printer className="size-4 text-amber-700" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={13} className="py-12 text-center text-muted-foreground" data-testid="kasir-empty">{notas.isLoading ? "Memuat..." : "Belum ada transaksi untuk ditagih."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="kasir" />
      </section>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" data-testid="kasir-detail-dialog">
          <DialogHeader><DialogTitle>Detail Nota</DialogTitle></DialogHeader>
          {detail && (
            <div>
              <NotaView nota={detail} logoUrl={logo} />
              <div className="mt-4 flex justify-end"><Button onClick={() => printMut.mutate(detail.nomor_kupon)} disabled={!detail.can_print} title={detail.can_print ? "Cetak" : "Ada bruto < 5kg"} data-testid="kasir-detail-print"><Printer className="size-4" /> Cetak Nota</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {printing && <div id="nota-print" className="hidden print:block"><NotaView nota={printing} logoUrl={logo} /></div>}
    </div>
  );
}
