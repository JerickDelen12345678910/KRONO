export function KPICard({ label, value, subtitle, variant = 'default' }) {
  const variantClass = variant !== 'default' ? `kpi-${variant}` : '';
  
  return (
    <div className={`kpi ${variantClass}`} role="region" aria-label={label}>
      <small className="kpi-label">{label}</small>
      <b className="kpi-value">{value}</b>
      <span className="kpi-subtitle">{subtitle}</span>
    </div>
  );
}
