import React from 'react';
import {
  GraduationCap,
  Users,
  Wallet,
  Building,
  Receipt,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { DatabaseSchema } from '../../types/school';
import { CalculationService } from '../../services/calculations';
import { Campus3DVisualizer } from '../3d/Campus3DVisualizer';
import { NavTab } from '../layout/Sidebar';

interface DashboardHomeProps {
  db: DatabaseSchema;
  onNavigate: (tab: NavTab) => void;
  isDark: boolean;
  show3DVisualizer: boolean;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({
  db,
  onNavigate,
  isDark,
  show3DVisualizer,
}) => {
  const metrics = CalculationService.computeFinancialMetrics(db);
  const activeStudents = db.students.filter((s) => s.schoolYearId === db.currentSchoolYearId);
  const totalStudents = activeStudents.length;
  const boys = activeStudents.filter((s) => s.gender === 'M').length;
  const girls = activeStudents.filter((s) => s.gender === 'F').length;

  const totalClasses = db.classes.length;
  const totalTeachers = db.teachers.length;
  const titulaireCount = db.teachers.filter((t) => t.contractType === 'TITULAIRE').length;
  const vacataireCount = db.teachers.filter((t) => t.contractType === 'VACATAIRE').length;

  const studentsByLevel = (level: 'primaire' | 'college' | 'lycee') =>
    activeStudents.filter((s) => {
      const cls = db.classes.find((c) => c.id === s.classId);
      return cls?.level === level;
    }).length;

  const termName =
    db.currentTermCode === 'TRIMESTRE_1'
      ? '1er Trimestre'
      : db.currentTermCode === 'TRIMESTRE_2'
      ? '2ème Trimestre'
      : '3ème Trimestre';

  // Compute top performing students for active term
  const allSummaries = db.classes.flatMap((c) =>
    CalculationService.generateClassReportCards(db, c.id, db.currentTermCode, db.currentSchoolYearId)
  );
  const topStudents = allSummaries
    .filter((summary) => summary.totalCoefficients > 0)
    .sort((a, b) => b.generalAverage - a.generalAverage)
    .slice(0, 5);

  const recentPayments = db.tuitionPayments
    .filter((payment) => payment.schoolYearId === db.currentSchoolYearId)
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
    .slice(0, 5);

  const studentMap = new Map(db.students.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Effectif total */}
        <div
          onClick={() => onNavigate('students')}
          className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm hover:border-blue-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Effectif Total</span>
            <GraduationCap className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {totalStudents}
            </span>
            <span className="text-xs text-slate-500">élèves inscrits</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] text-slate-500">
            <span>Garçons : <strong className="text-slate-700 dark:text-slate-300">{boys}</strong></span>
            <span>Filles : <strong className="text-slate-700 dark:text-slate-300">{girls}</strong></span>
          </div>
        </div>

        {/* Classes */}
        <div
          onClick={() => onNavigate('academics')}
          className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm hover:border-blue-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Divisions & Classes</span>
            <Building className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {totalClasses}
            </span>
            <span className="text-xs text-slate-500">classes actives</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] text-slate-500">
            <span>Lycée : <strong>{studentsByLevel('lycee')}</strong></span>
            <span>Collège : <strong>{studentsByLevel('college')}</strong></span>
            <span>Primaire : <strong>{studentsByLevel('primaire')}</strong></span>
          </div>
        </div>

        {/* Enseignants */}
        <div
          onClick={() => onNavigate('teachers')}
          className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm hover:border-blue-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Corps Enseignant</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {totalTeachers}
            </span>
            <span className="text-xs text-slate-500">professeurs</span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] text-slate-500">
            <span>Titulaires : <strong>{titulaireCount}</strong></span>
            <span>Vacataires : <strong>{vacataireCount}</strong></span>
          </div>
        </div>

        {/* Trésorerie */}
        <div
          onClick={() => onNavigate('finances')}
          className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm hover:border-blue-500 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase text-[10px] tracking-wider">Solde Trésorerie</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {CalculationService.formatAriary(metrics.netTreasuryBalance)}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] text-slate-500">
            <span className="text-emerald-600 flex items-center">
              +{CalculationService.formatAriary(metrics.grandTotalRevenues)}
            </span>
            <span className="text-rose-600 flex items-center">
              -{CalculationService.formatAriary(metrics.grandTotalExpenses)}
            </span>
          </div>
        </div>
      </div>

      {/* Vue 3D du campus (activable) */}
      {show3DVisualizer && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-900">
          <Campus3DVisualizer db={db} isDark={isDark} />
        </div>
      )}

      {/* Palmarès et effectifs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Palmarès académique */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-xs uppercase tracking-wide text-slate-800 dark:text-slate-200 m-0">
                  Palmarès Académique — Meilleurs Résultats ({termName})
                </h3>
              </div>
              <button
                onClick={() => onNavigate('academics')}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                Tous les bulletins →
              </button>
            </div>

            {topStudents.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                  Aucune note saisie pour le moment. Le palmarès apparaîtra dès la saisie des notes du trimestre.
                </p>
                <button
                  onClick={() => onNavigate('academics')}
                  className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                >
                  Saisir des notes
                </button>
              </div>
            ) : (
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">Rang</th>
                  <th>Matricule</th>
                  <th>Nom & Prénoms</th>
                  <th>Classe</th>
                  <th className="text-right">Moyenne / 20</th>
                  <th>Distinction</th>
                </tr>
              </thead>
              <tbody>
                {topStudents.map((item, idx) => (
                  <tr key={item.student.id}>
                    <td className="text-center font-bold font-mono">
                      <span
                        className={`inline-block w-5 h-5 leading-5 rounded text-[11px] ${
                          idx === 0
                            ? 'bg-amber-100 text-amber-900 font-extrabold'
                            : idx === 1
                            ? 'bg-slate-200 text-slate-800'
                            : 'bg-orange-100 text-orange-900'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="font-mono text-slate-500">{item.student.matricule}</td>
                    <td className="font-semibold text-slate-900 dark:text-white">
                      {item.student.lastName} {item.student.firstName}
                    </td>
                    <td>{item.schoolClass.name}</td>
                    <td className="text-right font-extrabold font-mono text-blue-600 dark:text-blue-400">
                      {item.generalAverage.toFixed(2)}
                    </td>
                    <td>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {item.honorMention}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>

          {/* Effectifs et tarifs par classe */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wide text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-2">
              Effectifs & Tarification par Classe
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {db.classes.map((cls) => {
                const count = activeStudents.filter((s) => s.classId === cls.id).length;
                return (
                  <div
                    key={cls.id}
                    onClick={() => onNavigate('academics')}
                    className="p-2.5 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-500 bg-slate-50 dark:bg-slate-800/40 cursor-pointer transition text-xs"
                  >
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                      <span>{cls.name}</span>
                      <span className="font-mono text-[10px] text-slate-500">{cls.serie || 'GEN'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Écolage : {CalculationService.formatAriary(cls.monthlyTuitionFee)}
                    </div>
                    <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1">
                      {count} / {cls.capacity} élèves
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Derniers règlements et informations établissement */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-xs uppercase tracking-wide text-slate-800 dark:text-slate-200 m-0">
                  Derniers Règlements de Caisse
                </h3>
              </div>
              <button
                onClick={() => onNavigate('finances')}
                className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
              >
                Journal →
              </button>
            </div>

            {recentPayments.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                  Aucun règlement enregistré pour l'instant.
                </p>
                <button
                  onClick={() => onNavigate('finances')}
                  className="mt-3 text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  Aller à la caisse
                </button>
              </div>
            ) : (
            <div className="space-y-2">
              {recentPayments.map((p) => {
                const stu = studentMap.get(p.studentId);
                return (
                  <div
                    key={p.id}
                    className="p-2 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                  >
                    <div className="flex justify-between">
                      <span className="font-bold text-slate-900 dark:text-white truncate">
                        {stu ? `${stu.lastName} ${stu.firstName}` : 'Élève'}
                      </span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {CalculationService.formatAriary(p.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>{p.receiptNumber}</span>
                      <span>{p.paymentDate} • {p.paymentMethod}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1 text-slate-600 dark:text-slate-300">
            <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Paramétrage de l'Établissement</span>
            </div>
            <div className="text-[11px]">
              <div>Code MEN : <span className="font-mono">{db.schoolConfig.menCode || 'Non renseigné'}</span></div>
              <div>CISCO : {db.schoolConfig.cisco}</div>
              <div>Direction : {db.schoolConfig.directorName}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
