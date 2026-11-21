// scripts/check-dashboard-view.mjs — Phase 11 PACE 1: the pure Home dashboard logic (src/lib/dashboardView.js) and the new
// ReminderService.listScheduled(). Runs in plain Node, local clock, no storage. "Now" is fixed: Thursday 2026-11-19, 07:35.
import { ACTIVITY_STATUS, ACTIVITY_TYPE, MODULE, OCCURRENCE_STATUS } from '../src/models/constants.js';
import { createActivity } from '../src/models/activity.js';
import { durationLabel } from '../src/lib/fitness.js';
import {
  agoLabel, kpiCards, mergePlanned, nextUp, routeFor, startTarget, syncCard, todayRows, untilLabel,
} from '../src/lib/dashboardView.js';
import { ReminderService } from '../src/services/ReminderService.js';

let count = 0;
const failures = [];
const check = (name, ok) => { count += 1; if (!ok) failures.push(name); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

const NOW = new Date(2026, 10, 19, 7, 35, 0);
const at = (h, m = 0, day = '2026-11-19') => `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const act = (o) => createActivity({ type: ACTIVITY_TYPE.SCHEDULE, module: MODULE.SCHEDULER, category: 'School', ...o });

// ---- untilLabel ----
check('untilLabel: minutes', untilLabel(at(8), NOW) === 'in 25 minutes');
check('untilLabel: singular', untilLabel(at(7, 36), NOW) === 'in 1 minute');
check('untilLabel: seconds round up (never "in 0 minutes")', untilLabel(at(7, 36), new Date(2026, 10, 19, 7, 35, 40)) === 'in 1 minute' && untilLabel(at(8), new Date(2026, 10, 19, 7, 35, 10)) === 'in 25 minutes');
check('untilLabel: now and past', untilLabel(at(7, 35), NOW) === 'now' && untilLabel(at(6), NOW) === 'now');
check('untilLabel: later today', untilLabel(at(9, 40), NOW) === 'in 2 h 5 min' && untilLabel(at(9, 35), NOW) === 'in 2 h' && untilLabel(at(8, 35), NOW) === 'in 1 h');
check('untilLabel: tomorrow', untilLabel(at(8, 0, '2026-11-20'), NOW) === 'tomorrow at 8:00 AM');
check('untilLabel: another day names the weekday', untilLabel(at(15, 30, '2026-11-22'), NOW) === 'Sunday at 3:30 PM');
check('untilLabel: not a date', untilLabel(null, NOW) === '' && untilLabel('soon', NOW) === '');

// ---- agoLabel ----
const nowMs = NOW.getTime();
check('agoLabel: just now', agoLabel(new Date(nowMs - 20000).toISOString(), nowMs) === 'just now' && agoLabel(new Date(nowMs + 5000).toISOString(), nowMs) === 'just now');
check('agoLabel: minutes', agoLabel(new Date(nowMs - 2 * 60000).toISOString(), nowMs) === '2 min ago' && agoLabel(new Date(nowMs - 59 * 60000).toISOString(), nowMs) === '59 min ago');
check('agoLabel: hours', agoLabel(new Date(nowMs - 3 * 3600000).toISOString(), nowMs) === '3 h ago');
check('agoLabel: older than a day gives a date', agoLabel(new Date(2026, 10, 12, 9, 0).toISOString(), nowMs) === 'Nov 12');
check('agoLabel: a number of ms works, junk gives nothing', agoLabel(nowMs - 120000, nowMs) === '2 min ago' && agoLabel('x', nowMs) === '' && agoLabel(null, nowMs) === '' && agoLabel(undefined, nowMs) === '');

// ---- routeFor ----
check('routeFor: exercise and workouts go to Fitness', routeFor(act({ category: 'Exercise' })) === '/fitness' && routeFor(act({ type: ACTIVITY_TYPE.WORKOUT, category: null })) === '/fitness');
check('routeFor: travel goes to the Map', routeFor(act({ category: 'Travel' })) === '/map' && routeFor(act({ type: ACTIVITY_TYPE.TRIP, category: null })) === '/map');
check('routeFor: everything else goes to the Scheduler', routeFor(act({ category: 'School' })) === '/scheduler' && routeFor(act({ category: null })) === '/scheduler');

// ---- nextUp ----
const ds = act({ id: 'a1', title: 'Data Structures', subtitle: 'Room 304', startsAt: at(8), endsAt: at(9, 30) });
const algo = act({ id: 'a2', title: 'Algorithms', startsAt: at(10), endsAt: at(11) });
const nu = nextUp(deepFreeze([algo, ds]), NOW);
check('nextUp: the soonest open item, even from an unsorted list', nu.title === 'Data Structures' && nu.key === 'a1');
check('nextUp: when and meta', nu.when === 'in 25 minutes' && nu.meta === '8:00 AM–9:30 AM · Room 304' && nu.route === '/scheduler');
check('nextUp: no end time, no subtitle', nextUp([act({ title: 'X', startsAt: at(9) })], NOW).meta === '9:00 AM');
check('nextUp: skips items that already started', nextUp([act({ title: 'Past', startsAt: at(7, 0) }), algo], NOW).title === 'Algorithms');
check('nextUp: an item starting this very minute still counts', nextUp([act({ title: 'Now', startsAt: at(7, 35) })], NOW).title === 'Now');
check('nextUp: skips done, skipped and cancelled', nextUp([
  act({ title: 'd', startsAt: at(8), status: ACTIVITY_STATUS.DONE }), act({ title: 's', startsAt: at(8), status: ACTIVITY_STATUS.SKIPPED }),
  act({ title: 'c', startsAt: at(8), status: ACTIVITY_STATUS.CANCELLED }), algo], NOW).title === 'Algorithms');
check('nextUp: nothing', nextUp([], NOW) === null && nextUp(null, NOW) === null && nextUp([act({ title: 'x', startsAt: null })], NOW) === null);
check('nextUp: tomorrow wording', nextUp([act({ title: 'T', startsAt: at(8, 0, '2026-11-20') })], NOW).when === 'tomorrow at 8:00 AM');
check('nextUp: a workout opens Fitness', nextUp([act({ title: 'W', type: ACTIVITY_TYPE.WORKOUT, category: 'Exercise', startsAt: at(12, 30) })], NOW).route === '/fitness');

// ---- KPI row ----
const cardsLoading = kpiCards({ loaded: false }, NOW);
check('kpi: before the data is read: four placeholders, never fake zeros', cardsLoading.length === 4 && cardsLoading.every((c) => c.value === '–' && c.subtitle === ''));
check('kpi: slots and variants as in the design', same(cardsLoading.map((c) => [c.key, c.variant]), [['classes', 'pri'], ['workout', 'fit'], ['places', 'map'], ['reminders', 'prj']]));
const base = { loaded: true, today: [], planned: [], places: 0, reminders: 0 };
const classes = (items) => kpiCards({ ...base, today: items }, NOW)[0];
check('classes: count and next class', same([classes([ds, algo]).value, classes([ds, algo]).subtitle], ['2', 'Next in 25 min']));
check('classes: a later class is shown in hours', classes([algo]).subtitle === 'Next in 2 h 25 min');
check('classes: one running now', classes([act({ startsAt: at(7), endsAt: at(8) })]).subtitle === 'In progress');
check('classes: running wins over a later one', classes([act({ startsAt: at(7), endsAt: at(8) }), algo]).subtitle === 'In progress');
check('classes: all over', classes([act({ startsAt: at(6), endsAt: at(7) })]).subtitle === 'Done for today');
check('classes: a class marked done is not "next"', classes([act({ startsAt: at(8), status: ACTIVITY_STATUS.DONE })]).subtitle === 'Done for today');
check('classes: none', same([classes([]).value, classes([]).subtitle], ['0', 'No classes today']));
check('classes: only School schedules count', classes([act({ category: 'Personal', startsAt: at(8) }), act({ type: ACTIVITY_TYPE.WORKOUT, category: 'School', startsAt: at(8) }), ds]).value === '1');
check('classes: skipped and cancelled do not count', classes([act({ startsAt: at(8), status: ACTIVITY_STATUS.SKIPPED }), act({ startsAt: at(9), status: ACTIVITY_STATUS.CANCELLED })]).value === '0');

const planOf = (o) => ({ occurrenceId: 'o', date: '2026-11-19', startTime: '12:30', endTime: '13:15', status: OCCURRENCE_STATUS.SCHEDULED, workout: { id: 'w1', name: 'Upper body workout' }, ...o });
const wk = (planned) => kpiCards({ ...base, planned }, NOW)[1];
check('workout: planned duration, time and name', same([wk([planOf()]).value, wk([planOf()]).subtitle], [durationLabel(45 * 60), '12:30 PM · Upper body workout']));
check('workout: more than one open workout', wk([planOf(), planOf({ startTime: '18:00', endTime: '19:00', workout: { id: 'w2', name: 'Run' } })]).subtitle === '12:30 PM · Upper body workout · +1 more');
check('workout: the earliest open one is shown first', wk([planOf({ startTime: '18:00', endTime: '19:00', workout: { id: 'w2', name: 'Run' } }), planOf()]).subtitle.startsWith('12:30 PM'));
check('workout: no end time = "Planned"', wk([planOf({ endTime: null })]).value === 'Planned');
check('workout: finished ones are not "open"', same([wk([planOf({ status: OCCURRENCE_STATUS.DONE })]).value, wk([planOf({ status: OCCURRENCE_STATUS.DONE })]).subtitle], ['Done', 'Upper body workout']));
check('workout: a done one does not hide an open one', wk([planOf({ status: OCCURRENCE_STATUS.DONE }), planOf({ startTime: '18:00', endTime: '19:00', workout: { id: 'w2', name: 'Run' } })]).subtitle.includes('Run'));
check('workout: nothing planned, or only skipped', same([wk([]).value, wk([]).subtitle], ['–', 'No workout planned']) && wk([planOf({ status: OCCURRENCE_STATUS.SKIPPED })]).value === '–');
check('workout: a nameless workout still reads well', wk([planOf({ workout: { id: 'w1' } })]).subtitle === '12:30 PM · Workout');

const counts = (places, reminders) => kpiCards({ ...base, places, reminders }, NOW);
check('places: count and subtitle', same([counts(3, 0)[2].value, counts(3, 0)[2].subtitle], ['3', 'Available offline']) && same([counts(0, 0)[2].value, counts(0, 0)[2].subtitle], ['0', 'Find places on the Map']));
check('reminders: count and subtitle', same([counts(0, 2)[3].value, counts(0, 2)[3].subtitle], ['2', 'Scheduled on this device']) && same([counts(0, 0)[3].value, counts(0, 0)[3].subtitle], ['0', 'None scheduled']));
check('places and reminders: not read yet = placeholder', counts(null, null)[2].value === '–' && counts(null, null)[3].value === '–');

// ---- Today list ----
const proj = act({ id: 'p1', title: 'Capstone meeting', subtitle: 'Library', category: 'Projects', startsAt: at(15), endsAt: at(16) });
const trip = act({ id: 't1', title: 'Travel to Makati', category: 'Travel', startsAt: at(17, 30) });
const gym = act({ id: 'g1', title: 'Upper body workout', subtitle: 'Gym', category: 'Exercise', startsAt: at(12, 30), endsAt: at(13, 15), refs: { scheduleId: 'gym' } });
const frozenDay = deepFreeze([trip, gym, proj, algo, ds]);
const t1 = todayRows(frozenDay);
check('today: sorted by start, header counts items', same(t1.rows.map((r) => r.title), ['Data Structures', 'Algorithms', 'Upper body workout', 'Capstone meeting', 'Travel to Makati']) && t1.header === '5 items');
check('today: 12-hour times', same(t1.rows.map((r) => r.time), ['8:00 AM', '10:00 AM', '12:30 PM', '3:00 PM', '5:30 PM']));
check('today: category colours as in the design', same(t1.rows.map((r) => r.bar), ['pri', 'pri', 'fit', 'prj', 'map']));
check('today: a class has no pill, the others name their category', same(t1.rows.map((r) => r.pills.map((p) => p.label)), [[], [], ['Exercise'], ['Project'], ['Travel']]));
check('today: pill variants', same(t1.rows.map((r) => r.pills.map((p) => p.variant)), [[], [], ['fit'], ['prj'], ['map']]));
check('today: subtitle, or "until" the end time', t1.rows[0].subtitle === 'Room 304' && t1.rows[1].subtitle === 'until 11:00 AM' && t1.rows[4].subtitle === '');
check('today: singular header', todayRows([ds]).header === '1 item' && todayRows([]).header === '0 items' && same(todayRows(null).rows, []));
check('today: cancelled is hidden, done / skipped / in progress say so in words', (() => {
  const rows = todayRows([
    act({ title: 'c', startsAt: at(8), status: ACTIVITY_STATUS.CANCELLED }), act({ title: 'd', startsAt: at(9), status: ACTIVITY_STATUS.DONE }),
    act({ title: 's', startsAt: at(10), status: ACTIVITY_STATUS.SKIPPED }), act({ title: 'p', startsAt: at(11), status: ACTIVITY_STATUS.IN_PROGRESS }),
  ]).rows;
  return same(rows.map((r) => r.title), ['d', 's', 'p']) && same(rows.map((r) => r.pills.map((p) => p.label)), [['Done'], ['Skipped'], ['In progress']]) && rows[0].pills[0].variant === 'ok';
})());
check('today: category and status pills together', same(todayRows([act({ title: 'g', category: 'Exercise', startsAt: at(9), status: ACTIVITY_STATUS.DONE })]).rows[0].pills.map((p) => p.label), ['Exercise', 'Done']));
check('today: another category names itself', same(todayRows([act({ category: 'Personal', startsAt: at(9) })]).rows[0].pills, [{ variant: 'primary', label: 'Personal' }]) && todayRows([act({ category: null, startsAt: at(9) })]).rows[0].pills.length === 0);
check('today: an item without a start is left out', todayRows([act({ title: 'x', startsAt: null })]).rows.length === 0);
check('today: a nameless item', todayRows([act({ title: '', startsAt: at(9) })]).rows[0].title === 'Untitled');
check('today: keys are unique, also without ids', new Set(todayRows([act({ id: undefined, startsAt: at(9) }), act({ id: undefined, startsAt: at(9) })].map((a) => ({ ...a, id: undefined }))).rows.map((r) => r.key)).size === 2);
check('today: workout sessions are Exercise rows', todayRows([act({ type: ACTIVITY_TYPE.WORKOUT, module: MODULE.FITNESS, category: null, title: 'Run', startsAt: at(6), status: ACTIVITY_STATUS.DONE })]).rows[0].bar === 'fit');

// ---- plan + session = one row ----
const session = (o) => act({ id: 's1', type: ACTIVITY_TYPE.WORKOUT, module: MODULE.FITNESS, category: null, title: 'Upper body workout', startsAt: at(12, 40), status: ACTIVITY_STATUS.DONE, refs: { scheduleId: 'gym' }, ...o });
const merged = mergePlanned(deepFreeze([gym, session(), ds]));
check('merge: a finished session replaces the planned occurrence of its schedule', same(merged.map((a) => a.id), ['s1', ds.id]) && merged.length === 2);
check('merge: so does one in progress', same(mergePlanned([gym, session({ status: ACTIVITY_STATUS.IN_PROGRESS })]).map((a) => a.id), ['s1']));
check('merge: a session without a schedule link leaves the plan alone', mergePlanned([gym, session({ refs: { scheduleId: null } })]).length === 2);
check('merge: another schedule is untouched', mergePlanned([gym, session({ refs: { scheduleId: 'other' } })]).length === 2);
check('merge: a session that is only scheduled does not replace the plan', mergePlanned([gym, session({ status: ACTIVITY_STATUS.SCHEDULED })]).length === 2);
check('merge: nothing to merge', same(mergePlanned([]), []) && mergePlanned([ds]).length === 1);
check('today: one workout is one row', todayRows([gym, session()]).rows.length === 1 && todayRows([gym, session()]).rows[0].pills.some((p) => p.label === 'Done'));

// ---- Start workout ----
check('startTarget: the one open workout', same(startTarget([planOf()]), { workoutId: 'w1', name: 'Upper body workout' }));
check('startTarget: two different workouts = choose on Fitness', startTarget([planOf(), planOf({ workout: { id: 'w2', name: 'Run' } })]) === null);
check('startTarget: the same workout twice is still one', startTarget([planOf(), planOf({ occurrenceId: 'o2' })])?.workoutId === 'w1');
check('startTarget: finished workouts do not count', startTarget([planOf({ status: OCCURRENCE_STATUS.DONE }), planOf({ workout: { id: 'w2', name: 'Run' } })])?.workoutId === 'w2');
check('startTarget: nothing open', startTarget([]) === null && startTarget(null) === null && startTarget([planOf({ status: OCCURRENCE_STATUS.SKIPPED })]) === null && startTarget([planOf({ status: OCCURRENCE_STATUS.CANCELLED })]) === null);
check('startTarget: a plan without a workout id is ignored', startTarget([planOf({ workout: null })]) === null);

// ---- Sync card ----
const sc = (status, online = true) => syncCard(status, online, nowMs);
const iso = (minsAgo) => new Date(nowMs - minsAgo * 60000).toISOString();
check('sync: synced', same(sc({ pending: 0, lastSyncedAt: iso(2) }), { pill: { variant: 'ok', label: 'Synced' }, title: 'All changes saved', subtitle: 'Last synced 2 min ago' }));
check('sync: synced but never synced (no timestamp)', sc({ pending: 0 }).subtitle === 'Saved on this device' && sc({ pending: 0 }).pill.label === 'Synced');
check('sync: syncing', same(sc({ running: true, pending: 3 }), { pill: { variant: 'primary', label: 'Syncing' }, title: 'Syncing your changes', subtitle: '3 changes to send' }) && sc({ running: true, pending: 0 }).subtitle === 'One moment' && sc({ running: true, pending: 1 }).subtitle === '1 change to send');
check('sync: waiting online', same([sc({ pending: 3 }).pill, sc({ pending: 3 }).title, sc({ pending: 3 }).subtitle], [{ variant: 'warn', label: 'Waiting' }, '3 changes waiting to sync', 'They will sync automatically']) && sc({ pending: 1 }).title === '1 change waiting to sync');
check('sync: waiting after a failed attempt says so', sc({ pending: 2, ok: false, lastError: new Error('x') }).subtitle === 'The last attempt failed. It will retry.');
check('sync: offline with changes waiting', same([sc({ pending: 2 }, false).pill, sc({ pending: 2 }, false).title, sc({ pending: 2 }, false).subtitle], [{ variant: 'warn', label: 'Offline' }, 'Working offline', '2 changes will sync when you’re back online']));
check('sync: offline with nothing waiting is never called Synced', sc({ pending: 0, lastSyncedAt: iso(2) }, false).pill.label === 'Offline' && sc({ pending: 0 }, false).title === 'All changes saved');
check('sync: unknown pending is never called Synced', sc({ pending: null }).pill.label === 'Checking' && sc({ pending: null }).pill.label !== 'Synced' && sc(undefined).pill.label === 'Checking');
check('sync: status is always a word', [sc({ pending: 0 }), sc({ pending: 4 }), sc({ running: true }), sc({ pending: 4 }, false), sc({})].every((c) => c.pill.label.length > 0));

// ---- ReminderService.listScheduled ----
// the method is tested on its own (not through the constructor, which validates the adapter's whole interface)
const service = (list) => Object.assign(Object.create(ReminderService.prototype), { adapter: { list } });
check('listScheduled: the adapter\'s reminders', same(await service(async () => [{ id: 'a' }, { id: 'b' }]).listScheduled(), [{ id: 'a' }, { id: 'b' }]));
check('listScheduled: never rejects', same(await service(async () => { throw new Error('boom'); }).listScheduled(), []));
check('listScheduled: not an array gives []', same(await service(async () => null).listScheduled(), []) && same(await service(async () => ({ a: 1 })).listScheduled(), []));

if (failures.length > 0) {
  console.error(`Phase 11 PACE 1 dashboard: ${failures.length} of ${count} checks FAILED:`);
  failures.forEach((f) => console.error(`  ✗ ${f}`));
  process.exit(1);
}
console.log(`Phase 11 PACE 1 dashboard OK (${count} checks)`);