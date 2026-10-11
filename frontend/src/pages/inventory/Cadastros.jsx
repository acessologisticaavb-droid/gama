import { useEffect, useState, useRef } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Upload, Search, Package, MapPin, Layers, Zap } from "lucide-react";

function SimpleList({ endpoint, columns, testid, extra }) {
  const [rows, setRows] = useState([]);
  const load = async () => { try { const { data } = await api.get(endpoint); setRows(data); } catch { /* */ } };
  useEffect(() => { load(); }, [endpoint]);
  const del = async (id) => {
    if (!window.confirm("Deseja realmente excluir este registro?")) return;
    try { await api.delete(`${endpoint}/${id}`); toast.success("Excluído"); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  return { rows, load, del, columns, testid, extra };
}

export default function Cadastros() {
  return (
    <div className="space-y-6">
      <PageHeader title="Cadastros" subtitle="Dados mestres do módulo Inventário" testid="cadastros-header" />
      <Tabs defaultValue="produtos">
        <TabsList data-testid="cadastros-tabs">
          <TabsTrigger value="produtos" data-testid="tab-produtos"><Package className="h-4 w-4 mr-1.5" />Produtos</TabsTrigger>
          <TabsTrigger value="enderecos" data-testid="tab-enderecos"><MapPin className="h-4 w-4 mr-1.5" />Endereços</TabsTrigger>
          <TabsTrigger value="grupos" data-testid="tab-grupos"><Layers className="h-4 w-4 mr-1.5" />Grupos de Inventário</TabsTrigger>
          <TabsTrigger value="gatilhos" data-testid="tab-gatilhos"><Zap className="h-4 w-4 mr-1.5" />Gatilhos</TabsTrigger>
        </TabsList>
        <TabsContent value="produtos" className="mt-4"><Produtos /></TabsContent>
        <TabsContent value="enderecos" className="mt-4"><Enderecos /></TabsContent>
        <TabsContent value="grupos" className="mt-4"><Grupos /></TabsContent>
        <TabsContent value="gatilhos" className="mt-4"><Gatilhos /></TabsContent>
      </Tabs>
    </div>
  );
}

function Produtos() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ cod_material: "", descricao: "", grupo_produtos: "" });
  const fileRef = useRef(null);
  const load = async () => { const { data } = await api.get(`/products?search=${encodeURIComponent(search)}`); setRows(data); };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search]);

  const add = async (e) => {
    e.preventDefault();
    try { await api.post("/products", form); toast.success("Produto criado"); setForm({ cod_material: "", descricao: "", grupo_produtos: "" }); load(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const del = async (id) => { if (!window.confirm("Excluir produto?")) return; await api.delete(`/products/${id}`); load(); };
  const imp = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try { const { data } = await api.post("/products/import", fd); toast.success(`${data.imported} produtos importados`); load(); }
    catch (err) { toast.error(apiError(err.response?.data?.detail)); }
    e.target.value = "";
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-4 rounded-xl border border-border bg-card p-4">
        <Input placeholder="Cód. de Material" value={form.cod_material} onChange={(e) => setForm((s) => ({ ...s, cod_material: e.target.value }))} required data-testid="prod-cod-input" />
        <Input placeholder="Descrição Breve" value={form.descricao} onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))} required data-testid="prod-desc-input" />
        <Input placeholder="Grupo de Produtos" value={form.grupo_produtos} onChange={(e) => setForm((s) => ({ ...s, grupo_produtos: e.target.value }))} required data-testid="prod-grupo-input" />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" data-testid="prod-add-btn"><Plus className="h-4 w-4" /></Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} data-testid="prod-import-btn"><Upload className="h-4 w-4" /></Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={imp} />
        </div>
      </form>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar produtos…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="prod-search" /></div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left px-4 py-3">Cód. Material</th><th className="text-left px-4 py-3">Descrição</th><th className="text-left px-4 py-3">Grupo</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/40" data-testid={`prod-row-${r.id}`}>
                <td className="px-4 py-2.5 font-mono">{r.cod_material}</td><td className="px-4 py-2.5">{r.descricao}</td><td className="px-4 py-2.5">{r.grupo_produtos}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => del(r.id)} data-testid={`prod-del-${r.id}`}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum produto.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CrudPanel({ endpoint, field, placeholder, prefix, label }) {
  const [rows, setRows] = useState([]);
  const [val, setVal] = useState("");
  const load = async () => { const { data } = await api.get(endpoint); setRows(data); };
  useEffect(() => { load(); }, []);
  const add = async (e) => { e.preventDefault(); try { await api.post(endpoint, { [field]: val }); setVal(""); load(); toast.success("Criado"); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const del = async (id) => { if (!window.confirm("Deseja realmente excluir este registro?")) return; await api.delete(`${endpoint}/${id}`); load(); };
  const [search, setSearch] = useState("");
  const view = rows.filter((r) => String(r[field] ?? "").toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="flex gap-2 max-w-xl"><Input placeholder={placeholder} value={val} onChange={(e) => setVal(e.target.value)} required data-testid={`${prefix}-input`} /><Button type="submit" data-testid={`${prefix}-add`}><Plus className="h-4 w-4 mr-1" />Adicionar</Button></form>
      <div className="relative max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`${prefix}-search`} /></div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left px-4 py-3">{label}</th><th className="px-4 py-3 w-16"></th></tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/40" data-testid={`${prefix}-row-${r.id}`}>
                <td className="px-4 py-2.5 font-mono">{r[field]}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => del(r.id)} data-testid={`${prefix}-del-${r.id}`}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={2} className="text-center py-8 text-muted-foreground">Nenhum registro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Enderecos = () => <CrudPanel endpoint="/addresses" field="nome_posicao" placeholder="Ex.: EXT-RA-B01" prefix="addr" label="Nome da Posição" />;
const Grupos = () => <CrudPanel endpoint="/inv-groups" field="nome" placeholder="Ex.: Inventário Rotativo" prefix="grp" label="Tipo de Inventário" />;

function Gatilhos() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ nome: "", motivo: "SKU faltante" });
  const load = async () => { const { data } = await api.get("/triggers"); setRows(data); };
  useEffect(() => { load(); }, []);
  const add = async (e) => { e.preventDefault(); try { await api.post("/triggers", form); setForm({ nome: "", motivo: "SKU faltante" }); load(); toast.success("Gatilho criado"); } catch (e) { toast.error(apiError(e.response?.data?.detail)); } };
  const del = async (id) => { if (!window.confirm("Deseja realmente excluir este registro?")) return; await api.delete(`/triggers/${id}`); load(); };
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-3 rounded-xl border border-border bg-card p-4 max-w-2xl">
        <Input placeholder="Nome do Gatilho (ex.: UD sem etiqueta)" value={form.nome} onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))} required data-testid="trigger-nome-input" />
        <Select value={form.motivo} onValueChange={(v) => setForm((s) => ({ ...s, motivo: v }))}>
          <SelectTrigger data-testid="trigger-motivo-select"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="SKU faltante">SKU faltante</SelectItem><SelectItem value="SKU fora do sistema">SKU fora do sistema</SelectItem></SelectContent>
        </Select>
        <Button type="submit" data-testid="trigger-add-btn"><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
      </form>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left px-4 py-3">Nome do Gatilho</th><th className="text-left px-4 py-3">Motivo</th><th className="px-4 py-3 w-16"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border hover:bg-accent/40" data-testid={`trigger-row-${r.id}`}>
                <td className="px-4 py-2.5 font-medium">{r.nome}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.motivo}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => del(r.id)} data-testid={`trigger-del-${r.id}`}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">Nenhum gatilho.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
