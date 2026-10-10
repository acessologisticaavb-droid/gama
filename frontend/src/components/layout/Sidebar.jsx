import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard, Building2, Users, Boxes, ClipboardList, AlertTriangle,
  Database, ScrollText, ChevronRight,
} from "lucide-react";

const linkCls = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
  }`;

export default function Sidebar({ collapsed }) {
  const { user } = useAuth();
  const loc = useLocation();
  const isSys = user?.role === "system_admin";
  const isCompanyAdmin = user?.role === "company_admin";
  const invOpen = loc.pathname.startsWith("/inventario");

  const Item = ({ to, icon: Icon, label, testid }) => (
    <NavLink to={to} className={linkCls} data-testid={testid} end={to === "/"}>
      <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );

  return (
    <aside className={`fixed left-0 top-0 bottom-0 z-40 ${collapsed ? "w-16" : "w-64"} bg-card border-r border-border transition-all duration-300 flex flex-col`}>
      <div className="h-16 flex items-center gap-2.5 px-4 border-b border-border">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"><Boxes className="h-5 w-5" /></div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-heading font-extrabold tracking-tight">GAMA</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Industrial</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {!isSys && <Item to="/" icon={LayoutDashboard} label="Dashboard" testid="nav-dashboard" />}

        {isSys && <Item to="/empresas" icon={Building2} label="Empresas" testid="nav-empresas" />}
        {isSys && <Item to="/auditoria" icon={ScrollText} label="Auditoria" testid="nav-auditoria-sys" />}

        {isCompanyAdmin && <Item to="/usuarios" icon={Users} label="Usuários & Acessos" testid="nav-usuarios" />}

        {!isSys && (
          <div className="pt-2">
            {!collapsed && <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><ChevronRight className="h-3 w-3" /> Inventário</div>}
            <Item to="/inventario/registros" icon={ClipboardList} label="Registro de Inventários" testid="nav-registros" />
            <Item to="/inventario/cadastros" icon={Database} label="Cadastros" testid="nav-cadastros" />
            <Item to="/inventario/pendencias" icon={AlertTriangle} label="Pendências" testid="nav-pendencias" />
          </div>
        )}

        {isCompanyAdmin && <div className="pt-2"><Item to="/auditoria" icon={ScrollText} label="Auditoria" testid="nav-auditoria" /></div>}
      </nav>

      {!collapsed && (
        <div className="p-3 border-t border-border text-xs text-muted-foreground">
          <div className="font-medium text-foreground truncate">{user?.nome}</div>
          <div className="truncate">{user?.funcao || user?.role}</div>
        </div>
      )}
    </aside>
  );
}
