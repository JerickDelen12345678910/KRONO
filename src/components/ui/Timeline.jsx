import { useMemo } from 'react';
import { CATEGORY_COLOR } from '../../models/constants.js';
import { DAY_START, HOUR_PX, formatRange, timeOf, to12h } from '../../lib/timeline.js';

function toMins(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return Math.max(0, Math.min(1440, (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)));
}

/**
 * Vertical day timeline: starts at 8 AM (or earlier if an item starts before 8 AM)
 * and ends dynamically at the last scheduled item's end hour for that day.
 */
export function Timeline({ items = [], selectedId, onSelect, now = null }) {
  const { startHour, endHour, placed, outside } = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) {
      return { startHour: DAY_START, endHour: 18, placed: [], outside: [] };
    }

    const parsed = items.map((item) => {
      const startMin = toMins(timeOf(item.startsAt));
      const rawEnd = toMins(timeOf(item.endsAt));
      const endMin = rawEnd > startMin ? rawEnd : Math.min(1440, startMin + 45);
      return { item, startMin, endMin };
    });

    const earliestMin = Math.min(...parsed.map((p) => p.startMin));
    const latestMin = Math.max(...parsed.map((p) => p.endMin));

    const computedStart = Math.min(DAY_START, Math.floor(earliestMin / 60));
    const computedEnd = Math.min(24, Math.max(computedStart + 1, Math.ceil(latestMin / 60)));

    const sorted = [...parsed].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const active = [];
    const laidOut = [];

    for (const entry of sorted) {
      for (let i = active.length - 1; i >= 0; i -= 1) {
        if (active[i].endMin <= entry.startMin) active.splice(i, 1);
      }
      const usedCols = new Set(active.map((a) => a.col));
      let col = 0;
      while (usedCols.has(col)) col += 1;
      const record = { ...entry, col, cols: col + 1 };
      active.push(record);
      const maxCols = Math.max(...active.map((a) => a.col)) + 1;
      for (const a of active) a.cols = Math.max(a.cols, maxCols);
      laidOut.push(record);
    }

    const positioned = laidOut.map((r) => {
      const top = ((r.startMin - computedStart * 60) / 60) * HOUR_PX;
      const height = Math.max(28, ((r.endMin - r.startMin) / 60) * HOUR_PX - 2);
      return { item: r.item, top, height, col: r.col, cols: r.cols };
    });

    return { startHour: computedStart, endHour: computedEnd, placed: positioned, outside: [] };
  }, [items]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const nowTop = useMemo(() => {
    if (!now) return null;
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < startHour * 60 || mins > endHour * 60) return null;
    return ((mins - startHour * 60) / 60) * HOUR_PX;
  }, [now, startHour, endHour]);

  return (
    <>
      <div
        className="timeline"
        style={{ height: Math.max(1, endHour - startHour) * HOUR_PX }}
        role="list"
        aria-label="Day timeline"
      >
        {hours.map((h) => (
          <div key={h} className="timeline-hour" style={{ top: (h - startHour) * HOUR_PX }}>
            <label>{h === 24 ? '12 AM' : to12h(`${h}:00`).replace(':00', '')}</label>
          </div>
        ))}
        {nowTop != null && <div className="timeline-now" style={{ top: nowTop }} aria-label="Current time" />}
        {placed.map(({ item, top, height, col, cols }) => (
          <button
            key={item.id}
            type="button"
            role="listitem"
            data-color={CATEGORY_COLOR[item.category] ?? 'primary'}
            className={`timeline-event${item.id === selectedId ? ' selected' : ''}${item.status === 'done' ? ' done' : ''}`}
            style={{
              top,
              height,
              left: `${(col / cols) * 100}%`,
              width: `calc(${100 / cols}% - 4px)`,
            }}
            aria-pressed={item.id === selectedId}
            onClick={() => onSelect(item.id)}
          >
            {item.title}
            {height >= 40 && <small>{formatRange(item)}{item.subtitle ? ` · ${item.subtitle}` : ''}</small>}
          </button>
        ))}
      </div>
      {outside.length > 0 && (
        <p className="timeline-outside">Outside hours: {outside.map((a) => `${a.title} (${formatRange(a)})`).join(', ')}</p>
      )}
    </>
  );
}