import { useState, useMemo, useRef } from "react";
import { ArrowUpDown, Filter, Trash2, Copy, ClipboardPaste, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Excel-like grid.
 * columns: [{ key, label, editable?, type?: 'text'|'select', options?: [{value,label}] }]
 * rows: array of objects (must have `rid`)
 * onCellChange(rid, key, value)  onDeleteRow(rid)  canDelete
 */
export default function ExcelTable({ columns, rows, onCellChange, onDeleteRow, canDelete = false, testid = "excel-table" }) {
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [filters, setFilters] = useState({});
  const [openFilter, setOpenFilter] = useState(null);
  const [editing, setEditing] = useState(null); // { rid, key }
  const [sel, setSel] = useState([]); // array of {r,key}
  const [clip, setClip] = useState(null);
  const anchor = useRef(null);

  const view = useMemo(() => {
    let data = [...rows];
    Object.entries(filters).forEach(([k, v]) => {
      if (v) data = data.filter((row) => String(row[k] ?? "").toLowerCase().includes(v.toLowerCase()));
    });
    if (sort.key) data.sort((a, b) => String(a[sort.key] ?? "").localeCompare(String(b[sort.key] ?? ""), "pt", { numeric: true }) * sort.dir);
    return data;
  }, [rows, filters, sort]);

  const toggleSort = (key) => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }));

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

  const copySel = () => {
    if (!sel.length) return;
    const first = view[sel[0].r];
    setClip(String(first?.[sel[0].key] ?? ""));
  };
  const pasteSel = () => {
    if (clip == null || !sel.length) return;
    sel.forEach(({ r, key }) => {
      const row = view[r];
      if (row) onCellChange(row.rid, key, clip);
    });
  };

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") { copySel(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "v") { pasteSel(); }
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
          <thead className="sticky top-0 z-10 bg-secondary">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="border border-border px-2 py-2 text-left font-semibold whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <button className="flex items-center gap-1 hover:text-primary" onClick={() => toggleSort(c.key)} data-testid={`sort-${c.key}`}>
                      {c.label} <ArrowUpDown className="h-3 w-3 opacity-50" />
                    </button>
                    <button className={`ml-auto ${filters[c.key] ? "text-primary" : "opacity-40 hover:opacity-100"}`} onClick={() => setOpenFilter(openFilter === c.key ? null : c.key)} data-testid={`filter-${c.key}`}>
                      <Filter className="h-3 w-3" />
                    </button>
                  </div>
                  {openFilter === c.key && (
                    <Input autoFocus value={filters[c.key] || ""} onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))} placeholder="filtrar…" className="mt-1 h-7 text-xs" data-testid={`filter-input-${c.key}`} />
                  )}
                </th>
              ))}
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
                        <select
                          autoFocus
                          className="bg-background border border-primary rounded px-1 py-0.5 text-xs"
                          value={val || ""}
                          onChange={(e) => { onCellChange(row.rid, c.key, e.target.value); setEditing(null); }}
                          onBlur={() => setEditing(null)}
                          data-testid={`edit-select-${c.key}-${rIdx}`}
                        >
                          <option value="">—</option>
                          {(c.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : isEditing ? (
                        <input
                          autoFocus
                          defaultValue={val || ""}
                          className="bg-background border border-primary rounded px-1 py-0.5 text-xs w-full"
                          onBlur={(e) => { onCellChange(row.rid, c.key, e.target.value); setEditing(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { onCellChange(row.rid, c.key, e.target.value); setEditing(null); } if (e.key === "Escape") setEditing(null); }}
                          data-testid={`edit-input-${c.key}-${rIdx}`}
                        />
                      ) : c.render ? (
                        c.render(val, row)
                      ) : (
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
      <p className="text-[11px] text-muted-foreground">Dê um duplo clique para editar. Selecione células (Shift+clique) e use Copiar/Colar para preencher em massa.</p>
    </div>
  );
}
