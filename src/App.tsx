import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseSchema } from './types/school';
import { StorageService } from './services/storage';
import { DesktopStorageService } from './services/desktopStorage';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandPalette } from './components/layout/CommandPalette';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { CloudSyncService } from './services/cloudSync';

const RegistrationView = lazy(() =>
  import('./components/admissions/RegistrationView').then((module) => ({
    default: module.RegistrationView,
  }))
);
const StudentListView = lazy(() =>
  import('./components/students/StudentListView').then((module) => ({
    default: module.StudentListView,
  }))
);
const GradesAndReportCardsView = lazy(() =>
  import('./components/academics/GradesAndReportCardsView').then((module) => ({
    default: module.GradesAndReportCardsView,
  }))
);
const FinancesManagerView = lazy(() =>
  import('./components/finances/FinancesManagerView').then((module) => ({
    default: module.FinancesManagerView,
  }))
);
const TimetableView = lazy(() =>
  import('./components/schedule/TimetableView').then((module) => ({
    default: module.TimetableView,
  }))
);
const AttendanceManagerView = lazy(() =>
  import('./components/attendance/AttendanceManagerView').then((module) => ({
    default: module.AttendanceManagerView,
  }))
);
const TeachersManagerView = lazy(() =>
  import('./components/teachers/TeachersManagerView').then((module) => ({
    default: module.TeachersManagerView,
  }))
);
const GeneralSettingsView = lazy(() =>
  import('./components/settings/GeneralSettingsView').then((module) => ({
    default: module.GeneralSettingsView,
  }))
);

const ViewLoading = () => (
  <div className="page-panel p-8 flex items-center justify-center min-h-[180px]" role="status">
    <div className="text-center">
      <div className="app-startup__spinner" aria-hidden="true" />
      <div className="mt-3 text-[11px] text-slate-500">Chargement du module…</div>
    </div>
  </div>
);


export function App() {
  const [db, setDb] = useState<DatabaseSchema>(() => StorageService.loadDatabase());
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>();
  const [pendingFinanceAction, setPendingFinanceAction] = useState<'NEW_PAYMENT' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isStartupReady, setIsStartupReady] = useState(
    () => !DesktopStorageService.isDesktop()
  );
  const [startupWarning, setStartupWarning] = useState('');
  const dbRef = useRef(db);

  const showToast = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToasts((current) => [
        ...current,
        { id: `toast-${Date.now()}-${Math.random()}`, text, type },
      ]);
    },
    []
  );

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('SEKOLY_THEME');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (!DesktopStorageService.isDesktop()) {
      setIsStartupReady(true);
      return;
    }

    let mounted = true;

    void StorageService.hydrateDesktopDatabase()
      .then((desktopDb) => {
        if (!mounted) return;
        if (desktopDb) {
          setDb(desktopDb);
          dbRef.current = desktopDb;
        } else {
          setStartupWarning(
            'La base locale n’a pas pu être chargée. Sekoly utilise temporairement le cache local.'
          );
        }
      })
      .finally(() => {
        if (mounted) setIsStartupReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('SEKOLY_THEME', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    let cancelled = false;
    let running = false;

    const pull = async () => {
      if (
        running ||
        cancelled ||
        !navigator.onLine ||
        !CloudSyncService.isConnected() ||
        !CloudSyncService.getSchoolId()
      ) {
        return;
      }

      running = true;
      try {
        const result = await CloudSyncService.pullTeacherChanges(dbRef.current);
        if (
          !cancelled &&
          (result.attendanceAdded > 0 ||
            result.gradesChanged > 0 ||
            result.gradeConflicts > 0)
        ) {
          StorageService.saveDatabase(result.db);
          dbRef.current = result.db;
          setDb(result.db);
          showToast(
            result.gradeConflicts > 0
              ? `Cloud : ${result.attendanceAdded} présence(s), ${result.gradesChanged} fiche(s) de notes mise(s) à jour, ${result.gradeConflicts} conflit(s) protégé(s).`
              : `Cloud : ${result.attendanceAdded} présence(s), ${result.gradesChanged} fiche(s) de notes mise(s) à jour.`,
            result.gradeConflicts > 0 ? 'info' : 'success'
          );
        }
        void CloudSyncService.ensureDailyBackup();
      } catch (error) {
        console.warn('Sekoly Cloud sync:', error);
      } finally {
        running = false;
      }
    };

    const resumeAfterReconnect = async () => {
      if (
        cancelled ||
        !CloudSyncService.isConnected() ||
        !CloudSyncService.getSchoolId()
      ) {
        return;
      }
      try {
        await CloudSyncService.syncLocalStructure(dbRef.current);
        await pull();
        showToast(
          'Connexion rétablie : les données locales ont été resynchronisées.',
          'success'
        );
      } catch (error) {
        console.warn('Sekoly Cloud reconnect:', error);
      }
    };

    void pull();
    const timer = window.setInterval(pull, 10000);
    window.addEventListener('online', resumeAfterReconnect);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('online', resumeAfterReconnect);
    };
  }, [showToast]);

  const handleNavigate = (tab: NavTab, entityId?: string) => {
    setCurrentTab(tab);
    setSelectedEntityId(entityId);
    if (tab !== 'finances') setPendingFinanceAction(null);
  };

  const handleQuickAction = (action: 'NEW_STUDENT' | 'NEW_PAYMENT' | 'NEW_GRADE') => {
    if (action === 'NEW_STUDENT') {
      setPendingFinanceAction(null);
      setCurrentTab('admissions');
    } else if (action === 'NEW_PAYMENT') {
      setPendingFinanceAction('NEW_PAYMENT');
      setCurrentTab('finances');
    } else {
      setPendingFinanceAction(null);
      setCurrentTab('academics');
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();

      if (key === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
      if (key === 'n') {
        event.preventDefault();
        handleQuickAction('NEW_STUDENT');
      }
      if (key === 'e') {
        event.preventDefault();
        handleQuickAction('NEW_PAYMENT');
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (currentTab === 'finances' && pendingFinanceAction) {
      const timer = window.setTimeout(() => setPendingFinanceAction(null), 0);
      return () => window.clearTimeout(timer);
    }
  }, [currentTab, pendingFinanceAction]);

  if (!isStartupReady) {
    return (
      <div className="app-startup" role="status" aria-live="polite">
        <div className="app-startup__card">
          <img src="/sekoly-app.svg" alt="" className="app-startup__logo" />
          <h1 className="app-startup__title">Sekoly</h1>
          <p className="app-startup__message">
            Chargement sécurisé des données de l’établissement…
          </p>
          <div className="app-startup__spinner" aria-hidden="true" />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {startupWarning && (
        <div className="sr-only" role="status" aria-live="polite">
          {startupWarning}
        </div>
      )}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => handleNavigate(tab)}
        db={db}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((value) => !value)}
      />

      <div className="app-workspace">
        <Header
          db={db}
          onUpdateDb={setDb}
          currentTab={currentTab}
          isDark={isDark}
          onToggleTheme={() => setIsDark((value) => !value)}
          onToggleSidebar={() => setIsSidebarCollapsed((value) => !value)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onQuickAction={handleQuickAction}
        />

        <main className="app-main">
          <div className="app-content">
            <Suspense fallback={<ViewLoading />}>
            {currentTab === 'dashboard' && (
              <DashboardHome db={db} onNavigate={handleNavigate} />
            )}
            {currentTab === 'admissions' && (
              <RegistrationView db={db} onUpdateDb={setDb} onShowToast={showToast} />
            )}
            {currentTab === 'students' && (
              <StudentListView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
                onOpenNewAdmission={() => setCurrentTab('admissions')}
                initialSelectedStudentId={selectedEntityId}
              />
            )}
            {currentTab === 'academics' && (
              <GradesAndReportCardsView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
                initialClassId={selectedEntityId}
              />
            )}
            {currentTab === 'finances' && (
              <FinancesManagerView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
                initialAction={pendingFinanceAction || undefined}
                initialPaymentId={selectedEntityId}
              />
            )}
            {currentTab === 'schedule' && (
              <TimetableView db={db} onUpdateDb={setDb} onShowToast={showToast} />
            )}
            {currentTab === 'attendance' && (
              <AttendanceManagerView db={db} onUpdateDb={setDb} onShowToast={showToast} />
            )}
            {currentTab === 'teachers' && (
              <TeachersManagerView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
                initialTeacherId={selectedEntityId}
              />
            )}
            {currentTab === 'settings' && (
              <GeneralSettingsView db={db} onUpdateDb={setDb} onShowToast={showToast} />
            )}
            </Suspense>
          </div>
        </main>
      </div>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        db={db}
        onNavigate={handleNavigate}
      />

      <ToastContainer
        toasts={toasts}
        onRemove={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))}
      />
    </div>
  );
}

export default App;
