import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DatabaseSchema } from './types/school';
import { StorageService } from './services/storage';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandPalette } from './components/layout/CommandPalette';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { CloudSyncService } from './services/cloudSync';
import { StartupScreen } from './components/startup/StartupScreen';
import { ViewErrorBoundary } from './components/common/ViewErrorBoundary';
import { needsFirstSetup } from './services/firstSetup';
const SchoolSetupWizard = lazy(() => import('./components/startup/SchoolSetupWizard').then(module => ({ default: module.SchoolSetupWizard })));

const RegistrationView = lazy(() => import('./components/admissions/RegistrationView').then((module) => ({ default: module.RegistrationView })));
const StudentListView = lazy(() => import('./components/students/StudentListView').then((module) => ({ default: module.StudentListView })));
const GradesAndReportCardsView = lazy(() => import('./components/academics/GradesAndReportCardsView').then((module) => ({ default: module.GradesAndReportCardsView })));
const FinancesManagerView = lazy(() => import('./components/finances/FinancesManagerView').then((module) => ({ default: module.FinancesManagerView })));
const TimetableView = lazy(() => import('./components/schedule/TimetableView').then((module) => ({ default: module.TimetableView })));
const AttendanceManagerView = lazy(() => import('./components/attendance/AttendanceManagerView').then((module) => ({ default: module.AttendanceManagerView })));
const TeachersManagerView = lazy(() => import('./components/teachers/TeachersManagerView').then((module) => ({ default: module.TeachersManagerView })));
const GeneralSettingsView = lazy(() => import('./components/settings/GeneralSettingsView').then((module) => ({ default: module.GeneralSettingsView })));

export function App() {
  const [db, setDb] = useState<DatabaseSchema>(() => StorageService.loadDatabase());
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>();
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [pendingFinanceAction, setPendingFinanceAction] = useState<'NEW_PAYMENT' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const dbRef = useRef(db);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [showStartup, setShowStartup] = useState(true);
  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToasts((current) => [...current, { id: crypto.randomUUID(), text, type }]);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const [isDark, setIsDark] = useState<boolean>(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem('SEKOLY_THEME'); } catch { /* Browser storage may be unavailable. */ }
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    let mounted = true;

    StorageService.hydrateDesktopDatabase().then((desktopDb) => {
      if (!mounted) return;
      if (desktopDb) {
        dbRef.current = desktopDb;
        setDb(desktopDb);
      }
      setDatabaseReady(true);
    }).catch((error: unknown) => {
      if (mounted) setStartupError(error instanceof Error ? error.message : 'Chargement impossible.');
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try { localStorage.setItem('SEKOLY_THEME', isDark ? 'dark' : 'light'); } catch { /* The current theme still works for this session. */ }
  }, [isDark]);

  useEffect(() => {
    if (!databaseReady) return;
    let backupError = '';
    const backup = async () => {
      try { await StorageService.ensureDailyLocalBackup(); backupError = ''; }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message !== backupError) showToast(`Copie locale quotidienne impossible : ${message}. Exportez une sauvegarde complète.`, 'error');
        backupError = message;
      }
    };
    void backup();
    const timer = window.setInterval(backup, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [databaseReady, showToast]);

  useEffect(() => {
    if (!databaseReady) return;
    let cancelled = false;
    let running = false;
    let lastSyncError = '';
    let lastBackupError = '';

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
        const base = StorageService.getCurrentDatabase();
        const result = await CloudSyncService.pullTeacherChanges(base);
        if (
          !cancelled &&
          (result.attendanceAdded > 0 ||
            result.gradesChanged > 0 ||
            result.gradeConflicts > 0)
        ) {
          const saved = await StorageService.saveDatabase(result.db, base, true);
          dbRef.current = saved;
          setDb(saved);
          result.commitCursor?.();
          showToast(
            result.gradeConflicts > 0
              ? `Cloud : ${result.attendanceAdded} présence(s), ${result.gradesChanged} fiche(s) de notes mise(s) à jour, ${result.gradeConflicts} conflit(s) protégé(s).`
              : `Cloud : ${result.attendanceAdded} présence(s), ${result.gradesChanged} fiche(s) de notes mise(s) à jour.`,
            result.gradeConflicts > 0 ? 'info' : 'success'
          );
        }
        lastSyncError = '';
        try { await CloudSyncService.ensureDailyBackup(); lastBackupError = ''; }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message !== lastBackupError) showToast(`Sauvegarde Cloud scolaire impossible : ${message}. La copie JSON complète reste nécessaire pour la comptabilité.`, 'error');
          lastBackupError = message;
        }
      } catch (error) {
        console.warn('Sekoly Cloud sync:', error);
        const message = error instanceof Error ? error.message : String(error);
        if (!cancelled && message !== lastSyncError) showToast(`Synchronisation interrompue : ${message}`, 'error');
        lastSyncError = message;
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
  }, [databaseReady, showToast]);

  const handleNavigate = (tab: NavTab, entityId?: string) => {
    if (window.matchMedia('(max-width: 900px)').matches) setIsSidebarCollapsed(true);
    setCurrentTab(tab);
    setSelectedEntityId(entityId);
    if (entityId) setNavigationRevision((revision) => revision + 1);
    if (tab !== 'finances') setPendingFinanceAction(null);
  };

  const handleQuickAction = (action: 'NEW_STUDENT' | 'NEW_PAYMENT' | 'NEW_GRADE') => {
    setSelectedEntityId(undefined);
    if (window.matchMedia('(max-width: 900px)').matches) setIsSidebarCollapsed(true);
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
      if (!databaseReady || showStartup || needsFirstSetup(dbRef.current) || event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
      // Never navigate away from a form or a dialog through a global shortcut.
      const inDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      const editing = event.target instanceof HTMLElement && Boolean(event.target.closest('input, textarea, select, [contenteditable="true"]'));
      if (inDialog || (editing && event.key.toLowerCase() !== 'k')) return;
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
  }, [databaseReady, showStartup]);

  if (showStartup) {
    return <StartupScreen ready={databaseReady} error={startupError} onFinish={() => setShowStartup(false)} />;
  }

  if (needsFirstSetup(db)) return <>
    <ViewErrorBoundary><Suspense fallback={<div role="status" className="p-8">Ouverture de l’assistant…</div>}>
      <SchoolSetupWizard db={db} onUpdateDb={setDb} onComplete={saved => { setDb(saved); setCurrentTab('dashboard'); }} onShowToast={showToast} isDark={isDark} onToggleTheme={() => setIsDark(value => !value)} />
    </Suspense></ViewErrorBoundary>
    <ToastContainer toasts={toasts} onRemove={removeToast} />
  </>;

  return (
    <div className="app-shell">
      {!isSidebarCollapsed && <button className="sidebar-backdrop" aria-label="Fermer la navigation" onClick={() => setIsSidebarCollapsed(true)} />}
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
          onShowToast={showToast}
          isDark={isDark}
          onToggleTheme={() => setIsDark((value) => !value)}
          sidebarExpanded={!isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((value) => !value)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onQuickAction={handleQuickAction}
        />

        <main className="app-main" id="main-content" key={`${currentTab}-${db.currentSchoolYearId}-${navigationRevision}`}>
          <div className="app-content">
            <ViewErrorBoundary key={`${currentTab}-${db.currentSchoolYearId}-${navigationRevision}`}>
            <Suspense fallback={<div className="page-panel p-6" role="status">Ouverture du module…</div>}>
            {currentTab === 'dashboard' && (
              <DashboardHome db={db} onNavigate={handleNavigate} />
            )}
            {currentTab === 'admissions' && (
              <RegistrationView db={db} onUpdateDb={setDb} onShowToast={showToast} onConfigureSchool={() => handleNavigate('settings')} />
            )}
            {currentTab === 'students' && (
              <StudentListView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
                onOpenNewAdmission={() => handleNavigate('admissions')}
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
                onInitialActionHandled={() => setPendingFinanceAction(null)}
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
            </ViewErrorBoundary>
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
        onRemove={removeToast}
      />
    </div>
  );
}

export default App;
