import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Pencil, Plus, Save, Search, ShoppingCart, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { SimpleSelect } from "@/components/SimpleSelect";
import { Paginator, Toolbar } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { downloadXlsx, rupiah, usePaged, whqs } from "@/lib/internal";
import type { Bandul, Pembelian, PembelianIn, Potongan } from "@/lib/internal";
import { DuplicateDialog } from "@/components/internal/DuplicateDialog";
import { useWh } from "./InternalLayout";

const MAX_ROWS = 300;
type Row = { _k: string; nomor_seri: string; harga_ribu: string; keterangan: string };
const emptyRow = (): Row => ({ _k: crypto.randomUUID(), nomor_seri: "", harga_ribu: "", keterangan: "" });

function PembelianForm({ wh, editing, onDone }: { wh: string; editing: Pembelian | null; onDone: () => void }) {
  const qc = useQueryClient();
  const today = useToday();
  const bandulQ = useQuery({ queryKey: ["bandul", wh], queryFn: () => apiGet<Bandul[]>(`/internal/bandul?${whqs(wh)}`) });
  const kuliQ = useQuery({ queryKey: ["potongan-kuli", wh], queryFn: () => apiGet<Potongan[]>(`/internal/potongan-kuli?${whqs(wh)}`) });
  const outQ = useQuery({ queryKey: ["potongan-out", wh], queryFn: () => apiGet<Potongan[]>(`/internal/potongan-out?${whqs(wh)}`) });

  const [pid, setPid] = useState<string | null>(editing?.id ?? null);
  const [date, setDate] = useState(editing?.tanggal_beli ?? "");
  const [kupon, setKupon] = useState(editing?.nomor_kupon ?? "");
  const [bandulId, setBandulId] = useState(editing?.bandul_id ?? "");
  const [bandulText, setBandulText] = useState(editing?.bandul_nama ?? "");
  const [kuliId, setKuliId] = useState(editing?.potongan_kuli_id ?? "");
  const [outId, setOutId] = useState(editing?.potongan_out_id ?? "");
  const [jumlahOut, setJumlahOut] = useState(String(editing?.jumlah_out ?? 0));
  const [rows, setRows] = useState<Row[]>(editing && editing.items.length ? editing.items.map((i): Row => ({ _k: crypto.randomUUID(), nomor_seri: i.nomor_seri, harga_ribu: String(i.harga / 1000), keterangan: i.keterangan })) : [emptyRow()]);
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dupMsg, setDupMsg] = useState<string | null>(null);
  const effDate = date || today.data?.today || "";

  const buildPayload = (): PembelianIn => ({
    tanggal_beli: effDate, nomor_kupon: kupon, bandul_id: bandulId || null, potongan_kuli_id: kuliId || null, potongan_out_id: outId || null,
    jumlah_out: Math.max(0, Math.round(Number(jumlahOut) || 0)),
    items: rows.filter((r) => r.nomor_seri.trim()).map((r) => ({ nomor_seri: r.nomor_seri.trim(), harga: Math.round(Number(r.harga_ribu) || 0) * 1000, keterangan: r.keterangan })),
  });

  const autosave = async () => {
    const payload = buildPayload();
    if (payload.items.length === 0) return;
    try {
      if (pid) await apiPut(`/internal/pembelian/${pid}?${whqs(wh)}`, payload);
      else { const created = await apiPost<Pembelian>(`/internal/pembelian?${whqs(wh)}`, payload); setPid(created.id); }
      qc.invalidateQueries({ queryKey: ["pembelian", wh] });
    } catch { /* draft autosave: abaikan error sementara saat mengetik (mis. nomor seri belum selesai diketik); validasi final tetap jalan saat Simpan */ }
  };
  const scheduleSave = () => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => void autosave(), 700); };

  const focusCell = (idx: number, field: string) => setTimeout(() => cellRefs.current[`${idx}:${field}`]?.focus(), 30);
  const updateRow = (idx: number, patch: Partial<Row>) => { setRows((cur) => cur.map((r, i) => (i === idx ? { ...r, ...patch } : r))); scheduleSave(); };
  const addRowAndFocus = () => { setRows((cur) => { if (cur.length >= MAX_ROWS) { toast.error(`Maksimal ${MAX_ROWS} nomor seri`); return cur; } const next = [...cur, emptyRow()]; focusCell(next.length - 1, "seri"); return next; }); };
  const removeRow = (idx: number) => { setRows((cur) => (cur.length === 1 ? [emptyRow()] : cur.filter((_, i) => i !== idx))); scheduleSave(); };

  const finalize = useMutation({
    mutationFn: async () => { const payload = buildPayload(); if (payload.items.length === 0) throw new Error("Isi minimal satu nomor seri"); return pid ? apiPut(`/internal/pembelian/${pid}?${whqs(wh)}`, payload) : apiPost(`/internal/pembelian?${whqs(wh)}`, payload); },
    onSuccess: () => { toast.success(editing ? "Pembelian diperbarui" : "Pembelian tersimpan"); qc.invalidateQueries({ queryKey: ["pembelian", wh] }); qc.invalidateQueries({ queryKey: ["kasir", wh] }); qc.invalidateQueries({ queryKey: ["berat-pending", wh] }); onDone(); },
    onError: (e) => { if (e instanceof ApiError && e.status === 409) setDupMsg(errMsg(e)); else toast.error(e instanceof Error && e.message.includes("satu") ? e.message : errMsg(e)); },
  });

  const jumlahSeri = rows.filter((r) => r.nomor_seri.trim()).length;
  const kuliHarga = kuliQ.data?.find((k) => k.id === kuliId)?.harga ?? 0;
  const outHarga = outQ.data?.find((o) => o.id === outId)?.harga ?? 0;
  const jumlahOutNum = Math.max(0, Math.round(Number(jumlahOut) || 0));

  const bandulOpts = (bandulQ.data ?? []).map((b) => ({ value: b.id, label: b.nama }));
  const kuliOpts = (kuliQ.data ?? []).map((k) => ({ value: k.id, label: rupiah(k.harga) }));
  const outOpts = (outQ.data ?? []).map((o) => ({ value: o.id, label: rupiah(o.harga) }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 md:p-6">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5"><Label>Tanggal Beli</Label><DateField testId="beli-date-input" value={effDate} onChange={(v) => { setDate(v); scheduleSave(); }} /></div>
          <div className="space-y-1.5"><Label>Nomor Kupon</Label><Input data-testid="beli-kupon-input" className="uppercase placeholder:normal-case" value={kupon} onChange={(e) => setKupon(e.target.value)} onBlur={scheduleSave} placeholder="Nomor kupon" /></div>
          <div className="space-y-1.5"><Label>Bandul</Label><Input list="beli-bandul-list" data-testid="beli-bandul-input" className="uppercase placeholder:normal-case" value={bandulText} onChange={(e) => { const v = e.target.value; setBandulText(v); const m = (bandulQ.data ?? []).find((b) => b.nama.toLowerCase() === v.trim().toLowerCase()); setBandulId(m?.id ?? ""); scheduleSave(); }} placeholder="Ketik nama bandul" /><datalist id="beli-bandul-list">{bandulOpts.map((o) => <option key={o.value} value={o.label} />)}</datalist></div>
          <div className="space-y-1.5"><Label>Potongan Kuli</Label><SimpleSelect value={kuliId} onChange={(v) => { setKuliId(v); scheduleSave(); }} placeholder="Pilih potongan kuli" testId="beli-kuli-select" options={kuliOpts} /></div>
          <div className="space-y-1.5"><Label>Potongan Out</Label><SimpleSelect value={outId} onChange={(v) => { setOutId(v); scheduleSave(); }} placeholder="Pilih potongan out" testId="beli-out-select" options={outOpts} /></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3"><h3 className="font-heading text-base font-semibold">Nomor Seri & Harga</h3><span className="text-sm text-muted-foreground" data-testid="beli-seri-count">{jumlahSeri} / {MAX_ROWS} seri</span></div>
        <Table data-testid="beli-items-table">
          <TableHeader><TableRow className="bg-muted/20"><TableHead className="w-12">#</TableHead><TableHead>Nomor Seri</TableHead><TableHead>Harga</TableHead><TableHead>Keterangan</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r._k} data-testid={`beli-row-${idx}`}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell><Input ref={(el) => { cellRefs.current[`${idx}:seri`] = el; }} data-testid={`beli-seri-${idx}`} className="uppercase placeholder:normal-case" value={r.nomor_seri} onChange={(e) => updateRow(idx, { nomor_seri: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusCell(idx, "harga"); } }} placeholder="Nomor seri" /></TableCell>
                <TableCell><div className="flex items-center gap-2"><Input ref={(el) => { cellRefs.current[`${idx}:harga`] = el; }} data-testid={`beli-harga-${idx}`} type="number" inputMode="numeric" className="w-24" value={r.harga_ribu} onChange={(e) => updateRow(idx, { harga_ribu: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusCell(idx, "ket"); } }} placeholder="56" /><span className="font-mono text-xs text-muted-foreground" data-testid={`beli-harga-display-${idx}`}>{r.harga_ribu ? rupiah(Math.round(Number(r.harga_ribu) || 0) * 1000) : "—"}</span></div></TableCell>
                <TableCell><Input ref={(el) => { cellRefs.current[`${idx}:ket`] = el; }} data-testid={`beli-ket-${idx}`} value={r.keterangan} onChange={(e) => updateRow(idx, { keterangan: e.target.value })} onBlur={scheduleSave} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (idx === rows.length - 1 && r.nomor_seri.trim()) addRowAndFocus(); else focusCell(idx + 1, "seri"); } }} placeholder="Keterangan" /></TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRow(idx)} data-testid={`beli-remove-${idx}`} aria-label="Hapus baris"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t p-3"><Button type="button" variant="outline" size="sm" onClick={addRowAndFocus} data-testid="beli-add-row"><Plus className="size-4" /> Tambah Baris</Button></div>
      </div>

      <div className="rounded-2xl border bg-white p-5 md:p-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5"><Label>Total Potongan Kuli</Label><p className="font-mono text-lg font-semibold" data-testid="beli-total-kuli">{rupiah(kuliHarga * jumlahSeri)}</p><p className="text-xs text-muted-foreground">{rupiah(kuliHarga)} × {jumlahSeri} seri</p></div>
          <div className="space-y-1.5"><Label>Jumlah Out</Label><Input data-testid="beli-jumlah-out-input" type="number" inputMode="numeric" className="w-28" value={jumlahOut} onChange={(e) => { setJumlahOut(e.target.value); scheduleSave(); }} /><p className="text-xs text-muted-foreground">Total Out: <span className="font-mono font-semibold" data-testid="beli-total-out">{rupiah(outHarga * jumlahOutNum)}</span></p></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t pt-5">
          <Button type="button" variant="outline" onClick={onDone} data-testid="beli-cancel-button"><ArrowLeft className="size-4" /> Kembali</Button>
          <Button type="button" size="lg" onClick={() => finalize.mutate()} disabled={finalize.isPending} data-testid="beli-save-button"><Save className="size-4" /> {finalize.isPending ? "Menyimpan..." : "Simpan"}</Button>
        </div>
      </div>
      <DuplicateDialog message={dupMsg} onClose={() => setDupMsg(null)} />
    </div>
  );
}

export default function Pembelian() {
  const wh = useWh();
  const qc = useQueryClient();
  const today = useToday();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const effFrom = dateFrom || today.data?.today || "";
  const effTo = dateTo || today.data?.today || "";
  const list = useQuery({ queryKey: ["pembelian", wh, effFrom, effTo], enabled: !!wh && !!effFrom, queryFn: () => apiGet<Pembelian[]>(`/internal/pembelian?${whqs(wh, { date_from: effFrom, date_to: effTo })}`) });
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<Pembelian | null>(null);
  const [toDelete, setToDelete] = useState<Pembelian | null>(null);
  const [qKupon, setQKupon] = useState("");
  const [qBandul, setQBandul] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/pembelian/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Transaksi dihapus"); setToDelete(null); qc.invalidateQueries({ queryKey: ["pembelian", wh] }); qc.invalidateQueries({ queryKey: ["kasir", wh] }); }, onError: (e) => toast.error(errMsg(e)) });

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    setImporting(true);
    try { const fd = new FormData(); fd.append("file", file); const res = await fetch(`/api/internal/pembelian/import?${whqs(wh)}`, { method: "POST", body: fd }); const body = await res.json(); if (!res.ok) throw new Error(body.detail || "gagal"); toast.success(`${body.created} transaksi diimpor`); qc.invalidateQueries({ queryKey: ["pembelian", wh] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal impor"); } finally { setImporting(false); }
  };

  const filtered = useMemo(() => (list.data ?? []).filter((p) => (p.nomor_kupon || "").toLowerCase().includes(qKupon.trim().toLowerCase()) && (p.bandul_nama || "").toLowerCase().includes(qBandul.trim().toLowerCase())), [list.data, qKupon, qBandul]);
  const sort = useSort<Pembelian>(filtered);
  const paged = usePaged(sort.sorted, 100);

  if (mode === "form") {
    return (<div><PageHeader eyebrow="Internal" title={editing ? "Edit Pembelian" : "Tambah Data Beli"} /><PembelianForm key={editing?.id ?? "new"} wh={wh} editing={editing} onDone={() => { setMode("list"); setEditing(null); }} /></div>);
  }

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Pembelian" actions={<>
        <Button variant="outline" onClick={() => downloadXlsx(`/internal/pembelian/template?${whqs(wh)}`).catch(() => toast.error("Gagal"))} data-testid="pembelian-template-button"><Download className="size-4" /> Format Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onImport(e.currentTarget)} data-testid="pembelian-import-input" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} data-testid="pembelian-import-button"><Upload className="size-4" /> {importing ? "Mengimpor..." : "Upload Excel"}</Button>
        <Button onClick={() => { setEditing(null); setMode("form"); }} data-testid="add-pembelian-button"><Plus className="size-4" /> Tambah Data Beli</Button>
      </>} />
      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="pembelian-date-from" value={effFrom} onChange={(v) => { setDateFrom(v); paged.setPage(1); }} /></div>
        <div className="space-y-1.5"><Label>Tanggal Sampai</Label><DateField testId="pembelian-date-to" value={effTo} onChange={(v) => { setDateTo(v); paged.setPage(1); }} /></div>
        <div className="space-y-1.5"><Label>Cari Nomor Kupon</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="pembelian-search-kupon" className="pl-8" value={qKupon} onChange={(e) => { setQKupon(e.target.value); paged.setPage(1); }} /></div></div>
        <div className="space-y-1.5"><Label>Cari Nama Bandul</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="pembelian-search-bandul" className="pl-8" value={qBandul} onChange={(e) => { setQBandul(e.target.value); paged.setPage(1); }} /></div></div>
      </Toolbar>
      <section className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="pembelian-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tanggal" sortKey="tanggal_beli" state={sort} onToggle={sort.toggle} />
            <SortHead label="Nomor Kupon" sortKey="nomor_kupon" state={sort} onToggle={sort.toggle} />
            <SortHead label="Bandul" sortKey="bandul_nama" state={sort} onToggle={sort.toggle} />
            <SortHead label="Jml Seri" sortKey="jumlah_seri" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Pot. Kuli" sortKey="total_potongan_kuli" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Out" sortKey="jumlah_out" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead className="w-24 text-right">Aksi</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((p) => (
              <TableRow key={p.id} data-testid={`pembelian-row-${p.id}`}>
                <TableCell>{fmtDate(p.tanggal_beli)}</TableCell>
                <TableCell className="font-mono font-semibold">{p.nomor_kupon || "—"}</TableCell>
                <TableCell>{p.bandul_nama || "—"}</TableCell>
                <TableCell className="text-right font-mono">{p.jumlah_seri}</TableCell>
                <TableCell className="text-right font-mono">{rupiah(p.total_potongan_kuli)}</TableCell>
                <TableCell className="text-right font-mono">{p.jumlah_out} · {rupiah(p.total_out)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon-sm" onClick={() => { setEditing(p); setMode("form"); }} data-testid={`pembelian-edit-${p.id}`} aria-label="Edit"><Pencil className="size-4" /></Button><Button variant="ghost" size="icon-sm" onClick={() => setToDelete(p)} data-testid={`pembelian-delete-${p.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-muted-foreground"><ShoppingCart className="mx-auto mb-2 size-8 opacity-40" />{list.isLoading ? "Memuat..." : "Belum ada transaksi pembelian."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="pembelian" />
      </section>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title={`Hapus transaksi kupon ${toDelete?.nomor_kupon || "ini"}?`} description="Transaksi beserta seluruh nomor serinya akan dihapus permanen." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="pembelian-delete-dialog" />
    </div>
  );
}
