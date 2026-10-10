import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, List, LayoutGrid, ClipboardList, Loader2 } from "lucide-react";

const STATUSES = ["Planejado", "Em andamento", "Em validação", "Com pendências", "Concluído", "Cancelado"];

export default function Inventarios() {
  const nav = useNavigate();
  const [list, setList] = useState(null);
  const [view, setView] = useState("list");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [prodGroups, setProdGroups] = useState([]);
  const [form, setForm] = useState({ tipo: "", grupo_produtos: "", data: new Date().toISOString().slice(0, 10), periodo: "" });
  const [saving, setSaving] = useState(false);

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

  if (list === null) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-6">
      <PageHeader title="Registro de Inventários" subtitle="Todos os inventários da empresa" testid="inventarios-header">
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <button onClick={() => setView("list")} className={`p-1.5 rounded ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid="view-list"><List className="h-4 w-4" /></button>
          <button onClick={() => setView("kanban")} className={`p-1.5 rounded ${view === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} data-testid="view-kanban"><LayoutGrid className="h-4 w-4" /></button>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="create-inventory-btn"><Plus className="h-4 w-4 mr-1" /> Criar Inventário</Button>
      </PageHeader>

      {list.length === 0 ? <Empty icon={ClipboardList} title="Nenhum inventário" hint="Crie o primeiro inventário para começar." /> :
        view === "list" ? (
          <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground"><tr>
                {["Código", "Tipo", "Grupo", "Data", "Período", "UDs", "Pend.", "Acurácia", "Status"].map((h) => <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {list.map((inv) => (
                  <tr key={inv.id} className="border-t border-border hover:bg-accent/40 cursor-pointer" onClick={() => nav(`/inventario/registros/${inv.id}`)} data-testid={`inv-row-${inv.id}`}>
                    <td className="px-4 py-3 font-mono font-semibold text-primary">{inv.codigo}</td>
                    <td className="px-4 py-3">{inv.tipo}</td><td className="px-4 py-3 text-muted-foreground">{inv.grupo_produtos}</td>
                    <td className="px-4 py-3">{inv.data}</td><td className="px-4 py-3 font-mono">{inv.periodo}</td>
                    <td className="px-4 py-3">{inv.qtd_uds}</td><td className="px-4 py-3">{inv.pendencias}</td><td className="px-4 py-3">{inv.acuracidade}%</td>
                    <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            {STATUSES.map((st) => (
              <div key={st} className="rounded-xl border border-border bg-card/50 p-3" data-testid={`kanban-col-${st}`}>
                <div className="mb-3"><StatusBadge status={st} /></div>
                <div className="space-y-2">
                  {list.filter((i) => i.status === st).map((inv) => (
                    <button key={inv.id} onClick={() => nav(`/inventario/registros/${inv.id}`)} className="w-full text-left rounded-lg border border-border bg-card p-3 hover:border-primary/50" data-testid={`kanban-card-${inv.id}`}>
                      <div className="font-mono font-semibold text-primary text-sm">{inv.codigo}</div>
                      <div className="text-xs mt-1">{inv.tipo}</div>
                      <div className="text-[11px] text-muted-foreground mt-1">{inv.qtd_uds} UDs · {inv.acuracidade}%</div>
                    </button>
                  ))}
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
    </div>
  );
}
