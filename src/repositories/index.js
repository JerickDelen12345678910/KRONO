// Creates all repositories for ONE signed-in user. Data is namespaced as users/{userId}/{collection},
// so two accounts can never see each other's records. Swap storage later with `createAdapter`.
import { COLLECTIONS as C } from '../models/constants.js';
import { createBase } from '../models/common.js';
import { createSchedule, validateOccurrence, validateSchedule } from '../models/schedule.js';
import { createAcademicPeriod, createSubject, validateAcademicPeriod, validateSubject } from '../models/academic.js';
import { createWorkout, validateWorkout } from '../models/workout.js';
import { createDestination, validateDestination } from '../models/place.js';
import { AppError, ERROR_CODE } from '../lib/errors.js';
import { MemoryAdapter, createMemoryStore } from './MemoryAdapter.js';
import { Repository } from './Repository.js';

// Occurrences and sessions arrive fully built (createOccurrence / createWorkoutSession); the factory only fills base fields.
const prebuilt = (o) => ({ ...createBase(), ...o });

export function createRepositories({ userId, store = createMemoryStore(), createAdapter } = {}) {
  if (!userId) throw new AppError(ERROR_CODE.INVALID, 'A signed-in user is required.');
  const adapterFor = createAdapter ?? ((col) => new MemoryAdapter(store, `users/${userId}/${col}`));
  const repo = (collection, factory, validate) => new Repository({ adapter: adapterFor(collection), factory, validate });
  return {
    schedules: repo(C.SCHEDULES, createSchedule, validateSchedule),
    occurrences: repo(C.OCCURRENCES, prebuilt, validateOccurrence),
    academicPeriods: repo(C.ACADEMIC_PERIODS, createAcademicPeriod, validateAcademicPeriod),
    subjects: repo(C.SUBJECTS, createSubject, validateSubject),
    workouts: repo(C.WORKOUTS, createWorkout, validateWorkout),
    exerciseHistory: repo(C.EXERCISE_HISTORY, prebuilt, null),
    destinations: repo(C.DESTINATIONS, createDestination, validateDestination),
  };
}

export { Repository, MemoryAdapter, createMemoryStore };
