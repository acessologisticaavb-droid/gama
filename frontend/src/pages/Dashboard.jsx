import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, KpiCard } from "@/components/ui/page";
import { StatusBadge } from "@/components/StatusBadge";
import { ClipboardList, CheckCircle2, AlertTriangle, Target, Boxes, Loader2 } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/dashboard").then((r) => setData(r.data)).catch(() => setData(false)); }, []);

  if (data === null) return <div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (data === false) return <PageHeader title={`Bem-vindo, ${user?.nome}`} subtitle="GAMA — Gestão Industrial" />;

  return (
    <div className="space-y-6">
      <PageHeader title="GAMA — Dashboard" subtitle="Visão geral do módulo Inventário" testid="gama-dashboard-header" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Em andamento" value={data.em_andamento} icon={ClipboardList} testid="kpi-em-andamento" />
        <KpiCard label="Concluídos" value={data.concluidos} icon={CheckCircle2} accent="text-emerald-400" testid="kpi-concluidos" />
        <KpiCard label="Pendências abertas" value={data.pendencias_abertas} icon={AlertTriangle} accent="text-amber-400" testid="kpi-pendencias" />
        <KpiCard label="Acuracidade média" value={`${data.acuracidade_media}%`} icon={Target} accent="text-cyan-400" testid="kpi-acuracidade" />
        <KpiCard label="Total UDs" value={data.total_uds.toLocaleString("pt-BR")} icon={Boxes} testid="kpi-total-uds" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-heading text-lg font-semibold">Inventários recentes</h3>
        </div>
        <div className="divide-y divide-border">
          {data.recentes.length === 0 && <div className="px-5 py-8 text-center text-muted-foreground text-sm">Nenhum inventário ainda.</div>}
          {data.recentes.map((inv) => (
            <button key={inv.id} onClick={() => nav(`/inventario/registros/${inv.id}`)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-accent/40 text-left" data-testid={`recent-inv-${inv.id}`}>
              <div className="flex items-center gap-4">
                <span className="font-mono font-semibold text-primary">{inv.codigo}</span>
                <span className="text-sm">{inv.tipo}</span>
                <span className="text-xs text-muted-foreground">{inv.grupo_produtos}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">{inv.qtd_uds} UDs</span>
                <span className="text-xs text-muted-foreground">{inv.acuracidade}%</span>
                <StatusBadge status={inv.status} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
