import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { isAdmin } from "@/lib/perms";
import { MAX_BRUTO, numId, whqs } from "@/lib/internal";
import type { BeratKoli, BeratLookup, BeratPending } from "@/lib/internal";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { useWh } from "./InternalLayout";

export default function BeratKoliPage() {
  const wh = useWh();
  const qc = useQueryClient();
  const me = useMe();
  const admin = isAdmin(me.data);
  const list = useQuery({ queryKey: ["berat-koli", wh], enabled: !!wh, queryFn: () => apiGet<BeratKoli[]>(`/internal/berat-koli?${whqs(wh)}`) });
  const pending = useQuery({ queryKey: ["berat-pending", wh], enabled: !!wh, queryFn: () => apiGet<BeratPending[]>(`/internal/berat-koli/pending?${whqs(wh)}`) });

  const [nomorSeri, setNomorSeri] = useState("");
  const [bruto, setBruto] = useState("");
  const [existingNote, setExistingNote] = useState<string>("");
  const [lookupInfo, setLookupInfo] = useState<{ bandul: string; ket: string }>({ bandul: "", ket: "" });
  const [showInfo, setShowInfo] = useState(false);
  const seriRef = useRef<HTMLInputElement>(null);
  const brutoRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<BeratKoli | null>(null);
  const [editBruto, setEditBruto] = useState("");
  const [toDelete, setToDelete] = useState<BeratKoli | null>(null);

  const brutoNum = Number(bruto.replace(",", "."));
  const nettoPreview = Number.isFinite(brutoNum) && bruto ? brutoNum - 2 : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["berat-koli", wh] });
    qc.invalidateQueries({ queryKey: ["berat-pending", wh] });
    qc.invalidateQueries({ queryKey: ["kasir", wh] });
  };

  const save = useMutation({
    mutationFn: (b: { nomor_seri: string; bruto: number }) => apiPost<BeratKoli>(`/internal/berat-koli?${whqs(wh)}`, b),
    onSuccess: (r) => {
      toast.success(`Berat ${r.nomor_seri} tersimpan (netto ${numId(r.netto)} kg)`);
      setNomorSeri(""); setBruto(""); setExistingNote(""); setLookupInfo({ bandul: "", ket: "" }); setShowInfo(false);
      invalidate();
      setTimeout(() => seriRef.current?.focus(), 30);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const onSeriEnter = async () => {
    const s = nomorSeri.trim().toUpperCase();
    if (!s) return;
    try {
      const r = await apiGet<BeratLookup>(`/internal/berat-koli/lookup?${whqs(wh, { seri: s })}`);
      if (!r.in_pembelian) { toast.error(`Nomor seri '${s}' belum ada di pembelian`); return; }
      if (r.existing) { setBruto(String(r.existing.bruto)); setExistingNote(`Sudah tersimpan: bruto ${numId(r.existing.bruto)} / netto ${numId(r.existing.netto)} kg`); }
      else setExistingNote("");
      setLookupInfo({ bandul: r.bandul_nama || "", ket: r.keterangan || "" });
      setShowInfo(true);
      setTimeout(() => brutoRef.current?.focus(), 30);
    } catch (e) { toast.error(errMsg(e)); }
  };

  const onBrutoEnter = () => {
    if (!nomorSeri.trim()) return;
    if (!Number.isFinite(brutoNum) || brutoNum <= 0) return toast.error("Bruto harus lebih dari 0");
    if (brutoNum > MAX_BRUTO) return toast.error(`Bruto maksimal ${MAX_BRUTO} kg`);
    save.mutate({ nomor_seri: nomorSeri.trim(), bruto: brutoNum });
  };

  const update = useMutation({
    mutationFn: (b: { nomor_seri: string; bruto: number }) => apiPut<BeratKoli>(`/internal/berat-koli/${editing!.id}?${whqs(wh)}`, b),
    onSuccess: () => { toast.success("Berat diperbarui"); setEditing(null); invalidate(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/berat-koli/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Dihapus"); setToDelete(null); invalidate(); }, onError: (e) => toast.error(errMsg(e)) });

  const saved = (list.data ?? []).slice(0, 10);
  const pend = pending.data ?? [];
  const savedSort = useSort<BeratKoli>(saved);
  const pendSort = useSort<BeratPending>(pend);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Berat Koli" />
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <form className="space-y-5 rounded-2xl border bg-white p-5 md:p-6" onSubmit={(e) => { e.preventDefault(); onBrutoEnter(); }} data-testid="berat-koli-form">
          <div className="flex items-center gap-2 text-amber-800"><Scale className="size-5" /><h2 className="font-heading text-lg font-bold">Input Berat Koli</h2></div>
          <div className="space-y-1.5">
            <Label>Nomor Seri</Label>
            <Input ref={seriRef} data-testid="berat-seri-input" className="uppercase placeholder:normal-case" value={nomorSeri}
              onChange={(e) => { setNomorSeri(e.target.value); setExistingNote(""); setLookupInfo({ bandul: "", ket: "" }); setShowInfo(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onSeriEnter(); } }}
              placeholder="Enter untuk lanjut ke bruto" />
            {existingNote && <p className="text-xs font-medium text-amber-700" data-testid="berat-existing-note">{existingNote}</p>}
            {showInfo && <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs" data-testid="berat-lookup-info"><p>Bandul: <span className="font-semibold">{lookupInfo.bandul || "—"}</span></p><p>Keterangan: <span className="font-semibold">{lookupInfo.ket || "—"}</span></p></div>}
          </div>
          <div className="space-y-1.5">
            <Label>Bruto (kg) · maks {MAX_BRUTO}</Label>
            <Input ref={brutoRef} data-testid="berat-bruto-input" type="number" inputMode="decimal" max={MAX_BRUTO} value={bruto}
              onChange={(e) => setBruto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onBrutoEnter(); } }}
              placeholder="Enter untuk simpan" />
          </div>
          <div className="space-y-1.5"><Label>Netto</Label><Input data-testid="berat-netto-preview" value={nettoPreview === null ? "" : numId(nettoPreview)} readOnly className="bg-muted/50" placeholder="otomatis" /></div>
          <Button type="submit" size="lg" className="w-full" disabled={save.isPending} data-testid="berat-submit-button">{save.isPending ? "Menyimpan..." : "Simpan Berat Koli"}</Button>
        </form>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="border-b bg-amber-50 px-5 py-3 font-heading font-semibold text-amber-900">Belum Ditimbang ({pend.length})</div>
            <Table data-testid="berat-pending-table">
              <TableHeader><TableRow className="bg-muted/30">
                <SortHead label="Nomor Seri" sortKey="nomor_seri" state={pendSort} onToggle={pendSort.toggle} />
                <SortHead label="Bandul" sortKey="bandul_nama" state={pendSort} onToggle={pendSort.toggle} />
                <SortHead label="Tanggal" sortKey="tanggal_beli" state={pendSort} onToggle={pendSort.toggle} />
              </TableRow></TableHeader>
              <TableBody>
                {pendSort.sorted.map((p) => (
                  <TableRow key={p.nomor_seri} data-testid={`berat-pending-${p.nomor_seri}`} className="cursor-pointer hover:bg-amber-50/60" onClick={() => { setNomorSeri(p.nomor_seri); setExistingNote(""); setTimeout(() => brutoRef.current?.focus(), 30); }}>
                    <TableCell className="font-mono font-semibold">{p.nomor_seri}</TableCell>
                    <TableCell>{p.bandul_nama || "—"}</TableCell>
                    <TableCell>{fmtDate(p.tanggal_beli)}</TableCell>
                  </TableRow>
                ))}
                {pend.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">{pending.isLoading ? "Memuat..." : "Semua nomor seri sudah ditimbang."}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </section>

          <section className="overflow-hidden rounded-2xl border bg-white">
            <div className="border-b bg-muted/40 px-5 py-3 font-heading font-semibold">Sudah Ditimbang (10 terakhir)</div>
            <Table data-testid="berat-koli-table">
              <TableHeader><TableRow className="bg-muted/30">
                <SortHead label="Nomor Seri" sortKey="nomor_seri" state={savedSort} onToggle={savedSort.toggle} />
                <SortHead label="Bandul" sortKey="bandul_nama" state={savedSort} onToggle={savedSort.toggle} />
                <SortHead label="Bruto" sortKey="bruto" state={savedSort} onToggle={savedSort.toggle} align="right" />
                <SortHead label="Netto" sortKey="netto" state={savedSort} onToggle={savedSort.toggle} align="right" />
                <SortHead label="Keterangan" sortKey="keterangan" state={savedSort} onToggle={savedSort.toggle} />
                <TableHead className="w-24 text-right">Aksi</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {savedSort.sorted.map((b) => (
                  <TableRow key={b.id} data-testid={`berat-row-${b.id}`}>
                    <TableCell className="font-mono font-semibold">{b.nomor_seri}</TableCell>
                    <TableCell>{b.bandul_nama || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{numId(b.bruto)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{numId(b.netto)}</TableCell>
                    <TableCell>{b.keterangan || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(b); setEditBruto(String(b.bruto)); }} data-testid={`berat-edit-${b.id}`} aria-label="Edit"><Pencil className="size-4" /></Button>
                      {admin && <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(b)} data-testid={`berat-delete-${b.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {saved.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{list.isLoading ? "Memuat..." : "Belum ada data."}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </section>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent data-testid="berat-edit-dialog">
          <DialogHeader><DialogTitle>Edit Berat · {editing?.nomor_seri}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const bn = Number(editBruto.replace(",", ".")); if (!(bn > 0)) return toast.error("Bruto tidak valid"); if (bn > MAX_BRUTO) return toast.error(`Bruto maksimal ${MAX_BRUTO} kg`); update.mutate({ nomor_seri: editing!.nomor_seri, bruto: bn }); }}>
            <div className="space-y-1.5"><Label>Bruto (kg)</Label><Input data-testid="berat-edit-bruto-input" type="number" max={MAX_BRUTO} value={editBruto} onChange={(e) => setEditBruto(e.target.value)} /><p className="text-xs text-muted-foreground">Netto: {editBruto ? numId(Number(editBruto.replace(",", ".")) - 2) : "—"} kg</p></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(null)}>Batal</Button><Button type="submit" disabled={update.isPending} data-testid="berat-edit-submit">Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={`Hapus berat ${toDelete?.nomor_seri ?? ""}?`} description="Data berat koli akan dihapus." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="berat-delete-dialog" />
    </div>
  );
}
