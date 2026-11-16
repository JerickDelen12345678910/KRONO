import { createContext } from 'react';

/** Holds the services for the signed-in user (null while signed out). Use `useServices()` to read it. */
export const ServicesContext = createContext(null);
