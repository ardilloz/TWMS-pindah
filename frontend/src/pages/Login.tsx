import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Lock, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/api";
import { errMsg } from "@/lib/format";
import { beginSession } from "@/lib/session";
import type { LoginIn, User } from "@/lib/types";

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginIn>({ username: "", password: "" });
  const [error, setError] = useState("");
  const m = useMutation({
    mutationFn: (b: LoginIn) => apiPost<User>("/auth/login", b),
    onSuccess: () => {
      beginSession();
      navigate("/", { replace: true });
    },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="animate-rise w-full max-w-sm">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-amber-950">Tobacco Warehouse Management System</h2>
          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              m.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  data-testid="login-username-input"
                  className="h-11 bg-white pl-9"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  data-testid="login-password-input"
                  className="h-11 bg-white pl-9"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="login-error">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full text-base" disabled={m.isPending} data-testid="login-submit-button">
              {m.isPending ? "Memproses..." : "Masuk"}
            </Button>
          </form>
      </div>
    </div>
  );
}
