// EduGasy Pro - Système Intégré de Gestion Scolaire (Desktop Architecture)
import React, { useState, useEffect } from 'react';
import { DatabaseSchema } from './types/school';
import { StorageService } from './services/storage';
import { DesktopMenuBar } from './components/layout/DesktopMenuBar';
import { DesktopStatusBar } from './components/layout/DesktopStatusBar';
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
  const [show3DVisualizer, setShow3DVisualizer] = useState(false); // Clean desktop default
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>(undefined);

  // Dark mode
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem('EDUGASY_THEME') === 'dark';
  });

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('EDUGASY_THEME', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('EDUGASY_THEME', 'light');
    }
  }, [isDark]);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, text, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleNavigate = (tab: NavTab, entityId?: string) => {
    setCurrentTab(tab);
    setSelectedEntityId(entityId);
  };

  const handleQuickAction = (action: 'NEW_STUDENT' | 'NEW_PAYMENT' | 'NEW_GRADE') => {
    if (action === 'NEW_STUDENT') {
      setCurrentTab('admissions');
    } else if (action === 'NEW_PAYMENT') {
      setCurrentTab('finances');
    } else if (action === 'NEW_GRADE') {
      setCurrentTab('academics');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans antialiased">
      {/* 1. Desktop Ribbon Menu Bar */}
      <DesktopMenuBar
        db={db}
        onUpdateDb={setDb}
        onNavigate={handleNavigate}
        onOpenNewAdmission={() => setCurrentTab('admissions')}
        onOpenNewPayment={() => setCurrentTab('finances')}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onShowToast={showToast}
      />

      {/* 2. Top Action Toolbar */}
      <Header
        db={db}
        onUpdateDb={setDb}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onQuickAction={handleQuickAction}
        show3DVisualizer={show3DVisualizer}
        onToggle3DVisualizer={() => setShow3DVisualizer(!show3DVisualizer)}
      />

      {/* 3. Main Split View: Left Sidebar + Center Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            setCurrentTab(tab);
            setSelectedEntityId(undefined);
          }}
          db={db}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Dynamic Main Workspace Pane */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-100 dark:bg-slate-950">
          <div className="max-w-7xl mx-auto">
            {currentTab === 'dashboard' && (
              <DashboardHome
                db={db}
                onNavigate={handleNavigate}
                onQuickAction={handleQuickAction}
                isDark={isDark}
                show3DVisualizer={show3DVisualizer}
              />
            )}

            {currentTab === 'admissions' && (
              <RegistrationView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
              />
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
              />
            )}

            {currentTab === 'schedule' && (
              <TimetableView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'teachers' && (
              <TeachersManagerView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
              />
            )}

            {currentTab === 'settings' && (
              <GeneralSettingsView
                db={db}
                onUpdateDb={setDb}
                onShowToast={showToast}
              />
            )}
          </div>
        </main>
      </div>

      {/* 4. Desktop Status Bar */}
      <DesktopStatusBar db={db} />

      {/* 5. Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        db={db}
        onNavigate={handleNavigate}
      />

      {/* 6. Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default App;
