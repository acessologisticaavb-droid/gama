import { useEffect, useState, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { InvBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Search } from "lucide-react";

export default function Pendencias() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("all");
  const [tipos, setTipos] = useState([]);
  const [tipo, setTipo] = useState("all");
  const [classif, setClassif] = useState("all");
  const [classifs, setClassifs] = useState([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status_resolucao", status);
    if (tipo !== "all") params.set("tipo", tipo);
    if (classif !== "all") params.set("gatilho", classif);
    if (search.trim()) params.set("search", search.trim());
    const { data } = await api.get(`/pendencias?${params}`);
    setRows(data);
  }, [status, tipo, classif, search]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    api.get("/inv-groups").then((r) => setTipos(r.data)).catch(() => {});
    api.get("/classificacoes").then((r) => setClassifs(r.data)).catch(() => {});
  }, []);

  const changeStatus = async (rid, value) => {
    try {
      await api.put(`/records/${rid}`, { resolucao_status: value });
      toast.success("Status atualizado");
      load();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Pendências" subtitle="Consolidado e sincronizado de todas as pendências da empresa" testid="pendencias-header" />
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Pesquisar pendências…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="pend-search" /></div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="pend-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="Pendente">Pendente</SelectItem><SelectItem value="Concluído">Concluído</SelectItem></SelectContent>
        </Select>
        <Select value={classif} onValueChange={setClassif}>
          <SelectTrigger className="w-56" data-testid="pend-classif-filter"><SelectValue placeholder="Classificação" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Toda classificação</SelectItem>{classifs.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-52" data-testid="pend-tipo-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{tipos.map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {rows === null ? <Loader2 className="h-5 w-5 animate-spin" /> :
        rows.length === 0 ? <Empty icon={AlertTriangle} title="Nenhuma pendência" hint="As pendências aparecem após o processamento dos inventários." /> : (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary uppercase tracking-wider text-muted-foreground"><tr>
                {["Inventário", "Data", "Tipo", "Material", "SKU", "Classificação", "Gatilho", "Resolução", "Status", "Concluído por", "Data Resol.", "Dias"].map((h) => <th key={h} className="text-left px-3 py-2.5 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rid} className="border-t border-border hover:bg-accent/40" data-testid={`pend-row-${r.rid}`}>
                    <td className="px-3 py-2 font-mono text-primary">{r.codigo}</td>
                    <td className="px-3 py-2">{r.data_inventario}</td>
                    <td className="px-3 py-2">{r.tipo}</td>
                    <td className="px-3 py-2">{r.cod_material || "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.sku}</td>
                    <td className="px-3 py-2"><InvBadge value={r.status_inventario} /></td>
                    <td className="px-3 py-2">{r.gatilho || "—"}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{r.resolucao || "—"}</td>
                    <td className="px-3 py-2">
                      <select value={r.status || "Pendente"} onChange={(e) => changeStatus(r.rid, e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-xs" data-testid={`pend-status-select-${r.rid}`}>
                        <option value="Pendente">Pendente</option>
                        <option value="Concluído">Concluído</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">{r.concluido_por || "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.data_resolucao ? new Date(r.data_resolucao).toLocaleString("pt-BR") : "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.dias_pendencia}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
