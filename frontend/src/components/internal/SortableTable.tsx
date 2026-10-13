import { useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string | null;
  dir: SortDir;
}

/** Excel-like column sorting: click a header to toggle a-z / z-a. */
export function useSort<T>(rows: T[], initialKey: string | null = null, initialDir: SortDir = "asc") {
  const [key, setKey] = useState<string | null>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);
  const toggle = (k: string) => {
    if (key === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("asc"); }
  };
  const sorted = useMemo(() => {
    if (!key) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      const an = av == null || av === "";
      const bn = bv == null || bv === "";
      if (an && bn) return 0;
      if (an) return 1;
      if (bn) return -1;
      const c = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "id", { numeric: true, sensitivity: "base" });
      return dir === "asc" ? c : -c;
    });
    return arr;
  }, [rows, key, dir]);
  return { sorted, key, dir, toggle };
}

export function SortHead({ label, sortKey, state, onToggle, align = "left", className }: {
  label: string;
  sortKey: string;
  state: SortState;
  onToggle: (k: string) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = state.key === sortKey;
  const Icon = active ? (state.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        data-testid={`sort-${sortKey}`}
        className={cn("inline-flex cursor-pointer select-none items-center gap-1 font-medium transition-colors hover:text-amber-700", align === "right" && "flex-row-reverse")}
      >
        <span>{label}</span>
        <Icon className={cn("size-3.5 shrink-0", active ? "text-amber-700" : "text-muted-foreground/40")} />
      </button>
    </TableHead>
  );
}
