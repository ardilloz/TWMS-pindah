import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { Paginator, Toolbar } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiGet } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { downloadXlsx, numId, rupiah, usePaged, whqs } from "@/lib/internal";
import type { LaporanPenjualanRow } from "@/lib/internal";
import { useWh } from "./InternalLayout";

function SumCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono text-base font-bold text-amber-950">{value}</p></div>;
}

export default function LaporanPenjualan() {
  const wh = useWh();
  const today = useToday();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [qSeri, setQSeri] = useState("");
  const [qJadi, setQJadi] = useState("");
  const [qBandul, setQBandul] = useState("");
  const effFrom = dateFrom || today.data?.today || "";
  const effTo = dateTo || today.data?.today || "";
  const params = useMemo(() => ({ date_from: effFrom, date_to: effTo, q_seri: qSeri, q_jadi: qJadi, q_bandul: qBandul }), [effFrom, effTo, qSeri, qJadi, qBandul]);
  const rows = useQuery({ queryKey: ["laporan-penjualan", wh, params], enabled: !!wh && !!effFrom, queryFn: () => apiGet<LaporanPenjualanRow[]>(`/internal/laporan-penjualan?${whqs(wh, params)}`) });
  const data = rows.data ?? [];
  const sort = useSort<LaporanPenjualanRow>(data);
  const paged = usePaged(sort.sorted, 100);
  const doExport = async () => { try { await downloadXlsx(`/internal/laporan-penjualan/export?${whqs(wh, params)}`); } catch { toast.error("Gagal mengunduh Excel"); } };

  const sum = useMemo(() => {
    let koli = 0, beli = 0, brutoJ = 0, nettoJ = 0, bayar = 0, selisih = 0;
    for (const r of data) { koli++; beli += r.total_harga_beli; brutoJ += r.bruto_jual; nettoJ += r.netto_jual; bayar += r.total_harga_jual; selisih += r.selisih; }
    return { koli, beli, brutoJ, nettoJ, bayar, selisih, avg: nettoJ > 0 ? bayar / nettoJ : 0 };
  }, [data]);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Laporan Penjualan" actions={<Button variant="outline" onClick={doExport} data-testid="laporan-export-button"><Download className="size-4" /> Export Excel</Button>} />
      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="laporan-date-from" value={effFrom} onChange={setDateFrom} /></div>
        <div className="space-y-1.5"><Label>Tanggal Sampai</Label><DateField testId="laporan-date-to" value={effTo} onChange={setDateTo} /></div>
        <div className="space-y-1.5"><Label>Cari Nomor Seri</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="laporan-search-seri" className="pl-8" value={qSeri} onChange={(e) => setQSeri(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Cari Nomor Jadi</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="laporan-search-jadi" className="pl-8" value={qJadi} onChange={(e) => setQJadi(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Cari Nama Bandul</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="laporan-search-bandul" className="pl-8" value={qBandul} onChange={(e) => setQBandul(e.target.value)} /></div></div>
      </Toolbar>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7" data-testid="laporan-summary">
        <SumCard label="Total Koli" value={numId(sum.koli, 0)} />
        <SumCard label="Total Beli" value={rupiah(sum.beli)} />
        <SumCard label="Bruto Jual (kg)" value={numId(sum.brutoJ)} />
        <SumCard label="Netto Jual (kg)" value={numId(sum.nettoJ)} />
        <SumCard label="Total Pembayaran" value={rupiah(sum.bayar)} />
        <SumCard label="Selisih" value={rupiah(sum.selisih)} />
        <SumCard label="Rata-rata Jual/kg" value={rupiah(sum.avg)} />
      </div>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="laporan-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tgl Beli" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} /><SortHead label="Tgl Jual" sortKey="tanggal_jual" state={sort} onToggle={sort.toggle} /><SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} /><SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} /><SortHead label="Nomor Jadi" sortKey="nomor_jadi" state={sort} onToggle={sort.toggle} /><SortHead label="Grade" sortKey="grade" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bruto Beli" sortKey="bruto_beli" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Netto Beli" sortKey="netto_beli" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Bruto Jual" sortKey="bruto_jual" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Netto Jual" sortKey="netto_jual" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Harga Beli" sortKey="harga_beli" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Total Beli" sortKey="total_harga_beli" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Harga Jual" sortKey="harga_jual" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Total Jual" sortKey="total_harga_jual" state={sort} onToggle={sort.toggle} align="right" /><SortHead label="Selisih" sortKey="selisih" state={sort} onToggle={sort.toggle} align="right" />
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((r, i) => (
              <TableRow key={`${r.nomor_jadi}-${i}`} data-testid={`laporan-row-${i}`}>
                <TableCell>{fmtDate(r.tanggal_beli)}</TableCell><TableCell>{fmtDate(r.tanggal_jual)}</TableCell>
                <TableCell className="font-mono">{r.nomor_seri}</TableCell><TableCell>{r.bandul_nama || "—"}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_jadi}</TableCell><TableCell>{r.grade}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto_beli)}</TableCell><TableCell className="text-right font-mono">{numId(r.netto_beli)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto_jual)}</TableCell><TableCell className="text-right font-mono">{numId(r.netto_jual)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.harga_beli)}</TableCell><TableCell className="text-right font-mono">{rupiah(r.total_harga_beli)}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.harga_jual)}</TableCell><TableCell className="text-right font-mono">{rupiah(r.total_harga_jual)}</TableCell>
                <TableCell className={`text-right font-mono font-semibold ${r.selisih < 0 ? "text-red-600" : "text-emerald-700"}`}>{rupiah(r.selisih)}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={15} className="py-10 text-center text-muted-foreground">{rows.isLoading ? "Memuat..." : "Tidak ada data."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="laporan" />
      </section>
    </div>
  );
}
