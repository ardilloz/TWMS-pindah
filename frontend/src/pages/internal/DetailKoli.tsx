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
import type { DetailKoliRow } from "@/lib/internal";
import { useWh } from "./InternalLayout";

export default function DetailKoli() {
  const wh = useWh();
  const today = useToday();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [qSeri, setQSeri] = useState("");
  const [qKupon, setQKupon] = useState("");
  const [qBandul, setQBandul] = useState("");

  const effFrom = dateFrom || today.data?.today || "";
  const effTo = dateTo || today.data?.today || "";
  const params = useMemo(() => ({ date_from: effFrom, date_to: effTo, q_seri: qSeri, q_kupon: qKupon, q_bandul: qBandul }), [effFrom, effTo, qSeri, qKupon, qBandul]);
  const rows = useQuery({ queryKey: ["detail-koli", wh, params], enabled: !!wh && !!effFrom, queryFn: () => apiGet<DetailKoliRow[]>(`/internal/detail-koli?${whqs(wh, params)}`) });
  const data = rows.data ?? [];
  const sort = useSort<DetailKoliRow>(data);
  const paged = usePaged(sort.sorted, 100);

  const doExport = async () => { try { await downloadXlsx(`/internal/detail-koli/export?${whqs(wh, params)}`); } catch { toast.error("Gagal mengunduh Excel"); } };

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Laporan Pembelian" actions={<Button variant="outline" onClick={doExport} data-testid="detail-export-button"><Download className="size-4" /> Export Excel</Button>} />
      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="detail-date-from" value={effFrom} onChange={(v) => { setDateFrom(v); paged.setPage(1); }} /></div>
        <div className="space-y-1.5"><Label>Tanggal Sampai</Label><DateField testId="detail-date-to" value={effTo} onChange={(v) => { setDateTo(v); paged.setPage(1); }} /></div>
        <div className="space-y-1.5"><Label>Cari Nomor Seri</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="detail-search-seri" className="pl-8" value={qSeri} onChange={(e) => { setQSeri(e.target.value); paged.setPage(1); }} /></div></div>
        <div className="space-y-1.5"><Label>Cari Nomor Kupon</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="detail-search-kupon" className="pl-8" value={qKupon} onChange={(e) => { setQKupon(e.target.value); paged.setPage(1); }} /></div></div>
        <div className="space-y-1.5"><Label>Cari Nama Bandul</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="detail-search-bandul" className="pl-8" value={qBandul} onChange={(e) => { setQBandul(e.target.value); paged.setPage(1); }} /></div></div>
      </Toolbar>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="detail-koli-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tanggal Beli" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Kupon" sortKey="nomor_kupon" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
            <SortHead label="Harga/kg" sortKey="harga" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead className="text-right">Total Harga</TableHead>
            <SortHead label="Bruto" sortKey="bruto" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Netto" sortKey="netto" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead>Keterangan</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((r, i) => (
              <TableRow key={`${r.nomor_seri}-${i}`} data-testid={`detail-row-${i}`}>
                <TableCell>{fmtDate(r.tanggal_beli)}</TableCell>
                <TableCell className="font-mono">{r.nomor_kupon || "—"}</TableCell>
                <TableCell>{r.bandul_nama || "—"}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_seri}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(r.harga)}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{rupiah((r.harga || 0) * (r.netto ?? 0))}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.netto)}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r.keterangan || "—"}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={9} className="py-10 text-center text-muted-foreground">{rows.isLoading ? "Memuat..." : "Tidak ada data."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="detail" />
      </section>
    </div>
  );
}
