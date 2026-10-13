import { Link, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Warehouse as WhIcon } from "lucide-react";
import { useWarehouses } from "@/lib/queries";
import { warehouseOptions } from "@/lib/warehouses";
import { getActiveWh, setActiveWh, useActiveWh } from "@/lib/activeWh";

export function useWh(): string {
  return useActiveWh();
}

export default function InternalLayout() {
  const whs = useWarehouses();
  const opts = warehouseOptions(whs.data);
  const active = useActiveWh();

  useEffect(() => {
    if (opts.length === 0) return;
    const valid = opts.some((o) => o.value === getActiveWh());
    if (!valid) setActiveWh(opts[0].value);
  }, [opts]);

  if (whs.isLoading) return <div className="h-64 animate-pulse rounded-3xl bg-muted" data-testid="internal-loading" />;
  if (opts.length === 0) {
    return (
      <div className="rounded-2xl border bg-white p-10 text-center" data-testid="internal-no-warehouse">
        <WhIcon className="mx-auto mb-3 size-8 text-amber-700" />
        <p className="text-lg font-semibold">Belum ada gudang</p>
        <p className="mt-1 text-sm text-muted-foreground">Buat gudang dulu di menu Kelola Gudang untuk mulai mengelola data Internal.</p>
        <Link to="/gudang" className="mt-4 inline-block rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white" data-testid="internal-goto-gudang">Kelola Gudang</Link>
      </div>
    );
  }
  if (!active || !opts.some((o) => o.value === active)) {
    return <div className="h-32 animate-pulse rounded-2xl bg-muted" />;
  }
  return <Outlet />;
}
