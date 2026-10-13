import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useMe } from "@/lib/queries";
import { canAny, firstAllowedPath } from "@/lib/perms";
import type { Permission } from "@/lib/types";

export function NoAccess() {
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-2xl border bg-white p-8 text-center" data-testid="no-access">
      <ShieldAlert className="mx-auto size-10 text-amber-700" />
      <h2 className="mt-3 font-heading text-xl font-semibold">Tidak ada akses</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Akun Anda belum diberi akses ke halaman ini. Hubungi admin utama untuk mengatur hak akses.
      </p>
    </div>
  );
}

/** Page-level gate. Server enforces the same permissions; this only shapes the UI. */
export function Guard({ any, children }: { any: Permission[]; children: ReactNode }) {
  const me = useMe();
  if (!me.data) return <>{children}</>; // backend unreachable: render the shell
  if (canAny(me.data, any)) return <>{children}</>;
  const first = firstAllowedPath(me.data);
  if (any.includes("stok") && first && first !== "/") return <Navigate to={first} replace />;
  return <NoAccess />;
}
