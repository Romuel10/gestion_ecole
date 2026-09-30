import { formatDate } from './dateFormat';
import * as XLSX from 'xlsx';
import { DatabaseSchema } from '../types/school';
import { CalculationService } from './calculations';

export class ExcelExporterService {
  private static setWidths(sheet: XLSX.WorkSheet, widths: number[]) {
    sheet['!cols'] = widths.map((wch) => ({ wch }));
  }

  static exportStudents(db: DatabaseSchema): void {
    const classMap = new Map(db.classes.map((item) => [item.id, item.name]));
    const yearMap = new Map(db.schoolYears.map((item) => [item.id, item.label]));

    const rows = db.students.map((student) => ({
      Matricule: student.matricule,
      Nom: student.lastName,
      Prénoms: student.firstName,
      Sexe: student.gender,
      'Date de naissance': formatDate(student.birthDate, ''),
      'Lieu de naissance': student.birthPlace,
      Classe: classMap.get(student.classId) || student.classId,
      'Année scolaire': yearMap.get(student.schoolYearId) || student.schoolYearId,
      Statut: student.status,
      Père: student.fatherName || '',
      'Téléphone père': student.fatherPhone || '',
      Mère: student.motherName || '',
      'Téléphone mère': student.motherPhone || '',
      Tuteur: student.guardianName || '',
      'Téléphone urgence': student.emergencyPhone || '',
      Adresse: student.address || '',
      Ville: student.city || '',
      'Décision annuelle': student.councilDecision || '',
    }));

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    this.setWidths(sheet, [18, 20, 22, 8, 15, 22, 22, 16, 14, 24, 18, 24, 18, 24, 18, 30, 18, 28]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Élèves');

    const classRows = db.classes.map((schoolClass) => {
      const students = db.students.filter(
        (student) =>
          student.schoolYearId === db.currentSchoolYearId &&
          student.classId === schoolClass.id
      );
      return {
        Classe: schoolClass.name,
        Code: schoolClass.code,
        Niveau: schoolClass.level,
        Effectif: students.length,
        Capacité: schoolClass.capacity,
        'Taux occupation': schoolClass.capacity
          ? `${Math.round((students.length / schoolClass.capacity) * 100)}%`
          : '0%',
        'Écolage mensuel': schoolClass.monthlyTuitionFee,
      };
    });
    const classSheet = XLSX.utils.json_to_sheet(classRows);
    this.setWidths(classSheet, [26, 14, 14, 10, 10, 16, 18]);
    XLSX.utils.book_append_sheet(workbook, classSheet, 'Classes');

    const year = db.schoolYears.find((item) => item.id === db.currentSchoolYearId)?.label || 'annee';
    XLSX.writeFile(workbook, `ELEVES_${db.schoolConfig.acronym}_${year.replace(/\s+/g, '_')}.xlsx`);
  }

  static exportFinances(db: DatabaseSchema): void {
    const workbook = XLSX.utils.book_new();
    const studentMap = new Map(db.students.map((item) => [item.id, item]));
    const classMap = new Map(db.classes.map((item) => [item.id, item]));
    const teacherMap = new Map(db.teachers.map((item) => [item.id, item]));
    const metrics = CalculationService.computeFinancialMetrics(db);

    const payments = db.tuitionPayments
      .filter((payment) => payment.schoolYearId === db.currentSchoolYearId)
      .map((payment) => {
        const student = studentMap.get(payment.studentId);
        const schoolClass = classMap.get(payment.classId);
        return {
          Reçu: payment.receiptNumber,
          Date: formatDate(payment.paymentDate),
          Matricule: student?.matricule || '',
          Élève: student ? `${student.lastName} ${student.firstName}` : '',
          Classe: schoolClass?.name || '',
          'Type de frais': payment.feeType,
          Période: payment.monthTarget || '',
          'Montant brut': payment.totalDue,
          Remise: payment.discount,
          Encaissé: payment.amount,
          'Mode de paiement': payment.paymentMethod,
          Payeur: payment.payerName,
          Référence: payment.referenceNumber || '',
        };
      });
    const paymentSheet = XLSX.utils.json_to_sheet(payments);
    this.setWidths(paymentSheet, [18, 12, 18, 28, 22, 20, 18, 16, 14, 16, 18, 25, 20]);
    XLSX.utils.book_append_sheet(workbook, paymentSheet, 'Encaissements');

    const cashRows = db.cashTransactions
      .filter((item) => item.schoolYearId === db.currentSchoolYearId)
      .map((item) => ({
        Pièce: item.voucherNumber,
        Date: formatDate(item.date),
        Type: item.type,
        Catégorie: item.category,
        Montant: item.amount,
        Tiers: item.beneficiaryOrPayer,
        Description: item.description,
        Paiement: item.paymentMethod,
      }));
    const cashSheet = XLSX.utils.json_to_sheet(cashRows);
    this.setWidths(cashSheet, [20, 12, 12, 26, 16, 28, 40, 18]);
    XLSX.utils.book_append_sheet(workbook, cashSheet, 'Livre de caisse');

    const salaries = db.salaryPayments
      .filter((item) => item.schoolYearId === db.currentSchoolYearId)
      .map((item) => {
        const teacher = teacherMap.get(item.teacherId);
        return {
          Fiche: item.voucherNumber,
          Date: formatDate(item.paymentDate),
          Mois: item.month,
          Enseignant: teacher ? `${teacher.lastName} ${teacher.firstName}` : '',
          Contrat: item.contractType,
          Brut: item.grossSalary,
          Avances: item.advances,
          Primes: item.bonuses,
          CNaPS: item.cnapsDeduction,
          OSTIE: item.ostieDeduction,
          'Autres retenues': item.otherDeductions,
          Net: item.netSalary,
          Paiement: item.paymentMethod,
        };
      });
    const salarySheet = XLSX.utils.json_to_sheet(salaries);
    this.setWidths(salarySheet, [18, 12, 18, 28, 14, 14, 14, 14, 14, 14, 16, 16, 18]);
    XLSX.utils.book_append_sheet(workbook, salarySheet, 'Salaires');

    const summaryRows = [
      ['Indicateur', 'Montant'],
      ['Recettes totales', metrics.grandTotalRevenues],
      ['Écolages encaissés', metrics.totalTuitionCollected],
      ['Dépenses totales', metrics.grandTotalExpenses],
      ['Salaires payés', metrics.totalSalariesPaid],
      ['Solde de caisse', metrics.netTreasuryBalance],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    this.setWidths(summarySheet, [28, 20]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Synthèse');

    const year = db.schoolYears.find((item) => item.id === db.currentSchoolYearId)?.label || 'annee';
    XLSX.writeFile(workbook, `FINANCES_${db.schoolConfig.acronym}_${year.replace(/\s+/g, '_')}.xlsx`);
  }
}
