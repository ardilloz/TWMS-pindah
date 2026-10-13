import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Calendar as CalIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Date picker (format tampilan dd/mm/yyyy Indonesia). Nilai & onChange memakai ISO yyyy-mm-dd. */
export function DateField({
  value,
  onChange,
  testId,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  testId?: string;
  className?: string;
}) {
  let selected: Date | undefined;
  let label = "Pilih tanggal";
  try {
    if (value) {
      selected = parseISO(value);
      label = format(selected, "dd/MM/yyyy", { locale: localeId });
    }
  } catch {
    selected = undefined;
  }
  return (
    <Popover>
      <PopoverTrigger
        data-testid={testId}
        className={cn(
          "flex h-9 w-full items-center justify-start gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <CalIcon className="size-4 shrink-0 text-amber-700" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          locale={localeId}
          onSelect={(d?: Date) => { if (d) onChange(format(d, "yyyy-MM-dd")); }}
        />
      </PopoverContent>
    </Popover>
  );
}
