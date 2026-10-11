export default function Donut({ value = 0, size = 64, stroke = 8, color = "#3B82F6", track = "#1F2937" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const dash = (pct / 100) * c;
  const col = pct >= 95 ? "#10B981" : pct >= 70 ? "#3B82F6" : pct >= 40 ? "#F59E0B" : "#EF4444";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color === "auto" ? col : col} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-heading font-bold" style={{ fontSize: size * 0.22 }}>{pct}%</span>
      </div>
    </div>
  );
}
