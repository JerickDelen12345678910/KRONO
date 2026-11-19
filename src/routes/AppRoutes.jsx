import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { Dashboard } from '../pages/Dashboard';
import { Scheduler } from '../pages/Scheduler';
import { Fitness } from '../pages/Fitness';
import { ExerciseLibrary } from '../pages/ExerciseLibrary';
import { ExerciseDetail } from '../pages/ExerciseDetail';
import { MapPage } from '../pages/MapPage';
import { Account } from '../pages/Account';
import { ProtectedRoute } from './ProtectedRoute';
import { Login } from '../pages/Login';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/scheduler/*" element={<Scheduler />} />
          <Route path="/fitness" element={<Fitness />} />
          <Route path="/fitness/exercises" element={<ExerciseLibrary />} />
          <Route path="/fitness/exercises/:id" element={<ExerciseDetail />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/account" element={<Account />} />
        </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}