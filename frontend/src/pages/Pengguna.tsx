import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NoAccess } from "@/components/Guard";
import { PageHeader } from "@/components/PageHeader";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { PERM_META } from "@/lib/perms";
import { useMe, useWarehouses } from "@/lib/queries";
import { warehouseOptions } from "@/lib/warehouses";
import type { Permission, Role, User, UserCreate, UserUpdate } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESET: Permission[] = ["masuk", "transfer", "pribadi"];

function invalidateUsers(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["users"] });
  qc.invalidateQueries({ queryKey: ["me"] });
}

function UserFormDialog({
  open,
  onOpenChange,
  initial,
  isSelf,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: User | null;
  isSelf: boolean;
}) {
  const qc = useQueryClient();
  const [username, setUsername] = useState(initial?.username ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(initial?.role ?? "staff");
  const [perms, setPerms] = useState<Permission[]>(initial?.permissions.length ? initial.permissions : PRESET);
  const [whIds, setWhIds] = useState<string[]>(initial?.warehouse_ids ?? []);
  const whs = useWarehouses();
  const whOptions = warehouseOptions(whs.data);

  const toggle = (p: Permission, on: boolean) =>
    setPerms((cur) => (on ? [...new Set([...cur, p])] : cur.filter((x) => x !== p)));
  const toggleWh = (id: string, on: boolean) =>
    setWhIds((cur) => (on ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));

  const m = useMutation({
    mutationFn: () => {
      if (initial) {
        const body: UserUpdate = { username, name };
        if (!isSelf) body.role = role;
        if (role === "staff") {
          body.permissions = perms;
          body.warehouse_ids = whIds;
        }
        return apiPatch<User>(`/users/${initial.id}`, body);
      }
      const body: UserCreate = { username, name, password, role, permissions: role === "staff" ? perms : [], warehouse_ids: role === "staff" ? whIds : [] };
      return apiPost<User>("/users", body);
    },
    onSuccess: (u) => {
      toast.success(initial ? `Akun ${u.username} diperbarui` : `Akun ${u.role === "admin" ? "admin" : "staff"} ${u.username} dibuat`);
      invalidateUsers(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="user-form-dialog">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit Akun ${initial.username}` : "Tambah Akun Baru"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (username.trim().length < 3) return toast.error("Username minimal 3 karakter");
            if (/\s/.test(username.trim())) return toast.error("Username tidak boleh mengandung spasi");
            if (!name.trim()) return toast.error("Nama wajib diisi");
            if (!initial && password.length < 6) return toast.error("Password minimal 6 karakter");
            if (role === "staff" && perms.length === 0) return toast.error("Pilih minimal satu hak akses");
            m.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Jenis Akun</Label>
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted p-1" data-testid="user-form-role">
              {(["staff", "admin"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={isSelf}
                  onClick={() => setRole(r)}
                  data-testid={`user-form-role-${r}`}
                  className={cn(
                    "rounded-md py-1.5 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed",
                    role === r ? "bg-white text-amber-900 shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {r === "admin" ? "Admin (akses penuh)" : "Staff"}
                </button>
              ))}
            </div>
            {isSelf && <p className="text-xs text-muted-foreground">Role akun Anda sendiri tidak dapat diubah.</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="u-username">Username</Label>
              <Input id="u-username" data-testid="user-form-username-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Nama Lengkap</Label>
              <Input id="u-name" data-testid="user-form-name-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {!initial && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="u-pass">Password</Label>
                <Input id="u-pass" type="password" data-testid="user-form-password-input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
            )}
          </div>

          {role === "admin" ? (
            <p className="rounded-lg border bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="user-form-admin-note">
              Admin memiliki akses penuh: semua menu, kelola pengguna, serta revisi dan hapus transaksi.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Hak Akses Staff</Label>
              <div className="grid gap-2 sm:grid-cols-2" data-testid="user-form-permissions">
                {PERM_META.map((p) => {
                  const on = perms.includes(p.key);
                  return (
                    <label
                      key={p.key}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-150",
                        on ? "border-amber-400 bg-amber-50" : "bg-white hover:bg-muted",
                      )}
                    >
                      <Checkbox checked={on} onCheckedChange={(c: boolean) => toggle(p.key, c)} data-testid={`user-perm-${p.key}`} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-semibold">{p.label}</span>
                        <span className="text-xs text-muted-foreground">{p.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Transaksi yang sudah diinput staff tidak dapat diubah; hanya admin yang dapat merevisi.</p>

              <div className="space-y-2 pt-1">
                <Label>Akses Gudang</Label>
                <p className="text-xs text-muted-foreground">Pilih gudang yang boleh diakses staff ini. Kosongkan untuk memberi akses ke semua gudang.</p>
                <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2" data-testid="user-form-warehouses">
                  {whOptions.map((w) => {
                    const on = whIds.includes(w.value);
                    return (
                      <label
                        key={w.value}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors duration-150",
                          on ? "border-amber-400 bg-amber-50" : "bg-white hover:bg-muted",
                        )}
                      >
                        <Checkbox checked={on} onCheckedChange={(c: boolean) => toggleWh(w.value, c)} data-testid={`user-warehouse-${w.value}`} />
                        <span className="text-sm font-medium">{w.label}</span>
                      </label>
                    );
                  })}
                  {whOptions.length === 0 && <p className="text-xs text-muted-foreground">Belum ada gudang.</p>}
                </div>
                {whIds.length === 0 && <p className="text-xs font-medium text-amber-700" data-testid="user-form-warehouse-all-note">Akses: semua gudang</p>}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="user-form-cancel">
              Batal
            </Button>
            <Button type="submit" disabled={m.isPending} data-testid="user-form-submit">
              {m.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, open, onOpenChange }: { user: User; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const m = useMutation({
    mutationFn: () => apiPatch<User>(`/users/${user.id}`, { password: pw } satisfies UserUpdate),
    onSuccess: () => {
      toast.success(`Password ${user.username} berhasil direset`);
      invalidateUsers(qc);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o: boolean) => onOpenChange(o)}>
      <DialogContent data-testid="reset-password-dialog">
        <DialogHeader>
          <DialogTitle>Reset Password — {user.name}</DialogTitle>
          <DialogDescription>Isi password baru untuk akun {user.username}. Akun akan diminta login ulang.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.length < 6) return toast.error("Password minimal 6 karakter");
            if (pw !== pw2) return toast.error("Konfirmasi password tidak sama");
            m.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rp-1">Password Baru</Label>
            <Input id="rp-1" type="password" data-testid="reset-password-input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-2">Ulangi Password Baru</Label>
            <Input id="rp-2" type="password" data-testid="reset-password-confirm-input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="reset-password-cancel">
              Batal
            </Button>
            <Button type="submit" disabled={m.isPending} data-testid="reset-password-submit">
              {m.isPending ? "Menyimpan..." : "Simpan Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Pengguna() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const users = useQuery({ queryKey: ["users"], queryFn: () => apiGet<User[]>("/users"), enabled: isAdmin });
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [toDelete, setToDelete] = useState<User | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: boolean }>(`/users/${id}`),
    onSuccess: () => {
      toast.success("Akun dihapus");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const openForm = (u: User | null) => {
    setEditing(u);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  if (me.data && !isAdmin) return <NoAccess />;

  const rows = users.isError ? [] : users.data ?? [];
  const label = (p: Permission) => PERM_META.find((m) => m.key === p)?.label ?? p;

  return (
    <div>
      <PageHeader
        eyebrow="Akses"
        title="Kelola Pengguna"
        actions={
          <Button onClick={() => openForm(null)} data-testid="add-user-button">
            <Plus className="size-4" /> Tambah Akun
          </Button>
        }
      />
      <section className="overflow-hidden rounded-2xl border bg-white">
        <Table data-testid="user-table">
          <TableHeader>
            <TableRow className="bg-muted/60">
              <TableHead>Nama</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Hak Akses</TableHead>
              <TableHead className="w-32 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id} data-testid={`user-row-${u.username}`}>
                <TableCell className="font-semibold">
                  {u.name} {u.id === me.data?.id && <span className="text-xs font-normal text-muted-foreground">(Anda)</span>}
                </TableCell>
                <TableCell className="font-mono text-sm">{u.username}</TableCell>
                <TableCell>
                  {u.role === "admin" ? (
                    <Badge className="bg-[#3D2411] text-[#FDE68A]">
                      <ShieldCheck className="size-3" /> Admin · Akses penuh
                    </Badge>
                  ) : (
                    <div className="flex max-w-md flex-wrap gap-1" data-testid={`user-perms-${u.username}`}>
                      {u.permissions.length === 0 && <span className="text-xs text-muted-foreground">Tidak ada akses</span>}
                      {u.permissions.map((p) => (
                        <Badge key={p} variant="outline" className="bg-white">
                          {label(p)}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800" data-testid={`user-warehouse-scope-${u.username}`}>
                        {u.warehouse_ids && u.warehouse_ids.length > 0 ? `${u.warehouse_ids.length} gudang` : "Semua gudang"}
                      </Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="icon-sm" onClick={() => openForm(u)} data-testid={`user-edit-${u.username}`} aria-label="Edit akun">
                    <Pencil className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setResetting(u)} data-testid={`user-reset-password-${u.username}`} aria-label="Reset password">
                    <KeyRound className="size-4 text-amber-700" />
                  </Button>
                  {u.id !== me.data?.id && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(u)} data-testid={`user-delete-${u.username}`} aria-label="Hapus akun">
                      <Trash2 className="size-4 text-red-600" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  {users.isLoading ? "Memuat..." : "Data pengguna tidak tersedia."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <UserFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} initial={editing} isSelf={!!editing && editing.id === me.data?.id} />
      {resetting && <ResetPasswordDialog key={resetting.id} user={resetting} open={!!resetting} onOpenChange={(o) => !o && setResetting(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Hapus akun ${toDelete?.username ?? ""}?`}
        description="Akun tidak akan bisa login lagi."
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        pending={del.isPending}
        testId="user-delete-dialog"
      />
    </div>
  );
}
