import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { handleError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useServices } from '../hooks/useServices';
import { usePwa } from '../hooks/usePwa';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { pipelineSteps } from '../lib/syncStatus.js';
import { ANDROID_APK_URL } from '../config/appLinks';
import { REMINDER_OFFSETS } from '../models/constants.js';
import { SNOOZE_OPTIONS } from '../lib/reminders.js';
import { PERMISSION } from '../reminders/ReminderAdapter.js';
import {
  ALARM_SOUND_OPTIONS, normalizeAlarmSound, previewAlarmSound, setPreferredAlarmSound, stopAlarmAudio,
} from '../reminders/alarmAudio.js';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { NoteBanner } from '../components/ui/NoteBanner';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { FormField } from '../components/ui/FormField';
import { SegmentedControl } from '../components/ui/SegmentedControl';

const USER_TYPES = ['Student', 'Professional', 'Other'];
const SNOOZE_CHOICES = SNOOZE_OPTIONS.map((m) => ({ value: m, label: `${m}m` }));
const offsetLabel = (m) => (m === 0 ? 'At start time' : `${m} min before`);
const PERMISSION_TEXT = {
  [PERMISSION.GRANTED]: 'Enabled', [PERMISSION.DENIED]: 'Blocked', [PERMISSION.DEFAULT]: 'Off', [PERMISSION.UNSUPPORTED]: 'Unsupported',
};
const PERMISSION_VARIANT = {
  [PERMISSION.GRANTED]: 'ok', [PERMISSION.DENIED]: 'warn', [PERMISSION.DEFAULT]: 'fit', [PERMISSION.UNSUPPORTED]: 'fit',
};

function Setting({ title, subtitle, checked, onChange }) {
  return (
    <div className="list-row">
      <div className="row-content">
        <b className="row-title">{title}</b>
        {subtitle && <small className="row-subtitle">{subtitle}</small>}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} aria-label={title} />
    </div>
  );
}

export function Account() {
  const { user, profile, online, demo, updateProfile, signOut, deleteAccount } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { reminders } = useServices();
  const pwa = usePwa();
  const steps = pipelineSteps(useSyncStatus());
  const isNative = Capacitor.isNativePlatform();
  const [form, setForm] = useState({
    displayName: profile?.displayName || '', userType: profile?.userType || '',
    school: profile?.school || '', course: profile?.course || '', yearLevel: profile?.yearLevel || '',
  });
  const [msg, setMsg] = useState('');
  const [prefs, setPrefs] = useState({ routes: false, sample: true });
  const [reminderSettings, setReminderSettings] = useState(() => reminders.getSettings());
  const [permission, setPermission] = useState(() => reminders.getPermission());
  const [enabling, setEnabling] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const flip = (k) => (v) => setPrefs({ ...prefs, [k]: v });

  useEffect(() => {
    let alive = true;
    reminders.refreshPermission?.().then((p) => {
      if (alive && p) setPermission(p);
    });
    return () => {
      alive = false;
      stopAlarmAudio();
    };
  }, [reminders]);

  const save = async (e) => {
    e.preventDefault();
    try { await updateProfile(form); setMsg('Saved.'); } catch { setMsg('Could not save.'); }
  };
  const run = (fn, confirmText) => async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await fn(); } catch (e) { setMsg(handleError(e, 'account')); }
  };

  const changeReminderSetting = async (changes) => setReminderSettings(await reminders.setSettings(changes));
  const enableNotifications = async () => {
    setEnabling(true);
    try { setPermission(await reminders.requestPermission()); } finally { setEnabling(false); }
  };

  const activeDefaultSound = normalizeAlarmSound(reminderSettings.sound);
  const activeOption = ALARM_SOUND_OPTIONS.find((o) => o.id === activeDefaultSound);

  const handleSelectDefaultSound = async (nextId) => {
    const resolved = setPreferredAlarmSound(nextId);
    previewAlarmSound(resolved);
    await changeReminderSetting({ sound: resolved });
  };

  return (
    <div className="stack krono-fade-in">
      {demo && <NoteBanner variant="info">Demo mode (local storage only).</NoteBanner>}
      <h3 className="section-divider">Profile</h3>
      <div className="cols">
        <div className="stack">
          <Card>
            <div className="profile-head">
              <span className="avatar avatar-lg">{profile?.photoURL ? <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" /> : (form.displayName[0] || 'K')}</span>
              <div>
                <b>{profile?.displayName || 'Your name'}</b>
                <small className="row-subtitle d-block">{user?.email}</small>
              </div>
              {profile?.userType && <Pill>{profile.userType}</Pill>}
            </div>
          </Card>
          <Card>
            <h3 className="ui-card-header">Details</h3>
            <form className="form-grid" onSubmit={save}>
              <label className="form-field">Name<input value={form.displayName} onChange={set('displayName')} /></label>
              <label className="form-field">Role
                <select value={form.userType} onChange={set('userType')}>
                  <option value="">Select</option>{USER_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="form-field">School / Organization<input value={form.school} onChange={set('school')} /></label>
              <label className="form-field">Course / Program<input value={form.course} onChange={set('course')} /></label>
              <label className="form-field">Year level<input value={form.yearLevel} onChange={set('yearLevel')} /></label>
              <Button type="submit" fullWidth>Save</Button>
              {msg && <small role="status" className="form-msg">{msg}</small>}
            </form>
          </Card>
          <Card>
            <h3 className="ui-card-header">Sync <Pill variant={online ? 'ok' : 'warn'}>{online ? 'Online' : 'Offline'}</Pill></h3>
            <div className="pipeline" role="group">
              {steps.map((step) => (
                <span key={step.label.split(' · ')[0]} className={`pipeline-step${step.state ? ` ${step.state}` : ''}`}>{step.label}</span>
              ))}
            </div>
          </Card>
        </div>
        <div className="stack">
          <Card>
            <h3 className="ui-card-header">Appearance</h3>
            <Setting title="Dark theme" checked={theme === 'dark'} onChange={toggleTheme} />
            <Setting title="Save route history" checked={prefs.routes} onChange={flip('routes')} />
            <Setting title="Sample data" checked={prefs.sample} onChange={flip('sample')} />
          </Card>
          <Card>
            <h3 className="ui-card-header">Alarms &amp; Reminders</h3>
            <Setting title="Enable reminders" checked={reminderSettings.enabled} onChange={(v) => changeReminderSetting({ enabled: v })} />
            {reminderSettings.enabled && (
              <>
                <Setting title="Ring alarm by default" checked={reminderSettings.defaultUseAlarm} onChange={(v) => changeReminderSetting({ defaultUseAlarm: v })} />
                <div className="form-grid mt-2">
                  <FormField label="Lead time">
                    <select value={reminderSettings.defaultOffsetMinutes} onChange={(e) => changeReminderSetting({ defaultOffsetMinutes: Number(e.target.value) })}>
                      {REMINDER_OFFSETS.map((m) => <option key={m} value={m}>{offsetLabel(m)}</option>)}
                    </select>
                  </FormField>
                  <FormField as="div" label="Default alarm sound">
                    <div className="d-flex gap-2 align-items-center">
                      <select value={activeDefaultSound} onChange={(e) => handleSelectDefaultSound(e.target.value)}>
                        {ALARM_SOUND_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                      </select>
                      <Button type="button" variant="secondary" onClick={() => previewAlarmSound(activeDefaultSound)}>
                        Preview
                      </Button>
                    </div>
                    {activeOption && (
                      <small className="row-subtitle d-block mt-1">
                        {activeOption.description}
                      </small>
                    )}
                  </FormField>
                  <FormField as="div" label="Snooze">
                    <SegmentedControl options={SNOOZE_CHOICES} value={reminderSettings.snoozeMinutes} onChange={(snoozeMinutes) => changeReminderSetting({ snoozeMinutes })} ariaLabel="Snooze length" />
                  </FormField>
                </div>
              </>
            )}
            <div className="list-row mt-2">
              <div className="row-content">
                <b className="row-title">Notifications</b>
              </div>
              <Pill variant={PERMISSION_VARIANT[permission]}>{PERMISSION_TEXT[permission]}</Pill>
            </div>
            <Button fullWidth variant="secondary" disabled={enabling || permission === PERMISSION.GRANTED || permission === PERMISSION.UNSUPPORTED} onClick={enableNotifications}>
              {enabling ? 'Requesting…' : 'Allow notifications'}
            </Button>
          </Card>
          {!isNative && (
            <Card>
              <h3 className="ui-card-header">
                Android &amp; Web App {pwa.offlineReady && <Pill variant="ok">Offline ready</Pill>}
              </h3>
              <div className="stack">
                <a
                  href={ANDROID_APK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary w-100"
                >
                  Download KRONO Android App (.APK)
                </a>
                <small className="row-subtitle">
                  Full native build with Home-Screen Widget, Alarm Sound Channel &amp; Custom Icon.
                </small>
                {pwa.canInstall && (
                  <Button fullWidth variant="secondary" onClick={pwa.install}>
                    Install Web App (PWA)
                  </Button>
                )}
              </div>
            </Card>
          )}
          <Card>
            <Button fullWidth disabled={!online} onClick={run(signOut)}>Sign out</Button>
            <hr className="my-3" />
            <Button fullWidth variant="secondary" disabled={!online} onClick={run(deleteAccount, 'Delete your account and all data?')}>Delete account</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
