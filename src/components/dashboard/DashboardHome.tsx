import { formatDate } from '../../services/dateFormat';
import React from 'react';
import { ChevronRight } from 'lucide-react';
import { DatabaseSchema } from '../../types/school';
import { CalculationService } from '../../services/calculations';
import { NavTab } from '../layout/Sidebar';

interface DashboardHomeProps {
  db: DatabaseSchema;
  onNavigate: (tab: NavTab, entityId?: string) => void;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ db, onNavigate }) => {
  const metrics = CalculationService.computeFinancialMetrics(db);
  const activeYear = db.schoolYears.find((year) => year.id === db.currentSchoolYearId);
  const activeTerm = activeYear?.terms.find((term) => term.code === db.currentTermCode);
  const activeStudents = db.students.filter(
    (student) => student.schoolYearId === db.currentSchoolYearId
  );

  const allSummaries = db.classes.flatMap((schoolClass) =>
    CalculationService.generateClassReportCards(
      db,
      schoolClass.id,
      db.currentTermCode,
      db.currentSchoolYearId
    )
  );
  const gradedSummaries = allSummaries.filter((summary) => summary.totalCoefficients > 0);
  const classAverage =
    gradedSummaries.length > 0
      ? gradedSummaries.reduce((sum, summary) => sum + summary.generalAverage, 0) /
        gradedSummaries.length
      : 0;

  const recentPayments = db.tuitionPayments
    .filter((payment) => payment.schoolYearId === db.currentSchoolYearId)
    .sort(
      (a, b) =>
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
    )
    .slice(0, 7);

  const studentMap = new Map(db.students.map((student) => [student.id, student]));

  return (
    <div className="space-y-4">
      <div className="dashboard-summary">
        <button type="button" onClick={() => onNavigate('students')} className="dashboard-summary__cell">
          <span className="dashboard-summary__label">Élèves inscrits</span>
          <strong>{activeStudents.length}</strong>
          <small>{activeYear?.label || 'Année active'} · {db.classes.length} classes</small>
        </button>
        <button type="button" onClick={() => onNavigate('teachers')} className="dashboard-summary__cell">
          <span className="dashboard-summary__label">Enseignants</span>
          <strong>{db.teachers.length}</strong>
          <small>{db.teachers.filter((teacher) => teacher.contractType === 'TITULAIRE').length} titulaires</small>
        </button>
        <button type="button" onClick={() => onNavigate('academics')} className="dashboard-summary__cell">
          <span className="dashboard-summary__label">Moyenne générale</span>
          <strong>{gradedSummaries.length > 0 ? classAverage.toFixed(2) : '—'}</strong>
          <small>{activeTerm?.label || 'Période active'} · {gradedSummaries.length} bulletins</small>
        </button>
        <button type="button" onClick={() => onNavigate('finances')} className="dashboard-summary__cell">
          <span className="dashboard-summary__label">Solde de caisse</span>
          <strong className="text-[1.125rem]">{CalculationService.formatAriary(metrics.netTreasuryBalance)}</strong>
          <small>Recettes {CalculationService.formatAriary(metrics.grandTotalRevenues)}</small>
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.65fr_1fr] gap-4">
        <section className="page-panel overflow-hidden">
          <div className="page-panel__header">
            <div>
              <h2 className="page-panel__title">Répartition des classes</h2>
              <p className="page-panel__subtitle">Effectif, capacité et frais mensuels</p>
            </div>
            <button type="button" onClick={() => onNavigate('settings')} className="button button--secondary">
              Paramétrer
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Niveau</th>
                  <th>Effectif</th>
                  <th>Capacité</th>
                  <th>Occupation</th>
                  <th className="text-right">Écolage</th>
                </tr>
              </thead>
              <tbody>
                {db.classes.map((schoolClass) => {
                  const count = activeStudents.filter(
                    (student) => student.classId === schoolClass.id
                  ).length;
                  const occupancy =
                    schoolClass.capacity > 0
                      ? Math.round((count / schoolClass.capacity) * 100)
                      : 0;
                  return (
                    <tr
                      key={schoolClass.id}
                      onClick={() => onNavigate('academics', schoolClass.id)}
                      className="cursor-pointer"
                    >
                      <td className="font-semibold">{schoolClass.name}</td>
                      <td className="capitalize text-slate-500">{schoolClass.level}</td>
                      <td>{count}</td>
                      <td>{schoolClass.capacity}</td>
                      <td>
                        <div className="flex items-center gap-2 min-w-[110px]">
                          <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div
                              className="h-full bg-slate-600 dark:bg-slate-300"
                              style={{ width: `${Math.min(occupancy, 100)}%` }}
                            />
                          </div>
                          <span className="text-[0.625rem] text-slate-500 w-8 text-right">{occupancy}%</span>
                        </div>
                      </td>
                      <td className="text-right font-mono">
                        {CalculationService.formatAriary(schoolClass.monthlyTuitionFee)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="page-panel overflow-hidden">
          <div className="page-panel__header">
            <div>
              <h2 className="page-panel__title">Derniers encaissements</h2>
              <p className="page-panel__subtitle">Année scolaire active</p>
            </div>
            <button type="button" onClick={() => onNavigate('finances')} className="text-[0.6875rem] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white">
              Voir tout
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {recentPayments.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">Aucun encaissement enregistré.</div>
            ) : (
              recentPayments.map((payment) => {
                const student = studentMap.get(payment.studentId);
                return (
                  <button
                    type="button"
                    key={payment.id}
                    onClick={() => onNavigate('finances', payment.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.71875rem] font-semibold text-slate-900 dark:text-white truncate">
                        {student ? `${student.lastName} ${student.firstName}` : 'Élève'}
                      </div>
                      <div className="mt-0.5 text-[0.625rem] text-slate-500">
                        {payment.receiptNumber} · {formatDate(payment.paymentDate)}
                      </div>
                    </div>
                    <div className="text-[0.6875rem] font-mono font-semibold">
                      {CalculationService.formatAriary(payment.amount)}
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      <section className="page-panel overflow-hidden">
        <div className="page-panel__header">
          <div>
            <h2 className="page-panel__title">Suivi académique</h2>
            <p className="page-panel__subtitle">
              {activeTerm?.label || 'Période active'} · résultats disponibles
            </p>
          </div>
          <button type="button" onClick={() => onNavigate('academics')} className="button button--secondary">
            Ouvrir les résultats
          </button>
        </div>

        {gradedSummaries.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-500">
            Les indicateurs académiques apparaîtront après la première saisie de notes.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>Classe</th>
                  <th className="text-right">Moyenne</th>
                  <th>Appréciation</th>
                </tr>
              </thead>
              <tbody>
                {[...gradedSummaries]
                  .sort((a, b) => b.generalAverage - a.generalAverage)
                  .slice(0, 8)
                  .map((summary) => (
                    <tr key={summary.studentId}>
                      <td className="font-semibold">
                        {summary.student.lastName} {summary.student.firstName}
                      </td>
                      <td>{summary.schoolClass.name}</td>
                      <td className="text-right font-mono font-semibold">
                        {summary.generalAverage.toFixed(2)} / 20
                      </td>
                      <td className="text-slate-500">{summary.honorMention}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
