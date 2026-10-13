import { Input } from "@/components/ui/input";
import { ITEM_KEYS, ITEM_META, LEMBAR_PER_GULUNG, nf, parseQty } from "@/lib/format";
import type { ItemKey, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ItemPicker({
  value,
  onChange,
  testPrefix,
}: {
  value: ItemKey;
  onChange: (i: ItemKey) => void;
  testPrefix: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {ITEM_KEYS.map((k) => {
        const m = ITEM_META[k];
        const active = value === k;
        return (
          <button
            type="button"
            key={k}
            data-testid={`${testPrefix}-item-${k}`}
            onClick={() => onChange(k)}
            className={cn(
              "rounded-xl border px-4 py-3 text-left transition-[border-color,box-shadow,background-color] duration-150",
              active ? cn(m.tint, "shadow-sm ring-2 ring-offset-1 ring-amber-600/40") : "border-border bg-white hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2 font-semibold">
              <span className={cn("size-2 rounded-full", m.dot)} />
              {m.label}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{m.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export function QtyInput({
  item,
  qty,
  unit,
  onQty,
  onUnit,
  testPrefix,
}: {
  item: ItemKey;
  qty: string;
  unit: Unit;
  onQty: (v: string) => void;
  onUnit: (u: Unit) => void;
  testPrefix: string;
}) {
  const n = parseQty(qty);
  const valid = Number.isFinite(n) && n > 0;
  let preview = "";
  if (item === "glangse" && valid) {
    preview =
      unit === "gulung"
        ? `= ${nf(n * LEMBAR_PER_GULUNG)} koli`
        : `= ${nf(n / LEMBAR_PER_GULUNG, 4)} gulung`;
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          data-testid={`${testPrefix}-qty-input`}
          inputMode="decimal"
          placeholder={item === "kertas" ? "contoh: 10" : "contoh: 10,5"}
          value={qty}
          onChange={(e) => onQty(e.target.value)}
          className="h-11 bg-white font-mono text-lg"
        />
        {item === "glangse" ? (
          <div className="flex shrink-0 rounded-lg border bg-muted p-1" data-testid={`${testPrefix}-unit-toggle`}>
            {(["gulung", "koli"] as Unit[]).map((u) => (
              <button
                type="button"
                key={u}
                data-testid={`${testPrefix}-unit-${u}`}
                onClick={() => onUnit(u)}
                className={cn(
                  "rounded-md px-3 text-sm font-medium capitalize transition-colors duration-150",
                  unit === u ? "bg-white text-amber-900 shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {u}
              </button>
            ))}
          </div>
        ) : (
          <span className="flex h-11 shrink-0 items-center rounded-lg border bg-muted px-4 text-sm font-medium">
            {item === "tali" ? "kg" : "roll"}
          </span>
        )}
      </div>
      {preview && (
        <p className="font-mono text-sm text-emerald-800" data-testid={`${testPrefix}-conversion-preview`}>
          {preview}
        </p>
      )}
    </div>
  );
}

export function defaultUnit(item: ItemKey): Unit {
  return ITEM_META[item].units[0];
}
