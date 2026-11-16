// Screens call these services — never a repository or database directly.
import { ScheduleService } from './ScheduleService.js';
import { WorkoutService } from './WorkoutService.js';
import { PlaceService } from './PlaceService.js';
import { ActivityService } from './ActivityService.js';
import { SampleDataService } from './SampleDataService.js';

export function createServices(repos, options = {}) {
  return {
    schedule: new ScheduleService(repos, options),
    workout: new WorkoutService(repos),
    place: new PlaceService(repos),
    activity: new ActivityService(repos),
    sampleData: new SampleDataService(repos),
  };
}
export { ActivityService, ScheduleService, WorkoutService, PlaceService, SampleDataService };
