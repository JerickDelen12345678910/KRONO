import { useEffect, useMemo, useRef } from 'react';
import { CATEGORY_COLOR } from '../../models/constants.js';
import { formatRange, timeOf, to12h } from '../../lib/timeline.js';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOUR_W = 84;
const TOTAL_W = 24 * HOUR_W;

function minsFromMidnight(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  return Math.max(0, Math.min(1440, (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)));
}

export function HorizontalScheduleStrip({ items = [], onSelectItem }) {
  const scrollerRef = useRef(null);

  const { laidOut, laneCount } = useMemo(() => {
    const sorted = [...items]
      .map((item) => {
        const startMin = minsFromMidnight(timeOf(item.startsAt));
        const rawEnd = minsFromMidnight(timeOf(item.endsAt));
        const endMin = rawEnd > startMin ? rawEnd : Math.min(1440, startMin + 45);
        return { item, startMin, endMin };
      })
      .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

    const laneEnds = [];
    const placed = sorted.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(entry.endMin);
      } else {
        laneEnds[lane] = entry.endMin;
      }
      const left = (entry.startMin / 60) * HOUR_W;
      const width = Math.max(82, ((entry.endMin - entry.startMin) / 60) * HOUR_W - 4);
      return { ...entry, lane, left, width };
    });

    return { laidOut: placed, laneCount: Math.max(2, laneEnds.length) };
  }, [items]);

  const nowLeft = useMemo(() => {
    const now = new Date();
    return ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_W;
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, nowLeft - 90), behavior: 'smooth' });
  }, [nowLeft, laidOut.length]);

  const laneHeight = 58;
  const bodyHeight = laneCount * laneHeight + 14;

  return (
    <div ref={scrollerRef} className="krono-htimeline-wrap" role="region" aria-label="24-hour horizontal schedule">
      <div className="krono-htimeline-canvas" style={{ width: TOTAL_W, height: bodyHeight + 28 }}>
        <div className="krono-htimeline-ruler">
          {HOURS_24.map((h) => (
            <div key={h} className="krono-htimeline-hour" style={{ left: h * HOUR_W, width: HOUR_W }}>
              <span>{to12h(`${h}:00`).replace(':00', '')}</span>
            </div>
          ))}
        </div>

        {HOURS_24.map((h) => (
          <div key={`g-${h}`} className="krono-htimeline-col" style={{ left: h * HOUR_W, top: 28, height: bodyHeight }} aria-hidden="true" />
        ))}

        <div className="krono-htimeline-now" style={{ left: nowLeft, top: 24, height: bodyHeight + 4 }} aria-hidden="true">
          <span className="krono-htimeline-now-dot" />
        </div>

        {laidOut.map(({ item, lane, left, width }) => (
          <button
            key={item.id}
            type="button"
            data-color={CATEGORY_COLOR[item.category] ?? 'primary'}
            className={`timeline-event krono-htimeline-event${item.status === 'done' ? ' done' : ''}`}
            style={{ left, width, top: 34 + lane * laneHeight, height: laneHeight - 8 }}
            onClick={() => onSelectItem?.(item)}
          >
            <b className="krono-htimeline-title">{item.title}</b>
            <small className="krono-htimeline-time">{formatRange(item)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}