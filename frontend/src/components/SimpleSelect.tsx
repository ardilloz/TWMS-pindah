import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder: string;
  testId: string;
  className?: string;
}

export function SimpleSelect({ value, onChange, options, placeholder, testId, className }: Props) {
  const labels: Record<string, string> = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value} onValueChange={(v: string) => onChange(v)}>
      <SelectTrigger className={cn("w-full bg-white", className)} data-testid={testId}>
        <SelectValue>{(v: string) => (v && labels[v] ? labels[v] : placeholder)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} data-testid={`${testId}-option-${o.value}`}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
