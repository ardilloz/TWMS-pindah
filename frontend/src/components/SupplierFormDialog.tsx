import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, apiPut } from "@/lib/api";
import { errMsg } from "@/lib/format";
import type { Supplier, SupplierIn } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: Supplier | null;
  onSaved?: (s: Supplier) => void;
}

// Parent should remount (via `key`) when `initial` changes so the form state resets.
export function SupplierFormDialog({ open, onOpenChange, initial, onSaved }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SupplierIn>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
  });
  const m = useMutation({
    mutationFn: (b: SupplierIn) =>
      initial ? apiPut<Supplier>(`/suppliers/${initial.id}`, b) : apiPost<Supplier>("/suppliers", b),
    onSuccess: (s) => {
      toast.success(initial ? "Supplier diperbarui" : `Supplier "${s.name}" ditambahkan`);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      onSaved?.(s);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => onOpenChange(o)}>
      <DialogContent data-testid="supplier-form-dialog">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Supplier" : "Tambah Supplier Baru"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return toast.error("Nama supplier wajib diisi");
            m.mutate(form);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">Nama Supplier</Label>
            <Input id="sup-name" data-testid="supplier-form-name-input" className="uppercase placeholder:normal-case" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="contoh: CV Sumber Rejeki" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-phone">No. Telepon (opsional)</Label>
            <Input
              id="sup-phone"
              data-testid="supplier-form-phone-input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-address">Alamat / Asal (opsional)</Label>
            <Input id="sup-address" data-testid="supplier-form-address-input" className="uppercase placeholder:normal-case" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="supplier-form-cancel">
              Batal
            </Button>
            <Button type="submit" disabled={m.isPending} data-testid="supplier-form-submit">
              {m.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
