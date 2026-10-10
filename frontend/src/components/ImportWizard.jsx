import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/** endpointBase like `/inventories/{id}/import-cutoff`. Uploads twice: preview then commit. */
export default function ImportWizard({ open, onClose, title, endpoint, onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const inputRef = useRef(null);

  const reset = () => { setFile(null); setPreview(null); setLoading(false); setCommitting(false); };
  const close = () => { reset(); onClose(); };

  const doPreview = async (f) => {
    setLoading(true); setPreview(null);
    const fd = new FormData(); fd.append("file", f);
    try {
      const { data } = await api.post(`${endpoint}?commit=false`, fd);
      setPreview(data);
      if (!data.valid) toast.error(data.message);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail, "Não foi possível processar o arquivo."));
    } finally { setLoading(false); }
  };

  const onPick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); doPreview(f);
  };

  const doCommit = async () => {
    if (!file) return;
    setCommitting(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post(`${endpoint}?commit=true`, fd);
      toast.success(data.message || "Importação concluída");
      close(); onDone?.(data);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally { setCommitting(false); }
  };

  const cols = preview?.preview?.length ? Object.keys(preview.preview[0]) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-3xl p-0 gap-0 flex flex-col max-h-[90vh]" data-testid="import-wizard">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0"><DialogTitle>{title}</DialogTitle></DialogHeader>

        <div className="px-6 py-4 space-y-4 shrink-0">
          <div
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { setFile(f); doPreview(f); } }}
            data-testid="import-dropzone"
          >
            <UploadCloud className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">{file ? file.name : "Clique ou arraste um arquivo .xlsx"}</p>
            <p className="text-xs text-muted-foreground mt-1">Formato Excel (.xlsx) ou CSV</p>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onPick} data-testid="import-file-input" />
          </div>

          {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Lendo e validando colunas…</div>}

          {preview && !preview.valid && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-destructive">{preview.message}</p>
                {preview.missing?.length > 0 && <p className="text-muted-foreground mt-1">Colunas ausentes: {preview.missing.join(", ")}</p>}
              </div>
            </div>
          )}

          {preview && preview.valid && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 flex gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-emerald-400">{preview.message}</p>
                <p className="text-muted-foreground">{preview.total} registros válidos encontrados.</p>
              </div>
            </div>
          )}
        </div>

        {preview && preview.valid && cols.length > 0 && (
          <div className="flex-1 min-h-0 px-6 pb-2 flex flex-col">
            <p className="text-xs font-medium text-muted-foreground mb-2 shrink-0">Pré-visualização dos dados</p>
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
              <table className="text-xs font-mono border-collapse">
                <thead className="bg-secondary sticky top-0 z-10"><tr>{cols.map((c) => <th key={c} className="border border-border px-2 py-1.5 text-left whitespace-nowrap">{c}</th>)}</tr></thead>
                <tbody>
                  {preview.preview.map((r, i) => (
                    <tr key={i} className="hover:bg-accent/40">{cols.map((c) => <td key={c} className="border border-border px-2 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border shrink-0 bg-card">
          <Button variant="outline" onClick={close} data-testid="import-cancel-btn">Cancelar</Button>
          <Button onClick={doCommit} disabled={!preview?.valid || committing} data-testid="import-confirm-btn">
            {committing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
            Importar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
