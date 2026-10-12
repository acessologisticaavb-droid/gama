import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserCircle, Upload, Trash2, Loader2, Save } from "lucide-react";

export default function Profile() {
  const { user, setUser, refresh } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [funcao, setFuncao] = useState(user?.funcao || "");

  const roleLabel = { system_admin: "Administrador do Sistema", company_admin: "Administrador da Empresa", user: "Usuário" }[user?.role];

  const savePayload = async (payload, msg) => {
    setSaving(true);
    try { const { data } = await api.put("/auth/profile", payload); setUser(data); await refresh(); toast.success(msg || "Perfil atualizado"); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const onPick = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error("Imagem muito grande (máx 2MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => savePayload({ foto: reader.result }, "Foto atualizada");
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Meu Perfil" subtitle="Gerencie sua identidade e foto" testid="profile-header" />
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            {user?.foto ? (
              <img src={user.foto} alt="Foto de perfil" className="h-24 w-24 rounded-full object-cover border border-border" data-testid="profile-photo" />
            ) : (
              <div className="h-24 w-24 rounded-full bg-primary/15 text-primary grid place-items-center" data-testid="profile-photo-placeholder"><UserCircle className="h-14 w-14" /></div>
            )}
          </div>
          <div className="space-y-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={saving} data-testid="profile-upload-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />} {user?.foto ? "Substituir foto" : "Enviar foto"}
            </Button>
            {user?.foto && <Button variant="ghost" className="text-destructive" onClick={() => savePayload({ foto: null }, "Foto removida")} disabled={saving} data-testid="profile-remove-btn"><Trash2 className="h-4 w-4 mr-1" /> Remover</Button>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} data-testid="profile-file-input" />
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value={user?.nome} />
          <Field label="Login" value={user?.username} mono />
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Função</Label>
            <div className="flex gap-2">
              <Input value={funcao} onChange={(e) => setFuncao(e.target.value)} placeholder="Sua função" data-testid="profile-funcao-input" />
              <Button onClick={() => savePayload({ funcao }, "Função atualizada")} disabled={saving || funcao === (user?.funcao || "")} data-testid="profile-funcao-save"><Save className="h-4 w-4 mr-1" /> Salvar</Button>
            </div>
          </div>
          <Field label="Perfil" value={roleLabel} />
        </div>
        <p className="text-xs text-muted-foreground mt-6">Alterar a função atualiza apenas a informação cadastral. As permissões de acesso continuam sob responsabilidade do Administrador da Empresa.</p>
      </div>
      <Button variant="ghost" onClick={() => nav(-1)}>Voltar</Button>
    </div>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-medium ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
