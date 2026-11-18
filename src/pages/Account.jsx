import { useState } from 'react';
import { handleError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useServices } from '../hooks/useServices';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { pipelineSteps } from '../lib/syncStatus.js';
import { REMINDER_OFFSETS } from '../models/constants.js';
import { REMINDER_SOUNDS, SNOOZE_OPTIONS } from '../lib/reminders.js';
import { PERMISSION } from '../reminders/ReminderAdapter.js';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Pill } from '../components/ui/Pill';
import { NoteBanner } from '../components/ui/NoteBanner';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { FormField } from '../components/ui/FormField';
import { SegmentedControl } from '../components/ui/SegmentedControl';

const USER_TYPES = ['Student', 'Professional', 'Other'];
const SOUND_OPTIONS = REMINDER_SOUNDS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));
const SNOOZE_CHOICES = SNOOZE_OPTIONS.map((m) => ({ value: m, label: `${m} min` }));
const offsetLabel = (m) => (m === 0 ? 'At start time' : `${m} min before`);
const PERMISSION_TEXT = {
  [PERMISSION.GRANTED]: 'Enabled', [PERMISSION.DENIED]: 'Blocked', [PERMISSION.DEFAULT]: 'Not requested', [PERMISSION.UNSUPPORTED]: 'Not supported',
};
const PERMISSION_VARIANT = {
  [PERMISSION.GRANTED]: 'ok', [PERMISSION.DENIED]: 'warn', [PERMISSION.DEFAULT]: 'fit', [PERMISSION.UNSUPPORTED]: 'fit',
};

function Setting({ title, subtitle, checked, onChange }) {
  return (
    <div className="list-row">
      <div className="row-content">
        <b className="row-title">{title}</b>
        <small className="row-subtitle">{subtitle}</small>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} aria-label={title} />
    </div>
  );
}

export function Account() {
  const { user, profile, online, demo, updateProfile, signOut, deleteAccount } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { reminders } = useServices();
  const steps = pipelineSteps(useSyncStatus());
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

  const save = async (e) => {
    e.preventDefault();
    try { await updateProfile(form); setMsg('Profile saved.'); } catch { setMsg('Could not save. Please try again.'); }
  };
  const run = (fn, confirmText) => async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    try { await fn(); } catch (e) { setMsg(handleError(e, 'account')); }
  };

  // Changing any reminder setting re-syncs the schedule through ReminderService itself; we just reflect what comes back.
  const changeReminderSetting = async (changes) => setReminderSettings(await reminders.setSettings(changes));
  const enableNotifications = async () => {
    setEnabling(true);
    try { setPermission(await reminders.requestPermission()); } finally { setEnabling(false); }
  };

  return (
    <div className="stack">
      {demo && <NoteBanner variant="info">Demo mode: Firebase keys are not set yet, so nothing is saved to the cloud.</NoteBanner>}
      <h3 className="section-divider">Profile and sync</h3>
      <div className="cols">
        <div className="stack">
          <Card>
            <div className="profile-head">
              <span className="avatar avatar-lg">{profile?.photoURL ? <img src={profile.photoURL} alt="" referrerPolicy="no-referrer" /> : (form.displayName[0] || 'A')}</span>
              <div>
                <b>{profile?.displayName || 'Your name'}</b>
                <small className="row-subtitle d-block">{user?.email}</small>
              </div>
              {profile?.userType && <Pill>{profile.userType}</Pill>}
            </div>
          </Card>
          <Card>
            <h3 className="ui-card-header">Edit profile <span>Optional details</span></h3>
            <form className="form-grid" onSubmit={save}>
              <label className="form-field">Name<input value={form.displayName} onChange={set('displayName')} /></label>
              <label className="form-field">User type
                <select value={form.userType} onChange={set('userType')}>
                  <option value="">Select</option>{USER_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="form-field">School<input value={form.school} onChange={set('school')} /></label>
              <label className="form-field">Course<input value={form.course} onChange={set('course')} /></label>
              <label className="form-field">Year level<input value={form.yearLevel} onChange={set('yearLevel')} /></label>
              <Button type="submit" fullWidth>Save profile</Button>
              {msg && <small role="status" className="form-msg">{msg}</small>}
            </form>
          </Card>
          <Card>
            <h3 className="ui-card-header">Sync status <Pill variant={online ? 'ok' : 'warn'}>{online ? 'Online' : 'Offline'}</Pill></h3>
            <div className="pipeline" role="group" aria-label={`Sync progress: ${steps.find((s) => s.state === 'current')?.label ?? 'Synced'}`}>
              {steps.map((step) => (
                <span key={step.label.split(' · ')[0]} className={`pipeline-step${step.state ? ` ${step.state}` : ''}`} aria-current={step.state === 'current' ? 'step' : undefined}>{step.label}</span>
              ))}
            </div>
            <small className="row-subtitle d-block mt-2">Changes save on this device first, then sync when you are online.</small>
          </Card>
        </div>
        <div className="stack">
          <Card>
            <h3 className="ui-card-header">Preferences</h3>
            <Setting title="Dark theme" subtitle="Light is the default" checked={theme === 'dark'} onChange={toggleTheme} />
            <Setting title="Route history" subtitle="Saved only when on" checked={prefs.routes} onChange={flip('routes')} />
            <Setting title="Sample data" subtitle="Remove without touching your records" checked={prefs.sample} onChange={flip('sample')} />
          </Card>
          <Card>
            <h3 className="ui-card-header">Reminders</h3>
            <Setting title="Enable reminders" subtitle="Turning off keeps your schedules" checked={reminderSettings.enabled} onChange={(v) => changeReminderSetting({ enabled: v })} />
            {reminderSettings.enabled && (
              <>
                <Setting title="Also ring an alarm by default" subtitle="Android only · new schedules start with this" checked={reminderSettings.defaultUseAlarm} onChange={(v) => changeReminderSetting({ defaultUseAlarm: v })} />
                <div className="form-grid mt-2">
                  <FormField label="Default reminder time">
                    <select value={reminderSettings.defaultOffsetMinutes} onChange={(e) => changeReminderSetting({ defaultOffsetMinutes: Number(e.target.value) })}>
                      {REMINDER_OFFSETS.map((m) => <option key={m} value={m}>{offsetLabel(m)}</option>)}
                    </select>
                  </FormField>
                  <FormField as="div" label="Sound">
                    <SegmentedControl options={SOUND_OPTIONS} value={reminderSettings.sound} onChange={(sound) => changeReminderSetting({ sound })} ariaLabel="Sound" />
                  </FormField>
                  <FormField as="div" label="Snooze length">
                    <SegmentedControl options={SNOOZE_CHOICES} value={reminderSettings.snoozeMinutes} onChange={(snoozeMinutes) => changeReminderSetting({ snoozeMinutes })} ariaLabel="Snooze length" />
                  </FormField>
                </div>
              </>
            )}
            <div className="list-row mt-2">
              <div className="row-content">
                <b className="row-title">Notifications</b>
                <small className="row-subtitle">Needed to show reminders while the app is open</small>
              </div>
              <Pill variant={PERMISSION_VARIANT[permission]}>{PERMISSION_TEXT[permission]}</Pill>
            </div>
            <Button fullWidth variant="secondary" disabled={enabling || permission === PERMISSION.GRANTED || permission === PERMISSION.UNSUPPORTED} onClick={enableNotifications}>
              {enabling ? 'Requesting…' : 'Enable notifications'}
            </Button>
          </Card>
          <h3 className="section-divider">Security</h3>
          <Card>
            <Button fullWidth disabled={!online} onClick={run(signOut)}>Sign out</Button>
            <small className="row-subtitle d-block mt-2">
              Sign out and account switching need internet so your local data stays protected.
            </small>
            <hr className="my-3" />
            <Button fullWidth variant="secondary" disabled={!online} onClick={run(deleteAccount, 'Delete your account and stored data? This cannot be undone.')}>Delete account</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}