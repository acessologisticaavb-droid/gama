import { useState, useMemo, useRef } from "react";
import { ArrowUpDown, Filter, Trash2, Copy, ClipboardPaste, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Excel-like grid with per-column unique-value filters.
 * columns: [{ key, label, editable?, type?: 'text'|'select', options?, render? }]
 * rows: array of objects (must have `rid`)
 */
export default function ExcelTable({ columns, rows, onCellChange, onDeleteRow, canDelete = false, testid = "excel-table" }) {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [filters, setFilters] = useState({}); // { key: [values] }
  const [openFilter, setOpenFilter] = useState(null);
  const [valSearch, setValSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [sel, setSel] = useState([]);
  const [clip, setClip] = useState(null);
  const anchor = useRef(null);

  const uniqueValues = (key) => {
    const set = new Set(rows.map((r) => String(r[key] ?? "")));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt", { numeric: true }));
  };

  const view = useMemo(() => {
    let data = [...rows];
    Object.entries(filters).forEach(([k, vals]) => {
      if (vals && vals.length) {
        const s = new Set(vals);
        data = data.filter((row) => s.has(String(row[k] ?? "")));
      }
    });
    if (sort.key) data.sort((a, b) => String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), "pt", { numeric: true }) * sort.dir);
    return data;
  }, [rows, filters, sort]);

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));

  const toggleValue = (key, v) => setFilters((f) => {
    const cur = new Set(f[key] || []);
    cur.has(v) ? cur.delete(v) : cur.add(v);
    return { ...f, [key]: Array.from(cur) };
  });
  const selectAll = (key) => setFilters((f) => ({ ...f, [key]: uniqueValues(key) }));
  const clearCol = (key) => setFilters((f) => ({ ...f, [key]: [] }));

  const selectCell = (rIdx, key, shift) => {
    const col = columns.find((c) => c.key === key);
    if (!col?.editable) return;
    if (shift && anchor.current && anchor.current.key === key) {
      const [a, b] = [anchor.current.r, rIdx].sort((x, y) => x - y);
      setSel(Array.from({ length: b - a + 1 }, (_, i) => ({ r: a + i, key })));
    } else {
      anchor.current = { r: rIdx, key };
      setSel([{ r: rIdx, key }]);
    }
  };
  const copySel = () => { if (sel.length) setClip(String(view[sel[0].r]?.[sel[0].key] ?? "")); };
  const pasteSel = () => { if (clip != null) sel.forEach(({ r, key }) => { const row = view[r]; if (row) onCellChange(row.rid, key, clip); }); };
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") copySel();
    if ((e.ctrlKey || e.metaKey) && e.key === "v") pasteSel();
  };
  const isSel = (rIdx, key) => sel.some((s) => s.r === rIdx && s.key === key);

  return (
    <div className="space-y-2" onKeyDown={onKey} tabIndex={0} data-testid={testid}>
      {sel.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{sel.length} célula(s) selecionada(s)</span>
          <Button size="sm" variant="outline" className="h-7" onClick={copySel} data-testid="excel-copy-btn"><Copy className="h-3 w-3 mr-1" />Copiar</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={pasteSel} disabled={clip == null} data-testid="excel-paste-btn"><ClipboardPaste className="h-3 w-3 mr-1" />Colar{clip != null ? `: "${clip.slice(0, 14)}"` : ""}</Button>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setSel([])}><X className="h-3 w-3" /></Button>
        </div>
      )}
      <div className="overflow-auto rounded-lg border border-border max-h-[65vh]">
        <table className="w-full border-collapse text-xs font-mono">
          <thead className="sticky top-0 z-20 bg-secondary">
            <tr>
              {columns.map((c) => {
                const active = (filters[c.key] || []).length > 0;
                const vals = openFilter === c.key ? uniqueValues(c.key).filter((v) => v.toLowerCase().includes(valSearch.toLowerCase())) : [];
                return (
                  <th key={c.key} className="border border-border px-2 py-2 text-left font-semibold whitespace-nowrap relative">
                    <div className="flex items-center gap-1">
                      <button className="flex items-center gap-1 hover:text-primary" onClick={() => toggleSort(c.key)} data-testid={`sort-${c.key}`}>
                        {c.label} <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                      <button className={`ml-auto ${active ? "text-primary" : "opacity-40 hover:opacity-100"}`} onClick={() => { setOpenFilter(openFilter === c.key ? null : c.key); setValSearch(""); }} data-testid={`filter-${c.key}`}>
                        <Filter className="h-3 w-3" />
                      </button>
                    </div>
                    {openFilter === c.key && (
                      <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl" data-testid={`filter-popover-${c.key}`}>
                        <Input autoFocus value={valSearch} onChange={(e) => setValSearch(e.target.value)} placeholder="Pesquisar valores…" className="h-7 text-xs mb-2" data-testid={`filter-search-${c.key}`} />
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <button className="text-primary hover:underline" onClick={() => selectAll(c.key)}>Selecionar todos</button>
                          <button className="text-muted-foreground hover:underline" onClick={() => clearCol(c.key)}>Limpar</button>
                        </div>
                        <div className="max-h-48 overflow-auto space-y-0.5">
                          {vals.map((v) => {
                            const checked = (filters[c.key] || []).includes(v);
                            return (
                              <label key={v} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent cursor-pointer text-xs" data-testid={`filter-opt-${c.key}`}>
                                <span className={`grid h-3.5 w-3.5 place-items-center rounded border ${checked ? "bg-primary border-primary" : "border-border"}`}>{checked && <Check className="h-2.5 w-2.5 text-primary-foreground" />}</span>
                                <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleValue(c.key, v)} />
                                <span className="truncate">{v === "" ? "(vazio)" : v}</span>
                              </label>
                            );
                          })}
                          {vals.length === 0 && <p className="text-[11px] text-muted-foreground px-1 py-2">Nenhum valor.</p>}
                        </div>
                        <Button size="sm" className="h-7 w-full mt-2 text-xs" onClick={() => setOpenFilter(null)}>Fechar</Button>
                      </div>
                    )}
                  </th>
                );
              })}
              {canDelete && <th className="border border-border px-2 py-2 w-10"></th>}
            </tr>
          </thead>
          <tbody>
            {view.map((row, rIdx) => (
              <tr key={row.rid} className="hover:bg-accent/40">
                {columns.map((c) => {
                  const val = row[c.key];
                  const selected = isSel(rIdx, c.key);
                  const isEditing = editing && editing.rid === row.rid && editing.key === c.key;
                  return (
                    <td
                      key={c.key}
                      className={`border border-border px-2 py-1 whitespace-nowrap ${c.editable ? "cursor-cell" : ""} ${selected ? "excel-cell-selected" : ""}`}
                      onClick={(e) => selectCell(rIdx, c.key, e.shiftKey)}
                      onDoubleClick={() => c.editable && setEditing({ rid: row.rid, key: c.key })}
                      data-testid={`cell-${c.key}-${rIdx}`}
                    >
                      {isEditing && c.type === "select" ? (
                        <select autoFocus className="bg-background border border-primary rounded px-1 py-0.5 text-xs" value={val || ""}
                          onChange={(e) => { onCellChange(row.rid, c.key, e.target.value); setEditing(null); }} onBlur={() => setEditing(null)} data-testid={`edit-select-${c.key}-${rIdx}`}>
                          <option value="">—</option>
                          {(c.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : isEditing ? (
                        <input autoFocus defaultValue={val || ""} className="bg-background border border-primary rounded px-1 py-0.5 text-xs w-full"
                          onBlur={(e) => { onCellChange(row.rid, c.key, e.target.value); setEditing(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { onCellChange(row.rid, c.key, e.target.value); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
                          data-testid={`edit-input-${c.key}-${rIdx}`} />
                      ) : c.render ? c.render(val, row) : (
                        <span className={val == null || val === "" ? "text-muted-foreground" : ""}>{val == null || val === "" ? "—" : String(val)}</span>
                      )}
                    </td>
                  );
                })}
                {canDelete && (
                  <td className="border border-border px-2 py-1 text-center">
                    <button className="text-muted-foreground hover:text-destructive" onClick={() => onDeleteRow(row.rid)} data-testid={`delete-row-${rIdx}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={columns.length + (canDelete ? 1 : 0)} className="text-center py-8 text-muted-foreground">Nenhum registro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Clique no funil para filtrar por valores únicos. Duplo clique para editar; selecione células (Shift+clique) e use Copiar/Colar.</p>
    </div>
  );
}
