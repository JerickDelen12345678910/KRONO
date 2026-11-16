// Shared constants. Names/values come from docs/PROJECT_PLAN.md and docs/DESIGN_LOCK.md.
const freeze = Object.freeze;

// Firestore/local collection names under users/{userId}/ (plan section 8).
export const COLLECTIONS = freeze({
  SCHEDULES: 'schedules', OCCURRENCES: 'occurrences', ACADEMIC_PERIODS: 'academicPeriods', SUBJECTS: 'subjects',
  WORKOUTS: 'workouts', EXERCISE_HISTORY: 'exerciseHistory', DESTINATIONS: 'destinations',
  REMINDERS: 'reminders', SYNC_METADATA: 'syncMetadata',
});

export const MODULE = freeze({ SCHEDULER: 'scheduler', FITNESS: 'fitness', MAP: 'map' });
export const USER_TYPES = freeze(['Student', 'Professional', 'Other']);

// Scheduler
export const CATEGORIES = freeze(['School', 'Personal', 'Exercise', 'Projects', 'Travel']);
export const SCHEDULE_COLORS = freeze(['primary', 'slate', 'success', 'warning']); // design tokens, not hex
export const CATEGORY_COLOR = freeze({ School: 'primary', Personal: 'slate', Exercise: 'slate', Projects: 'slate', Travel: 'primary' });
export const PRIORITY = freeze(['low', 'medium', 'high']);
export const REPEAT_TYPE = freeze({ NONE: 'none', DAILY: 'daily', WEEKLY: 'weekly', SELECTED_DAYS: 'selectedDays', CUSTOM: 'custom' });
export const OCCURRENCE_STATUS = freeze({ SCHEDULED: 'scheduled', DONE: 'done', SKIPPED: 'skipped', CANCELLED: 'cancelled' });
export const REMINDER_OFFSETS = freeze([0, 5, 10, 15, 30, 60]); // minutes before start; a custom number is also allowed
export const PERIOD_TYPES = freeze(['semester', 'schoolYear', 'custom']);
export const SUBJECT_SOURCE = freeze({ MANUAL: 'manual', COR: 'cor' });

// Fitness
export const EXERCISE_CATEGORIES = freeze(['Cardio', 'Strength', 'Core', 'Flexibility', 'Mobility', 'Recovery']);
export const DIFFICULTY = freeze(['Beginner', 'Intermediate', 'Advanced']);
export const SESSION_STATUS = freeze({ IN_PROGRESS: 'in_progress', PAUSED: 'paused', COMPLETED: 'completed' });
export const ENTRY_STATUS = freeze({ PENDING: 'pending', COMPLETED: 'completed', SKIPPED: 'skipped' });

// Map
export const TRAVEL_MODES = freeze(['driving', 'walking', 'cycling']);

// Sync (matches the Account pipeline: Saved locally -> Waiting -> Syncing -> Synced)
export const SYNC_STATUS = freeze({ LOCAL: 'local', PENDING: 'pending', SYNCING: 'syncing', SYNCED: 'synced' });

// Unified activity (dashboard)
export const ACTIVITY_TYPE = freeze({ SCHEDULE: 'schedule', WORKOUT: 'workout', TRIP: 'trip', REMINDER: 'reminder' });
export const ACTIVITY_STATUS = freeze({ SCHEDULED: 'scheduled', IN_PROGRESS: 'in_progress', DONE: 'done', SKIPPED: 'skipped', CANCELLED: 'cancelled' });
