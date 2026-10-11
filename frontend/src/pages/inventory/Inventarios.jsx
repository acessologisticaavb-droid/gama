import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { StatusBadge } from "@/components/StatusBadge";
import Donut from "@/components/Donut";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, ClipboardList, Loader2, Trash2, User, Boxes, AlertTriangle } from "lucide-react";

export default function Inventarios() {
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [prodGroups, setProdGroups] = useState([]);
  const [form, setForm] = useState({ tipo: "", grupo_produtos: "", data: new Date().toISOString().slice(0, 10), periodo: "" });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => { try { const { data } = await api.get("/inventories"); setList(data); } catch { setList([]); } };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (open) {
      api.get("/inv-groups").then((r) => setGroups(r.data));
      api.get("/product-groups").then((r) => setProdGroups(r.data));
    }
  }, [open]);

  const periodoFromData = (d) => { try { const dt = new Date(d); return `${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`; } catch { return ""; } };

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const body = { ...form, periodo: form.periodo || periodoFromData(form.data) };
      const { data } = await api.post("/inventories", body);
      toast.success(`Inventário ${data.codigo} criado`);
      setOpen(false); nav(`/inventario/registros/${data.id}`);
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const doDelete = async () => {
    setDeleting(true);
    try { await api.delete(`/inventories/${toDelete.id}`); toast.success("Inventário excluído"); setToDelete(null); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setDeleting(false); }
  };

  if (list === null) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Registro de Inventários" subtitle="Todos os inventários da empresa" testid="inventarios-header">
        <Button onClick={() => setOpen(true)} data-testid="create-inventory-btn"><Plus className="h-4 w-4 mr-1" /> Criar Inventário</Button>
      </PageHeader>

      {list.length === 0 ? <Empty icon={ClipboardList} title="Nenhum inventário" hint="Crie o primeiro inventário para começar." /> : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((inv) => (
            <div key={inv.id} className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/50 transition-colors" data-testid={`inv-card-${inv.id}`}>
              <div className="flex items-start justify-between gap-3">
                <button className="text-left flex-1" onClick={() => nav(`/inventario/registros/${inv.id}`)} data-testid={`inv-open-${inv.id}`}>
                  <div className="font-mono text-lg font-bold text-primary">{inv.codigo}</div>
                  <div className="text-sm font-medium mt-0.5">{inv.tipo}</div>
                  <div className="text-xs text-muted-foreground">{inv.grupo_produtos}</div>
                </button>
                <Donut value={inv.acuracidade} size={66} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <StatusBadge status={inv.status} />
                <span className="text-xs text-muted-foreground font-mono">{inv.data} · {inv.periodo}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Boxes className="h-3.5 w-3.5" /> {inv.qtd_uds} UDs</div>
                <div className="flex items-center gap-1.5 text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> {inv.pendencias} pend.</div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3" /> Registrado por: <span className="text-foreground">{inv.created_by || "—"}</span></span>
                <button className="text-muted-foreground hover:text-destructive" onClick={() => setToDelete(inv)} data-testid={`inv-delete-${inv.id}`} title="Excluir inventário"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="create-inventory-dialog">
          <DialogHeader><DialogTitle>Criar Inventário</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de Inventário</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((s) => ({ ...s, tipo: v }))}>
                <SelectTrigger data-testid="inv-tipo-select"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{groups.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground">Cadastre em Cadastros › Grupos</div> : groups.map((g) => <SelectItem key={g.id} value={g.nome}>{g.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Grupo de Produtos</Label>
              <Select value={form.grupo_produtos} onValueChange={(v) => setForm((s) => ({ ...s, grupo_produtos: v }))}>
                <SelectTrigger data-testid="inv-grupo-select"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                <SelectContent>{prodGroups.length === 0 ? <div className="px-3 py-2 text-xs text-muted-foreground">Cadastre produtos primeiro</div> : prodGroups.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Data do Inventário</Label><Input type="date" value={form.data} onChange={(e) => setForm((s) => ({ ...s, data: e.target.value, periodo: periodoFromData(e.target.value) }))} data-testid="inv-data-input" /></div>
              <div className="space-y-1.5"><Label>Período (MM/AAAA)</Label><Input value={form.periodo || periodoFromData(form.data)} onChange={(e) => setForm((s) => ({ ...s, periodo: e.target.value }))} className="font-mono" data-testid="inv-periodo-input" /></div>
            </div>
            <Button type="submit" className="w-full" disabled={saving || !form.tipo || !form.grupo_produtos} data-testid="inv-save-btn">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Inventário"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent data-testid="delete-inventory-dialog">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Excluir Inventário?</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Esta ação excluirá o inventário <span className="font-semibold text-foreground">{toDelete?.codigo}</span> e os dados relacionados, incluindo Ponto de Corte, Coleta Física, validações, pendências, gatilhos e demais registros vinculados.</p>
            <p className="text-sm font-medium text-destructive">Esta ação não poderá ser desfeita.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setToDelete(null)} data-testid="inv-delete-cancel">Cancelar</Button>
              <Button variant="destructive" onClick={doDelete} disabled={deleting} data-testid="inv-delete-confirm">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir Inventário"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
