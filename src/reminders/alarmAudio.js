// Offline storage (IndexedDB) + audio playback + active alarm state broadcast.
const DB_NAME = 'cadence-alarm-audio';
const STORE_NAME = 'sounds';
const CUSTOM_KEY = 'custom-alarm';

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

function openAudioDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read audio file.'));
    reader.readAsDataURL(file);
  });
}

function guessAudioMime(fileName = '', rawType = '') {
  if (rawType && rawType.startsWith('audio/')) return rawType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  return 'audio/mpeg';
}

export async function saveCustomAlarmSound(file) {
  if (!file) throw new Error('No audio file selected.');
  const mime = guessAudioMime(file.name, file.type);
  const [buffer, dataUrl] = await Promise.all([
    file.arrayBuffer(),
    fileToDataUrl(file),
  ]);
  const record = {
    name: file.name || 'Custom alarm',
    type: mime,
    buffer,
    dataUrl,
    updatedAt: Date.now(),
  };
  const db = await openAudioDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record, CUSTOM_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return { name: record.name, type: record.type };
}

export async function getCustomAlarmSound() {
  try {
    const db = await openAudioDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CUSTOM_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function clearCustomAlarmSound() {
  try {
    const db = await openAudioDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(CUSTOM_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
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

function playSynthTone(preset = 'default', { loop = false, maxMs = 30000 } = {}) {
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioCtx) return () => {};
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const patterns = {
    gentle: { notes: [440, 554.37, 659.25], step: 0.28, gap: 1.4, type: 'sine', gain: 0.28 },
    bright: { notes: [587.33, 783.99, 987.77, 1174.66], step: 0.16, gap: 1.1, type: 'triangle', gain: 0.35 },
    default: { notes: [523.25, 659.25, 783.99, 659.25], step: 0.18, gap: 1.2, type: 'triangle', gain: 0.38 },
  };
  const cfg = patterns[preset] || patterns.default;
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
      gain.gain.exponentialRampToValueAtTime(cfg.gain, start + idx * cfg.step + 0.03);
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

/** Plays either the user's imported custom sound (`sound === 'custom'`) or a built-in sound. */
export async function playAlarmSound(sound = 'default', { loop = false, maxMs = 30000, meta = null } = {}) {
  stopAlarmAudio();

  if (loop || meta) {
    activeAlarmInfo = {
      id: meta?.id || `alarm-${Date.now()}`,
      title: meta?.title || 'KRONO Alarm',
      body: meta?.body || 'Scheduled reminder is ringing',
      sound,
      onSnooze: typeof meta?.onSnooze === 'function' ? meta.onSnooze : null,
      onDismiss: typeof meta?.onDismiss === 'function' ? meta.onDismiss : null,
    };
    notifyAlarmListeners();
  }

  if (sound === 'custom') {
    const custom = await getCustomAlarmSound();
    if (custom && typeof Audio !== 'undefined') {
      let objectUrl = '';
      const src = custom.dataUrl
        || (custom.buffer
          ? (objectUrl = URL.createObjectURL(new Blob([custom.buffer], { type: custom.type || 'audio/mpeg' })))
          : '');
      if (src) {
        const audio = new Audio(src);
        audio.loop = loop;
        const cleanup = () => {
          audio.pause();
          audio.removeAttribute('src');
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        const autoStop = globalThis.setTimeout(() => stopAlarmAudio(), maxMs);
        audio.onended = () => {
          if (!loop) stopAlarmAudio();
        };
        activeStopper = () => {
          globalThis.clearTimeout(autoStop);
          cleanup();
        };
        try {
          await audio.play();
          return activeStopper;
        } catch {
          stopAlarmAudio();
        }
      }
    }
  }
  const stopSynth = playSynthTone(sound, { loop, maxMs });
  activeStopper = stopSynth;
  return stopSynth;
}