import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Pencil, Plus, Search, Trash2, UserSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/PageHeader";
import { Paginator } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { can, isAdmin } from "@/lib/perms";
import { fileUrl, usePaged, whqs } from "@/lib/internal";
import type { Bandul } from "@/lib/internal";
import { useWh } from "./InternalLayout";

function BandulDialog({ wh, open, onOpenChange, initial }: { wh: string; open: boolean; onOpenChange: (o: boolean) => void; initial: Bandul | null }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState(initial?.nama ?? "");
  const [alamat, setAlamat] = useState(initial?.alamat ?? "");
  const [ktpPath, setKtpPath] = useState<string | null>(initial?.ktp_path ?? null);
  const [preview, setPreview] = useState<string | null>(initial?.ktp_path ? fileUrl(initial.ktp_path) : null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/internal/upload/ktp?${whqs(wh)}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      setKtpPath((await res.json()).path);
      toast.success("Foto KTP terunggah");
    } catch { toast.error("Gagal mengunggah foto KTP"); } finally { setUploading(false); }
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { nama: nama.trim(), alamat: alamat.trim(), ktp_path: ktpPath };
      return initial ? apiPut<Bandul>(`/internal/bandul/${initial.id}?${whqs(wh)}`, body) : apiPost<Bandul>(`/internal/bandul?${whqs(wh)}`, body);
    },
    onSuccess: () => { toast.success(initial ? "Bandul diperbarui" : "Bandul ditambahkan"); qc.invalidateQueries({ queryKey: ["bandul", wh] }); onOpenChange(false); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="bandul-form-dialog">
        <DialogHeader><DialogTitle>{initial ? "Edit Data Bandul" : "Tambah Data Bandul"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!nama.trim()) return toast.error("Nama bandul wajib diisi"); if (uploading) return toast.error("Tunggu unggahan selesai"); save.mutate(); }}>
          <div className="space-y-1.5"><Label>Nama Bandul <span className="text-red-600">*</span></Label><Input data-testid="bandul-nama-input" className="uppercase placeholder:normal-case" value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama bandul" /></div>
          <div className="space-y-1.5"><Label>Alamat (opsional)</Label><Input data-testid="bandul-alamat-input" className="uppercase placeholder:normal-case" value={alamat} onChange={(e) => setAlamat(e.target.value)} placeholder="Alamat" /></div>
          <div className="space-y-2">
            <Label>Foto KTP (opsional)</Label>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.currentTarget)} data-testid="bandul-ktp-file-input" />
            <div className="flex items-center gap-3"><Button type="button" variant="outline" onClick={() => fileRef.current?.click()} data-testid="bandul-ktp-camera-button"><Camera className="size-4" /> {ktpPath ? "Ganti Foto" : "Ambil Foto KTP"}</Button>{uploading && <span className="text-xs text-muted-foreground">Mengunggah...</span>}</div>
            {preview && <img src={preview} alt="KTP" className="mt-2 max-h-40 rounded-lg border object-contain" />}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button><Button type="submit" disabled={save.isPending || uploading} data-testid="bandul-form-submit">Simpan</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BandulPage() {
  const wh = useWh();
  const qc = useQueryClient();
  const me = useMe();
  const canManage = can(me.data, "bandul");
  const admin = isAdmin(me.data);
  const list = useQuery({ queryKey: ["bandul", wh], enabled: !!wh, queryFn: () => apiGet<Bandul[]>(`/internal/bandul?${whqs(wh)}`) });
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Bandul | null>(null);
  const [toDelete, setToDelete] = useState<Bandul | null>(null);
  const [search, setSearch] = useState("");

  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/bandul/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Bandul dihapus"); qc.invalidateQueries({ queryKey: ["bandul", wh] }); setToDelete(null); }, onError: (e) => toast.error(errMsg(e)) });
  const openForm = (b: Bandul | null) => { setEditing(b); setFormKey((k) => k + 1); setOpen(true); };

  const filtered = useMemo(() => (list.data ?? []).filter((b) => b.nama.toLowerCase().includes(search.trim().toLowerCase())), [list.data, search]);
  const sort = useSort<Bandul>(filtered);
  const paged = usePaged(sort.sorted, 100);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Bandul" actions={canManage && <Button onClick={() => openForm(null)} data-testid="add-bandul-button"><Plus className="size-4" /> Tambah Data Bandul</Button>} />
      <div className="mb-4 max-w-sm">
        <div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="bandul-search" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); paged.setPage(1); }} placeholder="Cari / filter nama bandul" /></div>
      </div>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="bandul-table">
          <TableHeader><TableRow className="bg-muted/60"><SortHead label="Nama Bandul" sortKey="nama" state={sort} onToggle={sort.toggle} /><SortHead label="Alamat" sortKey="alamat" state={sort} onToggle={sort.toggle} /><TableHead>Foto KTP</TableHead>{canManage && <TableHead className="w-24 text-right">Aksi</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((b) => (
              <TableRow key={b.id} data-testid={`bandul-row-${b.id}`}>
                <TableCell className="font-semibold">{b.nama}</TableCell>
                <TableCell>{b.alamat || "—"}</TableCell>
                <TableCell>{b.ktp_path ? <a href={fileUrl(b.ktp_path)} target="_blank" rel="noreferrer"><img src={fileUrl(b.ktp_path)} alt="KTP" className="h-12 w-20 rounded border object-cover" /></a> : <span className="text-xs text-muted-foreground">Tidak ada</span>}</TableCell>
                {canManage && <TableCell className="text-right"><Button variant="ghost" size="icon-sm" onClick={() => openForm(b)} data-testid={`bandul-edit-${b.id}`} aria-label="Edit"><Pencil className="size-4" /></Button>{admin && <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(b)} data-testid={`bandul-delete-${b.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button>}</TableCell>}
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={canManage ? 4 : 3} className="py-10 text-center text-muted-foreground">{list.isLoading ? "Memuat..." : "Belum ada data bandul."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="bandul" />
      </section>
      {open && <BandulDialog key={formKey} wh={wh} open={open} onOpenChange={setOpen} initial={editing} />}
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={`Hapus ${toDelete?.nama ?? "bandul"}?`} description="Data bandul akan dihapus permanen." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="bandul-delete-dialog" />
    </div>
  );
}
