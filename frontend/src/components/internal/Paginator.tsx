import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Paginator({ page, total, count, onPage, testId }: { page: number; total: number; count: number; onPage: (p: number) => void; testId: string }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm" data-testid={`${testId}-paginator`}>
      <span className="text-muted-foreground" data-testid={`${testId}-count`}>Total {count} baris · Halaman {page}/{total}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => onPage(page - 1)} disabled={page <= 1} data-testid={`${testId}-prev`} aria-label="Sebelumnya"><ChevronLeft className="size-4" /></Button>
        <Button variant="outline" size="icon-sm" onClick={() => onPage(page + 1)} disabled={page >= total} data-testid={`${testId}-next`} aria-label="Berikutnya"><ChevronRight className="size-4" /></Button>
      </div>
    </div>
  );
}

/** A compact column-filter input placed inside a table header cell. */
export function HeaderFilter({ value, onChange, placeholder, testId }: { value: string; onChange: (v: string) => void; placeholder: string; testId: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 h-7 text-xs font-normal normal-case" data-testid={testId} />;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <section className="mb-5 rounded-2xl border bg-white p-4 md:p-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{children}</div></section>;
}
