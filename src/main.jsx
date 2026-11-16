import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ServicesProvider } from './contexts/ServicesProvider';
import { AppRoutes } from './routes/AppRoutes';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.scss';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ServicesProvider>
          <AppRoutes />
        </ServicesProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
