import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, apiError, API_URL } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, KpiCard, Empty } from "@/components/ui/page";
import { StatusBadge, InvBadge } from "@/components/StatusBadge";
import ExcelTable from "@/components/ExcelTable";
import ImportWizard from "@/components/ImportWizard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Upload, ScanLine, FileSpreadsheet, FileText, Loader2, Boxes,
  CheckCircle2, AlertTriangle, Target, Copy, Tag,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#8B5CF6", "#EC4899"];

export default function InventoryDetail() {
  const { iid } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [inv, setInv] = useState(null);
  const [wizard, setWizard] = useState(null); // 'cutoff' | 'physical'
  const [tabsData, setTabsData] = useState({});

  const loadInv = useCallback(async () => {
    try { const { data } = await api.get(`/inventories/${iid}`); setInv(data); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); nav("/inventario/registros"); }
  }, [iid, nav]);
  const loadTabs = useCallback(async () => { try { const { data } = await api.get(`/inventories/${iid}/pendencia-tabs`); setTabsData(data); } catch { /* */ } }, [iid]);

  useEffect(() => { loadInv(); loadTabs(); }, [loadInv, loadTabs]);

  const download = async (kind) => {
    try {
      const res = await api.get(`/inventories/${iid}/${kind === "excel" ? "export-excel" : "report-pdf"}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `${inv.codigo}.${kind === "excel" ? "xlsx" : "pdf"}`; a.click();
      URL.revokeObjectURL(url);
      toast.success(kind === "excel" ? "Excel exportado" : "Relatório PDF gerado");
    } catch (e) { toast.error(apiError(e.response?.data?.detail, "Falha ao gerar arquivo.")); }
  };

  const changeStatus = async (status) => {
    try { await api.put(`/inventories/${iid}/status?status=${encodeURIComponent(status)}`); toast.success("Status atualizado"); loadInv(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  if (!inv) return <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const afterImport = () => { loadInv(); loadTabs(); };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => nav("/inventario/registros")} data-testid="back-inventarios"><ArrowLeft className="h-4 w-4 mr-1" /> Inventários</Button>
      <PageHeader title={inv.codigo} subtitle={`${inv.tipo} · ${inv.grupo_produtos} · ${inv.data} · ${inv.periodo}`} testid="inv-detail-header">
        <StatusBadge status={inv.status} />
        <Select value={inv.status} onValueChange={changeStatus}>
          <SelectTrigger className="w-44" data-testid="inv-status-select"><SelectValue /></SelectTrigger>
          <SelectContent>{["Planejado", "Em andamento", "Em validação", "Com pendências", "Concluído", "Cancelado"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </PageHeader>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setWizard("cutoff")} data-testid="import-cutoff-btn"><Upload className="h-4 w-4 mr-1" /> Importar Estoque (Ponto de Corte)</Button>
        <Button variant="outline" onClick={() => setWizard("physical")} disabled={!inv.has_cutoff} data-testid="import-physical-btn"><ScanLine className="h-4 w-4 mr-1" /> Coleta SKU Físico</Button>
        <Button variant="outline" onClick={() => download("excel")} disabled={!inv.has_physical} data-testid="export-excel-btn"><FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar Excel</Button>
        <Button onClick={() => download("pdf")} disabled={!inv.has_physical} data-testid="generate-pdf-btn"><FileText className="h-4 w-4 mr-1" /> Gerar Relatório PDF</Button>
      </div>

      <Tabs defaultValue="relatorio">
        <TabsList className="flex-wrap h-auto" data-testid="inv-tabs">
          <TabsTrigger value="relatorio" data-testid="tab-relatorio">Relatório</TabsTrigger>
          <TabsTrigger value="cutoff" data-testid="tab-cutoff">Ponto de Corte</TabsTrigger>
          <TabsTrigger value="fisica" data-testid="tab-fisica">Coleta Física</TabsTrigger>
          <TabsTrigger value="dados" data-testid="tab-dados">Dados Gerais</TabsTrigger>
          {Object.entries(tabsData.base || {}).map(([st, c]) => (
            <TabsTrigger key={st} value={st} data-testid={`tab-${st}`}>{st} <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-1.5 text-[10px]">{c}</span></TabsTrigger>
          ))}
          {Object.entries(tabsData.gatilhos || {}).map(([g, c]) => (
            <TabsTrigger key={`g:${g}`} value={`g:${g}`} data-testid={`tab-gatilho-${g}`}>{g} <span className="ml-1.5 rounded-full bg-emerald-500/20 text-emerald-400 px-1.5 text-[10px]">{c}</span></TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="relatorio" className="mt-4"><Relatorio iid={iid} inv={inv} /></TabsContent>
        <TabsContent value="cutoff" className="mt-4"><CutoffTab iid={iid} hasData={inv.has_cutoff} /></TabsContent>
        <TabsContent value="fisica" className="mt-4"><PhysicalTab iid={iid} hasData={inv.has_physical} /></TabsContent>
        <TabsContent value="dados" className="mt-4"><DadosGerais iid={iid} /></TabsContent>
        {Object.keys(tabsData.base || {}).map((st) => (
          <TabsContent key={st} value={st} className="mt-4"><PendenciaTab iid={iid} status={st} onChange={afterImport} /></TabsContent>
        ))}
        {Object.keys(tabsData.gatilhos || {}).map((g) => (
          <TabsContent key={`g:${g}`} value={`g:${g}`} className="mt-4"><PendenciaTab iid={iid} gatilho={g} onChange={afterImport} /></TabsContent>
        ))}
      </Tabs>

      <ImportWizard open={wizard === "cutoff"} onClose={() => setWizard(null)} title="Importar Ponto de Corte (Estoque do Sistema)" endpoint={`/inventories/${iid}/import-cutoff`} onDone={afterImport} />
      <ImportWizard open={wizard === "physical"} onClose={() => setWizard(null)} title="Importar Coleta Física (SKU Físico)" endpoint={`/inventories/${iid}/import-physical`} onDone={afterImport} />
    </div>
  );
}

function Relatorio({ iid, inv }) {
  const [d, setD] = useState(null);
  const [resumo, setResumo] = useState([]);
  useEffect(() => {
    api.get(`/inventories/${iid}/dashboard`).then((r) => setD(r.data)).catch(() => setD(false));
    api.get(`/inventories/${iid}/resumo-material`).then((r) => setResumo(r.data)).catch(() => {});
  }, [iid]);

  if (!inv.has_physical) return <Empty icon={ScanLine} title="Aguardando Coleta Física" hint="Importe o Ponto de Corte e a Coleta Física para gerar o relatório." />;
  if (d === null) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!d) return null;
  const k = d.kpis;

  const chart1 = [{ name: "No Sistema", v: k.cutoff_total }, { name: "Coletadas", v: k.physical_total }];
  const chart2 = [{ name: "Posição Correta", v: k.posicao_correta }, { name: "Posição Errada", v: k.posicao_errada }];
  const chart3 = [{ name: "Contagem OK", v: k.contagem_ok }, { name: "Pendências", v: k.faltantes + k.fora_sistema + k.duplicadas + k.sem_etiqueta }];
  const chart4 = Object.entries(d.trigger_kpis).map(([name, v]) => ({ name, v }));
  const chart5 = Object.entries(d.pend_status).map(([name, v]) => ({ name, v }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="UDs Sistema" value={k.cutoff_total} icon={Boxes} testid="kpi-cutoff" />
        <KpiCard label="UDs Coletadas" value={k.physical_total} icon={ScanLine} testid="kpi-physical" />
        <KpiCard label="Faltantes" value={k.faltantes} icon={AlertTriangle} accent="text-amber-400" testid="kpi-faltantes" />
        <KpiCard label="Fora do Sistema" value={k.fora_sistema} icon={AlertTriangle} accent="text-red-400" testid="kpi-fora" />
        <KpiCard label="Duplicadas" value={k.duplicadas} icon={Copy} accent="text-fuchsia-400" testid="kpi-dup" />
        <KpiCard label="Sem Etiqueta" value={k.sem_etiqueta} icon={Tag} accent="text-orange-400" testid="kpi-sem" />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <KpiCard label="% Posição Correta" value={`${k.perc_posicao}%`} icon={Target} accent="text-cyan-400" testid="kpi-perc-pos" />
        <KpiCard label="% Acuracidade" value={`${k.perc_acuracidade}%`} icon={CheckCircle2} accent="text-emerald-400" testid="kpi-perc-acc" />
      </div>

      {chart4.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="KPIs por Gatilho">
            <BarChart data={chart4}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} /><YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="v" fill="#F59E0B" radius={[4, 4, 0, 0]} /></BarChart>
          </ChartCard>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="UDs Sistema × Coletadas">
          <BarChart data={chart1}><CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} /><YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} allowDecimals={false} /><Tooltip contentStyle={tooltipStyle} /><Bar dataKey="v" fill="#3B82F6" radius={[4, 4, 0, 0]} /></BarChart>
        </ChartCard>
        <ChartCard title="Posição Correta × Errada">
          <PieChart><Pie data={chart2} dataKey="v" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>{chart2.map((e, i) => <Cell key={i} fill={[COLORS[1], COLORS[3]][i]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
        </ChartCard>
        <ChartCard title="Contagem OK × Pendências">
          <PieChart><Pie data={chart3} dataKey="v" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>{chart3.map((e, i) => <Cell key={i} fill={[COLORS[1], COLORS[2]][i]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
        </ChartCard>
      </div>

      {chart5.some((c) => c.v > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard title="Status das Pendências">
            <PieChart><Pie data={chart5} dataKey="v" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>{chart5.map((e, i) => <Cell key={i} fill={[COLORS[2], COLORS[1]][i]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
          </ChartCard>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border"><h3 className="font-heading font-semibold">Resumo por Material</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left px-4 py-2.5">Cód. Material</th><th className="text-left px-4 py-2.5">Descrição</th><th className="text-left px-4 py-2.5">Qtd Sistema</th><th className="text-left px-4 py-2.5">Qtd Física</th><th className="text-left px-4 py-2.5">% Acuracidade</th></tr></thead>
          <tbody>
            {resumo.map((m, i) => (
              <tr key={i} className="border-t border-border" data-testid={`resumo-row-${i}`}>
                <td className="px-4 py-2 font-mono">{m.cod_material}</td><td className="px-4 py-2">{m.descricao}</td><td className="px-4 py-2">{m.qtd_sistema}</td><td className="px-4 py-2">{m.qtd_fisica}</td>
                <td className="px-4 py-2"><span className={m.acuracidade >= 100 ? "text-emerald-400" : m.acuracidade >= 50 ? "text-amber-400" : "text-red-400"}>{m.acuracidade}%</span></td>
              </tr>
            ))}
            {resumo.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sem dados.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

const tooltipStyle = { background: "#111827", border: "1px solid #374151", borderRadius: 8, fontSize: 12 };
function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="text-sm font-semibold mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>{children}</ResponsiveContainer>
    </div>
  );
}

function CutoffTab({ iid, hasData }) {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [search, setSearch] = useState("");
  useEffect(() => { api.get(`/inventories/${iid}/cutoff?search=${encodeURIComponent(search)}&limit=100`).then((r) => setData(r.data)).catch(() => {}); }, [iid, search, hasData]);
  if (!hasData) return <Empty icon={Upload} title="Nenhum Ponto de Corte importado" hint="Use o botão Importar Estoque." />;
  const cols = [
    { key: "sku_sistema", label: "SKU Sistema" }, { key: "cod_material", label: "Cód. Material" },
    { key: "descricao", label: "Descrição" }, { key: "lote", label: "Lote" }, { key: "um", label: "UM" },
    { key: "peso", label: "Peso" }, { key: "pos_sistema", label: "Posição Sistema" },
    { key: "dias_estoque", label: "Dias Estoque" }, { key: "estoque_disponivel", label: "Estoque Disp." },
    { key: "validacao_sku", label: "Validação do SKU", render: (v) => v ? <InvBadge value={v} /> : "—" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{data.total} registros</span>
        <input className="h-9 rounded-md border border-border bg-background px-3 text-sm" placeholder="Pesquisar…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="cutoff-search" /></div>
      <ExcelTable columns={cols} rows={data.rows.map((r, i) => ({ rid: r.sku_sistema + i, ...r }))} onCellChange={() => {}} testid="cutoff-table" />
    </div>
  );
}

function PhysicalTab({ iid, hasData }) {
  const [data, setData] = useState({ rows: [], total: 0 });
  useEffect(() => { api.get(`/inventories/${iid}/physical?limit=200`).then((r) => setData(r.data)).catch(() => {}); }, [iid, hasData]);
  if (!hasData) return <Empty icon={ScanLine} title="Nenhuma Coleta Física importada" hint="Use o botão Coleta SKU Físico." />;
  const cols = [
    { key: "cod_barras", label: "Cód. de Barras" }, { key: "sku_fisico", label: "SKU Físico" },
    { key: "pos_fisica", label: "Posição Física" }, { key: "cod_material", label: "Cód. Material" },
    { key: "descricao", label: "Descrição" }, { key: "lote", label: "Lote" },
    { key: "pos_sistema", label: "Posição Sistema" }, { key: "dias_estoque", label: "Dias Estoque" },
    { key: "peso", label: "Peso" },
  ];
  return (
    <div className="space-y-3">
      <span className="text-sm text-muted-foreground">{data.total} registros · use o funil para filtrar por valores únicos</span>
      <ExcelTable columns={cols} rows={data.rows.map((r, i) => ({ rid: r.cod_barras + i, ...r }))} onCellChange={() => {}} testid="physical-table" />
    </div>
  );
}

function DadosGerais({ iid }) {
  const [data, setData] = useState({ rows: [], total: 0 });
  useEffect(() => { api.get(`/inventories/${iid}/dados-gerais?limit=200`).then((r) => setData(r.data)).catch(() => {}); }, [iid]);
  if (data.total === 0) return <Empty icon={FileSpreadsheet} title="Sem dados consolidados" hint="Importe Coleta Física para gerar os Dados Gerais." />;
  const cols = [
    { key: "sku_sistema", label: "SKU Sistema" }, { key: "sku_fisico", label: "SKU Físico" },
    { key: "cod_material", label: "Material" }, { key: "descricao", label: "Descrição" }, { key: "lote", label: "Lote" },
    { key: "peso", label: "Peso" }, { key: "pos_sistema", label: "Pos. Sistema" }, { key: "pos_fisica", label: "Pos. Física" },
    { key: "validacao_posicao", label: "Validação Posição", render: (v) => <InvBadge value={v} /> },
    { key: "status_inventario", label: "Status Inventário", render: (v) => <InvBadge value={v} /> },
    { key: "gatilho", label: "Gatilho" }, { key: "motivo", label: "Motivo" },
    { key: "resolucao", label: "Resolução" }, { key: "resolucao_status", label: "Status Resol." },
  ];
  return (
    <div className="space-y-3">
      <span className="text-sm text-muted-foreground">{data.total} registros consolidados</span>
      <ExcelTable columns={cols} rows={data.rows.map((r) => ({ rid: r.rid, ...r }))} onCellChange={() => {}} testid="dados-gerais-table" />
    </div>
  );
}

function PendenciaTab({ iid, status, gatilho: gatilhoTab, onChange }) {
  const [data, setData] = useState({ rows: [], total: 0 });
  const [triggers, setTriggers] = useState([]);
  const canEdit = true;
  const isGatilhoTab = !!gatilhoTab;
  const isManual = status === "SKU FALTANTE" || status === "SKU FORA DO SISTEMA";
  const motivo = status === "SKU FALTANTE" ? "SKU faltante" : "SKU fora do sistema";
  const label = gatilhoTab || status;

  const load = useCallback(() => {
    const qs = isGatilhoTab ? `gatilho=${encodeURIComponent(gatilhoTab)}` : `status=${encodeURIComponent(status)}`;
    api.get(`/inventories/${iid}/records?${qs}&limit=500`).then((r) => setData(r.data)).catch(() => {});
  }, [iid, status, gatilhoTab, isGatilhoTab]);
  useEffect(() => {
    load();
    // Both manual base tabs and gatilho tabs offer the trigger dropdown so a record can be re-classified / moved.
    const m = isGatilhoTab ? "" : motivo;
    api.get(`/triggers${m ? `?motivo=${encodeURIComponent(m)}` : ""}`).then((r) => setTriggers(r.data)).catch(() => {});
  }, [load, isGatilhoTab, motivo]);

  const onCell = async (rid, key, value) => {
    const body = {};
    if (key === "gatilho") body.gatilho = value;
    if (key === "resolucao") body.resolucao = value;
    if (key === "resolucao_status") body.resolucao_status = value;
    try {
      await api.put(`/records/${rid}`, body);
      toast.success(key === "gatilho" ? "Gatilho salvo — registro movido para a aba correspondente" : "Registro atualizado");
      load(); onChange?.();
    } catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };
  const onDelete = async (rid) => {
    if (!window.confirm("Deseja realmente excluir este registro?")) return;
    try { await api.delete(`/records/${rid}`); toast.success("Registro excluído"); load(); onChange?.(); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
  };

  const gatilhoEditable = isManual || isGatilhoTab;
  const cols = [
    { key: "sku_fisico", label: "SKU Físico" }, { key: "sku_sistema", label: "SKU Sistema" },
    { key: "cod_material", label: "Material" }, { key: "descricao", label: "Descrição" },
    { key: "lote", label: "Lote" }, { key: "peso", label: "Peso" }, { key: "pos_sistema", label: "Pos. Sistema" },
    ...(gatilhoEditable ? [{ key: "gatilho", label: "Gatilho", editable: true, type: "select", options: triggers.map((t) => ({ value: t.nome, label: t.nome })) }]
      : [{ key: "gatilho", label: "Gatilho" }]),
    { key: "resolucao", label: "Resolução", editable: true, type: "text" },
    { key: "resolucao_status", label: "Status", editable: true, type: "select", options: [{ value: "Pendente", label: "Pendente" }, { value: "Concluído", label: "Concluído" }], render: (v) => <InvBadge value={v} /> },
    { key: "concluido_por", label: "Concluído por" },
    { key: "data_resolucao", label: "Data Resolução", render: (v) => v ? new Date(v).toLocaleString("pt-BR") : "—" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><InvBadge value={label} /><span className="text-sm text-muted-foreground">{data.total} ocorrência(s)</span></div>
      {isManual && triggers.length === 0 && <p className="text-xs text-amber-400">Cadastre gatilhos com motivo "{motivo}" em Cadastros › Gatilhos. Ao selecionar um gatilho e salvar, uma aba com esse gatilho é criada automaticamente.</p>}
      <ExcelTable columns={cols} rows={data.rows.map((r) => ({ rid: r.rid, ...r }))} onCellChange={onCell} onDeleteRow={onDelete} canDelete={canEdit} testid={`pend-table-${label}`} />
    </div>
  );
}
