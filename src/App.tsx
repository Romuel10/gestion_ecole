import React, { useEffect, useState } from 'react';
import { DatabaseSchema } from './types/school';
import { StorageService } from './services/storage';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandPalette } from './components/layout/CommandPalette';
import { ToastContainer, ToastMessage } from './components/common/Toast';
import { DashboardHome } from './components/dashboard/DashboardHome';
import { RegistrationView } from './components/admissions/RegistrationView';
import { StudentListView } from './components/students/StudentListView';
import { GradesAndReportCardsView } from './components/academics/GradesAndReportCardsView';
import { FinancesManagerView } from './components/finances/FinancesManagerView';
import { TimetableView } from './components/schedule/TimetableView';
import { TeachersManagerView } from './components/teachers/TeachersManagerView';
import { GeneralSettingsView } from './components/settings/GeneralSettingsView';

export function App() {
  const [db, setDb] = useState<DatabaseSchema>(() => StorageService.loadDatabase());
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>();
  const [pendingFinanceAction, setPendingFinanceAction] = useState<'NEW_PAYMENT' | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('EDUGASY_THEME');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('EDUGASY_THEME', isDark ? 'dark' : 'light');
  }, [isDark]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToasts((current) => [
      ...current,
      { id: `toast-${Date.now()}-${Math.random()}`, text, type },
    ]);
  };

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

  return (
    <div className="app-shell">
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
