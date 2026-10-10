import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function ChangePassword() {
  const { refresh, logout } = useAuth();
  const nav = useNavigate();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (p1 !== p2) return toast.error("As senhas não coincidem.");
    setLoading(true);
    try {
      await api.post("/auth/change-password", { new_password: p1 });
      await refresh();
      toast.success("Senha alterada com sucesso");
      nav("/");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background grid-texture p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-emerald-500/15 text-emerald-400 mb-5"><ShieldCheck className="h-6 w-6" /></div>
        <h1 className="font-heading text-2xl font-bold mb-1">Alterar senha inicial</h1>
        <p className="text-sm text-muted-foreground mb-6">Por política de segurança, defina uma nova senha para continuar.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="p1">Nova senha</Label>
            <Input id="p1" data-testid="new-password-input" type="password" value={p1} onChange={(e) => setP1(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p2">Confirmar senha</Label>
            <Input id="p2" data-testid="confirm-password-input" type="password" value={p2} onChange={(e) => setP2(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" data-testid="change-password-submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nova senha"}
          </Button>
        </form>
        <button className="mt-4 text-sm text-muted-foreground hover:text-foreground mx-auto block" onClick={logout}>Sair</button>
      </div>
    </div>
  );
}
