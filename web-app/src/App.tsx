import { lazy, Suspense, memo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SyncProvider } from './contexts/SyncContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { PageProvider } from './contexts/PageContext';
import { AppLayout } from './components/layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load page components for code splitting
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const TodoNotices = lazy(() => import('./pages/TodoNotices').then(m => ({ default: m.TodoNotices })));
const Projects = lazy(() => import('./pages/Projects').then(m => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail').then(m => ({ default: m.ProjectDetail })));
const Tasks = lazy(() => import('./pages/Tasks').then(m => ({ default: m.Tasks })));
const TaskDetail = lazy(() => import('./pages/TaskDetail').then(m => ({ default: m.TaskDetail })));
const Reports = lazy(() => import('./pages/Reports').then(m => ({ default: m.Reports })));
const Users = lazy(() => import('./pages/Users').then(m => ({ default: m.Users })));
const UserPerformanceDetail = lazy(() => import('./pages/UserPerformanceDetail').then(m => ({ default: m.UserPerformanceDetail })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));

// Loading fallback component - memoized to prevent re-renders
const PageLoadingFallback = memo(() => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
));
PageLoadingFallback.displayName = 'PageLoadingFallback';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-live="polite" aria-busy="true">
        <div className="text-center space-y-4">
          <div className="skeleton-shimmer rounded-full h-12 w-12 mx-auto" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" aria-live="polite" aria-busy="true">
        <div className="text-center space-y-4">
          <div className="skeleton-shimmer rounded-full h-12 w-12 mx-auto" aria-hidden="true" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/dashboard" replace /> : <Login />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Navigate to="/dashboard" replace />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bulletin-board"
          element={
            <ProtectedRoute>
              <AppLayout>
                <TodoNotices />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Projects />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProjectDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Tasks />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <TaskDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Reports />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Users />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:id/performance"
          element={
            <ProtectedRoute>
              <AppLayout>
                <UserPerformanceDetail />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Profile />
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <RealtimeProvider>
              <SyncProvider>
                <NotificationProvider>
                  <PageProvider>
                    <AppRoutes />
                  </PageProvider>
                </NotificationProvider>
              </SyncProvider>
            </RealtimeProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
