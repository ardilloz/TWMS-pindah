import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Download, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ConfirmTypeDialog } from "@/components/ConfirmTypeDialog";
import { NoAccess } from "@/components/Guard";
import { PageHeader } from "@/components/PageHeader";
import { apiGet, apiPost } from "@/lib/api";
import { errMsg, fmtDate } from "@/lib/format";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface BackupMeta {
  id: string;
  created_at: string;
  created_by: string;
  counts: Record<string, number>;
}

export default function MasterData() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const [resetOpen, setResetOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<{ payload: unknown; counts: Record<string, number>; name: string } | null>(null);

  const backups = useQuery({ queryKey: ["backups"], queryFn: () => apiGet<BackupMeta[]>("/admin/backups"), enabled: isAdmin });

  const reset = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>("/admin/reset", { confirm: "konfirmasi reset" }),
    onSuccess: () => {
      toast.success("Semua data transaksi, gudang, dan supplier telah direset");
      setResetOpen(false);
      ["warehouses", "suppliers", "transactions", "stock", "report"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const backup = useMutation({
    mutationFn: () => apiPost<BackupMeta>("/admin/backup"),
    onSuccess: () => {
      toast.success("Backup database berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const restore = useMutation({
    mutationFn: (payload: unknown) => apiPost<{ ok: boolean; restored: Record<string, number> }>("/admin/restore", { data: payload }),
    onSuccess: (res) => {
      toast.success(`Data dipulihkan: ${res.restored.transactions ?? 0} transaksi, ${res.restored.warehouses ?? 0} gudang, ${res.restored.suppliers ?? 0} supplier`);
      setPendingRestore(null);
      ["warehouses", "suppliers", "transactions", "stock", "report"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => {
      toast.error(errMsg(e));
      setPendingRestore(null);
    },
  });

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const d = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
      setPendingRestore({
        payload: parsed,
        counts: {
          transactions: (d.transactions ?? []).length,
          warehouses: (d.warehouses ?? []).length,
          suppliers: (d.suppliers ?? []).length,
        },
        name: file.name,
      });
    } catch {
      toast.error("File backup tidak valid (harus file .json hasil export)");
    }
  };

  if (me.data && !isAdmin) return <NoAccess />;
  const rows = backups.isError ? [] : backups.data ?? [];

  return (
    <div>
      <PageHeader eyebrow="Pengaturan" title="Master Data" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6" data-testid="reset-card">
          <div className="flex items-center gap-2 text-red-700">
            <RotateCcw className="size-5" />
            <h2 className="font-heading text-lg font-bold">Reset Seluruh Data</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Menghapus SEMUA transaksi, gudang, dan supplier sehingga aplikasi kembali kosong dari nol. Hanya akun admin (akses penuh) yang dipertahankan; akun staff ikut terhapus. Tindakan ini tidak bisa dibatalkan.
          </p>
          <Button variant="destructive" className="mt-4" onClick={() => setResetOpen(true)} data-testid="reset-button">
            <RotateCcw className="size-4" /> Reset Sekarang
          </Button>
        </section>

        <section className="rounded-2xl border bg-white p-6" data-testid="backup-card">
          <div className="flex items-center gap-2 text-amber-800">
            <Database className="size-5" />
            <h2 className="font-heading text-lg font-bold">Backup Database</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Simpan cadangan seluruh data aplikasi. Setiap backup dapat diekspor menjadi file .json.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => backup.mutate()} disabled={backup.isPending} data-testid="backup-button">
              <Database className="size-4" /> {backup.isPending ? "Memproses..." : "Backup Sekarang"}
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.currentTarget)} data-testid="restore-file-input" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="restore-button">
              <Upload className="size-4" /> Impor Backup (.json)
            </Button>
          </div>

          <div className="mt-5 space-y-2" data-testid="backup-list">
            {rows.length === 0 && <p className="text-sm text-muted-foreground">{backups.isLoading ? "Memuat..." : "Belum ada backup."}</p>}
            {rows.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2" data-testid={`backup-row-${b.id}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {fmtDate(b.created_at.slice(0, 10))} · {b.created_by}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.counts.transactions ?? 0} transaksi · {b.counts.warehouses ?? 0} gudang · {b.counts.suppliers ?? 0} supplier
                  </p>
                </div>
                <a
                  href={`/api/admin/backups/${b.id}/export`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
                  data-testid={`backup-export-${b.id}`}
                >
                  <Download className="size-4" /> Export
                </a>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ConfirmTypeDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset seluruh data aplikasi?"
        description="Semua transaksi, gudang, dan supplier akan dihapus permanen. Aplikasi kembali kosong dari nol. Hanya akun admin yang dipertahankan; akun staff ikut terhapus."
        confirmWord="konfirmasi reset"
        confirmLabel="Reset Sekarang"
        onConfirm={() => reset.mutate()}
        pending={reset.isPending}
        testId="reset-dialog"
      />

      <ConfirmDialog
        open={!!pendingRestore}
        onOpenChange={(o) => !o && setPendingRestore(null)}
        title="Pulihkan data dari backup?"
        description={
          pendingRestore
            ? `File: ${pendingRestore.name}. Ini akan MENGGANTI seluruh gudang, supplier, dan transaksi saat ini dengan isi backup (${pendingRestore.counts.transactions} transaksi, ${pendingRestore.counts.warehouses} gudang, ${pendingRestore.counts.suppliers} supplier).`
            : ""
        }
        onConfirm={() => pendingRestore && restore.mutate(pendingRestore.payload)}
        pending={restore.isPending}
        testId="restore-dialog"
      />
    </div>
  );
}
