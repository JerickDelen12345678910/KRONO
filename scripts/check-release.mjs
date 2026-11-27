// scripts/check-release.mjs — Phase 14: end-to-end cross-module integration and release configuration audit.
// Runs in plain Node via `npm run check`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMemoryStore, createRepositories } from '../src/repositories/index.js';
import { createServices } from '../src/services/index.js';
import { MemoryReminderAdapter } from '../src/reminders/MemoryReminderAdapter.js';
import { OCCURRENCE_STATUS } from '../src/models/constants.js';
import { kpiCards, leaveForCard, nextUp, todayRows, upcomingTravel } from '../src/lib/dashboardView.js';
import { reminderNotifications, searchAll } from '../src/lib/headerView.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };
const ok = (c, m) => { assert.ok(c, m); n += 1; };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (rel) => readFileSync(path.join(root, rel), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));

// ================= 1. Release & security configuration audit =================
const html = readText('index.html');
ok(html.includes('href="/manifest.webmanifest"'), 'index.html links manifest.webmanifest');
ok(html.includes('src="/src/main.jsx"'), 'index.html mounts /src/main.jsx');
ok(html.includes('viewport-fit=cover'), 'index.html supports safe-area insets');

const manifest = readJson('public/manifest.webmanifest');
eq(manifest.display, 'standalone', 'manifest uses standalone display');
ok(Array.isArray(manifest.icons) && manifest.icons.some((i) => i.sizes === '192x192'), 'manifest includes 192x192 icon');
ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest includes 512x512 maskable icon');

const capConfig = readJson('capacitor.config.json');
eq(capConfig.webDir, 'dist', 'Capacitor webDir points to dist');
ok(typeof capConfig.appId === 'string' && capConfig.appId.includes('.'), 'Capacitor appId is reverse-DNS formatted');

const firebaseConfig = readJson('firebase.json');
eq(firebaseConfig.hosting?.public, 'dist', 'Firebase Hosting serves dist');
eq(firebaseConfig.firestore?.rules, 'firestore.rules', 'Firebase references firestore.rules');
ok(firebaseConfig.hosting?.rewrites?.some((r) => r.source === '**' && r.destination === '/index.html'), 'Firebase Hosting configures SPA rewrite');
ok(firebaseConfig.hosting?.headers?.some((h) => h.source === '/sw.js'), 'Firebase Hosting configures no-cache header for /sw.js');

const rules = readText('firestore.rules');
ok(rules.includes('function isOwner(uid)'), 'firestore.rules enforces owner check');
ok(rules.includes('function isValidRecord(id)'), 'firestore.rules enforces record schema & serverTimestamp');
ok(rules.includes('allow read, write: if false;'), 'firestore.rules denies unmatched paths by default');
for (const col of ['schedules', 'occurrences', 'academicPeriods', 'subjects', 'workouts', 'exerciseHistory', 'destinations']) {
  ok(rules.includes(`'${col}'`), `firestore.rules allows synced collection ${col}`);
}

// ================= 2. End-to-end cross-module flow =================
const TODAY = '2026-11-23';
const NOW_ISO = '2026-11-23T07:30';
const NOW_DATE = new Date(2026, 10, 23, 7, 30, 0);

const store = createMemoryStore();
const repos = createRepositories({ userId: 'release-user', store });
const reminderAdapter = new MemoryReminderAdapter();
const services = createServices(repos, {
  today: () => TODAY,
  now: () => NOW_ISO,
  reminderAdapter,
  syncIntervalMs: 0,
});

try {
  // Save a destination and create both a School schedule and a linked Travel schedule
  const pier = await repos.destinations.create({
    name: 'Calapan Pier',
    address: 'San Antonio, Calapan City',
    latitude: 13.43,
    longitude: 121.19,
    isFavorite: true,
  });

  const classSched = await services.schedule.create({
    title: 'Information Systems Capstone',
    category: 'School',
    location: 'Room 204',
    date: TODAY,
    startTime: '08:00',
    endTime: '09:30',
    repeat: { type: 'none' },
    reminder: { enabled: true, offsetMinutes: 15, useAlarm: true },
  });

  await services.schedule.create({
    title: 'Trip to Calapan Pier',
    category: 'Travel',
    location: 'Calapan Pier',
    destinationId: pier.id,
    date: TODAY,
    startTime: '11:00',
    endTime: '11:45',
    repeat: { type: 'none' },
    reminder: { enabled: true, offsetMinutes: 30, useAlarm: false },
  });

  await services.reminders.whenIdle();
  const scheduledReminders = await services.reminders.listScheduled();
  eq(scheduledReminders.length, 2, 'creating two schedules automatically plans two reminders');

  // Header search + notifications bell + snooze
  const [allSchedules, favorites] = await Promise.all([
    services.schedule.list(),
    services.place.listFavorites(),
  ]);
  const search = searchAll({ query: 'calapan', schedules: allSchedules, places: favorites });
  eq(search.total, 2, 'header search finds both the Travel schedule and saved destination');

  const bell = reminderNotifications({ scheduled: scheduledReminders, schedules: allSchedules, now: NOW_DATE });
  eq(bell.count, 2, 'notifications bell lists both upcoming reminders');
  eq(bell.items[0].title, 'Information Systems Capstone', 'notifications bell orders earliest reminder first');

  const snoozed = await services.reminders.snooze(bell.items[0].id, 10);
  eq(snoozed?.fireAt, '2026-11-23T07:40', 'snooze shifts reminder fire time forward by 10 minutes');

  // Dashboard aggregation (KPIs, Next up, Leave for ..., Today list)
  const [todayItems, upcoming, planned, progress] = await Promise.all([
    services.activity.listToday({ today: TODAY }),
    services.activity.listUpcoming({ now: NOW_DATE, days: 7, limit: 5 }),
    services.workout.today({ today: TODAY }),
    services.workout.progress({ today: TODAY, range: 'week' }),
  ]);

  const kpis = kpiCards({
    loaded: true,
    today: todayItems,
    upcoming,
    planned,
    progress,
    places: favorites.length,
    reminders: (await services.reminders.listScheduled()).length,
  }, NOW_DATE);
  eq(kpis.length, 4, 'dashboard produces all 4 KPI cards');

  const next = nextUp(upcoming, NOW_DATE);
  eq(next?.title, 'Information Systems Capstone', 'dashboard Next up highlights the next class');

  const trip = upcomingTravel(upcoming, allSchedules, favorites, NOW_DATE);
  const leave = leaveForCard(trip, null, false);
  eq(leave?.title, 'Calapan Pier · in 3 h 30 min', 'dashboard Leave for card links upcoming Travel schedule to saved destination');

  const rows = todayRows(todayItems);
  eq(rows.rows.length, 2, 'dashboard Today list includes both scheduled items');

  // Completing an occurrence cancels its reminder and records history
  const occs = await services.schedule.listOccurrences({ date: TODAY, scheduleId: classSched.id });
  eq(occs.length, 1, 'occurrence exists for today');
  await services.schedule.setOccurrenceStatus(occs[0].id, OCCURRENCE_STATUS.DONE);
  await services.reminders.whenIdle();

  eq((await services.reminders.listScheduled()).length, 1, 'completing occurrence cancels its pending reminder');
  const history = await services.schedule.listHistory({ from: TODAY, to: TODAY });
  eq(history.length, 1, 'completed occurrence appears in schedule history');
} finally {
  services.reminders.dispose();
  services.sync.dispose();
}

console.log(`Phase 14 release & integration audit OK (${n} checks)`);