import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ItemPicker, QtyInput, defaultUnit } from "@/components/ItemFields";
import { DriverFields } from "@/components/DriverFields";
import { DateField } from "@/components/DateField";
import { PageHeader } from "@/components/PageHeader";
import { SimpleSelect } from "@/components/SimpleSelect";
import { apiPost } from "@/lib/api";
import { ITEM_META, errMsg, fmtBase, fmtTxQty, parseQty, stockOf, toBase } from "@/lib/format";
import { useMe, useStock, useToday, useWarehouses } from "@/lib/queries";
import { can } from "@/lib/perms";
import type { ItemKey, Transaction, TxKeluarIn, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { warehouseOptions } from "@/lib/warehouses";

type KeluarType = "transfer" | "pribadi";

const SUBMIT_LABEL: Record<KeluarType, string> = { transfer: "Simpan Transfer", pribadi: "Simpan Penggunaan" };

export default function BarangKeluar() {
  const qc = useQueryClient();
  const today = useToday();
  const whs = useWarehouses();
  const stock = useStock();

  const me = useMe();
  const canTransfer = can(me.data, "transfer");
  const canPribadi = can(me.data, "pribadi");
  const [type, setType] = useState<KeluarType>(canTransfer || !canPribadi ? "transfer" : "pribadi");
  const [date, setDate] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [item, setItem] = useState<ItemKey>("glangse");
  const [unit, setUnit] = useState<Unit>("gulung");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");

  const effDate = date || today.data?.today || "";
  const row = stock.data?.rows.find((r) => r.warehouse_id === warehouseId);
  const available = stockOf(row, item);
  const availFmt = fmtBase(item, available);
  const n = parseQty(qty);
  const base = Number.isFinite(n) && n > 0 ? toBase(item, n, unit) : 0;
  const over = base > available + 1e-9;

  const m = useMutation({
    mutationFn: (b: TxKeluarIn) => apiPost<Transaction>("/transactions/keluar", b),
    onSuccess: (t) => {
      toast.success(
        t.type === "transfer"
          ? `Transfer ${ITEM_META[t.item].label} ${fmtTxQty(t)} ke ${t.target_warehouse_name} berhasil`
          : `Penggunaan ${ITEM_META[t.item].label} ${fmtTxQty(t)} tercatat`,
      );
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
    if (!warehouseId) return toast.error("Pilih gudang asal");
    if (type === "transfer" && !targetId) return toast.error("Pilih gudang tujuan");
    if (!effDate) return toast.error("Tanggal wajib diisi");
    if (!Number.isFinite(n) || n <= 0) return toast.error("Jumlah harus lebih dari 0");
    if (item === "kertas" && !Number.isInteger(n)) return toast.error("Kertas Coklat harus bilangan bulat (roll)");
    m.mutate({
      date: effDate,
      type,
      warehouse_id: warehouseId,
      target_warehouse_id: type === "transfer" ? targetId : null,
      item,
      qty: n,
      unit,
      note,
      driver_name: driverName,
      vehicle_number: vehicleNumber,
    });
  };

  const whOptions = warehouseOptions(whs.data);

  return (
    <div>
      <PageHeader
        eyebrow="Pengeluaran"
        title="Barang Keluar / Pemakaian"
      />
      <form
        className="max-w-4xl space-y-6 rounded-2xl border bg-white p-5 md:p-7"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        data-testid="barang-keluar-form"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              { k: "transfer", label: "Transfer ke Gudang Lain", desc: "Stok pindah ke gudang tujuan", icon: ArrowRightLeft },
              { k: "pribadi", label: "Penggunaan Pribadi", desc: "Stok berkurang untuk dipakai", icon: UserRound },
            ] as const
          )
            .filter((o) => (o.k === "transfer" ? canTransfer : canPribadi) || !me.data)
            .map((o) => (
            <button
              type="button"
              key={o.k}
              data-testid={`keluar-type-${o.k}`}
              onClick={() => setType(o.k)}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150",
                type === o.k ? "border-amber-500 bg-amber-50 shadow-sm ring-2 ring-amber-500/30" : "bg-white hover:bg-muted",
              )}
            >
              <o.icon className={cn("mt-0.5 size-5", type === o.k ? "text-amber-700" : "text-muted-foreground")} />
              <span>
                <span className="block font-semibold">{o.label}</span>
                <span className="text-xs text-muted-foreground">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Gudang Asal</Label>
            <SimpleSelect
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                if (v === targetId) setTargetId("");
              }}
              placeholder="Pilih gudang asal"
              testId="keluar-warehouse-select"
              options={whOptions}
            />
          </div>
          {type === "transfer" && (
            <div className="space-y-1.5">
              <Label>Gudang Tujuan</Label>
              <SimpleSelect
                value={targetId}
                onChange={setTargetId}
                placeholder="Pilih gudang tujuan"
                testId="keluar-target-select"
                options={whOptions.filter((o) => o.value !== warehouseId)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="keluar-date">Tanggal</Label>
            <DateField id="keluar-date" testId="keluar-date-input" className="bg-white" value={effDate} onChange={setDate} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Barang</Label>
          <ItemPicker
            value={item}
            testPrefix="keluar"
            onChange={(i) => {
              setItem(i);
              setUnit(defaultUnit(i));
            }}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-2">
            <Label>Jumlah</Label>
            <QtyInput item={item} qty={qty} unit={unit} onQty={setQty} onUnit={setUnit} testPrefix="keluar" />
            {over && (
              <p className="text-sm font-medium text-amber-700" data-testid="keluar-over-warning">
                Jumlah melebihi stok tersedia — stok akan menjadi minus setelah disimpan.
              </p>
            )}
          </div>
          <div className={cn("rounded-xl border p-4", ITEM_META[item].tint)} data-testid="keluar-available-stock">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Stok tersedia</p>
            {warehouseId ? (
              <>
                <p className="mt-1 font-mono text-2xl font-semibold">{availFmt.main}</p>
                {availFmt.sub && <p className="font-mono text-sm opacity-80">{availFmt.sub}</p>}
              </>
            ) : (
              <p className="mt-1 text-sm opacity-80">Pilih gudang asal</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="keluar-note">
            {type === "pribadi" ? "Keterangan / Penerima / Keperluan" : "Keterangan (opsional)"}
          </Label>
          <Textarea
            id="keluar-note"
            data-testid="keluar-note-input"
            className="bg-white uppercase placeholder:normal-case"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {type !== "pribadi" && (
          <DriverFields driver={driverName} vehicle={vehicleNumber} onDriver={setDriverName} onVehicle={setVehicleNumber} testPrefix="keluar" />
        )}

        <div className="flex justify-end border-t pt-5">
          <Button type="submit" size="lg" disabled={m.isPending} data-testid="keluar-submit-button">
            {m.isPending ? "Menyimpan..." : SUBMIT_LABEL[type]}
          </Button>
        </div>
      </form>
    </div>
  );
}
