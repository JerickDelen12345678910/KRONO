export function Row({ time, barColor, title, subtitle, tag }) {
  const colorMap = {
    pri: 'var(--pri)',
    fit: 'var(--fit)',
    map: 'var(--map)',
    prj: 'var(--prj)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
  };
  
  return (
    <div className="list-row">
      <span className="row-time">{time}</span>
      <span className="row-bar" style={{ background: colorMap[barColor] }} />
      <div className="row-content">
        <b className="row-title">{title}</b>
        <small className="row-subtitle">{subtitle}</small>
      </div>
      {tag}
    </div>
  );
}
