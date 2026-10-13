import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { SimpleSelect } from "@/components/SimpleSelect";
import { Paginator, Toolbar } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiGet } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { numId, usePaged, whqs, downloadXlsx } from "@/lib/internal";
import type { DetailBusaiRow } from "@/lib/internal";
import { useWh } from "./InternalLayout";

const JENIS_OPTS = [
  { value: "ALL", label: "Semua Jenis" },
  { value: "BUSAI CC", label: "Busai CC" },
  { value: "BUSAI SERI", label: "Busai Seri" },
];

export default function DetailKoliBusai() {
  const wh = useWh();
  const today = useToday();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qSeri, setQSeri] = useState("");
  const [fJenis, setFJenis] = useState("ALL");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";
  const params = useMemo(() => ({ date_from: effFrom, date_to: effTo, q_seri: qSeri }), [effFrom, effTo, qSeri]);
  const rows = useQuery({ queryKey: ["detail-koli-cc", wh, params], enabled: !!wh && !!effFrom, queryFn: () => apiGet<DetailBusaiRow[]>(`/internal/detail-koli-cc?${whqs(wh, params)}`) });
  const data = useMemo(() => (rows.data ?? []).filter((r) => fJenis === "ALL" || r.jenis === fJenis), [rows.data, fJenis]);
  const sort = useSort<DetailBusaiRow>(data);
  const paged = usePaged(sort.sorted, 100);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Detail Koli Busai" actions={<Button variant="outline" onClick={() => downloadXlsx(`/internal/detail-koli-cc/export?${whqs(wh, params)}`).catch(() => toast.error("Gagal mengunduh"))} data-testid="dkb-export-button"><Download className="size-4" /> Export Excel</Button>} />
      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="dkb-date-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><DateField testId="dkb-date-to" value={effTo} onChange={setTo} /></div>
        <div className="space-y-1.5"><Label>Cari Nomor Seri</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="dkb-search-seri" className="pl-8" value={qSeri} onChange={(e) => setQSeri(e.target.value)} /></div></div>
        <div className="space-y-1.5"><Label>Filter Jenis</Label><SimpleSelect value={fJenis} onChange={setFJenis} placeholder="Semua Jenis" testId="dkb-filter-jenis" options={JENIS_OPTS} /></div>
      </Toolbar>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="dkb-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tgl Busai" sortKey="tanggal_busai" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
            <SortHead label="Jenis" sortKey="jenis" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bruto Beli" sortKey="bruto_beli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Netto Beli" sortKey="netto_beli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Bruto Busai" sortKey="bruto_busai" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Netto Busai" sortKey="netto_busai" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead>Keterangan</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((r, i) => (
              <TableRow key={`${r.nomor_seri}-${i}`} data-testid={`dkb-row-${i}`}>
                <TableCell>{r.tanggal_busai ? fmtDate(r.tanggal_busai) : "—"}</TableCell>
                <TableCell className="font-mono font-semibold">{r.nomor_seri}</TableCell>
                <TableCell><span className={`rounded px-2 py-0.5 text-xs font-semibold ${r.jenis === "BUSAI CC" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>{r.jenis}</span></TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto_beli)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.netto_beli)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.bruto_busai)}</TableCell>
                <TableCell className="text-right font-mono">{numId(r.netto_busai)}</TableCell>
                <TableCell>{r.keterangan || "—"}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{rows.isLoading ? "Memuat..." : "Belum ada data busai."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="dkb" />
      </section>
    </div>
  );
}
