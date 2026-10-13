import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Nama driver + nomor kendaraan — tampil pada tanda terima saat dicetak. */
export function DriverFields({
  driver,
  vehicle,
  onDriver,
  onVehicle,
  testPrefix,
}: {
  driver: string;
  vehicle: string;
  onDriver: (v: string) => void;
  onVehicle: (v: string) => void;
  testPrefix: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${testPrefix}-driver`}>Nama Driver (opsional)</Label>
        <Input
          id={`${testPrefix}-driver`}
          data-testid={`${testPrefix}-driver-input`}
          className="bg-white uppercase placeholder:normal-case"
          placeholder="contoh: Budi"
          value={driver}
          onChange={(e) => onDriver(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${testPrefix}-vehicle`}>No. Kendaraan (opsional)</Label>
        <Input
          id={`${testPrefix}-vehicle`}
          data-testid={`${testPrefix}-vehicle-input`}
          className="bg-white uppercase placeholder:normal-case"
          placeholder="contoh: N 1234 AB"
          value={vehicle}
          onChange={(e) => onVehicle(e.target.value)}
        />
      </div>
    </div>
  );
}
