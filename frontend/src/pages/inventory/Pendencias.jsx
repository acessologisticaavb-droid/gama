import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { InvBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function Pendencias() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("all");
  const [tipos, setTipos] = useState([]);
  const [tipo, setTipo] = useState("all");

  const load = async () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status_resolucao", status);
    if (tipo !== "all") params.set("tipo", tipo);
    const { data } = await api.get(`/pendencias?${params}`);
    setRows(data);
  };
  useEffect(() => { load(); }, [status, tipo]);
  useEffect(() => { api.get("/inv-groups").then((r) => setTipos(r.data)).catch(() => {}); }, []);

  return (
    <div className="space-y-6">
      <PageHeader title="Pendências" subtitle="Consolidado de pendências de todos os inventários" testid="pendencias-header" />
      <div className="flex flex-wrap gap-3">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48" data-testid="pend-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="Pendente">Pendente</SelectItem><SelectItem value="Concluído">Concluído</SelectItem></SelectContent>
        </Select>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-56" data-testid="pend-tipo-filter"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{tipos.map((t) => <SelectItem key={t.id} value={t.nome}>{t.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {rows === null ? <Loader2 className="h-5 w-5 animate-spin" /> :
        rows.length === 0 ? <Empty icon={AlertTriangle} title="Nenhuma pendência" hint="As pendências aparecem após o processamento dos inventários." /> : (
          <div className="rounded-xl border border-border bg-card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary uppercase tracking-wider text-muted-foreground"><tr>
                {["Inventário", "Data", "Tipo", "Material", "SKU", "Classificação", "Gatilho", "Motivo", "Status", "Dias", "Resolução"].map((h) => <th key={h} className="text-left px-3 py-2.5 whitespace-nowrap">{h}</th>)}
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
                    <td className="px-3 py-2">{r.motivo}</td>
                    <td className="px-3 py-2"><InvBadge value={r.status} /></td>
                    <td className="px-3 py-2 font-mono">{r.dias_pendencia}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{r.resolucao || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
