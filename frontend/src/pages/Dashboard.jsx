import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/page";
import { Boxes, Package, Truck, Factory, ShieldCheck, Warehouse, MapPin, ArrowRight } from "lucide-react";

const MODULES = [
  { key: "inventario", icon: Boxes, nome: "Inventário", desc: "Gestão e controle de inventários físicos, pontos de corte, coletas e pendências.", to: "/inventario/registros", available: true },
];

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [perms, setPerms] = useState(null);

  useEffect(() => { setPerms(user?.permissions || {}); }, [user]);

  const canAccess = (m) => {
    if (user?.role === "company_admin") return true;
    if (user?.role === "system_admin") return false;
    const sub = perms?.[m.key] || {};
    return Object.values(sub).some((arr) => Array.isArray(arr) && arr.length > 0);
  };

  const visible = MODULES.filter((m) => m.available && canAccess(m));

  if (user?.role === "system_admin") {
    return (
      <div className="space-y-6">
        <PageHeader title={`Bem-vindo, ${user?.nome?.split(" ")[0] || ""}`} subtitle="GAMA — Administração do Sistema" testid="gama-dashboard-header" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="group rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/50 transition-colors" data-testid="admin-card-empresas">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary mb-4"><Factory className="h-6 w-6" /></div>
            <h3 className="font-heading text-xl font-bold">Empresas</h3>
            <p className="text-sm text-muted-foreground mt-2 flex-1">Cadastre empresas, gere chaves de validação e gerencie administradores.</p>
            <button onClick={() => nav("/empresas")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">Gerenciar empresas <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="group rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/50 transition-colors" data-testid="admin-card-auditoria">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary mb-4"><ShieldCheck className="h-6 w-6" /></div>
            <h3 className="font-heading text-xl font-bold">Auditoria</h3>
            <p className="text-sm text-muted-foreground mt-2 flex-1">Histórico de ações e alterações em todas as empresas da plataforma.</p>
            <button onClick={() => nav("/auditoria")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all">Ver auditoria <ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Bem-vindo, ${user?.nome?.split(" ")[0] || ""}`} subtitle="GAMA — Gestão Industrial · selecione um módulo" testid="gama-dashboard-header" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => (
          <div key={m.key} className="group rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/50 transition-colors" data-testid={`module-card-${m.key}`}>
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary mb-4"><m.icon className="h-6 w-6" /></div>
            <h3 className="font-heading text-xl font-bold">{m.nome}</h3>
            <p className="text-sm text-muted-foreground mt-2 flex-1">{m.desc}</p>
            <button onClick={() => nav(m.to)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary group-hover:gap-3 transition-all" data-testid={`access-module-${m.key}`}>
              Acessar módulo <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
