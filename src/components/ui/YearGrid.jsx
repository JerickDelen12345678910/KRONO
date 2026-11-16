/** Twelve mini months. Days with items are tinted; tap a month to open it. */
export function YearGrid({ months, today, counts, onPickMonth }) {
  return (
    <div className="year-grid">
      {months.map((m) => (
        <button key={m.key} type="button" className="mini-month" aria-label={`Open ${m.label}`} onClick={() => onPickMonth(m.date)}>
          <b>{m.label}</b>
          <span className="mini-grid" aria-hidden="true">
            {m.cells.map((c) => (
              <span key={c.date} className={`mini-day${c.inMonth ? '' : ' out'}${counts.has(c.date) ? ' busy' : ''}${c.date === today ? ' today' : ''}`}>{c.day}</span>
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}
