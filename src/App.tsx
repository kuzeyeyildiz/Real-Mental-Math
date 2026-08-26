import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { AuthPage } from './pages/AuthPage/AuthPage';
import { BenchmarkPage } from './pages/BenchmarkPage/BenchmarkPage';
import { StudentApp } from './pages/StudentApp/StudentApp';
import { StudentWelcome } from './pages/StudentWelcome/StudentWelcome';
import { TeacherDashboard } from './pages/TeacherDashboard/TeacherDashboard';
import { StatusScreen } from './components/StatusScreen/StatusScreen';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { getLatestBenchmark } from './lib/api';
import type { Level } from './types';

type GateState =
  | { status: 'loading' }
  | { status: 'placed'; level: Level; score: number }
  | { status: 'unplaced' }
  | { status: 'error'; message: string };

/**
 * Student landing. The placement assessment is offered, strongly, but it is not
 * a wall: a student who has declined it goes straight through with no placement,
 * and the offer stays open from their profile.
 */
function StudentGate({ userId }: { userId: string }) {
  const { profile } = useAuth();
  const [state, setState] = useState<GateState>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState({ status: 'loading' });
    const res = await getLatestBenchmark(userId);
    if (id !== requestId.current) return;
    // A failed read must never be read as "no placement" — that would send a
    // student who already tested back through the full 80-question assessment.
    if (!res.ok) setState({ status: 'error', message: res.error });
    else if (res.data) setState({ status: 'placed', level: res.data.level, score: res.data.score });
    else setState({ status: 'unplaced' });
  }, [userId]);

  useEffect(() => {
    void load();
    return () => { requestId.current++; };
  }, [load]);

  if (state.status === 'loading') return <StatusScreen title="Loading your progress…" />;
  if (state.status === 'error') {
    return (
      <StatusScreen
        tone="error"
        title="Couldn't load your placement"
        detail={state.message}
        onRetry={() => void load()}
      />
    );
  }
  // Previously this redirected straight into the assessment. A student now sees
  // who they are and what the test involves, and chooses.
  if (state.status === 'unplaced' && !profile?.placement_declined_at) {
    return <StudentWelcome />;
  }
  return (
    <StudentApp
      userId={userId}
      placement={
        state.status === 'placed' ? { level: state.level, score: state.score } : null
      }
    />
  );
}

function HomeRoute() {
  const { session, profile, profileError, refreshProfile } = useAuth();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    await refreshProfile();
    setRetrying(false);
  };

  if (!session) return <Navigate to="/login" replace />;

  if (!profile) {
    if (profileError) {
      return (
        <StatusScreen
          tone="error"
          title="Couldn't load your account"
          detail={profileError}
          busy={retrying}
          onRetry={() => void retry()}
        />
      );
    }
    return <StatusScreen title="Setting up your account…" />;
  }

  if (profile.role === 'teacher') return <TeacherDashboard />;
  return <StudentGate userId={session.user.id} />;
}

/** Gate for authenticated routes. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <StatusScreen title="Loading…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

/** Redirect away from auth pages once signed in. */
function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <StatusScreen title="Loading…" />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<RedirectIfAuthed><AuthPage initialMode="login" /></RedirectIfAuthed>} />
      <Route path="/signup" element={<RedirectIfAuthed><AuthPage initialMode="signup" /></RedirectIfAuthed>} />
      {/* Each route carries its own boundary so a crash in one screen can't
          blank the whole app, and recovering lands the user back on that screen. */}
      <Route
        path="/benchmark"
        element={<RequireAuth><ErrorBoundary><BenchmarkPage /></ErrorBoundary></RequireAuth>}
      />
      <Route
        path="/"
        element={<RequireAuth><ErrorBoundary><HomeRoute /></ErrorBoundary></RequireAuth>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
