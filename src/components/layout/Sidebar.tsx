// EduGasy Pro - High-Density Enterprise Sidebar
import React from 'react';
import {
  LayoutDashboard,
  UserPlus,
  GraduationCap,
  FileSpreadsheet,
  Wallet,
  Calendar,
  Users,
  Settings,
  ChevronRight,
  CreditCard,
  Building,
} from 'lucide-react';
import { DatabaseSchema } from '../../types/school';

export type NavTab =
  | 'dashboard'
  | 'admissions'
  | 'students'
  | 'academics'
  | 'finances'
  | 'schedule'
  | 'teachers'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  db: DatabaseSchema;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  db,
  isCollapsed,
}) => {
  const sections = [
    {
      group: 'Pédagogie & Élèves',
      items: [
        { id: 'dashboard' as NavTab, label: 'Tableau de bord', icon: LayoutDashboard },
        { id: 'admissions' as NavTab, label: 'Inscriptions / Admissions', icon: UserPlus, badge: 'Nouveau' },
        { id: 'students' as NavTab, label: 'Fichier Élèves & Dossiers', icon: GraduationCap, badge: String(db.students.length) },
        { id: 'academics' as NavTab, label: 'Notes, Bulletins & Conseil', icon: FileSpreadsheet },
      ],
    },
    {
      group: 'Administration & Caisse',
      items: [
        { id: 'finances' as NavTab, label: 'Écolages & Salaires', icon: Wallet, badge: 'Caisse' },
        { id: 'schedule' as NavTab, label: 'Emplois du Temps', icon: Calendar },
        { id: 'teachers' as NavTab, label: 'Corps Enseignant', icon: Users, badge: String(db.teachers.length) },
      ],
    },
    {
      group: 'Système',
      items: [
        { id: 'settings' as NavTab, label: 'Paramétrage & Sauvegardes', icon: Settings },
      ],
    },
  ];

  return (
    <aside
      className={`bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col flex-shrink-0 transition-all duration-200 select-none ${
        isCollapsed ? 'w-16' : 'w-60 sm:w-64'
      }`}
    >
      {/* Sidebar Navigation Groups */}
      <div className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
        {sections.map((sec, sIdx) => (
          <div key={sec.group} className="space-y-1">
            {!isCollapsed && (
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {sec.group}
              </div>
            )}

            {sec.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-2 rounded text-xs transition ${
                    isActive
                      ? 'bg-blue-700 text-white font-bold shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {item.badge && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-medium ${
                            isActive ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* School Badge Footer */}
      {!isCollapsed && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-[11px] text-slate-400">
          <div className="font-bold text-slate-200 truncate">{db.schoolConfig.name}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{db.schoolConfig.city || 'Antananarivo'}</div>
        </div>
      )}
    </aside>
  );
};
