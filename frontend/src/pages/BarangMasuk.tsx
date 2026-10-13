import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemPicker, QtyInput, defaultUnit } from "@/components/ItemFields";
import { DriverFields } from "@/components/DriverFields";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { SimpleSelect } from "@/components/SimpleSelect";
import { SupplierFormDialog } from "@/components/SupplierFormDialog";
import { apiPost } from "@/lib/api";
import { ITEM_META, errMsg, fmtBase, fmtDate, fmtTxQty, parseQty, toBase } from "@/lib/format";
import { useMe, useSuppliers, useToday, useTransactions, useWarehouses } from "@/lib/queries";
import { can } from "@/lib/perms";
import type { ItemKey, Transaction, TxMasukIn, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { warehouseOptions } from "@/lib/warehouses";

export default function BarangMasuk() {
  const qc = useQueryClient();
  const today = useToday();
  const whs = useWarehouses();
  const sups = useSuppliers();
  const me = useMe();
  const canRiwayat = can(me.data, "riwayat");
  const recent = useTransactions({ type: "masuk", limit: "6" }, canRiwayat);

  const [date, setDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [item, setItem] = useState<ItemKey>("glangse");
  const [unit, setUnit] = useState<Unit>("gulung");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [supDialog, setSupDialog] = useState(false);
  const [supDialogKey, setSupDialogKey] = useState(0);

  const effDate = date || today.data?.today || "";

  const m = useMutation({
    mutationFn: (b: TxMasukIn) => apiPost<Transaction>("/transactions/masuk", b),
    onSuccess: (t) => {
      toast.success(`Barang masuk tercatat: ${ITEM_META[t.item].label} ${fmtTxQty(t)}`);
      setQty("");
      setNote("");
      setDriverName("");
      setVehicleNumber("");
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["report"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const submit = () => {
    const n = parseQty(qty);
    if (!supplierId) return toast.error("Pilih supplier terlebih dahulu");
    if (!warehouseId) return toast.error("Pilih gudang tujuan");
    if (!effDate) return toast.error("Tanggal wajib diisi");
    if (!Number.isFinite(n) || n <= 0) return toast.error("Jumlah harus lebih dari 0");
    if (item === "kertas" && !Number.isInteger(n)) return toast.error("Kertas Coklat harus bilangan bulat (roll)");
    m.mutate({ date: effDate, supplier_id: supplierId, warehouse_id: warehouseId, item, qty: n, unit, note, driver_name: driverName, vehicle_number: vehicleNumber });
  };

  const n = parseQty(qty);
  const summary = Number.isFinite(n) && n > 0 ? fmtBase(item, toBase(item, n, unit)) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Pemasukan"
        title="Barang Masuk"
      />
      <div className={cn("grid gap-6", canRiwayat && "xl:grid-cols-[1fr_380px]")}>
        <form
          className="space-y-6 rounded-2xl border bg-white p-5 md:p-7"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          data-testid="barang-masuk-form"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Supplier</Label>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-semibold text-amber-800 hover:underline"
                  data-testid="masuk-add-supplier-button"
                  onClick={() => {
                    setSupDialogKey((k) => k + 1);
                    setSupDialog(true);
                  }}
                >
                  <Plus className="size-3.5" /> Supplier baru
                </button>
              </div>
              <SimpleSelect
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Pilih supplier"
                testId="masuk-supplier-select"
                options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gudang Tujuan</Label>
              <SimpleSelect
                value={warehouseId}
                onChange={setWarehouseId}
                placeholder="Pilih gudang"
                testId="masuk-warehouse-select"
                options={warehouseOptions(whs.data)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="masuk-date">Tanggal</Label>
              <DateField id="masuk-date" testId="masuk-date-input" className="bg-white" value={effDate} onChange={setDate} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Barang</Label>
            <ItemPicker
              value={item}
              testPrefix="masuk"
              onChange={(i) => {
                setItem(i);
                setUnit(defaultUnit(i));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label>Jumlah</Label>
            <QtyInput item={item} qty={qty} unit={unit} onQty={setQty} onUnit={setUnit} testPrefix="masuk" />
          </div>

          <DriverFields driver={driverName} vehicle={vehicleNumber} onDriver={setDriverName} onVehicle={setVehicleNumber} testPrefix="masuk" />

          <div className="space-y-1.5">
            <Label htmlFor="masuk-note">Keterangan / No. Surat Jalan (opsional)</Label>
            <Textarea
              id="masuk-note"
              data-testid="masuk-note-input"
              className="bg-white uppercase placeholder:normal-case"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" data-testid="masuk-summary">
              {summary ? (
                <>
                  Stok bertambah{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {summary.main}
                    {summary.sub ? ` (${summary.sub})` : ""}
                  </span>
                </>
              ) : (
                "Isi jumlah barang untuk melihat ringkasan."
              )}
            </p>
            <Button type="submit" size="lg" disabled={m.isPending} data-testid="masuk-submit-button">
              {m.isPending ? "Menyimpan..." : "Simpan Barang Masuk"}
            </Button>
          </div>
        </form>

        {canRiwayat && (
        <aside className="rounded-2xl border bg-white p-5">
          <h3 className="mb-4 font-heading text-base font-semibold">Barang Masuk Terakhir</h3>
          <ul className="space-y-3" data-testid="masuk-recent-list">
            {(recent.isError ? [] : recent.data ?? []).map((t) => (
              <li key={t.id} className="rounded-xl border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={cn(ITEM_META[t.item].badge)}>
                    {ITEM_META[t.item].label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{fmtDate(t.date)}</span>
                </div>
                <p className="mt-2 font-mono font-semibold">{fmtTxQty(t)}</p>
                <p className="text-xs text-muted-foreground">
                  {t.supplier_name} → {t.warehouse_name}
                </p>
              </li>
            ))}
            {recent.data && recent.data.length === 0 && <li className="text-sm text-muted-foreground">Belum ada data.</li>}
          </ul>
        </aside>
        )}
      </div>

      <SupplierFormDialog
        key={supDialogKey}
        open={supDialog}
        onOpenChange={setSupDialog}
        onSaved={(s) => setSupplierId(s.id)}
      />
    </div>
  );
}
