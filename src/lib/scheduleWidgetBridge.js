import { Capacitor, registerPlugin } from '@capacitor/core';
import { addDays, toLocalDate } from '../models/common.js';
import { OCCURRENCE_STATUS } from '../models/constants.js';
import { to12h } from './timeline.js';

const NativeScheduleWidget = registerPlugin('ScheduleWidget');
const WEB_RECOVERY_KEY = 'krono_post_gym_recovery';

function toMinutes(hhmm) {
  const [h, m] = String(hhmm ?? '00:00').split(':').map(Number);
  return h * 60 + m;
}

/** Switches the Android home-screen widget to Map Mascot mode when navigating or leaving soon. */
export async function setWidgetMapMode(destinationName, etaText = 'Navigating', subtitle = 'Tap ➤ Go for directions') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeScheduleWidget.setActiveMode({
      mode: 'map',
      time: etaText,
      title: `To: ${destinationName || 'Destination'}`,
      subtitle,
    });
  } catch (err) {
    console.warn('Native widget map mode skipped:', err);
  }
}

/** Resets the Android home-screen widget back to automatic Schedule / Gym mascot detection. */
export async function resetWidgetToAutoMode() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeScheduleWidget.setActiveMode({ mode: 'auto' });
  } catch (err) {
    console.warn('Native widget auto reset skipped:', err);
  }
}

/** Reads native streak count, completed widget IDs, and pending post-gym recovery flag. */
export async function getNativeWidgetState() {
  const webRecovery = typeof localStorage !== 'undefined' ? localStorage.getItem(WEB_RECOVERY_KEY) : null;
  if (!Capacitor.isNativePlatform()) {
    return {
      streak: 0,
      pendingPostGymRecovery: Boolean(webRecovery),
      workoutLabel: webRecovery || '',
      completedIds: [],
    };
  }
  try {
    const state = await NativeScheduleWidget.getWidgetState();
    return {
      streak: state?.streak ?? 0,
      pendingPostGymRecovery: Boolean(state?.pendingPostGymRecovery || webRecovery),
      workoutLabel: webRecovery || 'Workout',
      completedIds: Array.isArray(state?.completedIds) ? state.completedIds : [],
    };
  } catch {
    return { streak: 0, pendingPostGymRecovery: Boolean(webRecovery), workoutLabel: webRecovery || '', completedIds: [] };
  }
}

/** Flags that a workout just finished so Dashboard suggests a 30m recovery/meal block. */
export function triggerPostGymRecovery(workoutName = 'Workout') {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(WEB_RECOVERY_KEY, workoutName || 'Workout');
  }
}

/** Clears the post-gym recovery suggestion banner after user adds or dismisses it. */
export async function clearPostGymRecovery() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(WEB_RECOVERY_KEY);
  }
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeScheduleWidget.clearRecoveryPrompt();
  } catch {
    // Non-blocking
  }
}

/** Syncs today's schedule & workout items, reconciles widget "Done" taps, and activates smart "Leave Now" mode. */
export async function syncNativeScheduleWidget(scheduleService, today = toLocalDate(), leaveCard = null) {
  if (!scheduleService) return;
  try {
    // 1. Reconcile any tasks marked "Done" directly from the Android home-screen widget
    if (Capacitor.isNativePlatform()) {
      const state = await getNativeWidgetState();
      for (const doneId of state.completedIds) {
        if (doneId) {
          try {
            await scheduleService.setOccurrenceStatus(doneId, OCCURRENCE_STATUS.DONE);
          } catch {
            // Already updated or removed
          }
        }
      }
    }

    const [schedules, occurrences] = await Promise.all([
      scheduleService.list(),
      scheduleService.listOccurrences({ from: today, to: addDays(today, 1) }),
    ]);
    const byId = new Map(schedules.filter((s) => !s.deleted).map((s) => [s.id, s]));

    const activeOccurrences = occurrences.filter(
      (o) => !o.deleted && o.date === today && o.status === OCCURRENCE_STATUS.SCHEDULED && byId.has(o.scheduleId)
    );

    // 2. Sync to Native Android Home-Screen Widget (KRONO)
    if (Capacitor.isNativePlatform()) {
      const nativeItems = activeOccurrences.map((o) => {
        const s = byId.get(o.scheduleId);
        return {
          id: o.id,
          date: o.date,
          startTime: o.startTime,
          endTime: o.endTime,
          title: s.title,
          category: s.category ?? '',
          type: s.category ?? '',
          location: s.location ?? '',
        };
      });

      await NativeScheduleWidget.syncItems({
        itemsJson: JSON.stringify(nativeItems),
      });

      // 3. Smart "Leave Now" Auto-Trigger (switches widget to Map Mascot when it's time to depart)
      if (leaveCard && (leaveCard.pill?.variant === 'warn' || leaveCard.pill?.variant === 'err' || /leave now|in \d+m/i.test(leaveCard.pill?.label ?? ''))) {
        await setWidgetMapMode(
          leaveCard.title || 'Next Class',
          leaveCard.pill?.label || 'Leave Soon',
          leaveCard.subtitle || 'Tap ➤ Go for directions'
        );
      }
    }

    // 4. Sync to PWA Live Notification (if granted)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const todayActs = activeOccurrences.map((o) => {
        const s = byId.get(o.scheduleId);
        return {
          id: o.id,
          title: s.title,
          category: s.category,
          status: 'scheduled',
          startsAt: `${o.date}T${o.startTime}:00`,
          endsAt: `${o.date}T${o.endTime}:00`,
          subtitle: s.location ?? '',
        };
      });
      await syncPwaLiveNotification(buildNowWidgetModel(todayActs, new Date()));
    }
  } catch {
    // Non-blocking
  }
}

/** Pins or refreshes the live schedule notification in the notification bar and lock screen. */
export async function syncPwaLiveNotification(widget, { requestPermission = false } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  let perm = Notification.permission;
  if (perm !== 'granted' && requestPermission) {
    perm = await Notification.requestPermission();
  }
  if (perm !== 'granted') return 'denied';

  const title = widget.active
    ? `Now: ${widget.active.title} (${widget.active.remainingText})`
    : widget.next
      ? `Up next: ${widget.next.title} · ${widget.next.timeRange}`
      : 'KRONO · Schedule clear today';

  const body = widget.active
    ? `${widget.active.timeRange}${widget.active.subtitle ? ` · ${widget.active.subtitle}` : ''}`
    : widget.next?.subtitle || 'Tap to open your KRONO schedule';

  const options = {
    body,
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    tag: 'krono-live-schedule',
    renotify: false,
    silent: true,
    requireInteraction: true,
    data: { url: '/widget' },
  };

  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) {
    await reg.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
  return 'granted';
}

/** Computes the live "Happening Now" widget model for Dashboard, /widget, and Notification Shade. */
export function buildNowWidgetModel(todayActivities = [], nowDate = new Date()) {
  const hh = String(nowDate.getHours()).padStart(2, '0');
  const mm = String(nowDate.getMinutes()).padStart(2, '0');
  const nowStr = `${hh}:${mm}`;
  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();

  const sorted = [...todayActivities]
    .filter((a) => a.status !== 'cancelled' && a.status !== 'skipped')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const active = sorted.find((a) => {
    const start = a.startsAt.slice(11, 16);
    const end = a.endsAt.slice(11, 16);
    return start <= nowStr && end > nowStr;
  }) ?? null;

  const next = sorted.find((a) => a.startsAt.slice(11, 16) > nowStr) ?? null;

  if (!active) {
    return {
      active: null,
      next: next
        ? {
            id: next.id,
            title: next.title,
            timeRange: `${to12h(next.startsAt.slice(11, 16))} – ${to12h(next.endsAt.slice(11, 16))}`,
            subtitle: next.subtitle || '',
          }
        : null,
    };
  }

  const startStr = active.startsAt.slice(11, 16);
  const endStr = active.endsAt.slice(11, 16);
  const startMins = toMinutes(startStr);
  const endMins = Math.max(startMins + 1, toMinutes(endStr));
  const elapsed = Math.max(0, Math.min(endMins - startMins, nowMins - startMins));
  const remaining = Math.max(1, endMins - nowMins);
  const percent = Math.round((elapsed / (endMins - startMins)) * 100);

  return {
    active: {
      id: active.id,
      title: active.title,
      category: active.category,
      timeRange: `${to12h(startStr)} – ${to12h(endStr)}`,
      subtitle: active.subtitle || '',
      remainingText: `${remaining} min left`,
      percent,
    },
    next: next
      ? {
          id: next.id,
          title: next.title,
          timeRange: `${to12h(next.startsAt.slice(11, 16))} – ${to12h(next.endsAt.slice(11, 16))}`,
          subtitle: next.subtitle || '',
        }
      : null,
  };
}