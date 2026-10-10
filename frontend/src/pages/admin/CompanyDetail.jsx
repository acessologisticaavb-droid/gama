import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, KeyRound, UserPlus, ArrowLeft, Copy, Loader2, ShieldCheck } from "lucide-react";

export default function CompanyDetail() {
  const { cid } = useParams();
  const nav = useNavigate();
  const [company, setCompany] = useState(null);
  const [form, setForm] = useState({ nome: "", funcao: "", login: "", senha: "", senha2: "" });
  const [saving, setSaving] = useState(false);
  const [adminCreated, setAdminCreated] = useState(null);

  const load = async () => {
    try { const { data } = await api.get(`/companies/${cid}`); setCompany(data); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  useEffect(() => { load(); }, [cid]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.senha !== form.senha2) return toast.error("As senhas não coincidem.");
    setSaving(true);
    try {
      const { data } = await api.post(`/companies/${cid}/admin`, { nome: form.nome, funcao: form.funcao, login: form.login, senha: form.senha });
      toast.success("Administrador da empresa criado");
      setAdminCreated(data);
      setForm({ nome: "", funcao: "", login: "", senha: "", senha2: "" });
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  if (!company) return <div className="text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => nav("/empresas")} data-testid="back-companies"><ArrowLeft className="h-4 w-4 mr-1" /> Empresas</Button>
      <PageHeader title={company.nome_fantasia || company.nome} subtitle={company.ramo} testid="company-detail-header" />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 lg:col-span-1">
          <div className="flex items-center gap-3">
            {company.logo ? <img src={company.logo} alt="" className="h-14 w-14 rounded-lg object-cover border border-border" /> :
              <div className="grid h-14 w-14 place-items-center rounded-lg bg-primary/15 text-primary"><Building2 className="h-7 w-7" /></div>}
            <div><div className="font-semibold">{company.nome}</div><div className="text-xs text-muted-foreground">{company.cnpj}</div></div>
          </div>
          <div>
            <Label className="text-xs">Chave de validação</Label>
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 mt-1">
              <KeyRound className="h-4 w-4 text-primary" />
              <span className="font-mono flex-1" data-testid="company-key-value">{company.key}</span>
              <button onClick={() => { navigator.clipboard?.writeText(company.key); toast.success("Chave copiada"); }} data-testid="copy-company-key"><Copy className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4"><UserPlus className="h-5 w-5 text-primary" /><h3 className="font-heading text-lg font-semibold">Administrador da Empresa</h3></div>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Nome completo</Label><Input value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} required data-testid="admin-nome-input" /></div>
            <div className="space-y-1.5"><Label>Função</Label><Input value={form.funcao} onChange={(e) => setForm((s) => ({ ...s, funcao: e.target.value }))} required data-testid="admin-funcao-input" /></div>
            <div className="space-y-1.5"><Label>Login</Label><Input value={form.login} onChange={(e) => setForm((s) => ({ ...s, login: e.target.value.toLowerCase() }))} required data-testid="admin-login-input" /></div>
            <div />
            <div className="space-y-1.5"><Label>Senha</Label><Input type="password" value={form.senha} onChange={(e) => setForm((s) => ({ ...s, senha: e.target.value }))} required data-testid="admin-senha-input" /></div>
            <div className="space-y-1.5"><Label>Confirmar senha</Label><Input type="password" value={form.senha2} onChange={(e) => setForm((s) => ({ ...s, senha2: e.target.value }))} required data-testid="admin-senha2-input" /></div>
            <div className="sm:col-span-2"><Button type="submit" disabled={saving} data-testid="create-admin-btn">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Administrador"}</Button></div>
          </form>
          {adminCreated && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-emerald-400">Administrador criado: {adminCreated.username}</p>
                <p className="text-muted-foreground">No primeiro acesso ele deverá informar a chave da empresa para validação.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
