import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut } from "lucide-react";

export default function ValidateKey() {
  const { user, setUser, logout, booting } = useAuth();
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  if (!booting && (!user || user === false)) nav("/login");
  if (user && user.validated) nav("/");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/validate-key", { key });
      setUser(data);
      toast.success("Empresa validada com sucesso");
      nav(data.must_change_password ? "/trocar-senha" : "/");
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background grid-texture p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/15 text-primary mb-5"><KeyRound className="h-6 w-6" /></div>
        <h1 className="font-heading text-2xl font-bold mb-1">Validação da Empresa</h1>
        <p className="text-sm text-muted-foreground mb-6">Informe a chave de validação da empresa fornecida pelo administrador para liberar o acesso aos módulos.</p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="key">Chave da Empresa</Label>
            <Input id="key" data-testid="validate-key-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Ex.: AVB-X7K92P" className="font-mono uppercase" required />
          </div>
          <Button type="submit" className="w-full" data-testid="validate-key-submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar e Entrar"}
          </Button>
        </form>
        <button className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mx-auto" data-testid="logout-from-validate" onClick={logout}>
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </div>
  );
}
