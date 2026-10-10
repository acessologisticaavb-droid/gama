export function PageHeader({ title, subtitle, children, testid }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4" data-testid={testid}>
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function KpiCard({ label, value, icon: Icon, accent = "text-primary", testid }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid={testid}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className={`h-5 w-5 ${accent}`} />}
      </div>
      <div className="mt-3 font-heading text-3xl font-bold">{value}</div>
    </div>
  );
}

export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-12 text-center">
      {Icon && <Icon className="h-10 w-10 mx-auto text-muted-foreground mb-3" />}
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
