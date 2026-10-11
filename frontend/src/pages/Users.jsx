import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Users as UsersIcon, Plus, Shield, Trash2, Loader2, CheckCircle2, Copy, Pencil, UserCircle } from "lucide-react";

const PERMS = ["visualizar", "criar", "editar", "excluir", "importar", "exportar", "aprovar", "administrar"];
const SUBS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "cadastros", label: "Cadastros" },
  { key: "lancamentos", label: "Lançamentos" },
  { key: "pendencias", label: "Pendências" },
  { key: "relatorios", label: "Relatórios" },
  { key: "dados_gerais", label: "Dados Gerais" },
  { key: "configuracoes", label: "Configurações" },
];

export default function Users() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", funcao: "", senha: "" });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const [permUser, setPermUser] = useState(null);
  const [perms, setPerms] = useState({});
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ nome: "", funcao: "", active: true, senha: "", foto: null });

  const load = async () => {
    try { const { data } = await api.get("/users"); setList(data); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const { data } = await api.post("/users", form);
      toast.success(`Usuário criado: ${data.username}`);
      setCreated(data); setOpen(false); setForm({ nome: "", funcao: "", senha: "" }); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const del = async (u) => {
    if (!window.confirm(`Deseja realmente excluir o usuário ${u.nome}?`)) return;
    try { await api.delete(`/users/${u.id}`); toast.success("Usuário excluído"); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const openPerms = (u) => { setPermUser(u); setPerms(u.permissions?.inventario || {}); };

  const openEdit = (u) => { setEditUser(u); setEditForm({ nome: u.nome, funcao: u.funcao || "", active: u.active !== false, senha: "", foto: u.foto || null }); };
  const onEditPhoto = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx 2MB)."); return; }
    const reader = new FileReader(); reader.onload = () => setEditForm((s) => ({ ...s, foto: reader.result })); reader.readAsDataURL(f);
    e.target.value = "";
  };
  const saveEdit = async () => {
    try {
      const body = { nome: editForm.nome, funcao: editForm.funcao, active: editForm.active, foto: editForm.foto };
      if (editForm.senha) body.senha = editForm.senha;
      await api.put(`/users/${editUser.id}`, body);
      toast.success("Usuário atualizado"); setEditUser(null); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const togglePerm = (sub, perm) => setPerms((p) => {
    const cur = new Set(p[sub] || []);
    cur.has(perm) ? cur.delete(perm) : cur.add(perm);
    return { ...p, [sub]: Array.from(cur) };
  });
  const savePerms = async () => {
    try {
      await api.put(`/users/${permUser.id}/permissions`, { permissions: { inventario: perms } });
      toast.success("Permissões atualizadas"); setPermUser(null); load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Usuários & Acessos" subtitle="Gerencie usuários da empresa e controle de permissões" testid="users-header">
        <Button onClick={() => setOpen(true)} data-testid="create-user-btn"><Plus className="h-4 w-4 mr-1" /> Criar Usuário</Button>
      </PageHeader>

      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> :
        list.length === 0 ? <Empty icon={UsersIcon} title="Nenhum usuário" /> : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Login</th><th className="text-left px-4 py-3">Função</th><th className="text-left px-4 py-3">Perfil</th><th className="text-left px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className="border-t border-border hover:bg-accent/40" data-testid={`user-row-${u.id}`}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2.5">
                        {u.foto ? <img src={u.foto} alt="" className="h-7 w-7 rounded-full object-cover border border-border" /> : <UserCircle className="h-7 w-7 text-muted-foreground" />}
                        {u.nome}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.funcao}</td>
                    <td className="px-4 py-3">{u.role === "company_admin" ? "Admin Empresa" : "Usuário"}</td>
                    <td className="px-4 py-3">{u.active === false ? <span className="text-red-400 text-xs">Inativo</span> : u.validated ? <span className="text-emerald-400 text-xs flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Validado</span> : <span className="text-amber-400 text-xs">Pendente</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Button>
                        {u.role !== "company_admin" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openPerms(u)} data-testid={`perms-btn-${u.id}`}><Shield className="h-3.5 w-3.5 mr-1" />Acessos</Button>
                            <Button size="sm" variant="ghost" onClick={() => del(u)} data-testid={`delete-user-${u.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-dialog">
          <DialogHeader><DialogTitle>Criar Usuário</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5"><Label>Nome completo</Label><Input value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} required data-testid="user-nome-input" /><p className="text-[11px] text-muted-foreground">O login será gerado automaticamente (ex.: alan_teixeira).</p></div>
            <div className="space-y-1.5"><Label>Função</Label><Input value={form.funcao} onChange={(e) => setForm((s) => ({ ...s, funcao: e.target.value }))} required data-testid="user-funcao-input" /></div>
            <div className="space-y-1.5"><Label>Senha inicial (opcional)</Label><Input value={form.senha} onChange={(e) => setForm((s) => ({ ...s, senha: e.target.value }))} placeholder="Gerada automaticamente se vazio" data-testid="user-senha-input" /></div>
            <Button type="submit" className="w-full" disabled={saving} data-testid="user-save-btn">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={() => setCreated(null)}>
        <DialogContent data-testid="user-created-dialog">
          <DialogHeader><DialogTitle>Credenciais do usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Repasse as credenciais. No primeiro acesso o usuário valida a chave da empresa e troca a senha inicial.</p>
            <div className="rounded-lg bg-secondary p-4 space-y-2 font-mono text-sm">
              <div className="flex items-center justify-between"><span><span className="text-muted-foreground">login:</span> {created?.username}</span><button onClick={() => navigator.clipboard?.writeText(created.username)}><Copy className="h-4 w-4" /></button></div>
              <div className="flex items-center justify-between"><span><span className="text-muted-foreground">senha:</span> {created?.senha_inicial}</span><button onClick={() => navigator.clipboard?.writeText(created.senha_inicial)}><Copy className="h-4 w-4" /></button></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent data-testid="edit-user-dialog">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              {editForm.foto ? <img src={editForm.foto} alt="" className="h-16 w-16 rounded-full object-cover border border-border" /> : <div className="h-16 w-16 rounded-full bg-primary/15 text-primary grid place-items-center"><UserCircle className="h-9 w-9" /></div>}
              <div className="flex gap-2">
                <label className="inline-flex items-center gap-1 text-sm cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-accent" data-testid="edit-user-photo-label">
                  Foto<input type="file" accept="image/*" className="hidden" onChange={onEditPhoto} data-testid="edit-user-photo-input" />
                </label>
                {editForm.foto && <Button variant="ghost" className="text-destructive" onClick={() => setEditForm((s) => ({ ...s, foto: null }))}>Remover</Button>}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Nome completo</Label><Input value={editForm.nome} onChange={(e) => setEditForm((s) => ({ ...s, nome: e.target.value }))} data-testid="edit-user-nome" /></div>
            <div className="space-y-1.5"><Label>Função</Label><Input value={editForm.funcao} onChange={(e) => setEditForm((s) => ({ ...s, funcao: e.target.value }))} data-testid="edit-user-funcao" /></div>
            <div className="space-y-1.5"><Label>Nova senha (opcional)</Label><Input value={editForm.senha} onChange={(e) => setEditForm((s) => ({ ...s, senha: e.target.value }))} placeholder="Deixe vazio para manter" data-testid="edit-user-senha" /></div>
            <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm((s) => ({ ...s, active: e.target.checked }))} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="edit-user-active" /> Usuário ativo</label>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button><Button onClick={saveEdit} data-testid="edit-user-save">Salvar</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!permUser} onOpenChange={() => setPermUser(null)}>
        <DialogContent className="max-w-3xl" data-testid="perms-dialog">
          <DialogHeader><DialogTitle>Controle de Acessos — {permUser?.nome} · Módulo Inventário</DialogTitle></DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-secondary"><tr><th className="border border-border px-2 py-2 text-left">Submódulo</th>{PERMS.map((p) => <th key={p} className="border border-border px-2 py-2 capitalize">{p}</th>)}</tr></thead>
              <tbody>
                {SUBS.map((s) => (
                  <tr key={s.key}>
                    <td className="border border-border px-2 py-2 font-medium">{s.label}</td>
                    {PERMS.map((p) => (
                      <td key={p} className="border border-border px-2 py-2 text-center">
                        <input type="checkbox" checked={(perms[s.key] || []).includes(p)} onChange={() => togglePerm(s.key, p)} data-testid={`perm-${s.key}-${p}`} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPermUser(null)}>Cancelar</Button><Button onClick={savePerms} data-testid="save-perms-btn">Salvar Permissões</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
