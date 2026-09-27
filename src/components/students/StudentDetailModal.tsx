import React, { useState } from 'react';
import {
  Phone,
  MapPin,
  FileSpreadsheet,
  Printer,
  HeartPulse,
} from 'lucide-react';
import { DatabaseSchema, Student } from '../../types/school';
import { Modal } from '../common/Modal';
import { CalculationService } from '../../services/calculations';
import { PdfGeneratorService } from '../../services/pdfGenerator';

interface StudentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  db: DatabaseSchema;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  isOpen,
  onClose,
  student,
  db,
}) => {
  const [tab, setTab] = useState<'INFO' | 'GRADES' | 'FINANCES' | 'ATTENDANCE'>('INFO');

  if (!student) return null;

  const currentClass = db.classes.find((c) => c.id === student.classId);
  const studentYear = db.schoolYears.find((year) => year.id === student.schoolYearId);
  const studentPayments = db.tuitionPayments.filter(
    (payment) =>
      payment.studentId === student.id &&
      payment.schoolYearId === student.schoolYearId
  );
  const totalPaid = studentPayments.reduce((acc, p) => acc + p.amount, 0);

  // Compute the report card in the student's own enrollment year.
  const classSummaries = CalculationService.generateClassReportCards(
    db,
    student.classId,
    db.currentTermCode,
    student.schoolYearId
  );
  const studentSummary = classSummaries.find((s) => s.studentId === student.id);

  const studentAttendance = db.attendanceRecords.filter(
    (attendance) =>
      attendance.studentId === student.id &&
      (!studentYear ||
        (attendance.date >= studentYear.startDate && attendance.date <= studentYear.endDate))
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Dossier Scolaire — ${student.lastName} ${student.firstName}`}
      subtitle={`Matricule : ${student.matricule} • Classe : ${currentClass?.name || 'N/A'}`}
      maxWidth="4xl"
      actions={
        <div className="flex items-center space-x-2">
          <button
            onClick={() => PdfGeneratorService.generateEnrollmentCertificatePDF(student, db)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Certificat de Scolarité</span>
          </button>
          {studentSummary && (
            <button
              onClick={() => PdfGeneratorService.generateOfficialReportCardPDF(studentSummary, db)}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Imprimer Bulletin de Notes</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Top Mini Header with Avatar and Key Badges */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow">
              {student.firstName.charAt(0)}
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white m-0">
                {student.lastName} {student.firstName}
              </h4>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Né(e) le {student.birthDate} à {student.birthPlace || 'Madagascar'} ({student.gender === 'M' ? 'Masculin' : 'Féminin'})
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {currentClass?.name || 'Classe non assignée'}
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Statut : {student.status}
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-1 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            onClick={() => setTab('INFO')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              tab === 'INFO'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            État Civil & Parents
          </button>
          <button
            onClick={() => setTab('GRADES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              tab === 'GRADES'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Relevé de Notes & Rang
          </button>
          <button
            onClick={() => setTab('FINANCES')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              tab === 'FINANCES'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Écolages & Reçus ({studentPayments.length})
          </button>
          <button
            onClick={() => setTab('ATTENDANCE')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              tab === 'ATTENDANCE'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Assiduité & Discipline
          </button>
        </div>

        {/* TAB 1: INFO */}
        {tab === 'INFO' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5 text-blue-600 dark:text-blue-400">
                <MapPin className="w-3.5 h-3.5" />
                <span>Adresse & Localisation</span>
              </div>
              <div>
                <span className="text-slate-400">Adresse :</span>{' '}
                <strong className="text-slate-800 dark:text-slate-200">{student.address || 'Non renseigné'}</strong>
              </div>
              <div>
                <span className="text-slate-400">Fokontany / Ville :</span>{' '}
                <strong className="text-slate-800 dark:text-slate-200">{student.city || 'Antananarivo'}</strong>
              </div>
              <div>
                <span className="text-slate-400">Établissement d'origine :</span>{' '}
                <strong className="text-slate-800 dark:text-slate-200">{student.previousSchool || 'LPSM'}</strong>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-2.5">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5 text-purple-600 dark:text-purple-400">
                <Phone className="w-3.5 h-3.5" />
                <span>Parents & Contacts d'Urgence</span>
              </div>
              <div>
                <span className="text-slate-400">Père :</span>{' '}
                <strong>{student.fatherName || '-'}</strong> {student.fatherPhone && `(${student.fatherPhone})`}
              </div>
              <div>
                <span className="text-slate-400">Mère :</span>{' '}
                <strong>{student.motherName || '-'}</strong> {student.motherPhone && `(${student.motherPhone})`}
              </div>
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-400">Urgence :</span>{' '}
                <strong className="text-rose-600 dark:text-rose-400">{student.emergencyContact}</strong> —{' '}
                <span className="font-mono">{student.emergencyPhone}</span>
              </div>
            </div>

            <div className="md:col-span-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 space-y-2">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400">
                <HeartPulse className="w-3.5 h-3.5" />
                <span>Informations Médicales</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Groupe Sanguin :</span> <strong>{student.bloodType || 'Inconnu'}</strong>
                </div>
                <div>
                  <span className="text-slate-400">Remarques & Allergies :</span>{' '}
                  <strong>{student.medicalNotes || 'Aucune remarque'}</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GRADES */}
        {tab === 'GRADES' && (
          <div className="space-y-3">
            {studentSummary ? (
              <>
                <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs">
                  <div>
                    <span className="text-slate-500">Moyenne Générale : </span>
                    <strong className="text-base font-extrabold text-blue-600 dark:text-blue-400">
                      {studentSummary.generalAverage.toFixed(2)} / 20
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Rang : </span>
                    <strong className="font-bold text-slate-800 dark:text-slate-200">
                      {studentSummary.rank}e sur {studentSummary.classSize} élèves
                    </strong>
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      {studentSummary.honorMention}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-500">
                        <th className="py-2 px-3">Matière</th>
                        <th className="py-2 px-3 text-center">Coeff</th>
                        <th className="py-2 px-3 text-center">Contrôles</th>
                        <th className="py-2 px-3 text-center">Compo</th>
                        <th className="py-2 px-3 text-right">Moyenne</th>
                        <th className="py-2 px-3 text-right">Pts Pondérés</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {studentSummary.subjectDetails.map((sub) => (
                        <tr key={sub.subjectId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                            {sub.subjectName}
                          </td>
                          <td className="py-2 px-3 text-center">{sub.coefficient}</td>
                          <td className="py-2 px-3 text-center font-mono">
                            {sub.evaluations.length > 0 ? sub.evaluations.join(' | ') : '-'}
                          </td>
                          <td className="py-2 px-3 text-center font-mono">
                            {sub.examGrade !== undefined ? sub.examGrade.toFixed(1) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-blue-600 dark:text-blue-400">
                            {sub.average.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold">
                            {sub.weightedPoints.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Aucune note enregistrée pour cet élève sur le trimestre actif.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FINANCES */}
        {tab === 'FINANCES' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs">
              <div>
                <span className="text-slate-500">Total versé cette session : </span>
                <strong className="text-emerald-700 dark:text-emerald-300 font-bold">
                  {CalculationService.formatAriary(totalPaid)}
                </strong>
              </div>
              <div className="text-[11px] text-slate-400">
                {studentPayments.length} règlement(s) enregistré(s)
              </div>
            </div>

            {studentPayments.length > 0 ? (
              <div className="space-y-2">
                {studentPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {p.feeType.replace('_', ' ')} — {p.monthTarget}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Reçu : {p.receiptNumber} • {p.paymentDate} • {p.paymentMethod}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                        {CalculationService.formatAriary(p.amount)}
                      </span>
                      <button
                        onClick={() => PdfGeneratorService.generateTuitionReceiptPDF(p, db)}
                        className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200"
                        title="Réimprimer le reçu"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                Aucun versement enregistré.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ATTENDANCE */}
        {tab === 'ATTENDANCE' && (
          <div className="space-y-3">
            {studentAttendance.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {studentAttendance.map((att) => (
                  <div key={att.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{att.date}</span>
                      {att.reason && <div className="text-[11px] text-slate-400">{att.reason}</div>}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        att.type === 'PRESENT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : att.type === 'ABSENT_JUSTIFIE'
                          ? 'bg-amber-100 text-amber-800'
                          : att.type === 'ABSENT_NON_JUSTIFIE'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {att.type.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                Assiduité parfaite (0 absence enregistrée).
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
