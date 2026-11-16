// Screens call these services — never a repository or database directly.
import { ScheduleService } from './ScheduleService.js';
import { WorkoutService } from './WorkoutService.js';
import { PlaceService } from './PlaceService.js';
import { SampleDataService } from './SampleDataService.js';

export function createServices(repos) {
  return {
    schedule: new ScheduleService(repos),
    workout: new WorkoutService(repos),
    place: new PlaceService(repos),
    sampleData: new SampleDataService(repos),
  };
}
export { ScheduleService, WorkoutService, PlaceService, SampleDataService };
