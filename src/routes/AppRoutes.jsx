import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';
import { Dashboard } from '../pages/Dashboard';
import { Login } from '../pages/Login';

// Lazy-loaded heavy modules (naglo-load lang kapag binuksan ang tab)
const ScheduleWidgetPage = lazy(() => import('../pages/ScheduleWidgetPage').then((m) => ({ default: m.ScheduleWidgetPage })));
const Scheduler = lazy(() => import('../pages/Scheduler').then((m) => ({ default: m.Scheduler })));
const Fitness = lazy(() => import('../pages/Fitness').then((m) => ({ default: m.Fitness })));
const ExerciseLibrary = lazy(() => import('../pages/ExerciseLibrary').then((m) => ({ default: m.ExerciseLibrary })));
const ExerciseDetail = lazy(() => import('../pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetail })));
const MyWorkouts = lazy(() => import('../pages/MyWorkouts').then((m) => ({ default: m.MyWorkouts })));
const WorkoutForm = lazy(() => import('../pages/WorkoutForm').then((m) => ({ default: m.WorkoutForm })));
const WorkoutSession = lazy(() => import('../pages/WorkoutSession').then((m) => ({ default: m.WorkoutSession })));
const MapPage = lazy(() => import('../pages/MapPage').then((m) => ({ default: m.MapPage })));
const Account = lazy(() => import('../pages/Account').then((m) => ({ default: m.Account })));

function PageLoader() {
  return (
    <div className="d-flex justify-content-center align-items-center py-5" role="status">
      <div className="spinner-border text-primary" aria-label="Loading page" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/widget" element={<ScheduleWidgetPage />} />
              <Route path="/scheduler/*" element={<Scheduler />} />
              <Route path="/fitness" element={<Fitness />} />
              <Route path="/fitness/exercises" element={<ExerciseLibrary />} />
              <Route path="/fitness/exercises/:id" element={<ExerciseDetail />} />
              <Route path="/fitness/workouts" element={<MyWorkouts />} />
              <Route path="/fitness/workouts/new" element={<WorkoutForm />} />
              <Route path="/fitness/workouts/:id" element={<WorkoutForm />} />
              <Route path="/fitness/session/:id" element={<WorkoutSession />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/account" element={<Account />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}