// EduGasy Pro - Desktop Application Status Bar
import React from 'react';
import { Database, ShieldCheck, Users, CheckCircle2, Clock } from 'lucide-react';
import { DatabaseSchema } from '../../types/school';
import { CalculationService } from '../../services/calculations';

interface DesktopStatusBarProps {
  db: DatabaseSchema;
}

export const DesktopStatusBar: React.FC<DesktopStatusBarProps> = ({ db }) => {
  const metrics = CalculationService.computeFinancialMetrics(db);
  const activeYear = db.schoolYears.find((y) => y.id === db.currentSchoolYearId);

  return (
    <footer className="h-6 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 px-3 flex items-center justify-between select-none z-30">
      {/* Left: App Status & Database Engine */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-1.5 text-slate-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>EduGasy Pro v2.4 (Système Autonome Local)</span>
        </div>

        <div className="hidden sm:flex items-center space-x-1 text-slate-400">
          <span>Session :</span>
          <strong className="text-slate-200">{activeYear?.label}</strong>
          <span>({db.currentTermCode === 'TRIMESTRE_1' ? 'T1' : db.currentTermCode === 'TRIMESTRE_2' ? 'T2' : 'T3'})</span>
        </div>
      </div>

      {/* Right: Key counts & Treasury balance */}
      <div className="flex items-center space-x-4">
        <div className="hidden md:flex items-center space-x-1">
          <span>Effectif :</span>
          <strong className="text-slate-200 font-mono">{db.students.length}</strong>
        </div>

        <div className="hidden md:flex items-center space-x-1">
          <span>Enseignants :</span>
          <strong className="text-slate-200 font-mono">{db.teachers.length}</strong>
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
