import React from 'react';
import {
  LayoutDashboard,
  UserRoundPlus,
  UsersRound,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  WalletCards,
  GraduationCap,
  Settings2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { DatabaseSchema } from '../../types/school';

export type NavTab =
  | 'dashboard'
  | 'admissions'
  | 'students'
  | 'academics'
  | 'finances'
  | 'schedule'
  | 'attendance'
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
  onToggleCollapse,
}) => {
  const activeStudentCount = db.students.filter(
    (student) => student.schoolYearId === db.currentSchoolYearId
  ).length;

  const groups = [
    {
      label: 'Pilotage',
      items: [
        { id: 'dashboard' as NavTab, label: 'Tableau de bord', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Scolarité',
      items: [
        { id: 'admissions' as NavTab, label: 'Admissions', icon: UserRoundPlus },
        { id: 'students' as NavTab, label: 'Élèves', icon: UsersRound, count: activeStudentCount },
        { id: 'academics' as NavTab, label: 'Notes et bulletins', icon: BookOpenCheck },
        { id: 'schedule' as NavTab, label: 'Emploi du temps', icon: CalendarDays },
        { id: 'attendance' as NavTab, label: 'Vie scolaire', icon: ClipboardCheck },
      ],
    },
    {
      label: 'Administration',
      items: [
        { id: 'teachers' as NavTab, label: 'Enseignants', icon: GraduationCap, count: db.teachers.length },
        { id: 'finances' as NavTab, label: 'Finances', icon: WalletCards },
        { id: 'settings' as NavTab, label: 'Paramètres', icon: Settings2 },
      ],
    },
  ];

  return (
    <aside
      className={`app-sidebar ${isCollapsed ? 'app-sidebar--collapsed' : ''}`}
      aria-label="Navigation principale"
    >
      <div className="app-sidebar__brand">
        <div className="app-sidebar__mark">
          <img src="/sekoly-app.svg" alt="Sekoly" />
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <div className="app-sidebar__product">SEKOLY</div>
            <div className="app-sidebar__school">
              {db.schoolConfig.name === 'Nouvel établissement'
                ? "Gestion d'établissement"
                : db.schoolConfig.name}
            </div>
            <div className="app-sidebar__location">Logiciel local · Madagascar</div>
          </div>
        )}
      </div>

      <nav className="app-sidebar__nav">
        {groups.map((group) => (
          <div key={group.label} className="app-sidebar__group">
            {!isCollapsed && <div className="app-sidebar__group-label">{group.label}</div>}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`app-sidebar__item ${active ? 'is-active' : ''}`}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={isCollapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="w-[17px] h-[17px] shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="app-sidebar__item-label">{item.label}</span>
                      {'count' in item && item.count !== undefined && (
                        <span className="app-sidebar__count">{item.count}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="app-sidebar__collapse"
          title={isCollapsed ? 'Déployer la navigation' : 'Réduire la navigation'}
          aria-label={isCollapsed ? 'Déployer la navigation' : 'Réduire la navigation'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4" />
              <span>Réduire</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
