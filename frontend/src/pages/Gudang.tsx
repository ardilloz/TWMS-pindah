import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, GitBranchPlus, MapPin, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmTypeDialog } from "@/components/ConfirmTypeDialog";
import { PageHeader } from "@/components/PageHeader";
import { SimpleSelect } from "@/components/SimpleSelect";
import { apiDelete, apiPost, apiPut } from "@/lib/api";
import { errMsg, fmtBase, nf } from "@/lib/format";
import { can } from "@/lib/perms";
import { useMe, useStock, useWarehouses } from "@/lib/queries";
import type { StockRow, Warehouse, WarehouseIn } from "@/lib/types";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/lib/internal";
import { warehouseTree } from "@/lib/warehouses";

type Kind = "induk" | "ranting";

function dialogTitle(initial: Warehouse | null, kind: Kind): string {
  if (initial) return initial.parent_id ? "Edit Ranting" : "Edit Gudang";
  return kind === "ranting" ? "Tambah Ranting Gudang" : "Tambah Gudang Induk";
}

function savedMessage(initial: Warehouse | null, kind: Kind): string {
  if (initial) return "Gudang diperbarui";
  return kind === "ranting" ? "Ranting ditambahkan" : "Gudang induk ditambahkan";
}

function WarehouseFormDialog({
  open,
  onOpenChange,
  initial,
  initialKind,
  initialParent,
  indukOptions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: Warehouse | null;
  initialKind: Kind;
  initialParent: string;
  indukOptions: { value: string; label: string }[];
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [form, setForm] = useState({ name: initial?.name ?? "", location: initial?.location ?? "", parent: initialParent });
  const [logoUrl, setLogoUrl] = useState<string>(initial?.logo_url ?? "");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const options = indukOptions.filter((o) => o.value !== initial?.id);

  const onLogo = async (input: HTMLInputElement) => {
    const file = input.files?.[0]; input.value = ""; if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch(`/api/internal/upload/ktp`, { method: "POST", body: fd });
      const body = await res.json(); if (!res.ok) throw new Error(body.detail || "gagal");
      setLogoUrl(body.path);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Gagal unggah logo"); } finally { setUploadingLogo(false); }
  };

  const m = useMutation({
    mutationFn: (b: WarehouseIn) => (initial ? apiPut<Warehouse>(`/warehouses/${initial.id}`, b) : apiPost<Warehouse>("/warehouses", b)),
    onSuccess: () => {
      toast.success(savedMessage(initial, kind));
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => onOpenChange(o)}>
      <DialogContent data-testid="warehouse-form-dialog">
        <DialogHeader>
          <DialogTitle>{dialogTitle(initial, kind)}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return toast.error("Nama gudang wajib diisi");
            if (kind === "ranting" && !form.parent) return toast.error("Pilih gudang induk untuk ranting ini");
            m.mutate({ name: form.name, location: form.location, parent_id: kind === "ranting" ? form.parent : null, logo_url: logoUrl });
          }}
        >
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-1" data-testid="warehouse-form-kind">
            {(["induk", "ranting"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                data-testid={`warehouse-form-kind-${k}`}
                className={cn("rounded-md py-1.5 text-sm font-medium transition-colors duration-150", kind === k ? "bg-white text-amber-900 shadow-sm" : "text-muted-foreground")}
              >
                {k === "induk" ? "Gudang Induk" : "Ranting"}
              </button>
            ))}
          </div>
          {kind === "ranting" && (
            <div className="space-y-1.5">
              <Label>Menginduk ke Gudang</Label>
              <SimpleSelect value={form.parent} onChange={(v) => setForm({ ...form, parent: v })} placeholder="Pilih gudang induk" testId="warehouse-form-parent-select" options={options} />
              {options.length === 0 && <p className="text-xs text-red-700">Belum ada gudang induk. Buat gudang induk terlebih dahulu.</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">{kind === "ranting" ? "Nama Ranting" : "Nama Gudang"}</Label>
            <Input id="wh-name" data-testid="warehouse-form-name-input" className="uppercase placeholder:normal-case" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-loc">Lokasi (opsional)</Label>
            <Input id="wh-loc" data-testid="warehouse-form-location-input" className="uppercase placeholder:normal-case" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Logo Gudang (tampil di kanan atas nota/laporan saat cetak)</Label>
            <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.currentTarget)} data-testid="warehouse-logo-input" />
            <div className="flex items-center gap-3">
              {logoUrl && <img src={fileUrl(logoUrl)} alt="Logo" className="h-14 w-14 rounded border object-contain bg-white" data-testid="warehouse-logo-preview" />}
              <Button type="button" variant="outline" onClick={() => logoRef.current?.click()} data-testid="warehouse-logo-button">{logoUrl ? "Ganti Logo" : "Unggah Logo"}</Button>
              {logoUrl && <Button type="button" variant="ghost" onClick={() => setLogoUrl("")} data-testid="warehouse-logo-remove">Hapus</Button>}
              {uploadingLogo && <span className="text-xs text-muted-foreground">Mengunggah...</span>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="warehouse-form-cancel">
              Batal
            </Button>
            <Button type="submit" disabled={m.isPending} data-testid="warehouse-form-submit">
              {m.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StockChips({ r, compact }: { r?: StockRow; compact?: boolean }) {
  const g = fmtBase("glangse", r?.glangse_lembar ?? 0);
  return (
    <dl className={cn("grid grid-cols-3 gap-2 text-center", compact && "gap-1.5")}>
      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-900">
        <dt className="text-[10px] font-semibold uppercase tracking-wider">Glangse</dt>
        <dd className="font-mono text-sm font-semibold">{g.main}</dd>
        {!compact && <dd className="font-mono text-[11px] opacity-80">{g.sub}</dd>}
      </div>
      <div className="rounded-lg bg-indigo-50 p-2 text-indigo-900">
        <dt className="text-[10px] font-semibold uppercase tracking-wider">Tali</dt>
        <dd className="font-mono text-sm font-semibold">{nf(r?.tali_kg ?? 0)} kg</dd>
      </div>
      <div className="rounded-lg bg-amber-50 p-2 text-amber-950">
        <dt className="text-[10px] font-semibold uppercase tracking-wider">Kertas</dt>
        <dd className="font-mono text-sm font-semibold">{nf(r?.kertas_roll ?? 0)} roll</dd>
      </div>
    </dl>
  );
}

export default function Gudang() {
  const qc = useQueryClient();
  const me = useMe();
  const whs = useWarehouses();
  const stock = useStock();
  const canManage = can(me.data, "gudang");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [formKind, setFormKind] = useState<Kind>("induk");
  const [formParent, setFormParent] = useState("");
  const [toDelete, setToDelete] = useState<Warehouse | null>(null);

  const tree = warehouseTree(whs.isError ? [] : whs.data);
  const indukOptions = tree.map((n) => ({ value: n.warehouse.id, label: n.warehouse.name }));
  const stockOf = (id: string) => stock.data?.rows.find((x) => x.warehouse_id === id);

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean; deleted_transactions: number }>(`/warehouses/${id}`),
    onSuccess: (res) => {
      toast.success(`Gudang dihapus beserta ${res.deleted_transactions} transaksi terkait`);
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e) => {
      toast.error(errMsg(e));
      setToDelete(null);
    },
  });

  const openForm = (w: Warehouse | null, kind: Kind, parent = "") => {
    setEditing(w);
    setFormKind(kind);
    setFormParent(parent);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const actions = (w: Warehouse) =>
    canManage && (
      <div className="flex shrink-0">
        <Button variant="ghost" size="icon-sm" onClick={() => openForm(w, w.parent_id ? "ranting" : "induk", w.parent_id ?? "")} data-testid={`warehouse-edit-${w.id}`} aria-label="Edit gudang">
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(w)} data-testid={`warehouse-delete-${w.id}`} aria-label="Hapus gudang">
          <Trash2 className="size-4 text-red-600" />
        </Button>
      </div>
    );

  return (
    <div>
      <PageHeader
        eyebrow="Master Data"
        title="Kelola Gudang"
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => openForm(null, "ranting")} data-testid="add-ranting-button" disabled={tree.length === 0}>
                <GitBranchPlus className="size-4" /> Tambah Ranting
              </Button>
              <Button onClick={() => openForm(null, "induk")} data-testid="add-warehouse-button">
                <Plus className="size-4" /> Tambah Gudang Induk
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-5 lg:grid-cols-2" data-testid="warehouse-list">
        {tree.map((n, i) => (
          <article
            key={n.warehouse.id}
            className="animate-rise rounded-2xl border bg-white p-5 transition-[box-shadow] duration-200 hover:shadow-md"
            style={{ animationDelay: `${i * 40}ms` }}
            data-testid={`warehouse-card-${n.warehouse.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-[#3D2411] text-[#E69C24]">
                  <WarehouseIcon className="size-5" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">Gudang Induk</p>
                  <h3 className="font-heading text-lg font-semibold leading-tight" data-testid={`warehouse-name-${n.warehouse.id}`}>
                    {n.warehouse.name}
                  </h3>
                  {n.warehouse.location && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {n.warehouse.location}
                    </p>
                  )}
                </div>
              </div>
              {actions(n.warehouse)}
            </div>
            <div className="mt-4">
              <StockChips r={stockOf(n.warehouse.id)} />
            </div>

            <div className="mt-5 border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ranting ({n.ranting.length})</p>
                {canManage && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline"
                    onClick={() => openForm(null, "ranting", n.warehouse.id)}
                    data-testid={`warehouse-add-ranting-${n.warehouse.id}`}
                  >
                    <Plus className="size-3.5" /> Ranting
                  </button>
                )}
              </div>
              <ul className="space-y-2">
                {n.ranting.map((r) => (
                  <li key={r.id} className="rounded-xl border bg-muted/30 p-3" data-testid={`ranting-item-${r.id}`}>
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <CornerDownRight className="mt-0.5 size-4 text-amber-700" />
                        <div>
                          <p className="font-semibold leading-tight" data-testid={`warehouse-name-${r.id}`}>{r.name}</p>
                          {r.location && <p className="text-xs text-muted-foreground">{r.location}</p>}
                        </div>
                      </div>
                      {actions(r)}
                    </div>
                    <StockChips r={stockOf(r.id)} compact />
                  </li>
                ))}
                {n.ranting.length === 0 && <li className="text-sm text-muted-foreground">Belum ada ranting.</li>}
              </ul>
            </div>
          </article>
        ))}
        {whs.data && whs.data.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-muted-foreground lg:col-span-2" data-testid="warehouse-empty">
            Belum ada gudang. Mulai dengan menambahkan gudang induk.
          </div>
        )}
      </div>

      <WarehouseFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        initialKind={formKind}
        initialParent={formParent}
        indukOptions={indukOptions}
      />
      <ConfirmTypeDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Hapus ${toDelete?.name ?? "gudang"}?`}
        description="Menghapus gudang ini akan otomatis menghapus SELURUH transaksi yang terkait (barang masuk, keluar, dan transfer) beserta rantingnya. Tindakan ini tidak dapat dibatalkan."
        confirmWord="konfirmasi"
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        pending={del.isPending}
        testId="warehouse-delete-dialog"
      />
    </div>
  );
}
