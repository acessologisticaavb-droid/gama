import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar collapsed={collapsed} />
      <div className={`${collapsed ? "pl-16" : "pl-64"} transition-all duration-300`}>
        <Topbar onToggle={() => setCollapsed((c) => !c)} />
        <main className="p-6 md:p-8 space-y-6 max-w-[1700px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
