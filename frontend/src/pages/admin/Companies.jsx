import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Plus, KeyRound, Eye, EyeOff, Users, Loader2, Copy, Trash2, AlertTriangle } from "lucide-react";

export default function Companies() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", nome_fantasia: "", cnpj: "", ramo: "", logo: null });
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState({});
  const [created, setCreated] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/companies"); setList(data); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onLogo = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => setForm((s) => ({ ...s, logo: r.result })); r.readAsDataURL(f);
  };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await api.post("/companies", form);
      toast.success("Empresa cadastrada com sucesso");
      setCreated(data); setOpen(false);
      setForm({ nome: "", nome_fantasia: "", cnpj: "", ramo: "", logo: null });
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const copyKey = (k) => { navigator.clipboard?.writeText(k); toast.success("Chave copiada"); };

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/companies/${toDelete.id}?confirm=${encodeURIComponent(confirmName)}`);
      toast.success(data.message || "Empresa excluída com sucesso.");
      setToDelete(null); setConfirmName(""); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Empresas" subtitle="Administração global de empresas da plataforma GAMA" testid="companies-header">
        <Button onClick={() => setOpen(true)} data-testid="create-company-btn"><Plus className="h-4 w-4 mr-1" /> Cadastrar Empresa</Button>
      </PageHeader>

      {loading ? <div className="text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div> :
        list.length === 0 ? <Empty icon={Building2} title="Nenhuma empresa cadastrada" hint="Cadastre a primeira empresa para começar." /> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-5 space-y-3" data-testid={`company-card-${c.id}`}>
                <div className="flex items-center gap-3">
                  {c.logo ? <img src={c.logo} alt="" className="h-11 w-11 rounded-lg object-cover border border-border" /> :
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/15 text-primary"><Building2 className="h-5 w-5" /></div>}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.nome_fantasia || c.nome}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.cnpj}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
                  <KeyRound className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-mono text-sm flex-1">{reveal[c.id] ? c.key : "••••••••"}</span>
                  <button onClick={() => setReveal((r) => ({ ...r, [c.id]: !r[c.id] }))} data-testid={`reveal-key-${c.id}`}>{reveal[c.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  <button onClick={() => copyKey(c.key)} data-testid={`copy-key-${c.id}`}><Copy className="h-4 w-4" /></button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {c.users} usuários</span>
                  <span>{c.admins} admin(s)</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => nav(`/empresas/${c.id}`)} data-testid={`manage-company-${c.id}`}>Gerenciar</Button>
                  <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => { setToDelete(c); setConfirmName(""); }} data-testid={`delete-company-${c.id}`} title="Excluir empresa"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="company-dialog">
          <DialogHeader><DialogTitle>Cadastrar Empresa</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            {[["nome", "Nome completo da empresa"], ["nome_fantasia", "Nome fantasia"], ["cnpj", "CNPJ"], ["ramo", "Ramo de atuação"]].map(([k, l]) => (
              <div key={k} className="space-y-1.5">
                <Label>{l}</Label>
                <Input value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))} required data-testid={`company-${k}-input`} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Logotipo</Label>
              <Input type="file" accept="image/*" onChange={onLogo} data-testid="company-logo-input" />
              {form.logo && <img src={form.logo} alt="" className="h-16 rounded-lg border border-border mt-2" />}
            </div>
            <Button type="submit" className="w-full" disabled={saving} data-testid="company-save-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar e gerar chave"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={() => setCreated(null)}>
        <DialogContent data-testid="company-created-dialog">
          <DialogHeader><DialogTitle>Empresa criada — Chave gerada</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Guarde a chave de validação. Ela será exigida no primeiro acesso dos usuários.</p>
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-3">
              <KeyRound className="h-5 w-5 text-primary" />
              <span className="font-mono text-lg flex-1">{created?.key}</span>
              <button onClick={() => copyKey(created.key)}><Copy className="h-4 w-4" /></button>
            </div>
            <Button className="w-full" onClick={() => { const id = created.id; setCreated(null); nav(`/empresas/${id}`); }} data-testid="goto-create-admin">
              Criar Administrador da Empresa
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => { if (!o) { setToDelete(null); setConfirmName(""); } }}>
        <DialogContent data-testid="delete-company-dialog">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Excluir empresa?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta ação excluirá a empresa <span className="font-semibold text-foreground">{toDelete?.nome}</span> e todos os dados vinculados a ela, incluindo usuários, inventários, produtos, pendências, importações, registros e demais informações relacionadas.
            </p>
            <p className="text-sm font-medium text-destructive">Essa ação não poderá ser desfeita.</p>
            <div className="space-y-1.5">
              <Label>Para confirmar, digite o nome da empresa: <span className="font-mono text-foreground">{toDelete?.nome}</span></Label>
              <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder="Nome exato da empresa" data-testid="delete-confirm-name-input" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setToDelete(null); setConfirmName(""); }} data-testid="delete-cancel-btn">Cancelar</Button>
              <Button variant="destructive" onClick={doDelete} disabled={deleting || confirmName.trim() !== (toDelete?.nome || "").trim()} data-testid="delete-confirm-btn">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir empresa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
