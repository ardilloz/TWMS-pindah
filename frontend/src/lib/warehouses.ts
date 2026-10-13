import type { Warehouse } from "./types";

export interface WarehouseNode {
  warehouse: Warehouse;
  ranting: Warehouse[];
}

const byName = (a: Warehouse, b: Warehouse) => a.name.localeCompare(b.name, "id");

/** Induk sorted by name, each with its ranting. Ranting whose induk is missing are treated as induk. */
export function warehouseTree(whs: Warehouse[] | undefined): WarehouseNode[] {
  const list = whs ?? [];
  const ids = new Set(list.map((w) => w.id));
  const roots = list.filter((w) => !w.parent_id || !ids.has(w.parent_id)).sort(byName);
  return roots.map((r) => ({ warehouse: r, ranting: list.filter((w) => w.parent_id === r.id).sort(byName) }));
}

/** Select options in tree order; ranting labelled "Induk › Ranting". */
export function warehouseOptions(whs: Warehouse[] | undefined): { value: string; label: string }[] {
  return warehouseTree(whs).flatMap((n) => [
    { value: n.warehouse.id, label: n.warehouse.name },
    ...n.ranting.map((r) => ({ value: r.id, label: `${n.warehouse.name} › ${r.name}` })),
  ]);
}
