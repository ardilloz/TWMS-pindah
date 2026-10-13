import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  Boxes,
  Box,
  Calculator,
  ChevronDown,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Gauge,
  History,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageOpen,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Receipt,
  Scale,
  ShoppingCart,
  Sparkles,
  Tag,
  Truck,
  Users,
  UserSquare,
  Warehouse,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { useMe, useWarehouses } from "@/lib/queries";
import { warehouseOptions } from "@/lib/warehouses";
import { setActiveWh, useActiveWh } from "@/lib/activeWh";
import { endSession } from "@/lib/session";
import { canAny, isAdmin } from "@/lib/perms";
import type { Permission, User } from "@/lib/types";
import { cn } from "@/lib/utils";

const HTTP_UNAUTHORIZED = 401;
const PAGE_INITIAL = { opacity: 0, y: 8 };
const PAGE_ANIMATE = { opacity: 1, y: 0 };
const PAGE_TRANSITION = { duration: 0.2, ease: "easeOut" } as const;

type NavItem = { to: string; label: string; icon: typeof Users; testId: string; perms: Permission[] | "admin" };

// Menu groups (dropdowns). More groups (e.g. Finansial & Keuangan Gudang) get added here later.
const GROUPS: { id: string; label: string; icon: typeof Users; items: NavItem[] }[] = [
  {
    id: "stok-gudang",
    label: "Stock Keperluan Gudang",
    icon: Boxes,
    items: [
      { to: "/", label: "Dashboard Stok", icon: LayoutDashboard, testId: "nav-dashboard", perms: ["stok"] },
      { to: "/barang-masuk", label: "Barang Masuk", icon: ArrowDownToLine, testId: "nav-barang-masuk", perms: ["masuk"] },
      { to: "/barang-keluar", label: "Barang Keluar / Pemakaian", icon: ArrowUpFromLine, testId: "nav-barang-keluar", perms: ["transfer", "pribadi"] },
      { to: "/riwayat", label: "Riwayat Transaksi", icon: History, testId: "nav-riwayat", perms: ["riwayat"] },
      { to: "/gudang", label: "Kelola Gudang", icon: Warehouse, testId: "nav-gudang", perms: ["gudang"] },
      { to: "/supplier", label: "Kelola Supplier", icon: Truck, testId: "nav-supplier", perms: ["supplier"] },
    ],
  },
  {
    id: "internal",
    label: "Internal",
    icon: Layers,
    items: [
      { to: "/internal/dashboard", label: "Dashboard", icon: Gauge, testId: "nav-internal-dashboard", perms: ["dashboard"] },
      { to: "/internal/harga", label: "Harga", icon: Tag, testId: "nav-internal-harga", perms: ["harga"] },
      { to: "/internal/bandul", label: "Bandul", icon: UserSquare, testId: "nav-internal-bandul", perms: ["bandul"] },
      { to: "/internal/pembelian", label: "Pembelian", icon: ShoppingCart, testId: "nav-internal-pembelian", perms: ["pembelian"] },
      { to: "/internal/berat-koli", label: "Berat Koli", icon: Scale, testId: "nav-internal-berat-koli", perms: ["berat_koli"] },
      { to: "/internal/penjualan", label: "Penjualan", icon: Receipt, testId: "nav-internal-penjualan", perms: ["penjualan"] },
      { to: "/internal/busai", label: "Busai", icon: PackageOpen, testId: "nav-internal-busai", perms: ["busai"] },
      { to: "/internal/kasir", label: "Kasir", icon: Calculator, testId: "nav-internal-kasir", perms: ["kasir"] },
      { to: "/internal/detail-koli", label: "Laporan Pembelian", icon: ClipboardList, testId: "nav-internal-detail-koli", perms: ["detail_koli"] },
      { to: "/internal/laporan-penjualan", label: "Laporan Penjualan", icon: FileSpreadsheet, testId: "nav-internal-laporan-penjualan", perms: ["laporan_penjualan"] },
      { to: "/internal/sisa-stock", label: "Sisa Stock", icon: Archive, testId: "nav-internal-sisa-stock", perms: ["sisa_stock"] },
      { to: "/internal/out", label: "Out", icon: LogOut, testId: "nav-internal-out", perms: ["out"] },
      { to: "/internal/revisi", label: "Revisi", icon: Pencil, testId: "nav-internal-revisi", perms: ["revisi"] },
      { to: "/internal/detail-koli-cc", label: "Detail Koli Busai", icon: Box, testId: "nav-internal-detail-koli-cc", perms: ["detail_koli_cc"] },
    ],
  },
];

const SINGLES: NavItem[] = [
  { to: "/asisten", label: "Asisten AI", icon: Sparkles, testId: "nav-asisten", perms: ["asisten"] },
  { to: "/master-data", label: "Master Data", icon: Database, testId: "nav-master-data", perms: "admin" },
  { to: "/pengguna", label: "Kelola Pengguna", icon: Users, testId: "nav-pengguna", perms: "admin" },
];

const visible = (user: User | undefined, n: NavItem) => (n.perms === "admin" ? isAdmin(user) : canAny(user, n.perms));

function NavItemLink({ n, tp, onNavigate, nested }: { n: NavItem; tp: string; onNavigate?: () => void; nested?: boolean }) {
  return (
    <NavLink
      to={n.to}
      end={n.to === "/"}
      onClick={onNavigate}
      data-testid={tp + n.testId}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
          nested && "ml-3 border-l border-sidebar-border pl-4",
          isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-[#D6C7B2] hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )
      }
    >
      <n.icon className="size-4 shrink-0" />
      {n.label}
    </NavLink>
  );
}

function SidebarContent({ user, onNavigate, tp = "" }: { user?: User; onNavigate?: () => void; tp?: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const whs = useWarehouses();
  const whOpts = warehouseOptions(whs.data);
  const active = useActiveWh();
  useEffect(() => {
    if (whOpts.length > 0 && !whOpts.some((o) => o.value === active)) setActiveWh(whOpts[0].value);
  }, [whOpts, active]);
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-sidebar-primary font-heading text-lg font-bold uppercase text-sidebar-primary-foreground">
            {user?.name?.charAt(0) ?? "•"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold leading-tight" data-testid={tp + "sidebar-user-name"}>
              {user?.name ?? "—"}
            </p>
            <p className="text-xs uppercase tracking-wider text-sidebar-primary" data-testid={tp + "sidebar-user-role"}>
              {user?.role === "admin" ? "Admin Utama" : user ? "Staff" : ""}
            </p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-5">
        {GROUPS.map((g) => {
          const items = g.items.filter((n) => visible(user, n));
          if (items.length === 0) return null;
          const isOpen = open[g.id] ?? true;
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                data-testid={`${tp}nav-group-${g.id}`}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent/60"
              >
                <g.icon className="size-4 shrink-0 text-sidebar-primary" />
                <span className="flex-1">{g.label}</span>
                <ChevronDown className={cn("size-4 transition-transform duration-200", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="mt-1 space-y-0.5" data-testid={`${tp}nav-group-${g.id}-items`}>
                  {g.id === "internal" && whOpts.length > 0 && (
                    <select
                      data-testid={`${tp}internal-warehouse-select`}
                      value={active}
                      onChange={(e) => setActiveWh(e.target.value)}
                      className="mb-1.5 ml-3 w-[calc(100%-0.75rem)] rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-sm font-semibold text-sidebar-foreground"
                    >
                      {whOpts.map((o) => (<option key={o.value} value={o.value} className="text-black">{o.label}</option>))}
                    </select>
                  )}
                  {(g.id !== "internal" || active) && items.map((n) => (
                    <NavItemLink key={n.to} n={n} tp={tp} onNavigate={onNavigate} nested />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {SINGLES.filter((n) => visible(user, n)).map((n) => (
          <NavItemLink key={n.to} n={n} tp={tp} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <button
          type="button"
          onClick={() => void endSession()}
          data-testid={tp + "logout-button"}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#D6C7B2] transition-colors duration-150 hover:bg-red-900/40 hover:text-white"
        >
          <LogOut className="size-4" /> Keluar
        </button>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const me = useMe();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (me.error instanceof ApiError && me.error.status === HTTP_UNAUTHORIZED) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={cn("min-h-screen bg-background", !collapsed && "lg:pl-64")}>
      <aside className={cn("fixed inset-y-0 left-0 z-30 w-64", collapsed ? "hidden" : "hidden lg:block")}>
        <SidebarContent user={me.data} />
      </aside>
      <button type="button" onClick={() => setCollapsed((c) => !c)} data-testid="sidebar-toggle" aria-label="Tutup/buka panel" className="fixed left-3 top-3 z-40 hidden rounded-lg border bg-white/90 p-2 shadow-sm backdrop-blur hover:bg-muted lg:flex">
        {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
      </button>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-[#29180C] px-4 py-3 text-white lg:hidden">
        <p className="truncate font-heading text-lg font-bold" data-testid="mobile-header-user-name">
          {me.data?.name ?? ""}
        </p>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          data-testid="mobile-menu-button"
          className="rounded-md p-2 hover:bg-white/10"
          aria-label="Buka menu"
        >
          <Menu className="size-5" />
        </button>
      </header>
      <Sheet open={mobileOpen} onOpenChange={(o: boolean) => setMobileOpen(o)}>
        <SheetContent side="left" className="w-72 border-none p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent user={me.data} tp="mobile-" onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="mx-auto max-w-[1800px] px-4 py-6 md:px-8 lg:px-10 lg:py-9">
        <motion.div
          key={location.pathname}
          initial={PAGE_INITIAL}
          animate={PAGE_ANIMATE}
          transition={PAGE_TRANSITION}
        >
          {/* Wait for the session check so pages don't fire unauthenticated requests;
              a non-401 failure (backend offline) still renders the page shell. */}
          {me.data || me.isError ? (
            <Outlet context={me.data} />
          ) : (
            <div className="h-64 animate-pulse rounded-3xl bg-muted" data-testid="page-loading" />
          )}
        </motion.div>
      </main>
      <Toaster richColors />
    </div>
  );
}
