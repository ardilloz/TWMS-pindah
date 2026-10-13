import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmTypeDialog } from "@/components/ConfirmTypeDialog";
import { PageHeader } from "@/components/PageHeader";
import { SupplierFormDialog } from "@/components/SupplierFormDialog";
import { apiDelete } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { useMe, useSuppliers } from "@/lib/queries";
import { can, isAdmin } from "@/lib/perms";
import type { Supplier } from "@/lib/types";

export default function SupplierPage() {
  const qc = useQueryClient();
  const me = useMe();
  const sups = useSuppliers();
  const canManage = can(me.data, "supplier");
  const admin = isAdmin(me.data);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean; deleted_transactions: number }>(`/suppliers/${id}`),
    onSuccess: (res) => {
      toast.success(`Supplier dihapus beserta ${res.deleted_transactions} transaksi terkait`);
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["report"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const openForm = (s: Supplier | null) => {
    setEditing(s);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const rows = sups.isError ? [] : sups.data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Master Data"
        title="Kelola Supplier"
        actions={
          <Button onClick={() => openForm(null)} data-testid="add-supplier-button">
            <Plus className="size-4" /> Tambah Supplier
          </Button>
        }
      />
      <section className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="supplier-table">
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead>Nama Supplier</TableHead>
              <TableHead>Telepon</TableHead>
              <TableHead>Alamat / Asal</TableHead>
              {canManage && <TableHead className="w-24 text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id} data-testid={`supplier-row-${s.id}`}>
                <TableCell className="font-semibold">{s.name}</TableCell>
                <TableCell className="font-mono text-sm">{s.phone || "—"}</TableCell>
                <TableCell>{s.address || "—"}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => openForm(s)} data-testid={`supplier-edit-${s.id}`} aria-label="Edit supplier">
                      <Pencil className="size-4" />
                    </Button>
                    {admin && (
                      <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(s)} data-testid={`supplier-delete-${s.id}`} aria-label="Hapus supplier">
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  {sups.isLoading ? "Memuat..." : "Belum ada supplier."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <SupplierFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} initial={editing} />
      <ConfirmTypeDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Hapus ${toDelete?.name ?? "supplier"}?`}
        description="Menghapus supplier ini akan otomatis menghapus SEMUA transaksi barang masuk dari supplier tersebut. Tindakan ini tidak dapat dibatalkan."
        confirmWord="konfirmasi"
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        pending={del.isPending}
        testId="supplier-delete-dialog"
      />
    </div>
  );
}
