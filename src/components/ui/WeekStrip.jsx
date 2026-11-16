import { dayNumber, weekdayLetter } from '../../lib/timeline.js';

/** Seven day buttons (Sun–Sat). `busy` is a Set of dates that have items. */
export function WeekStrip({ dates, selected, today, busy = new Set(), onSelect }) {
  return (
    <div className="week-header" role="group" aria-label="Choose a day">
      {dates.map((date) => (
        <button
          key={date}
          type="button"
          className={`week-day${date === selected ? ' selected' : ''}${date === today ? ' today' : ''}${busy.has(date) ? ' busy' : ''}`}
          aria-pressed={date === selected}
          aria-label={new Date(`${date}T00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          onClick={() => onSelect(date)}
        >
          {weekdayLetter(date)}
          <b>{dayNumber(date)}</b>
        </button>
      ))}
    </div>
  );
}
