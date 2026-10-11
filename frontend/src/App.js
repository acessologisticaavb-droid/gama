import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Login from "@/pages/Login";
import ValidateKey from "@/pages/ValidateKey";
import ChangePassword from "@/pages/ChangePassword";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Companies from "@/pages/admin/Companies";
import CompanyDetail from "@/pages/admin/CompanyDetail";
import Users from "@/pages/Users";
import Cadastros from "@/pages/inventory/Cadastros";
import Inventarios from "@/pages/inventory/Inventarios";
import InventoryDetail from "@/pages/inventory/InventoryDetail";
import Pendencias from "@/pages/inventory/Pendencias";
import Audit from "@/pages/Audit";
import Profile from "@/pages/Profile";

function Gate({ children }) {
  const { user, booting } = useAuth();
  if (booting || user === null)
    return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "system_admin" && !user.validated) return <Navigate to="/validar-chave" replace />;
  if (user.must_change_password) return <Navigate to="/trocar-senha" replace />;
  return children;
}

function Routing() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/validar-chave" element={<ValidateKey />} />
      <Route path="/trocar-senha" element={<ChangePassword />} />
      <Route element={<Gate><AppLayout /></Gate>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/empresas" element={<Companies />} />
        <Route path="/empresas/:cid" element={<CompanyDetail />} />
        <Route path="/usuarios" element={<Users />} />
        <Route path="/inventario/cadastros" element={<Cadastros />} />
        <Route path="/inventario/registros" element={<Inventarios />} />
        <Route path="/inventario/registros/:iid" element={<InventoryDetail />} />
        <Route path="/inventario/pendencias" element={<Pendencias />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/auditoria" element={<Audit />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routing />
        <Toaster richColors position="top-right" theme="dark" />
      </BrowserRouter>
    </AuthProvider>
  );
}
