import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Pencil, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { Paginator, Toolbar } from "@/components/internal/Paginator";
import { SortHead, useSort } from "@/components/internal/SortableTable";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { useToday } from "@/lib/queries";
import { downloadXlsx, MAX_BRUTO, nextSerial, numId, rupiah, usePaged, whqs } from "@/lib/internal";
import type { HargaJual, Penjualan } from "@/lib/internal";
import { DuplicateDialog } from "@/components/internal/DuplicateDialog";
import { useWh } from "./InternalLayout";

const MAX_ROWS = 50;
type Row = { _k: string; nomor_seri: string; nomor_jadi: string; bruto: string; grade: string; keterangan: string };
const emptyRow = (grade = ""): Row => ({ _k: crypto.randomUUID(), nomor_seri: "", nomor_jadi: "", bruto: "", grade, keterangan: "" });

function PenjualanForm({ wh, editing, onDone }: { wh: string; editing: Penjualan | null; onDone: () => void }) {
  const qc = useQueryClient();
  const today = useToday();
  const grades = useQuery({ queryKey: ["harga-jual", wh], queryFn: () => apiGet<HargaJual[]>(`/internal/harga-jual?${whqs(wh)}`) });
  const [date, setDate] = useState(editing?.tanggal_jual ?? "");
  const [gulungan, setGulungan] = useState(editing?.gulungan ?? "");
  const [pembeli, setPembeli] = useState(editing?.pembeli ?? "");
  const [rows, setRows] = useState<Row[]>(
    editing && editing.items.length
      ? editing.items.map((i): Row => ({ _k: crypto.randomUUID(), nomor_seri: i.nomor_seri, nomor_jadi: i.nomor_jadi, bruto: String(i.bruto), grade: i.grade, keterangan: i.keterangan }))
      : [emptyRow()],
  );
  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [dupMsg, setDupMsg] = useState<string | null>(null);
  const effDate = date || today.data?.today || "";
  const priceOf = (g: string): number | null => (grades.data ?? []).find((x) => x.grade.toUpperCase() === g.trim().toUpperCase())?.harga ?? null;

  const focusCell = (idx: number, field: string) => setTimeout(() => cellRefs.current[`${idx}:${field}`]?.focus(), 30);
  const updateRow = (idx: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  // Enter di Nomor Seri: validasi & isi otomatis (bruto, nomor jadi, keterangan), lalu LANJUT KE NOMOR SERI DI BARIS BAWAHNYA.
  const onSeriEnter = async (idx: number) => {
    const row = rows[idx];
    const s = row.nomor_seri.trim().toUpperCase();
    if (!s) return;
    try {
      const r = await apiGet<{ valid: boolean; error?: string; bruto?: number; keterangan?: string }>(`/internal/penjualan/lookup?${whqs(wh, { seri: s })}`);
      if (!r.valid) { toast.error(r.error || "Nomor seri tidak valid"); return; }
      const prevJadi = idx > 0 ? rows[idx - 1].nomor_jadi : "";
      const autoJadi = row.nomor_jadi || (prevJadi ? nextSerial(prevJadi) : "");
      updateRow(idx, { bruto: String(r.bruto ?? ""), keterangan: r.keterangan ?? "", nomor_jadi: autoJadi });
      if (idx === rows.length - 1 && rows.length < MAX_ROWS) {
        setRows((cur) => [...cur, emptyRow(row.grade)]);
      }
      focusCell(idx + 1, "seri");
    } catch (e) { toast.error(errMsg(e)); }
  };

  // Enter di Grade: LANJUT KE GRADE DI BARIS BAWAHNYA (tidak kembali ke nomor seri).
  const onGradeEnter = (idx: number) => {
    if (idx < rows.length - 1) focusCell(idx + 1, "grade");
  };

  const removeRow = (idx: number) => setRows((cur) => (cur.length === 1 ? [emptyRow()] : cur.filter((_, i) => i !== idx)));

  const save = useMutation({
    mutationFn: () => {
      const items = rows.filter((r) => r.nomor_seri.trim()).map((r) => ({ nomor_seri: r.nomor_seri.trim(), nomor_jadi: r.nomor_jadi.trim(), bruto: Number(r.bruto) || 0, grade: r.grade }));
      if (items.length === 0) throw new Error("Isi minimal satu nomor seri");
      const body = { tanggal_jual: effDate, gulungan, pembeli, items };
      return editing ? apiPut<Penjualan>(`/internal/penjualan/${editing.id}?${whqs(wh)}`, body) : apiPost<Penjualan>(`/internal/penjualan?${whqs(wh)}`, body);
    },
    onSuccess: () => { toast.success(editing ? "Penjualan diperbarui" : "Penjualan tersimpan"); qc.invalidateQueries({ queryKey: ["penjualan", wh] }); qc.invalidateQueries({ queryKey: ["laporan-penjualan", wh] }); onDone(); },
    onError: (e) => { if (e instanceof ApiError && e.status === 409) setDupMsg(errMsg(e)); else toast.error(e instanceof Error && e.message.includes("satu") ? e.message : errMsg(e)); },
  });

  const jumlah = rows.filter((r) => r.nomor_seri.trim()).length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-5 md:p-6">
        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5"><Label>Tanggal Jual</Label><DateField testId="jual-date-input" value={effDate} onChange={setDate} /></div>
          <div className="space-y-1.5"><Label>Gulungan</Label><Input data-testid="jual-gulungan-input" className="uppercase placeholder:normal-case" value={gulungan} onChange={(e) => setGulungan(e.target.value)} placeholder="contoh: G1" /></div>
          <div className="space-y-1.5"><Label>Nama Pembeli</Label><Input data-testid="jual-pembeli-input" className="uppercase placeholder:normal-case" value={pembeli} onChange={(e) => setPembeli(e.target.value)} placeholder="Nama pembeli" /></div>
        </div>
      </div>
      <datalist id="jual-grades">{(grades.data ?? []).map((g) => <option key={g.id} value={g.grade} />)}</datalist>
      <div className="overflow-x-auto rounded-2xl border bg-white">
        <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3"><h3 className="font-heading text-base font-semibold">Nomor Seri (maks {MAX_ROWS})</h3><span className="text-sm text-muted-foreground" data-testid="jual-count">{jumlah} / {MAX_ROWS}</span></div>
        <Table data-testid="jual-items-table">
          <TableHeader><TableRow className="bg-muted/20"><TableHead className="w-12">#</TableHead><TableHead>Nomor Seri</TableHead><TableHead>Nomor Jadi</TableHead><TableHead>Bruto</TableHead><TableHead>Netto</TableHead><TableHead>Grade</TableHead><TableHead>Keterangan</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r, idx) => (
              <TableRow key={r._k} data-testid={`jual-row-${idx}`}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell><Input ref={(el) => { cellRefs.current[`${idx}:seri`] = el; }} data-testid={`jual-seri-${idx}`} className="uppercase placeholder:normal-case" value={r.nomor_seri} onChange={(e) => updateRow(idx, { nomor_seri: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onSeriEnter(idx); } }} placeholder="Nomor seri" /></TableCell>
                <TableCell><Input data-testid={`jual-jadi-${idx}`} className="w-32 uppercase placeholder:normal-case" value={r.nomor_jadi} onChange={(e) => updateRow(idx, { nomor_jadi: e.target.value })} placeholder="Nomor jadi" /></TableCell>
                <TableCell><Input data-testid={`jual-bruto-${idx}`} type="number" max={MAX_BRUTO} className="w-20" value={r.bruto} onChange={(e) => updateRow(idx, { bruto: e.target.value })} /></TableCell>
                <TableCell className="font-mono text-sm" data-testid={`jual-netto-${idx}`}>{r.bruto ? numId(Number(r.bruto) - 2) : "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input ref={(el) => { cellRefs.current[`${idx}:grade`] = el; }} list="jual-grades" data-testid={`jual-grade-${idx}`} className="w-20 uppercase placeholder:normal-case" value={r.grade} onChange={(e) => updateRow(idx, { grade: e.target.value.toUpperCase() })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onGradeEnter(idx); } }} placeholder="Grade" />
                    <span className="font-mono text-xs text-muted-foreground" data-testid={`jual-harga-${idx}`}>{r.grade && priceOf(r.grade) != null ? rupiah(priceOf(r.grade)!) : "—"}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.keterangan || "—"}</TableCell>
                <TableCell><Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRow(idx)} data-testid={`jual-remove-${idx}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t p-3"><Button type="button" variant="outline" size="sm" onClick={() => setRows((c) => (c.length < MAX_ROWS ? [...c, emptyRow(c[c.length - 1]?.grade ?? "")] : c))} data-testid="jual-add-row"><Plus className="size-4" /> Tambah Baris</Button></div>
      </div>
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onDone} data-testid="jual-cancel-button"><ArrowLeft className="size-4" /> Kembali</Button><Button type="button" size="lg" onClick={() => save.mutate()} disabled={save.isPending} data-testid="jual-save-button"><Save className="size-4" /> {save.isPending ? "Menyimpan..." : "Simpan"}</Button></div>
      <DuplicateDialog message={dupMsg} onClose={() => setDupMsg(null)} />
    </div>
  );
}

export default function PenjualanPage() {
  const wh = useWh();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["penjualan", wh], enabled: !!wh, queryFn: () => apiGet<Penjualan[]>(`/internal/penjualan?${whqs(wh)}`) });
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<Penjualan | null>(null);
  const [toDelete, setToDelete] = useState<Penjualan | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const today = useToday();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qGul, setQGul] = useState("");
  const effFrom = from || today.data?.today || "";
  const effTo = to || today.data?.today || "";

  const del = useMutation({ mutationFn: (id: string) => apiDelete(`/internal/penjualan/${id}?${whqs(wh)}`), onSuccess: () => { toast.success("Penjualan dihapus"); setToDelete(null); qc.invalidateQueries({ queryKey: ["penjualan", wh] }); }, onError: (e) => toast.error(errMsg(e)) });

  const onImport = async (input: HTMLInputElement) => {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    setImporting(true);
    try { const fd = new FormData(); fd.append("file", file); const res = await fetch(`/api/internal/penjualan/import?${whqs(wh)}`, { method: "POST", body: fd }); const body = await res.json(); if (!res.ok) throw new Error(body.detail || "gagal"); toast.success(`${body.created} penjualan diimpor`); qc.invalidateQueries({ queryKey: ["penjualan", wh] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Gagal impor"); } finally { setImporting(false); }
  };

  const filtered = useMemo(() => (list.data ?? []).filter((p) => (!effFrom || p.tanggal_jual >= effFrom) && (!effTo || p.tanggal_jual <= effTo) && (p.gulungan || "").toLowerCase().includes(qGul.trim().toLowerCase())), [list.data, effFrom, effTo, qGul]);
  const sort = useSort<Penjualan>(filtered);
  const paged = usePaged(sort.sorted, 100);
  const rows = filtered;
  const summary = useMemo(() => {
    const guls = new Set<string>(); let koli = 0;
    for (const p of filtered) { if (p.gulungan) guls.add(p.gulungan); koli += p.jumlah_seri; }
    return { gulungan: guls.size, koli };
  }, [filtered]);
  const totBruto = (p: Penjualan) => p.items.reduce((s, i) => s + (i.bruto || 0), 0);
  const totNetto = (p: Penjualan) => p.items.reduce((s, i) => s + (i.netto || 0), 0);

  if (mode === "form") return (<div><PageHeader eyebrow="Internal" title={editing ? "Edit Penjualan" : "Tambah Penjualan"} /><PenjualanForm key={editing?.id ?? "new"} wh={wh} editing={editing} onDone={() => { setMode("list"); setEditing(null); }} /></div>);

  return (
    <div>
      <PageHeader eyebrow="Internal" title="Penjualan" actions={<>
        <Button variant="outline" onClick={() => downloadXlsx(`/internal/penjualan/template?${whqs(wh)}`).catch(() => toast.error("Gagal"))} data-testid="penjualan-template-button"><Download className="size-4" /> Format Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onImport(e.currentTarget)} data-testid="penjualan-import-input" />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} data-testid="penjualan-import-button"><Upload className="size-4" /> {importing ? "Mengimpor..." : "Upload Excel"}</Button>
        <Button onClick={() => { setEditing(null); setMode("form"); }} data-testid="add-penjualan-button"><Plus className="size-4" /> Tambah</Button>
      </>} />
      <Toolbar>
        <div className="space-y-1.5"><Label>Tanggal Dari</Label><DateField testId="jual-filter-from" value={effFrom} onChange={setFrom} /></div>
        <div className="space-y-1.5"><Label>Sampai</Label><DateField testId="jual-filter-to" value={effTo} onChange={setTo} /></div>
        <div className="space-y-1.5"><Label>Cari Gulungan</Label><div className="relative"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input data-testid="jual-filter-gulungan" className="pl-8 uppercase placeholder:normal-case" value={qGul} onChange={(e) => setQGul(e.target.value)} /></div></div>
      </Toolbar>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 md:max-w-md" data-testid="penjualan-summary">
        <div className="rounded-xl border bg-white px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Jumlah Gulungan</p><p className="mt-1 font-mono text-base font-bold text-amber-950">{numId(summary.gulungan, 0)}</p></div>
        <div className="rounded-xl border bg-white px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Jumlah Koli</p><p className="mt-1 font-mono text-base font-bold text-amber-950">{numId(summary.koli, 0)}</p></div>
      </div>
      <section className="overflow-x-auto rounded-2xl border bg-white">
        <Table data-testid="penjualan-table">
          <TableHeader><TableRow className="bg-muted/60">
            <SortHead label="Tanggal Jual" sortKey="tanggal_jual" state={sort} onToggle={sort.toggle} />
            <SortHead label="Gulungan" sortKey="gulungan" state={sort} onToggle={sort.toggle} />
            <SortHead label="Jml Koli" sortKey="jumlah_seri" state={sort} onToggle={sort.toggle} align="right" />
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead className="text-right">Netto</TableHead>
            <SortHead label="Total Jual" sortKey="total_harga_jual" state={sort} onToggle={sort.toggle} align="right" />
            <SortHead label="Oleh" sortKey="created_by_name" state={sort} onToggle={sort.toggle} />
            <TableHead className="w-24 text-right">Aksi</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {paged.slice.map((p) => (
              <TableRow key={p.id} data-testid={`penjualan-row-${p.id}`}>
                <TableCell>{fmtDate(p.tanggal_jual)}</TableCell>
                <TableCell className="font-semibold">{p.gulungan || "—"}</TableCell>
                <TableCell className="text-right font-mono">{p.jumlah_seri}</TableCell>
                <TableCell className="text-right font-mono">{numId(totBruto(p))}</TableCell>
                <TableCell className="text-right font-mono">{numId(totNetto(p))}</TableCell>
                <TableCell className="text-right font-mono font-semibold">{rupiah(p.total_harga_jual)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.created_by_name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(p); setMode("form"); }} data-testid={`penjualan-edit-${p.id}`} aria-label="Edit"><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(p)} data-testid={`penjualan-delete-${p.id}`} aria-label="Hapus"><Trash2 className="size-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground">{list.isLoading ? "Memuat..." : "Belum ada penjualan."}</TableCell></TableRow>}
          </TableBody>
        </Table>
        <Paginator page={paged.page} total={paged.total} count={paged.count} onPage={paged.setPage} testId="penjualan" />
      </section>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Hapus penjualan ini?" description="Data penjualan akan dihapus permanen." onConfirm={() => toDelete && del.mutate(toDelete.id)} pending={del.isPending} testId="penjualan-delete-dialog" />
    </div>
  );
}
