import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, PackageOpen, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { Paginator } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { MAX_BRUTO, numId, rupiah, usePaged, whqs } from "@/lib/internal";
import type { Busai, BusaiInfo } from "@/lib/internal";
import { useWh } from "./InternalLayout";

export default function BusaiPage() {
  const wh = useWh();
  const qc = useQueryClient();
  const today = useToday();
  const list = useQuery({ queryKey: ["busai", wh], enabled: !!wh, queryFn: () => apiGet<Busai[]>(`/internal/busai?${whqs(wh)}`) });
  const [bongkarOpen, setBongkarOpen] = useState(false);
  const [ccOpen, setCcOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["busai", wh] });
    qc.invalidateQueries({ queryKey: ["detail-koli-cc", wh] });
    qc.invalidateQueries({ queryKey: ["sisa-stock", wh] });
  };

  const all = list.data ?? [];
  const inRange = (d: string | null) => !d || ((!effFrom || d >= effFrom) && (!effTo || d <= effTo));
  const bongkarList = useMemo(() => all.filter((b) => b.status === "bongkar"), [all]);
  const ccList = useMemo(() => all.filter((b) => b.status === "cc" && inRange(b.tanggal_busai)), [all, effFrom, effTo]);
  const bungkusList = useMemo(() => all.filter((b) => b.status === "bungkus" && inRange(b.tanggal_busai)), [all, effFrom, effTo]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Internal" title="Busai" actions={<>
        <Button variant="outline" onClick={() => setBongkarOpen(true)} data-testid="busai-koli-button"><PackageOpen className="size-4" /> Bongkar Koli</Button>
        <Button variant="outline" onClick={() => setCcOpen(true)} data-testid="busai-cc-button"><Boxes className="size-4" /> Busai CC</Button>
      </>} />
      <div className="grid gap-3 sm:grid-cols-2 md:max-w-md">
        <div className="space-y-1.5"><Label>Dari Tanggal</Label><DateField testId="busai-date-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai Tanggal</Label><DateField testId="busai-date-to" value={effTo} onChange={setTo} /></div>
      </div>

      <BongkarTable wh={wh} rows={bongkarList} loading={list.isLoading} onDone={invalidate} />
      <CCTable wh={wh} rows={ccList} loading={list.isLoading} onDone={invalidate} />
      <BungkusTable wh={wh} rows={bungkusList} loading={list.isLoading} onDone={invalidate} />

      {bongkarOpen && <BongkarDialog wh={wh} onClose={() => setBongkarOpen(false)} onDone={invalidate} />}
      {ccOpen && <CCDialog wh={wh} onClose={() => setCcOpen(false)} onDone={invalidate} />}
    </div>
  );
}

function BongkarTable({ wh, rows, loading, onDone }: { wh: string; rows: Busai[]; loading: boolean; onDone: () => void }) {
  const [brutos, setBrutos] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Busai | null>(null);
  const sort = useSort<Busai>(rows);
  const paged = usePaged(sort.sorted, 100);
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/busai/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Data dihapus"); setToDelete(null); onDone(); }, onError: (e) => toast.error(errMsg(e)) });
  const bungkus = useMutation({
    mutationFn: (b: { nomor_seri: string; bruto: number }) => apiPost(`/internal/busai/bungkus?${whqs(wh)}`, b),
    onSuccess: () => { toast.success("Koli dibungkus"); onDone(); }, onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <section className="overflow-x-auto rounded-2xl border bg-white">
      <div className="border-b bg-amber-50 px-5 py-3 font-heading font-semibold text-amber-900">Nomor Seri Sedang Dibongkar ({rows.length})</div>
      <Table data-testid="busai-bongkar-table">
        <TableHeader><TableRow className="bg-muted/30">
          <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
          <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
          <SortHead label="Tgl Beli" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
          <SortHead label="Bruto Beli" sortKey="bruto_beli" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Keterangan" sortKey="keterangan" state={sort} onToggle={sort.toggle} />
          <TableHead>Bruto Busai (kg)</TableHead>
          <TableHead className="w-28"></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {paged.slice.map((b) => (
            <TableRow key={b.id} data-testid={`busai-bongkar-row-${b.nomor_seri}`}>
              <TableCell className="font-mono font-semibold">{b.nomor_seri}</TableCell>
              <TableCell>{b.bandul_nama || "—"}</TableCell>
              <TableCell>{b.tanggal_beli ? fmtDate(b.tanggal_beli) : "—"}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.bruto_beli)}</TableCell>
              <TableCell>{b.keterangan || "—"}</TableCell>
              <TableCell><Input data-testid={`busai-bungkus-bruto-${b.nomor_seri}`} type="number" max={MAX_BRUTO} className="w-24" value={brutos[b.nomor_seri] ?? ""} onChange={(e) => setBrutos((m) => ({ ...m, [b.nomor_seri]: e.target.value }))} placeholder={numId(b.bruto_beli)} /></TableCell>
              <TableCell><div className="flex items-center justify-end gap-1"><Button size="sm" onClick={() => { const v = Number(brutos[b.nomor_seri] ?? b.bruto_beli ?? 0); if (!(v > 0) || v > MAX_BRUTO) return toast.error(`Bruto 0-${MAX_BRUTO} kg`); bungkus.mutate({ nomor_seri: b.nomor_seri, bruto: v }); }} disabled={bungkus.isPending} data-testid={`busai-bungkus-submit-${b.nomor_seri}`}>Bungkus</Button><Button variant="ghost" size="icon-sm" onClick={() => setToDelete(b)} data-testid={`busai-bongkar-delete-${b.nomor_seri}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></div></TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">{loading ? "Memuat..." : "Tidak ada koli yang sedang dibongkar."}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="busai-bongkar" />
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Hapus data busai ini?" description={`Nomor seri ${toDelete?.nomor_seri} akan dibatalkan dari proses busai.`} onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="busai-bongkar-delete-dialog" />
    </section>
  );
}

function CCTable({ wh, rows, loading, onDone }: { wh: string; rows: Busai[]; loading: boolean; onDone: () => void }) {
  const sort = useSort<Busai>(rows);
  const paged = usePaged(sort.sorted, 100);
  const [edit, setEdit] = useState<Busai | null>(null);
  const [toDelete, setToDelete] = useState<Busai | null>(null);
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/busai/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Data dihapus"); setToDelete(null); onDone(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <section className="overflow-x-auto rounded-2xl border bg-white">
      <div className="border-b bg-sky-50 px-5 py-3 font-heading font-semibold text-sky-900">Busai CC Sudah Diinput ({rows.length})</div>
      <Table data-testid="busai-cc-table">
        <TableHeader><TableRow className="bg-muted/30">
          <SortHead label="Tgl Busai" sortKey="tanggal_busai" state={sort} onToggle={sort.toggle} />
          <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
          <SortHead label="Bruto Busai" sortKey="bruto_busai" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Netto Busai" sortKey="netto_busai" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Keterangan" sortKey="keterangan" state={sort} onToggle={sort.toggle} />
          <TableHead className="w-16 text-right">Aksi</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {paged.slice.map((b) => (
            <TableRow key={b.id} data-testid={`busai-cc-row-${b.nomor_seri}`}>
              <TableCell>{b.tanggal_busai ? fmtDate(b.tanggal_busai) : "—"}</TableCell>
              <TableCell className="font-mono font-semibold">{b.nomor_seri}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.bruto_busai)}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.netto_busai)}</TableCell>
              <TableCell>{b.keterangan || "—"}</TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="icon-sm" onClick={() => setEdit(b)} data-testid={`busai-cc-edit-${b.nomor_seri}`} aria-label="Edit"><Pencil className="size-4" /></Button><Button variant="ghost" size="icon-sm" onClick={() => setToDelete(b)} data-testid={`busai-cc-delete-${b.nomor_seri}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{loading ? "Memuat..." : "Belum ada Busai CC."}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="busai-cc" />
      {edit && <EditBusaiDialog wh={wh} item={edit} onClose={() => setEdit(null)} onDone={onDone} />}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Hapus Busai CC ini?" description={`Nomor seri ${toDelete?.nomor_seri} akan dihapus permanen.`} onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="busai-cc-delete-dialog" />
    </section>
  );
}

function BungkusTable({ wh, rows, loading, onDone }: { wh: string; rows: Busai[]; loading: boolean; onDone: () => void }) {
  const sort = useSort<Busai>(rows);
  const paged = usePaged(sort.sorted, 100);
  const [edit, setEdit] = useState<Busai | null>(null);
  const [toDelete, setToDelete] = useState<Busai | null>(null);
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/busai/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Data dihapus"); setToDelete(null); onDone(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <section className="overflow-x-auto rounded-2xl border bg-white">
      <div className="border-b bg-emerald-50 px-5 py-3 font-heading font-semibold text-emerald-900">Nomor Seri Sudah Dibungkus ({rows.length})</div>
      <Table data-testid="busai-bungkus-table">
        <TableHeader><TableRow className="bg-muted/30">
          <SortHead label="Tgl Beli" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
          <SortHead label="Tgl Busai" sortKey="tanggal_busai" state={sort} onToggle={sort.toggle} />
          <SortHead label="Nomor Seri" sortKey="nomor_seri" state={sort} onToggle={sort.toggle} />
          <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
          <SortHead label="Harga Beli" sortKey="harga_beli" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Bruto Beli" sortKey="bruto_beli" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Netto Beli" sortKey="netto_beli" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Bruto Busai" sortKey="bruto_busai" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Netto Busai" sortKey="netto_busai" state={sort} onToggle={sort.toggle} align="right" />
          <SortHead label="Keterangan" sortKey="keterangan" state={sort} onToggle={sort.toggle} />
          <TableHead className="w-16 text-right">Aksi</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {paged.slice.map((b) => (
            <TableRow key={b.id} data-testid={`busai-bungkus-row-${b.nomor_seri}`}>
              <TableCell>{b.tanggal_beli ? fmtDate(b.tanggal_beli) : "—"}</TableCell>
              <TableCell>{b.tanggal_busai ? fmtDate(b.tanggal_busai) : "—"}</TableCell>
              <TableCell className="font-mono font-semibold">{b.nomor_seri}</TableCell>
              <TableCell>{b.bandul_nama || "—"}</TableCell>
              <TableCell className="text-right font-mono">{rupiah(b.harga_beli)}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.bruto_beli)}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.netto_beli)}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.bruto_busai)}</TableCell>
              <TableCell className="text-right font-mono">{numId(b.netto_busai)}</TableCell>
              <TableCell>{b.keterangan || "—"}</TableCell>
              <TableCell className="text-right"><Button variant="ghost" size="icon-sm" onClick={() => setEdit(b)} data-testid={`busai-bungkus-edit-${b.nomor_seri}`} aria-label="Edit"><Pencil className="size-4" /></Button><Button variant="ghost" size="icon-sm" onClick={() => setToDelete(b)} data-testid={`busai-bungkus-delete-${b.nomor_seri}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">{loading ? "Memuat..." : "Belum ada hasil bungkus."}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="busai-bungkus" />
      {edit && <EditBusaiDialog wh={wh} item={edit} onClose={() => setEdit(null)} onDone={onDone} />}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Hapus hasil bungkus ini?" description={`Nomor seri ${toDelete?.nomor_seri} akan dihapus permanen.`} onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="busai-bungkus-delete-dialog" />
    </section>
  );
}

function EditBusaiDialog({ wh, item, onClose, onDone }: { wh: string; item: Busai; onClose: () => void; onDone: () => void }) {
  const [bruto, setBruto] = useState(item.bruto_busai != null ? String(item.bruto_busai) : "");
  const [keterangan, setKeterangan] = useState(item.keterangan ?? "");
  const save = useMutation({
    mutationFn: () => apiPut(`/internal/busai/${item.id}?${whqs(wh)}`, { bruto: Number(bruto), keterangan }),
    onSuccess: () => { toast.success("Busai diperbarui"); onDone(); onClose(); }, onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="busai-edit-dialog">
        <DialogHeader><DialogTitle>Edit Busai · {item.nomor_seri}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const b = Number(bruto); if (!(b > 0) || b > MAX_BRUTO) return toast.error(`Bruto 0-${MAX_BRUTO} kg`); save.mutate(); }}>
          <div className="space-y-1.5"><Label>Bruto Busai (kg)</Label><Input data-testid="busai-edit-bruto" type="number" max={MAX_BRUTO} value={bruto} onChange={(e) => setBruto(e.target.value)} /><p className="text-xs text-muted-foreground">Netto: {bruto ? numId(Number(bruto) - 2) : "—"} kg</p></div>
          <div className="space-y-1.5"><Label>Keterangan</Label><Input data-testid="busai-edit-keterangan" className="uppercase placeholder:normal-case" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Keterangan" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={save.isPending} data-testid="busai-edit-submit">Simpan</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BongkarDialog({ wh, onClose, onDone }: { wh: string; onClose: () => void; onDone: () => void }) {
  const [seri, setSeri] = useState("");
  const [info, setInfo] = useState<BusaiInfo | null>(null);
  const lookup = async () => { const s = seri.trim().toUpperCase(); if (!s) return; try { setInfo(await apiGet<BusaiInfo>(`/internal/busai/info?${whqs(wh, { seri: s })}`)); } catch (e) { setInfo(null); toast.error(errMsg(e)); } };
  const bongkar = useMutation({ mutationFn: () => apiPost(`/internal/busai/bongkar?${whqs(wh)}`, { nomor_seri: seri.trim() }), onSuccess: () => { toast.success("Koli dibongkar"); onDone(); onClose(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="bongkar-dialog">
        <DialogHeader><DialogTitle>Busai Koli (Bongkar)</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nomor Seri</Label><div className="flex gap-2"><Input data-testid="bongkar-seri-input" className="uppercase" value={seri} onChange={(e) => setSeri(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void lookup(); } }} placeholder="Nomor seri yang dibeli" /><Button type="button" variant="outline" onClick={lookup} data-testid="bongkar-lookup-button">Cek</Button></div></div>
          {info && <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="bongkar-info"><p>Bandul: <b>{info.bandul_nama || "—"}</b></p><p>Tanggal Beli: {info.tanggal_beli ? fmtDate(info.tanggal_beli) : "—"}</p><p>Harga Beli: {rupiah(info.harga_beli)}</p><p>Bruto/Netto Beli: {numId(info.bruto_beli)} / {numId(info.netto_beli)} kg</p><p>Keterangan: <b>{info.keterangan_beli || "—"}</b></p>{info.busai_status && <p className="text-amber-700">Status busai: {info.busai_status}</p>}</div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Batal</Button><Button onClick={() => bongkar.mutate()} disabled={bongkar.isPending || !info} data-testid="bongkar-submit">Bongkar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CCDialog({ wh, onClose, onDone }: { wh: string; onClose: () => void; onDone: () => void }) {
  const [seri, setSeri] = useState("");
  const [bruto, setBruto] = useState("");
  const cc = useMutation({ mutationFn: () => apiPost(`/internal/busai/cc?${whqs(wh)}`, { nomor_seri: seri.trim(), bruto: Number(bruto) }), onSuccess: () => { toast.success("Busai CC tersimpan"); onDone(); onClose(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="cc-dialog">
        <DialogHeader><DialogTitle>Busai CC</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const b = Number(bruto); if (!seri.trim()) return toast.error("Nomor seri wajib"); if (!(b > 0) || b > MAX_BRUTO) return toast.error(`Bruto 0-${MAX_BRUTO} kg`); cc.mutate(); }}>
          <div className="space-y-1.5"><Label>Nomor Seri CC (baru)</Label><Input data-testid="cc-seri-input" className="uppercase" value={seri} onChange={(e) => setSeri(e.target.value)} placeholder="Nomor seri baru" /></div>
          <div className="space-y-1.5"><Label>Bruto (kg)</Label><Input data-testid="cc-bruto-input" type="number" max={MAX_BRUTO} value={bruto} onChange={(e) => setBruto(e.target.value)} /><p className="text-xs text-muted-foreground">Netto: {bruto ? numId(Number(bruto) - 2) : "—"} kg</p></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Batal</Button><Button type="submit" disabled={cc.isPending} data-testid="cc-submit">Simpan</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
