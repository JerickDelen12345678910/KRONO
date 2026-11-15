import { USER_TYPES } from './constants.js';
import { isNonEmpty, result } from './common.js';

/** Matches the profile document written in Phase 2 (users/{uid}), plus default preferences. */
export function createUserProfile(o = {}) {
  return {
    displayName: '', email: '', photoURL: null,
    userType: '', school: '', course: '', yearLevel: '',
    ...o,
    preferences: { remindersEnabled: true, theme: 'light', saveRouteHistory: false, showSampleData: true, ...o.preferences },
  };
}

export function validateUserProfile(p) {
  const e = {};
  if (!isNonEmpty(p.displayName)) e.displayName = 'Name is required.';
  if (p.userType && !USER_TYPES.includes(p.userType)) e.userType = 'Choose Student, Professional or Other.';
  return result(e);
}
