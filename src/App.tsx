import { useEffect, useRef, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ActiveTimerBanner } from './components/ActiveTimerBanner';
import { CloudInteraction } from './components/CloudInteraction';
import { BottomNav } from './components/Layout';
import { ConfirmProvider } from './components/Modal';
import { ToastProvider, useToast } from './components/Toast';
import { db } from './db/db';
import { useActiveTimer, useApplyTheme, useSettings } from './hooks';
import { formatDateTime } from './lib/format';
import { Dashboard } from './pages/Dashboard';
import { ProjectDetail } from './pages/ProjectDetail';
import { Projects } from './pages/Projects';
import { Reports } from './pages/Reports';
import { Sessions } from './pages/Sessions';
import { Settings } from './pages/Settings';

function ThemeSync() {
  const settings = useSettings();
  useApplyTheme(settings.theme);
  return null;
}

/** Tells the user, once per launch, when a session is still open from before. */
function OpenSessionNotice() {
  const timer = useActiveTimer();
  const toast = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current || timer === undefined) return;
    shown.current = true; // decide once per launch
    if (!timer) return;
    db.projects.get(timer.projectId).then((p) => {
      toast.info(`لديك جلسة ${timer.status === 'paused' ? 'متوقفة مؤقتًا' : 'مفتوحة'} على «${p?.name ?? 'مشروع'}» منذ ${formatDateTime(timer.startedAt)}`);
    });
  }, [timer, toast]);
  return null;
}

function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [dismissed, setDismissed] = useState(false);
  if (!needRefresh || dismissed) return null;
  return (
    <div className="update-bar" role="status">
      <span className="small flex-1">يتوفر تحديث جديد للتطبيق. بياناتك محفوظة ولن تتأثر.</span>
      <button className="btn sm" style={{ background: 'rgba(255,255,255,0.2)', color: 'inherit' }} onClick={() => updateServiceWorker(true)}>
        تحديث
      </button>
      <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={() => setDismissed(true)} aria-label="لاحقًا">
        لاحقًا
      </button>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <HashRouter>
          <div className="app">
            <ThemeSync />
            <OpenSessionNotice />
            <UpdatePrompt />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Dashboard />} />
            </Routes>
            <ActiveTimerBanner />
            <BottomNav />
            <CloudInteraction />
          </div>
        </HashRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
