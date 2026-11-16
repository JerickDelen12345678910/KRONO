const LETTERS = 'SMTWTFS'.split('');
const full = (d) => new Date(`${d}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** Month calendar. `counts` is the Map from dayCounts(); a day shows up to 3 dots (one per item) and "+N". */
export function MonthGrid({ cells, selected, today, counts, onSelect }) {
  return (
    <div className="month-grid" role="group" aria-label="Month calendar">
      {LETTERS.map((l, i) => <span key={i} className="month-dow" aria-hidden="true">{l}</span>)}
      {cells.map((c) => {
        const info = counts.get(c.date);
        return (
          <button
            key={c.date}
            type="button"
            className={`month-cell${c.inMonth ? '' : ' out'}${c.date === today ? ' today' : ''}${c.date === selected ? ' selected' : ''}`}
            aria-pressed={c.date === selected}
            aria-label={`${full(c.date)}${info ? `, ${info.count} ${info.count === 1 ? 'item' : 'items'}` : ''}`}
            onClick={() => onSelect(c.date)}
          >
            <b>{c.day}</b>
            <span className="month-dots" aria-hidden="true">
              {info?.colors.map((col, i) => <i key={i} data-color={col} />)}
              {info?.count > 3 && <em>+{info.count - 3}</em>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
