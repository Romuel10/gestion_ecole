import React from 'react';
import { DatabaseSchema } from '../../types/school';
import { CalculationService } from '../../services/calculations';

interface DesktopStatusBarProps {
  db: DatabaseSchema;
}

export const DesktopStatusBar: React.FC<DesktopStatusBarProps> = ({ db }) => {
  const metrics = CalculationService.computeFinancialMetrics(db);
  const activeYear = db.schoolYears.find((y) => y.id === db.currentSchoolYearId);
  const activeStudentCount = db.students.filter((student) => student.schoolYearId === db.currentSchoolYearId).length;

  return (
    <footer className="h-6 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-[0.6875rem] text-slate-500 dark:text-slate-400 px-3 flex items-center justify-between select-none z-30">
      {/* État de l'application */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>EduGasy Pro v2.4 (Système Autonome Local)</span>
        </div>

        <div className="hidden sm:flex items-center space-x-1 text-slate-400">
          <span>Session :</span>
          <strong className="text-slate-800 dark:text-slate-200">{activeYear?.label}</strong>
          <span>({db.currentTermCode === 'TRIMESTRE_1' ? 'T1' : db.currentTermCode === 'TRIMESTRE_2' ? 'T2' : 'T3'})</span>
        </div>
      </div>

      {/* Effectifs et trésorerie */}
      <div className="flex items-center space-x-4">
        <div className="hidden md:flex items-center space-x-1">
          <span>Effectif :</span>
          <strong className="text-slate-800 dark:text-slate-200 font-mono">{activeStudentCount}</strong>
        </div>

        <div className="hidden md:flex items-center space-x-1">
          <span>Enseignants :</span>
          <strong className="text-slate-800 dark:text-slate-200 font-mono">{db.teachers.length}</strong>
        </div>

        <div className="flex items-center space-x-1">
          <span>Solde Caisse :</span>
          <strong className="text-emerald-400 font-mono font-bold">
            {CalculationService.formatAriary(metrics.netTreasuryBalance)}
          </strong>
        </div>
      </div>
    </footer>
  );
};
