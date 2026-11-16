import { useContext } from 'react';
import { ServicesContext } from '../contexts/ServicesContext';
import { AppError, ERROR_CODE } from '../lib/errors';

/** const { schedule, workout, place, activity, sampleData, reminders } = useServices(); — screens use ONLY these. */
export function useServices() {
  const services = useContext(ServicesContext);
  if (!services) throw new AppError(ERROR_CODE.INVALID, 'useServices must be used inside a signed-in ServicesProvider.');
  return services;
}