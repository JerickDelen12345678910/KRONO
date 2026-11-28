// Offline built-in alarm presets + Web Audio synthesizer + native Android raw channel mapping.
const STORAGE_PREF_KEY = 'krono_default_alarm_sound_v1';

export const ALARM_SOUND_OPTIONS = [
  {
    id: 'chrono_chime',
    label: 'Chrono Bell (Class & COR)',
    category: 'Schedule / COR',
    description: 'Clean ascending bell chime ideal for classes and COR schedules.',
  },
  {
    id: 'titan_pulse',
    label: 'Titan Pulse (Gym & HIIT)',
    category: 'Gym / Workout',
    description: 'Energetic double-pulse synth beat for workouts and rest timers.',
  },
  {
    id: 'atlas_radar',
    label: 'Atlas Radar (Leave-By)',
    category: 'Navigation / ETA',
    description: 'Crisp sonar ping alert when it is time to head out.',
  },
  {
    id: 'digital_rooster',
    label: 'Crisp Digital Beep (7AM)',
    category: 'Early Class / Wake-Up',
    description: 'Classic 4-beep digital watch tone for early morning classes.',
  },
  {
    id: 'zen_marimba',
    label: 'Calm Marimba (Study)',
    category: 'Study / General',
    description: 'Warm marimba melody for study blocks and daily reminders.',
  },
  {
    id: 'urgent_siren',
    label: 'Max Alert Tone (Exams)',
    category: 'Exams / Deadlines',
    description: 'High-clarity dual-tone alert for exams and critical deadlines.',
  },
];

const LEGACY_SOUND_MAP = {
  default: 'chrono_chime',
  gentle: 'zen_marimba',
  bright: 'titan_pulse',
  custom: 'chrono_chime',
};

export function normalizeAlarmSound(sound) {
  if (!sound) return 'chrono_chime';
  if (LEGACY_SOUND_MAP[sound]) return LEGACY_SOUND_MAP[sound];
  const exists = ALARM_SOUND_OPTIONS.some((item) => item.id === sound);
  return exists ? sound : 'chrono_chime';
}

export function getAlarmSoundLabel(sound) {
  const normalized = normalizeAlarmSound(sound);
  return ALARM_SOUND_OPTIONS.find((item) => item.id === normalized)?.label || 'Chrono Bell (Class & COR)';
}

export function getPreferredAlarmSound() {
  try {
    return normalizeAlarmSound(localStorage.getItem(STORAGE_PREF_KEY));
  } catch {
    return 'chrono_chime';
  }
}

export function setPreferredAlarmSound(sound) {
  const normalized = normalizeAlarmSound(sound);
  try {
    localStorage.setItem(STORAGE_PREF_KEY, normalized);
  } catch {
    // ignore storage errors
  }
  return normalized;
}

let activeStopper = null;
let activeAlarmInfo = null;
const alarmListeners = new Set();

function notifyAlarmListeners() {
  const snapshot = activeAlarmInfo ? { ...activeAlarmInfo } : null;
  for (const fn of alarmListeners) {
    try { fn(snapshot); } catch { /* ignore */ }
  }
}

export function getActiveAlarm() {
  return activeAlarmInfo ? { ...activeAlarmInfo } : null;
}

export function subscribeActiveAlarm(listener) {
  if (typeof listener !== 'function') return () => {};
  alarmListeners.add(listener);
  try { listener(getActiveAlarm()); } catch { /* ignore */ }
  return () => alarmListeners.delete(listener);
}

export function stopAlarmAudio() {
  if (typeof activeStopper === 'function') {
    try { activeStopper(); } catch { /* ignore */ }
    activeStopper = null;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(0); } catch { /* ignore */ }
  }
  if (activeAlarmInfo !== null) {
    activeAlarmInfo = null;
    notifyAlarmListeners();
  }
}

const SOUND_PATTERNS = {
  chrono_chime: {
    notes: [523.25, 659.25, 783.99, 1046.5],
    step: 0.17,
    gap: 1.25,
    type: 'triangle',
    gain: 0.36,
  },
  titan_pulse: {
    notes: [440, 587.33, 440, 880, 880],
    step: 0.12,
    gap: 0.95,
    type: 'sawtooth',
    gain: 0.28,
  },
  atlas_radar: {
    notes: [880, 1174.66, 880],
    step: 0.14,
    gap: 1.15,
    type: 'sine',
    gain: 0.38,
  },
  digital_rooster: {
    notes: [987.77, 987.77, 987.77, 987.77],
    step: 0.11,
    gap: 0.85,
    type: 'square',
    gain: 0.24,
  },
  zen_marimba: {
    notes: [392.0, 493.88, 587.33, 783.99, 659.25],
    step: 0.22,
    gap: 1.4,
    type: 'sine',
    gain: 0.34,
  },
  urgent_siren: {
    notes: [783.99, 1046.5, 783.99, 1046.5, 1318.51],
    step: 0.13,
    gap: 0.8,
    type: 'triangle',
    gain: 0.42,
  },
};

function playSynthTone(preset = 'chrono_chime', { loop = false, maxMs = 30000 } = {}) {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const resolvedId = normalizeAlarmSound(preset);
  const cfg = SOUND_PATTERNS[resolvedId] || SOUND_PATTERNS.chrono_chime;
  let stopped = false;
  let timer = null;

  const triggerBurst = () => {
    if (stopped) return;
    if (loop && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate([350, 150, 350]); } catch { /* ignore */ }
    }
    const start = ctx.currentTime + 0.02;
    cfg.notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = cfg.type;
      osc.frequency.setValueAtTime(freq, start + idx * cfg.step);
      gain.gain.setValueAtTime(0.001, start + idx * cfg.step);
      gain.gain.exponentialRampToValueAtTime(cfg.gain, start + idx * cfg.step + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + (idx + 1) * cfg.step);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + idx * cfg.step);
      osc.stop(start + (idx + 1) * cfg.step + 0.02);
    });
    if (loop && !stopped) {
      timer = globalThis.setTimeout(triggerBurst, cfg.gap * 1000);
    }
  };

  triggerBurst();
  const autoStop = globalThis.setTimeout(() => stopAlarmAudio(), maxMs);

  return () => {
    stopped = true;
    globalThis.clearTimeout(timer);
    globalThis.clearTimeout(autoStop);
    ctx.close().catch(() => {});
  };
}

/** Short one-shot preview when user picks an alarm sound in Schedule / COR / Gym / Settings */
export function previewAlarmSound(sound = 'chrono_chime') {
  stopAlarmAudio();
  const stopSynth = playSynthTone(sound, { loop: false, maxMs: 2500 });
  activeStopper = stopSynth;
  return stopSynth;
}

/** Plays the chosen built-in preset and broadcasts active alarm UI banner when ringing */
export async function playAlarmSound(sound = 'chrono_chime', { loop = false, maxMs = 30000, meta = null } = {}) {
  stopAlarmAudio();
  const resolvedSound = normalizeAlarmSound(sound);

  if (loop || meta) {
    activeAlarmInfo = {
      id: meta?.id || `alarm-${Date.now()}`,
      title: meta?.title || 'KRONO Alarm',
      body: meta?.body || 'Scheduled reminder is ringing',
      sound: resolvedSound,
      onSnooze: typeof meta?.onSnooze === 'function' ? meta.onSnooze : null,
      onDismiss: typeof meta?.onDismiss === 'function' ? meta.onDismiss : null,
    };
    notifyAlarmListeners();
  }

  const stopSynth = playSynthTone(resolvedSound, { loop, maxMs });
  activeStopper = stopSynth;
  return stopSynth;
}

// Keep legacy exports as safe no-ops so older imports never crash
export async function saveCustomAlarmSound() {
  return { name: getAlarmSoundLabel(getPreferredAlarmSound()), type: 'audio/wav' };
}
export async function getCustomAlarmSound() {
  return null;
}
export async function clearCustomAlarmSound() {}
