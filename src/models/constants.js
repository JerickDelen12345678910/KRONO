const freeze = Object.freeze;

export const COLLECTIONS = freeze({
  SCHEDULES: 'schedules', OCCURRENCES: 'occurrences', ACADEMIC_PERIODS: 'academicPeriods', SUBJECTS: 'subjects',
  WORKOUTS: 'workouts', EXERCISE_HISTORY: 'exerciseHistory', DESTINATIONS: 'destinations',
  REMINDERS: 'reminders', SYNC_METADATA: 'syncMetadata',
});

export const MODULE = freeze({ SCHEDULER: 'scheduler', FITNESS: 'fitness', MAP: 'map' });
export const USER_TYPES = freeze(['Student', 'Professional', 'Other']);

// Scheduler — Distinct, high-contrast color tokens per category
export const CATEGORIES = freeze(['School', 'Personal', 'Exercise', 'Projects', 'Travel']);
export const SCHEDULE_COLORS = freeze(['primary', 'slate', 'success', 'warning', 'violet']);
export const CATEGORY_COLOR = freeze({
  School: 'primary',     // Electric Blue (Classes & COR)
  Exercise: 'warning',   // Energetic Orange (Gym & Workouts)
  Travel: 'success',     // Emerald Mint (Routes & Commute)
  Projects: 'violet',    // Royal Violet (Projects & Coding)
  Personal: 'slate',     // Cool Slate (Personal & Errands)
});
export const PRIORITY = freeze(['low', 'medium', 'high']);
export const REPEAT_TYPE = freeze({ NONE: 'none', DAILY: 'daily', WEEKLY: 'weekly', SELECTED_DAYS: 'selectedDays', CUSTOM: 'custom' });
export const OCCURRENCE_STATUS = freeze({ SCHEDULED: 'scheduled', DONE: 'done', SKIPPED: 'skipped', CANCELLED: 'cancelled' });
export const REMINDER_OFFSETS = freeze([0, 5, 10, 15, 30, 60]);
export const PERIOD_TYPES = freeze(['semester', 'schoolYear', 'custom']);
export const SUBJECT_SOURCE = freeze({ MANUAL: 'manual', COR: 'cor' });

// Fitness
export const EXERCISE_CATEGORIES = freeze(['Cardio', 'Strength', 'Core', 'Flexibility', 'Mobility', 'Recovery']);
export const DIFFICULTY = freeze(['Beginner', 'Intermediate', 'Advanced']);
export const SESSION_STATUS = freeze({ IN_PROGRESS: 'in_progress', PAUSED: 'paused', COMPLETED: 'completed' });
export const ENTRY_STATUS = freeze({ PENDING: 'pending', COMPLETED: 'completed', SKIPPED: 'skipped' });

// Map
export const TRAVEL_MODES = freeze(['driving', 'walking', 'cycling']);

// Sync
export const SYNC_STATUS = freeze({ LOCAL: 'local', PENDING: 'pending', SYNCING: 'syncing', SYNCED: 'synced' });

// Unified activity
export const ACTIVITY_TYPE = freeze({ SCHEDULE: 'schedule', WORKOUT: 'workout', TRIP: 'trip', REMINDER: 'reminder' });
export const ACTIVITY_STATUS = freeze({ SCHEDULED: 'scheduled', IN_PROGRESS: 'in_progress', DONE: 'done', SKIPPED: 'skipped', CANCELLED: 'cancelled' });
