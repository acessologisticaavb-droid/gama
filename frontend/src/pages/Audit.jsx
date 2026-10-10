import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Empty } from "@/components/ui/page";
import { ScrollText, Loader2 } from "lucide-react";

export default function Audit() {
  const [list, setList] = useState(null);
  useEffect(() => { api.get("/audit").then((r) => setList(r.data)).catch(() => setList([])); }, []);
  if (list === null) return <Loader2 className="h-5 w-5 animate-spin" />;
  return (
    <div className="space-y-6">
      <PageHeader title="Auditoria" subtitle="Histórico de operações e alterações do sistema" testid="audit-header" />
      {list.length === 0 ? <Empty icon={ScrollText} title="Sem registros de auditoria" /> : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left px-4 py-3">Data/Hora</th><th className="text-left px-4 py-3">Usuário</th><th className="text-left px-4 py-3">Ação</th><th className="text-left px-4 py-3">Módulo</th><th className="text-left px-4 py-3">Registro</th></tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-accent/40" data-testid={`audit-row-${a.id}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-2.5">{a.username || "—"}</td>
                  <td className="px-4 py-2.5">{a.action}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.module}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{a.record || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
