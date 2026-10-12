import { Clock, PlayCircle, ShieldCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const MAP = {
  Planejado: { c: "bg-slate-500/15 text-slate-300 border-slate-500/30", Icon: Clock },
  "Em andamento": { c: "bg-blue-500/15 text-blue-400 border-blue-500/30", Icon: PlayCircle },
  "Em validação": { c: "bg-purple-500/15 text-purple-400 border-purple-500/30", Icon: ShieldCheck },
  "Com pendências": { c: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: AlertTriangle },
  Concluído: { c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", Icon: CheckCircle2 },
  Cancelado: { c: "bg-red-500/15 text-red-400 border-red-500/30", Icon: XCircle },
};

export function StatusBadge({ status }) {
  const m = MAP[status] || MAP["Planejado"];
  const Icon = m.Icon;
  return (
    <span data-testid="status-badge" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${m.c}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}

const INV_MAP = {
  "CONTAGEM OK": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "SKU no fisico": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "SKU FALTANTE": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "SKU faltante": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "SKU FORA DO SISTEMA": "bg-red-500/15 text-red-400 border-red-500/30",
  "SKU fora do sistema": "bg-red-500/15 text-red-400 border-red-500/30",
  "UD DUPLICADA": "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "UD duplicada": "bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30",
  "SEM ETIQUETA": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Sem etiqueta": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "POSIÇÃO CORRETA": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "POSIÇÃO ERRADA": "bg-red-500/15 text-red-400 border-red-500/30",
  Pendente: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Concluído: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export function InvBadge({ value }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const c = INV_MAP[value] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium font-mono ${c}`}>{value}</span>;
}
