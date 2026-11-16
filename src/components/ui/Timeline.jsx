import { CATEGORY_COLOR } from '../../models/constants.js';
import { DAY_END, DAY_START, HOUR_PX, formatRange, layoutEvents, nowOffset, to12h } from '../../lib/timeline.js';

const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

/** Hourly timeline (8 AM–6 PM) for one day. Events that overlap share the width. */
export function Timeline({ items, selectedId, onSelect, now = null }) {
  const { placed, outside } = layoutEvents(items);
  const nowTop = now ? nowOffset(now) : null;
  return (
    <>
      <div className="timeline" style={{ height: (DAY_END - DAY_START) * HOUR_PX }} role="list" aria-label="Day timeline">
        {HOURS.map((h) => (
          <div key={h} className="timeline-hour" style={{ top: (h - DAY_START) * HOUR_PX }}>
            <label>{to12h(`${h}:00`).replace(':00', '')}</label>
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
            style={{ top, height, left: `${(col / cols) * 100}%`, width: `calc(${100 / cols}% - 4px)` }}
            aria-pressed={item.id === selectedId}
            onClick={() => onSelect(item.id)}
          >
            {item.title}
            {height >= 40 && <small>{formatRange(item)}{item.subtitle ? ` · ${item.subtitle}` : ''}</small>}
          </button>
        ))}
      </div>
      {outside.length > 0 && (
        <p className="timeline-outside">Outside 8 AM–6 PM: {outside.map((a) => `${a.title} (${formatRange(a)})`).join(', ')}</p>
      )}
    </>
  );
}
