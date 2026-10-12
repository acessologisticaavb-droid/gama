import { useAuth } from "@/context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PanelLeft, LogOut, UserCircle, Sun, Moon } from "lucide-react";

const LABELS = {
  "": "Dashboard", empresas: "Empresas", usuarios: "Usuários & Acessos",
  inventario: "Inventário", cadastros: "Cadastros", registros: "Registro de Inventários",
  pendencias: "Pendências", auditoria: "Auditoria",
};

export default function Topbar({ onToggle }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const parts = loc.pathname.split("/").filter(Boolean);
  const roleLabel = { system_admin: "Admin do Sistema", company_admin: "Admin da Empresa", user: "Usuário" }[user?.role];
  const [light, setLight] = useState(() => document.documentElement.classList.contains("light"));

  const doLogout = async () => { await logout(); nav("/login"); };
  const toggleTheme = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("gama-theme", next ? "light" : "dark");
  };

  return (
    <header className="h-16 sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onToggle} data-testid="sidebar-toggle"><PanelLeft className="h-5 w-5" /></Button>
        <nav className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">GAMA</span>
          {parts.map((p, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-muted-foreground">/</span>
              <span className={i === parts.length - 1 ? "font-medium" : "text-muted-foreground"}>{LABELS[p] || p}</span>
            </span>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <button onClick={() => nav("/perfil")} className="flex items-center gap-3 rounded-lg hover:bg-accent px-2 py-1 transition-colors" data-testid="topbar-profile-btn">
          <div className="text-right leading-tight hidden sm:block">
            <div className="text-sm font-medium">{user?.nome}</div>
            <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wide">{roleLabel}</div>
          </div>
          {user?.foto ? (
            <img src={user.foto} alt="perfil" className="h-9 w-9 rounded-full object-cover border border-border" data-testid="topbar-avatar" />
          ) : (
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary"><UserCircle className="h-6 w-6" /></div>
          )}
        </button>
        <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="theme-toggle-btn" title={light ? "Modo escuro" : "Modo claro"}>
          {light ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={doLogout} data-testid="logout-button" title="Sair"><LogOut className="h-5 w-5" /></Button>
      </div>
    </header>
  );
}
