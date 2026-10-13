import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Pop-up peringatan nomor ganda (dipakai di Pembelian & Penjualan). */
export function DuplicateDialog({ message, onClose }: { message: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!message} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent data-testid="duplicate-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="size-5" /> Nomor Sudah Ada
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground" data-testid="duplicate-dialog-message">{message}</p>
        <DialogFooter>
          <Button type="button" onClick={onClose} data-testid="duplicate-dialog-ok">Mengerti</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
