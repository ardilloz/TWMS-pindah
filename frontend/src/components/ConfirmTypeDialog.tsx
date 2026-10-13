import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Destructive confirm that requires the user to type a specific word (e.g. "konfirmasi"). */
export function ConfirmTypeDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmWord,
  onConfirm,
  pending,
  testId,
  confirmLabel = "Hapus",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmWord: string;
  onConfirm: () => void;
  pending?: boolean;
  testId: string;
  confirmLabel?: string;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) setText("");
  }, [open]);
  const matched = text.trim().toLowerCase() === confirmWord.toLowerCase();

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => onOpenChange(o)}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${testId}-input`}>
            Ketik <span className="font-mono font-semibold text-red-600">{confirmWord}</span> untuk melanjutkan
          </Label>
          <Input
            id={`${testId}-input`}
            data-testid={`${testId}-input`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={confirmWord}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid={`${testId}-cancel`}>
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending || !matched}
            data-testid={`${testId}-confirm`}
          >
            {pending ? "Memproses..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
