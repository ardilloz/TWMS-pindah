import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut as OutIcon, Pencil, Percent, Plus, Tag, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { can, isAdmin } from "@/lib/perms";
import { rupiah, whqs } from "@/lib/internal";
import type { HargaJual, Potongan } from "@/lib/internal";
import { useWh } from "./InternalLayout";

export default function Harga() {
  const wh = useWh();
  const me = useMe();
  const canManage = can(me.data, "harga");
  const admin = isAdmin(me.data);
  const hj = useQuery({ queryKey: ["harga-jual", wh], enabled: !!wh, queryFn: () => apiGet<HargaJual[]>(`/internal/harga-jual?${whqs(wh)}`) });
  const pk = useQuery({ queryKey: ["potongan-kuli", wh], enabled: !!wh, queryFn: () => apiGet<Potongan[]>(`/internal/potongan-kuli?${whqs(wh)}`) });
  const po = useQuery({ queryKey: ["potongan-out", wh], enabled: !!wh, queryFn: () => apiGet<Potongan[]>(`/internal/potongan-out?${whqs(wh)}`) });

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Harga" />
      <HargaJualSection wh={wh} rows={hj.data ?? []} loading={hj.isLoading} canManage={canManage} admin={admin} />
      <PajakSection wh={wh} canManage={canManage} />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <PotonganSection title="Potongan Kuli" icon={Users} endpoint="/internal/potongan-kuli" queryKey="potongan-kuli" wh={wh} rows={pk.data ?? []} loading={pk.isLoading} canManage={canManage} admin={admin} testId="potongan-kuli" />
        <PotonganSection title="Potongan Out" icon={OutIcon} endpoint="/internal/potongan-out" queryKey="potongan-out" wh={wh} rows={po.data ?? []} loading={po.isLoading} canManage={canManage} admin={admin} testId="potongan-out" />
      </div>
    </div>
  );
}

function PajakSection({ wh, canManage }: { wh: string; canManage: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pajak", wh], enabled: !!wh, queryFn: () => apiGet<{ pajak_rate: number }>(`/internal/pajak?${whqs(wh)}`) });
  const [val, setVal] = useState("");
  const rate = q.data?.pajak_rate ?? 0.0025;
  const display = val !== "" ? val : (rate * 100).toString().replace(".", ",");
  const save = useMutation({
    mutationFn: () => apiPut(`/internal/pajak?${whqs(wh)}`, { pajak_rate: Number(display.replace(",", ".")) / 100 }),
    onSuccess: () => { toast.success("Pajak tersimpan"); qc.invalidateQueries({ queryKey: ["pajak", wh] }); qc.invalidateQueries({ queryKey: ["kasir", wh] }); setVal(""); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border bg-white" data-testid="pajak-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-4"><Percent className="size-5 text-amber-700" /><h2 className="font-heading text-lg font-bold">Pajak Pembelian</h2></div>
      <div className="flex flex-wrap items-end gap-3 p-5">
        <div className="space-y-1.5"><Label>Pajak (%)</Label><Input data-testid="pajak-input" className="w-40" value={display} onChange={(e) => setVal(e.target.value)} disabled={!canManage} placeholder="0,25" /></div>
        {canManage && <Button onClick={() => { const n = Number(display.replace(",", ".")); if (!(n >= 0 && n <= 100)) return toast.error("Persen harus 0-100"); save.mutate(); }} disabled={save.isPending} data-testid="pajak-save">Simpan</Button>}
        <p className="pb-2 text-xs text-muted-foreground">Seluruh pembelian mengikuti potongan pajak ini (default 0,25%).</p>
      </div>
    </section>
  );
}

function HargaJualSection({ wh, rows, loading, canManage, admin }: { wh: string; rows: HargaJual[]; loading: boolean; canManage: boolean; admin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HargaJual | null>(null);
  const [grade, setGrade] = useState("");
  const [harga, setHarga] = useState("");
  const [toDelete, setToDelete] = useState<HargaJual | null>(null);
  const sort = useSort<HargaJual>(rows);

  const start = (r: HargaJual | null) => { setEditing(r); setGrade(r?.grade ?? ""); setHarga(r ? String(r.harga) : ""); setOpen(true); };
  const save = useMutation({
    mutationFn: () => {
      const body = { grade, harga: Number(harga) };
      return editing ? apiPut(`/internal/harga-jual/${editing.id}?${whqs(wh)}`, body) : apiPost(`/internal/harga-jual?${whqs(wh)}`, body);
    },
    onSuccess: () => { toast.success("Tersimpan"); qc.invalidateQueries({ queryKey: ["harga-jual", wh] }); setOpen(false); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/harga-jual/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Dihapus"); qc.invalidateQueries({ queryKey: ["harga-jual", wh] }); setToDelete(null); }, onError: (e) => toast.error(errMsg(e)) });

  return (
    <section className="overflow-hidden rounded-2xl border bg-white" data-testid="harga-jual-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-4">
        <div className="flex items-center gap-2"><Tag className="size-5 text-amber-700" /><h2 className="font-heading text-lg font-bold">Harga Jual</h2></div>
        {canManage && <Button size="sm" onClick={() => start(null)} data-testid="harga-jual-add"><Plus className="size-4" /> Tambah Harga</Button>}
      </div>
      <Table data-testid="harga-jual-table">
        <TableHeader><TableRow className="bg-muted/30"><SortHead label="Grade" sortKey="grade" state={sort} onToggle={sort.toggle} /><SortHead label="Harga" sortKey="harga" state={sort} onToggle={sort.toggle} align="right" />{canManage && <TableHead className="w-24 text-right">Aksi</TableHead>}</TableRow></TableHeader>
        <TableBody>
          {sort.sorted.map((r) => (
            <TableRow key={r.id} data-testid={`harga-jual-row-${r.id}`}>
              <TableCell className="font-semibold">{r.grade}</TableCell>
              <TableCell className="text-right font-mono">{rupiah(r.harga)}</TableCell>
              {canManage && <TableCell className="text-right">
                <Button variant="ghost" size="icon-sm" onClick={() => start(r)} data-testid={`harga-jual-edit-${r.id}`} aria-label="Edit"><Pencil className="size-4" /></Button>
                {admin && <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(r)} data-testid={`harga-jual-delete-${r.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button>}
              </TableCell>}
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={canManage ? 3 : 2} className="py-8 text-center text-muted-foreground">{loading ? "Memuat..." : "Belum ada data."}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="harga-jual-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit Harga Jual" : "Tambah Harga"}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!grade.trim()) return toast.error("Grade wajib diisi"); if (!(Number(harga) >= 0)) return toast.error("Harga tidak valid"); save.mutate(); }}>
            <div className="space-y-1.5"><Label>Grade</Label><Input data-testid="harga-jual-grade-input" className="uppercase placeholder:normal-case" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="contoh: A" /></div>
            <div className="space-y-1.5"><Label>Harga (Rp)</Label><Input data-testid="harga-jual-harga-input" type="number" value={harga} onChange={(e) => setHarga(e.target.value)} placeholder="contoh: 60000" />{harga && <p className="text-xs text-muted-foreground">{rupiah(Number(harga))}</p>}</div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={save.isPending} data-testid="harga-jual-submit">Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={`Hapus grade ${toDelete?.grade ?? ""}?`} description="Data akan dihapus permanen." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="harga-jual-delete-dialog" />
    </section>
  );
}

function PotonganSection({ title, icon: Icon, endpoint, queryKey, wh, rows, loading, canManage, admin, testId }: { title: string; icon: typeof Tag; endpoint: string; queryKey: string; wh: string; rows: Potongan[]; loading: boolean; canManage: boolean; admin: boolean; testId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Potongan | null>(null);
  const [harga, setHarga] = useState("");
  const [toDelete, setToDelete] = useState<Potongan | null>(null);
  const sort = useSort<Potongan>(rows);
  const start = (r: Potongan | null) => { setEditing(r); setHarga(r ? String(r.harga) : ""); setOpen(true); };
  const save = useMutation({
    mutationFn: () => { const body = { harga: Number(harga) }; return editing ? apiPut(`${endpoint}/${editing.id}?${whqs(wh)}`, body) : apiPost(`${endpoint}?${whqs(wh)}`, body); },
    onSuccess: () => { toast.success("Tersimpan"); qc.invalidateQueries({ queryKey: [queryKey, wh] }); setOpen(false); }, onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({ mutationFn: (id: string) => apiDelete(`${endpoint}/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Dihapus"); qc.invalidateQueries({ queryKey: [queryKey, wh] }); setToDelete(null); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <section className="overflow-hidden rounded-2xl border bg-white" data-testid={`${testId}-card`}>
      <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-4">
        <div className="flex items-center gap-2"><Icon className="size-5 text-amber-700" /><h2 className="font-heading text-lg font-bold">{title}</h2></div>
        {canManage && <Button size="sm" onClick={() => start(null)} data-testid={`${testId}-add`}><Plus className="size-4" /> Tambah {title}</Button>}
      </div>
      <Table data-testid={`${testId}-table`}>
        <TableHeader><TableRow className="bg-muted/30"><SortHead label="Harga" sortKey="harga" state={sort} onToggle={sort.toggle} align="right" />{canManage && <TableHead className="w-24 text-right">Aksi</TableHead>}</TableRow></TableHeader>
        <TableBody>
          {sort.sorted.map((r) => (
            <TableRow key={r.id} data-testid={`${testId}-row-${r.id}`}>
              <TableCell className="text-right font-mono font-semibold">{rupiah(r.harga)}</TableCell>
              {canManage && <TableCell className="text-right">
                <Button variant="ghost" size="icon-sm" onClick={() => start(r)} data-testid={`${testId}-edit-${r.id}`} aria-label="Edit"><Pencil className="size-4" /></Button>
                {admin && <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(r)} data-testid={`${testId}-delete-${r.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button>}
              </TableCell>}
            </TableRow>
          ))}
          {rows.length === 0 && <TableRow><TableCell colSpan={canManage ? 2 : 1} className="py-8 text-center text-muted-foreground">{loading ? "Memuat..." : "Belum ada data."}</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid={`${testId}-dialog`}>
          <DialogHeader><DialogTitle>{editing ? `Edit ${title}` : `Tambah ${title}`}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!(Number(harga) >= 0)) return toast.error("Harga tidak valid"); save.mutate(); }}>
            <div className="space-y-1.5"><Label>Harga (Rp)</Label><Input data-testid={`${testId}-harga-input`} type="number" value={harga} onChange={(e) => setHarga(e.target.value)} placeholder="contoh: 9000" />{harga && <p className="text-xs text-muted-foreground">{rupiah(Number(harga))}</p>}</div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button type="submit" disabled={save.isPending} data-testid={`${testId}-submit`}>Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={`Hapus ${title}?`} description="Data akan dihapus permanen." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId={`${testId}-delete-dialog`} />
    </section>
  );
}
