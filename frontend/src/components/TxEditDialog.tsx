import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemPicker, QtyInput, defaultUnit } from "@/components/ItemFields";
import { DriverFields } from "@/components/DriverFields";
import { DateField } from "@/components/DateField";
import { SimpleSelect } from "@/components/SimpleSelect";
import { apiPut } from "@/lib/api";
import { TYPE_META, errMsg, parseQty } from "@/lib/format";
import { useSuppliers, useWarehouses } from "@/lib/queries";
import { warehouseOptions } from "@/lib/warehouses";
import type { ItemKey, Transaction, TxUpdateIn, Unit } from "@/lib/types";

// Parent remounts via `key={tx.id}` so state re-initialises per transaction.
export function TxEditDialog({
  tx,
  open,
  onOpenChange,
}: {
  tx: Transaction;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const whs = useWarehouses();
  const sups = useSuppliers();
  const [date, setDate] = useState(tx.date);
  const [warehouseId, setWarehouseId] = useState(tx.warehouse_id);
  const [targetId, setTargetId] = useState(tx.target_warehouse_id ?? "");
  const [supplierId, setSupplierId] = useState(tx.supplier_id ?? "");
  const [item, setItem] = useState<ItemKey>(tx.item);
  const [unit, setUnit] = useState<Unit>(tx.input_unit);
  const [qty, setQty] = useState(String(tx.input_qty).replace(".", ","));
  const [note, setNote] = useState(tx.note);
  const [driverName, setDriverName] = useState(tx.driver_name ?? "");
  const [vehicleNumber, setVehicleNumber] = useState(tx.vehicle_number ?? "");

  const m = useMutation({
    mutationFn: (b: TxUpdateIn) => apiPut<Transaction>(`/transactions/${tx.id}`, b),
    onSuccess: () => {
      toast.success("Transaksi berhasil direvisi");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const whOptions = warehouseOptions(whs.data);

  const submit = () => {
    const n = parseQty(qty);
    if (!Number.isFinite(n) || n <= 0) return toast.error("Jumlah harus lebih dari 0");
    if (item === "kertas" && !Number.isInteger(n)) return toast.error("Kertas Coklat harus bilangan bulat (roll)");
    if (tx.type === "masuk" && !supplierId) return toast.error("Pilih supplier");
    if (tx.type === "transfer" && !targetId) return toast.error("Pilih gudang tujuan");
    m.mutate({
      date,
      warehouse_id: warehouseId,
      target_warehouse_id: tx.type === "transfer" ? targetId : null,
      supplier_id: tx.type === "masuk" ? supplierId : null,
      item,
      qty: n,
      unit,
      note,
      driver_name: driverName,
      vehicle_number: vehicleNumber,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="tx-edit-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Revisi Transaksi <Badge className={TYPE_META[tx.type].badge}>{TYPE_META[tx.type].label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-date">Tanggal</Label>
              <DateField id="edit-date" testId="tx-edit-date-input" value={date} onChange={setDate} />
            </div>
            {tx.type === "masuk" && (
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <SimpleSelect
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder={tx.supplier_name ?? "Pilih supplier"}
                  testId="tx-edit-supplier-select"
                  options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>{tx.type === "masuk" ? "Gudang Tujuan" : "Gudang Asal"}</Label>
              <SimpleSelect value={warehouseId} onChange={setWarehouseId} placeholder={tx.warehouse_name} testId="tx-edit-warehouse-select" options={whOptions} />
            </div>
            {tx.type === "transfer" && (
              <div className="space-y-1.5">
                <Label>Gudang Tujuan</Label>
                <SimpleSelect
                  value={targetId}
                  onChange={setTargetId}
                  placeholder={tx.target_warehouse_name ?? "Pilih gudang"}
                  testId="tx-edit-target-select"
                  options={whOptions.filter((o) => o.value !== warehouseId)}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Barang</Label>
            <ItemPicker
              value={item}
              testPrefix="tx-edit"
              onChange={(i) => {
                setItem(i);
                setUnit(defaultUnit(i));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Jumlah</Label>
            <QtyInput item={item} qty={qty} unit={unit} onQty={setQty} onUnit={setUnit} testPrefix="tx-edit" />
          </div>
          <DriverFields driver={driverName} vehicle={vehicleNumber} onDriver={setDriverName} onVehicle={setVehicleNumber} testPrefix="tx-edit" />
          <div className="space-y-1.5">
            <Label htmlFor="edit-note">Keterangan</Label>
            <Textarea id="edit-note" data-testid="tx-edit-note-input" className="uppercase placeholder:normal-case" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="tx-edit-cancel">
              Batal
            </Button>
            <Button type="submit" disabled={m.isPending} data-testid="tx-edit-submit">
              {m.isPending ? "Menyimpan..." : "Simpan Revisi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
