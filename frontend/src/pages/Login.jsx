import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Boxes, Lock, User as UserIcon, Loader2 } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [reset, setReset] = useState(false);

  useEffect(() => {
    if (user) nav("/");
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(username, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Acesso autorizado");
      if (res.user.role !== "system_admin" && !res.user.validated) nav("/validar-chave");
      else if (res.user.must_change_password) nav("/trocar-senha");
      else nav("/");
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative flex-col justify-between p-12 grid-texture border-r border-border overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.18),transparent_55%)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary text-primary-foreground"><Boxes className="h-7 w-7" /></div>
          <div>
            <div className="font-heading text-2xl font-extrabold tracking-tight">GAMA</div>
            <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Gestão Industrial</div>
          </div>
        </div>
        <div className="relative space-y-4">
          <h1 className="font-heading text-4xl font-bold leading-tight">Controle, rastreabilidade e acuracidade de inventário.</h1>
          <p className="text-muted-foreground max-w-md">Plataforma corporativa multiempresa, modular e segura para gestão industrial de ponta a ponta.</p>
          <div className="flex gap-6 pt-4 text-xs uppercase tracking-wider text-muted-foreground font-mono">
            <span>Multiempresa</span><span>Auditoria</span><span>Modular</span>
          </div>
        </div>
        <div className="relative text-xs text-muted-foreground font-mono">© GAMA — Sistema Industrial</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground"><Boxes className="h-6 w-6" /></div>
            <div className="font-heading text-2xl font-extrabold">GAMA</div>
          </div>
          <h2 className="font-heading text-2xl font-bold mb-1">{reset ? "Redefinir senha" : "Entrar"}</h2>
          <p className="text-sm text-muted-foreground mb-6">{reset ? "Contate o administrador para redefinição." : "Acesse com seu usuário e senha."}</p>

          {reset ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                A redefinição de senha é realizada pelo administrador da sua empresa. Solicite a geração de uma nova senha inicial.
              </div>
              <Button variant="outline" className="w-full" data-testid="back-to-login-btn" onClick={() => setReset(false)}>Voltar ao login</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="username">Usuário</Label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="username" data-testid="login-username-input" className="pl-9" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu_usuario" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" data-testid="login-password-input" type="password" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
                </div>
              </div>
              <Button type="submit" className="w-full" data-testid="login-submit-button" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
              <button type="button" className="text-sm text-primary hover:underline w-full text-center" data-testid="reset-password-link" onClick={() => setReset(true)}>
                Redefinir senha
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
