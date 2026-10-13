import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, Boxes, Download, Gauge, Scale, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { Paginator } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiGet } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { numId, rupiah, usePaged, whqs, downloadXlsx } from "@/lib/internal";
import type { SisaStockRow } from "@/lib/internal";
import { useWh } from "./InternalLayout";

function serialCode(s: string): string {
  const m = (s || "").trim().match(/^([A-Za-z]*)/);
  return m && m[1] ? m[1].toUpperCase() : "POLOS";
}
function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-white px-5 py-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Icon className="size-5" /></div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-heading text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function SisaStock() {
  const wh = useWh();
  const [qSeri, setQSeri] = useState("");
  const [qBandul, setQBandul] = useState("");
  const params = useMemo(() => ({ q_seri: qSeri, q_bandul: qBandul }), [qSeri, qBandul]);
  const rows = useQuery({ queryKey: ["sisa-stock", wh, params], enabled: !!wh, queryFn: () => apiGet<SisaStockRow[]>(`/internal/sisa-stock?${whqs(wh, params)}`) });  const data = rows.data ?? [];
  const sort = useSort<SisaStockRow>(data);
  const paged = usePaged(sort.sorted, 100);

  const totals = useMemo(() => {
    let bruto = 0, netto = 0, pembelian = 0;
    for (const r of data) {
      bruto += r.bruto_busai ?? r.bruto_beli ?? 0;
      netto += r.netto_busai ?? r.netto_beli ?? 0;
      pembelian += (r.harga_beli || 0) * (r.netto_beli ?? 0);
    }
    return { jumlah: data.length, bruto, netto, pembelian, avg: netto > 0 ? pembelian / netto : 0 };
  }, [data]);

  const kode = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of data) { const k = serialCode(r.nomor_seri); m[k] = (m[k] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data]);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Sisa Stock" actions={<Button variant="outline" onClick={() => downloadXlsx(`/internal/sisa-stock/export?${whqs(wh, params)}`).catch(() => toast.error("Gagal mengunduh"))} data-testid="sisa-export-button"><Download className="size-4" /> Export Excel</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat icon={Boxes} label="Jumlah Koli" value={numId(totals.jumlah, 0)} />
        <Stat icon={Scale} label="Jumlah Bruto Stock (kg)" value={numId(totals.bruto)} />
        <Stat icon={Scale} label="Jumlah Netto Stock (kg)" value={numId(totals.netto)} />
        <Stat icon={Wallet} label="Jumlah Total Pembelian" value={rupiah(totals.pembelian)} />
        <Stat icon={Gauge} label="Rata-rata Harga/kg" value={rupiah(totals.avg)} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 md:max-w-xl">
            <div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="sisa-search-seri" className="pl-8" value={qSeri} onChange={(e) => { setQSeri(e.target.value); paged.setPage(1); }} placeholder="Cari nomor seri" /></div>
            <div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="sisa-search-bandul" className="pl-8" value={qBandul} onChange={(e) => { setQBandul(e.target.value); paged.setPage(1); }} placeholder="Cari nama bandul" /></div>
          </div>
          <section className="overflow-x-auto rounded-2xl border bg-white">
            <Table data-testid="sisa-table">
              <TableHeader><TableRow className="bg-muted/60">
                <SortHead label="Tgl Beli" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
                <SortHead label="Kupon" sortKey="nomor_kupon" state={sort} onToggle={sort.toggle} />
                <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
                <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
                <SortHead label="Bruto" sortKey="bruto_beli" state={sort} onToggle={sort.toggle} align="right" />
                <SortHead label="Netto" sortKey="netto_beli" state={sort} onToggle={sort.toggle} align="right" />
                <SortHead label="Harga Beli" sortKey="harga_beli" state={sort} onToggle={sort.toggle} align="right" />
                <TableHead className="text-right">Total Harga Beli</TableHead>
                <SortHead label="Bruto Busai" sortKey="bruto_busai" state={sort} onToggle={sort.toggle} align="right" />
                <SortHead label="Netto Busai" sortKey="netto_busai" state={sort} onToggle={sort.toggle} align="right" />
                <SortHead label="Keterangan" sortKey="keterangan" state={sort} onToggle={sort.toggle} />
              </TableRow></TableHeader>
              <TableBody>
                {paged.slice.map((r, i) => (
                  <TableRow key={`${r.nomor_seri}-${i}`} data-testid={`sisa-row-${i}`}>
                    <TableCell>{fmtDate(r.tanggal_beli)}</TableCell>
                    <TableCell className="font-mono">{r.nomor_kupon || "—"}</TableCell>
                    <TableCell>{r.bandul_nama || "—"}</TableCell>
                    <TableCell className="font-mono font-semibold">{r.nomor_seri}</TableCell>
                    <TableCell className="text-right font-mono">{numId(r.bruto_busai ?? r.bruto_beli)}</TableCell>
                    <TableCell className="text-right font-mono">{numId(r.netto_busai ?? r.netto_beli)}</TableCell>
                    <TableCell className="text-right font-mono">{rupiah(r.harga_beli)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{rupiah((r.harga_beli || 0) * (r.netto_beli ?? 0))}</TableCell>
                    <TableCell className="text-right font-mono">{numId(r.bruto_busai)}</TableCell>
                    <TableCell className="text-right font-mono">{numId(r.netto_busai)}</TableCell>
                    <TableCell>{r.keterangan || "—"}</TableCell>
                  </TableRow>
                ))}
                {data.length === 0 && <TableRow><TableCell colSpan={11} className="py-12 text-center text-muted-foreground"><Archive className="mx-auto mb-2 size-8 opacity-40" />{rows.isLoading ? "Memuat..." : "Tidak ada sisa stock."}</TableCell></TableRow>}
              </TableBody>
            </Table>
            <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="sisa" />
          </section>
        </div>

        <section className="order-1 h-fit overflow-hidden rounded-2xl border bg-white lg:order-2">
          <div className="border-b bg-muted/40 px-5 py-3 font-heading font-semibold">Jumlah Per Kode Seri</div>
          <Table data-testid="sisa-kode-table">
            <TableHeader><TableRow className="bg-muted/30"><TableHead>Kode</TableHead><TableHead className="text-right">Jumlah Koli</TableHead></TableRow></TableHeader>
            <TableBody>
              {kode.map(([k, v]) => (<TableRow key={k} data-testid={`sisa-kode-${k}`}><TableCell className="font-mono font-semibold">{k}</TableCell><TableCell className="text-right font-mono">{v}</TableCell></TableRow>))}
              {kode.length === 0 && <TableRow><TableCell colSpan={2} className="py-8 text-center text-muted-foreground">{rows.isLoading ? "Memuat..." : "Belum ada data."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
