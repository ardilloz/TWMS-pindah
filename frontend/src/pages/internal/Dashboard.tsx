import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, Package, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { apiGet } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { numId, rupiah, whqs } from "@/lib/internal";
import type { DashboardOut } from "@/lib/internal";
import { useWh } from "./InternalLayout";

function Stat({ icon: Icon, label, value }: { icon: typeof Gauge; label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="flex items-center gap-2 text-amber-700"><Icon className="size-5" /><span className="text-xs font-semibold uppercase tracking-wider">{label}</span></div>
      <p className="mt-2 font-mono text-xl font-bold text-amber-950">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const wh = useWh();
  const today = useToday();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [fTanggal, setFTanggal] = useState("");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";
  const q = useQuery({ queryKey: ["dashboard", wh, effFrom, effTo], enabled: !!wh && !!effFrom, queryFn: () => apiGet<DashboardOut>(`/internal/dashboard?${whqs(wh, { date_from: effFrom, date_to: effTo })}`) });
  const d = q.data;
  const t = d?.totals;
  const days = useMemo(() => (d?.days ?? []).filter((x) => fmtDate(x.tanggal).toLowerCase().includes(fTanggal.trim().toLowerCase()) || x.tanggal.includes(fTanggal.trim())), [d, fTanggal]);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Dashboard Ringkasan Harian" />
      <div className="mb-5 grid max-w-md gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="dashboard-date-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><DateField testId="dashboard-date-to" value={effTo} onChange={setTo} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Package} label="Jumlah Koli Hari Ini" value={String(t?.jumlah_koli ?? 0)} />
        <Stat icon={Gauge} label="Total Bruto" value={`${numId(t?.total_bruto ?? 0)} kg`} />
        <Stat icon={Gauge} label="Total Netto" value={`${numId(t?.total_netto ?? 0)} kg`} />
        <Stat icon={Gauge} label="Total Pembelian" value={rupiah(t?.total_pembelian ?? 0)} />
        <Stat icon={Gauge} label="Total Pajak" value={rupiah(t?.total_pajak ?? 0)} />
        <Stat icon={Gauge} label="Total Potongan Kuli" value={rupiah(t?.total_kuli ?? 0)} />
        <Stat icon={Gauge} label="Total Potongan Out" value={rupiah(t?.total_out ?? 0)} />
        <Stat icon={Wallet} label="Total Pembayaran" value={rupiah(t?.total_pembayaran ?? 0)} />
        <Stat icon={Gauge} label="Rata-rata Harga/kg" value={rupiah((t?.total_netto ?? 0) > 0 ? (t!.total_pembelian / t!.total_netto) : 0)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b bg-muted/40 px-5 py-3 font-heading font-semibold">Jumlah Per Kode Seri</div>
          <Table data-testid="dashboard-kode-table">
            <TableHeader><TableRow className="bg-muted/30"><TableHead>Kode</TableHead><TableHead className="text-right">Jumlah Koli</TableHead></TableRow></TableHeader>
            <TableBody>
              {(d?.kode ?? []).map((k) => (<TableRow key={k.kode} data-testid={`dashboard-kode-${k.kode}`}><TableCell className="font-mono font-semibold">{k.kode}</TableCell><TableCell className="text-right font-mono">{k.jumlah}</TableCell></TableRow>))}
              {(!d || d.kode.length === 0) && <TableRow><TableCell colSpan={2} className="py-8 text-center text-muted-foreground">{q.isLoading ? "Memuat..." : "Belum ada data."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
        <section className="overflow-x-auto rounded-2xl border bg-white">
          <div className="border-b bg-muted/40 px-5 py-3 font-heading font-semibold">Ringkasan Per Hari</div>
          <Table data-testid="dashboard-days-table">
            <TableHeader>
              <TableRow className="bg-muted/30"><TableHead>Tanggal</TableHead><TableHead className="text-right">Koli</TableHead><TableHead className="text-right">Bruto</TableHead><TableHead className="text-right">Netto</TableHead><TableHead className="text-right">Pembelian</TableHead><TableHead className="text-right">Pembayaran</TableHead></TableRow>
              <TableRow><TableHead className="pb-2"><Input value={fTanggal} onChange={(e) => setFTanggal(e.target.value)} placeholder="filter tgl" className="h-7 text-xs" data-testid="dashboard-day-filter" /></TableHead><TableHead colSpan={5}></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {days.map((x) => (
                <TableRow key={x.tanggal} data-testid={`dashboard-day-${x.tanggal}`}>
                  <TableCell>{fmtDate(x.tanggal)}</TableCell>
                  <TableCell className="text-right font-mono">{x.jumlah_koli}</TableCell>
                  <TableCell className="text-right font-mono">{numId(x.total_bruto)}</TableCell>
                  <TableCell className="text-right font-mono">{numId(x.total_netto)}</TableCell>
                  <TableCell className="text-right font-mono">{rupiah(x.total_pembelian)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{rupiah(x.total_pembayaran)}</TableCell>
                </TableRow>
              ))}
              {days.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{q.isLoading ? "Memuat..." : "Belum ada data."}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  );
}
