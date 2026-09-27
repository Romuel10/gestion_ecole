import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DatabaseSchema, ReportCardSummary, TuitionPayment, SalaryPayment, Student } from '../types/school';
import { CalculationService } from './calculations';

export class PdfGeneratorService {
  private static addSchoolLogo(doc: jsPDF, db: DatabaseSchema, y = 5): void {
    const cfg = db.schoolConfig;
    if (!cfg.logoUrl) return;

    try {
      const properties = doc.getImageProperties(cfg.logoUrl);
      const requestedWidth = Math.min(40, Math.max(8, cfg.documentLogoWidthMm || 18));
      const ratio = properties.width / properties.height || 1;
      let width = requestedWidth;
      let height = width / ratio;
      const maxHeight = 11;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const position = cfg.documentLogoPosition || 'LEFT';
      const x =
        position === 'CENTER'
          ? (pageWidth - width) / 2
          : position === 'RIGHT'
          ? pageWidth - 14 - width
          : 14;

      const format = cfg.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(cfg.logoUrl, format, x, y, width, height, undefined, 'FAST');
    } catch {
      // A broken logo must never block generation of an official document.
    }
  }

  private static fillCertificateTemplate(
    template: string,
    student: Student,
    db: DatabaseSchema,
    className: string,
    schoolYearLabel: string
  ): string {
    const cfg = db.schoolConfig;
    const variables: Record<string, string> = {
      '{NOM_ET_PRENOMS}': `${student.lastName.toUpperCase()} ${student.firstName}`,
      '{MATRICULE}': student.matricule,
      '{DATE_NAISSANCE}': student.birthDate,
      '{LIEU_NAISSANCE}': student.birthPlace || 'Madagascar',
      '{CLASSE}': className,
      '{ANNEE_SCOLAIRE}': schoolYearLabel,
      '{DIRECTEUR}': cfg.directorName,
      '{FONCTION}': cfg.directorTitle,
      '{ETABLISSEMENT}': cfg.name,
      '{VILLE}': cfg.city,
    };

    return Object.entries(variables).reduce(
      (result, [token, value]) => result.split(token).join(value || ''),
      template
    );
  }

  /**
   * Generates and downloads an Official Report Card (Bulletin de Notes Madagascar)
   */
  static generateOfficialReportCardPDF(summary: ReportCardSummary, db: DatabaseSchema): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const cfg = db.schoolConfig;
    this.addSchoolLogo(doc, db);
    const yearObj = db.schoolYears.find(y => y.id === summary.schoolYearId);
    const yearLabel = yearObj?.label || 'Année scolaire';
    const termLabel =
      yearObj?.terms.find((term) => term.code === summary.termCode)?.label.toUpperCase() ||
      summary.termCode.replace(/_/g, ' ').toUpperCase();

    // Official Madagascar Top Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text("REPOBLIKAN'I MADAGASIKARA", 105, 12, { align: 'center' });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text("Fitiavana - Tanindrazana - Fandrosoana", 105, 16, { align: 'center' });

    // Ministry & CISCO left side
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text("MINISTÈRE DE L'ÉDUCATION NATIONALE", 14, 22);
    doc.text(cfg.dren || 'DREN ANALAMANGA', 14, 26);
    doc.text(cfg.cisco || 'CISCO ANTANANARIVO RENIVOHITRA', 14, 30);
    if (cfg.zap) doc.text(`ZAP : ${cfg.zap}`, 14, 34);

    // School Name & Details right side
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(cfg.name.toUpperCase(), 196, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(cfg.menCode || '', 196, 26, { align: 'right' });
    doc.text(cfg.address || '', 196, 30, { align: 'right' });
    doc.text(`Tél : ${cfg.phone || ''}`, 196, 34, { align: 'right' });

    // Decorative separator line
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.6);
    doc.line(14, 37, 196, 37);

    // Document Title Banner
    doc.setFillColor(30, 58, 138); // Deep Navy
    doc.rect(14, 40, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`BULLETIN DE NOTES OFFICIEL — ${termLabel} (${yearLabel})`, 105, 45.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Student Info Card Box
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 51, 182, 22, 2, 2, 'FD');

    doc.setFontSize(8);
    // Col 1
    doc.setFont('helvetica', 'bold');
    doc.text("Nom & Prénoms :", 18, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(`${summary.student.lastName.toUpperCase()} ${summary.student.firstName}`, 45, 56);

    doc.setFont('helvetica', 'bold');
    doc.text("Matricule :", 18, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(summary.student.matricule, 45, 62);

    doc.setFont('helvetica', 'bold');
    doc.text("Date & Lieu Naiss :", 18, 68);
    doc.setFont('helvetica', 'normal');
    doc.text(`${summary.student.birthDate} à ${summary.student.birthPlace || 'Madagascar'}`, 45, 68);

    // Col 2
    doc.setFont('helvetica', 'bold');
    doc.text("Classe :", 125, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(summary.schoolClass.name, 140, 56);

    doc.setFont('helvetica', 'bold');
    doc.text("Série / Filière :", 125, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(summary.schoolClass.serie || 'Générale', 150, 62);

    doc.setFont('helvetica', 'bold');
    doc.text("Effectif de la classe :", 125, 68);
    doc.setFont('helvetica', 'normal');
    doc.text(`${summary.classSize} élèves`, 158, 68);

    // Grades Table
    const tableBody = summary.subjectDetails.map(sub => [
      sub.subjectName,
      String(sub.coefficient),
      sub.evaluations.length > 0 ? sub.evaluations.map(e => e.toFixed(1)).join(' | ') : '-',
      sub.examGrade !== undefined ? sub.examGrade.toFixed(1) : '-',
      sub.average.toFixed(2),
      sub.weightedPoints.toFixed(2),
      `${sub.rankInSubject}e`,
      sub.classAvg.toFixed(2),
      sub.teacherComment || 'Bien',
    ]);

    autoTable(doc, {
      startY: 76,
      head: [
        ['DISCIPLINES / MATIÈRES', 'Coeff', 'C. Continus', 'Compo /20', 'Moy /20', 'Pts Pondérés', 'Rang', 'Moy Cls', 'Appréciation du Professeur'],
      ],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: 30,
      },
      columnStyles: {
        0: { cellWidth: 42, halign: 'left', fontStyle: 'bold' },
        1: { cellWidth: 12, halign: 'center' },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        6: { cellWidth: 12, halign: 'center' },
        7: { cellWidth: 14, halign: 'center' },
        8: { cellWidth: 26, halign: 'left' },
      },
      margin: { left: 14, right: 14 },
    });

    const lastY = (doc as any).lastAutoTable.finalY + 4;

    // Academic Summary & Discipline Cards side by side
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(14, lastY, 115, 34, 1.5, 1.5, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("BILAN DES RÉSULTATS DU TRIMESTRE", 18, lastY + 5);
    doc.line(18, lastY + 6.5, 120, lastY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.text(`Total des points obtenus :`, 18, lastY + 12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${summary.totalPoints.toFixed(2)} / ${(summary.totalCoefficients * 20).toFixed(0)}`, 70, lastY + 12);

    doc.setFont('helvetica', 'normal');
    doc.text(`Total des coefficients :`, 18, lastY + 17);
    doc.setFont('helvetica', 'bold');
    doc.text(`${summary.totalCoefficients}`, 70, lastY + 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`MOYENNE GÉNÉRALE :`, 18, lastY + 24);
    doc.setTextColor(30, 58, 138);
    doc.text(`${summary.generalAverage.toFixed(2)} / 20`, 70, lastY + 24);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`RANG : ${summary.rank}e sur ${summary.classSize} élèves`, 18, lastY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`(Moy. Cls: ${summary.classGeneralAverage.toFixed(2)} | Max: ${summary.classMaxAverage.toFixed(2)} | Min: ${summary.classMinAverage.toFixed(2)})`, 55, lastY + 30);

    // Discipline & Mention Box (Right)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(132, lastY, 64, 34, 1.5, 1.5, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("DISCIPLINE & DISTINCTION", 136, lastY + 5);
    doc.line(136, lastY + 6.5, 192, lastY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.text(`Absences justifiées : ${summary.absencesJustified} demi-journée(s)`, 136, lastY + 12);
    doc.text(`Absences non justifiées : ${summary.absencesUnjustified}`, 136, lastY + 17);
    doc.text(`Retards signalés : ${summary.latenessCount}`, 136, lastY + 22);

    doc.setFont('helvetica', 'bold');
    doc.text("MENTION ATTRIBUÉE :", 136, lastY + 28);
    doc.setTextColor(5, 150, 105);
    doc.text(summary.honorMention, 136, lastY + 32);
    doc.setTextColor(0, 0, 0);

    // Signatures Area
    const signY = lastY + 40;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');

    doc.text("Le Professeur Principal", 25, signY);
    doc.text("Visa des Parents / Tuteurs", 95, signY);
    doc.text("Le Chef d'Établissement / Proviseur", 150, signY);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text("(Signature)", 32, signY + 15);
    doc.text("(Signature)", 105, signY + 15);
    doc.text(`Fait à ${cfg.city || 'Antananarivo'}, le ${new Date().toLocaleDateString('fr-FR')}`, 145, signY + 18);
    doc.text(`Dr. ${cfg.directorName || 'Le Proviseur'}`, 145, signY + 22);

    // Save and download
    const fileName = `BULLETIN_${summary.schoolClass.name.replace(/\s+/g, '_')}_${summary.student.lastName}_${summary.termCode}.pdf`;
    doc.save(fileName);
  }

  /**
   * Generates and downloads an Official Tuition Fee Payment Receipt (Reçu de Caisse Écolage)
   */
  static generateTuitionReceiptPDF(payment: TuitionPayment, db: DatabaseSchema): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [148, 210], // A5 Format
    });

    const cfg = db.schoolConfig;
    this.addSchoolLogo(doc, db, 4);
    const student = db.students.find(s => s.id === payment.studentId);
    const cls = db.classes.find(c => c.id === payment.classId);

    // Top Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(cfg.name.toUpperCase(), 74, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(cfg.motto, 74, 16, { align: 'center' });
    doc.text(`${cfg.address} - ${cfg.city} | Tél: ${cfg.phone}`, 74, 20, { align: 'center' });

    doc.setDrawColor(200, 200, 200);
    doc.line(10, 23, 138, 23);

    // Title Box
    doc.setFillColor(30, 58, 138);
    doc.rect(10, 26, 128, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`REÇU DE QUITTANCE N° ${payment.receiptNumber}`, 74, 31.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Details Grid
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(10, 38, 128, 56, 1.5, 1.5, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("Date de paiement :", 14, 44);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.paymentDate, 50, 44);

    doc.setFont('helvetica', 'bold');
    doc.text("Matricule Élève :", 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(student ? student.matricule : 'N/A', 50, 50);

    doc.setFont('helvetica', 'bold');
    doc.text("Nom & Prénom Élève :", 14, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(student ? `${student.lastName} ${student.firstName}` : 'Élève inconnu', 50, 56);

    doc.setFont('helvetica', 'bold');
    doc.text("Classe :", 14, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(cls ? cls.name : 'N/A', 50, 62);

    doc.setFont('helvetica', 'bold');
    doc.text("Motif du paiement :", 14, 68);
    doc.setFont('helvetica', 'normal');
    doc.text(`${payment.feeType.replace('_', ' ')} — ${payment.monthTarget || ''}`, 50, 68);

    doc.setFont('helvetica', 'bold');
    doc.text("Mode de règlement :", 14, 74);
    doc.setFont('helvetica', 'normal');
    doc.text(`${payment.paymentMethod} ${payment.referenceNumber ? `(Réf: ${payment.referenceNumber})` : ''}`, 50, 74);

    doc.setFont('helvetica', 'bold');
    doc.text("Versé par :", 14, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.payerName || 'Parent / Tuteur', 50, 80);

    doc.setFont('helvetica', 'bold');
    doc.text("Observations :", 14, 86);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.notes || 'Paiement régulier validé', 50, 86);

    if (payment.discount > 0) {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Montant brut : ${CalculationService.formatAriary(payment.totalDue)}  •  Remise : -${CalculationService.formatAriary(payment.discount)}`,
        14,
        93
      );
    }

    // Total Banner
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(10, 98, 128, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(4, 120, 87);
    doc.text("MONTANT TOTAL PERÇU :", 16, 107);
    doc.setFontSize(12);
    doc.text(CalculationService.formatAriary(payment.amount), 132, 107, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Signatures
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text("Signature du Payeur", 25, 122);
    doc.text("Cachet & Signature Caisse LPSM", 90, 122);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.text(`Émis le ${payment.paymentDate} par ${payment.cashierName}`, 90, 136);

    doc.save(`RECU_${payment.receiptNumber}.pdf`);
  }

  /**
   * Generates and downloads a Teacher / Staff Payslip (Fiche de Paie / Bulletin de Salaire)
   */
  static generateSalaryPayslipPDF(salary: SalaryPayment, db: DatabaseSchema): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const cfg = db.schoolConfig;
    this.addSchoolLogo(doc, db, 4);
    const teacher = db.teachers.find(t => t.id === salary.teacherId);

    // Top Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(cfg.name.toUpperCase(), 14, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${cfg.address} - ${cfg.city}`, 14, 20);
    doc.text(`N° Employeur / Code MEN : ${cfg.menCode}`, 14, 25);

    // Title
    doc.setFillColor(30, 58, 138);
    doc.rect(14, 32, 182, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text(`BULLETIN DE PAIE — MOIS DE ${salary.month.toUpperCase()}`, 105, 37.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    // Employee & School Info
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 44, 182, 28, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("Nom & Prénoms :", 18, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(teacher ? `${teacher.lastName.toUpperCase()} ${teacher.firstName}` : 'Enseignant', 50, 50);

    doc.setFont('helvetica', 'bold');
    doc.text("Matricule Enseignant :", 18, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(teacher ? teacher.matricule : 'N/A', 50, 56);

    doc.setFont('helvetica', 'bold');
    doc.text("Statut Contractuel :", 18, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(salary.contractType, 50, 62);

    doc.setFont('helvetica', 'bold');
    doc.text("N° CIN :", 18, 68);
    doc.setFont('helvetica', 'normal');
    doc.text(teacher?.cinNumber || 'N/A', 50, 68);

    doc.setFont('helvetica', 'bold');
    doc.text("Période :", 125, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(salary.month, 150, 50);

    doc.setFont('helvetica', 'bold');
    doc.text("Date de paiement :", 125, 56);
    doc.setFont('helvetica', 'normal');
    doc.text(salary.paymentDate, 155, 56);

    doc.setFont('helvetica', 'bold');
    doc.text("Mode de règlement :", 125, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(salary.paymentMethod, 155, 62);

    // Salary Calculation Table
    const salaryRows = [
      [
        salary.contractType === 'TITULAIRE' ? 'Salaire de Base Mensuel' : `Vacations Enseignement (${salary.hoursWorked} heures × ${CalculationService.formatAriary(salary.baseSalaryOrRate)})`,
        CalculationService.formatAriary(salary.grossSalary),
        '-',
      ],
      ['Primes & Indemnités d\'ancienneté / assiduité', CalculationService.formatAriary(salary.bonuses), '-'],
      ['Avance sur salaire (Acompte quinzaine)', '-', CalculationService.formatAriary(salary.advances)],
      ['Cotisation CNaPS (Caisse Nationale de Prévoyance Sociale - 1%)', '-', CalculationService.formatAriary(salary.cnapsDeduction)],
      ['Cotisation Sanitaire OSTIE / FUNHRE (1%)', '-', CalculationService.formatAriary(salary.ostieDeduction)],
      ['Autres retenues diverses', '-', CalculationService.formatAriary(salary.otherDeductions)],
    ];

    autoTable(doc, {
      startY: 76,
      head: [['DÉSIGNATION DES RUBRIQUES SALARIALES', 'GAINS (BRUT)', 'RETENUES / DÉDUCTIONS']],
      body: salaryRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 41, halign: 'right' },
        2: { cellWidth: 41, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;

    // Net to Pay Box
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(16, 185, 129);
    doc.roundedRect(14, finalY, 182, 16, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text("NET À PAYER EN ARIARY :", 20, finalY + 10.5);
    doc.setFontSize(13);
    doc.text(CalculationService.formatAriary(salary.netSalary), 190, 10.5, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Signatures
    const sY = finalY + 30;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text("Signature du Salarié", 35, sY);
    doc.text("Pour l'Établissement (Direction & Caisse)", 130, sY);

    doc.save(`FICHE_PAIE_${salary.voucherNumber}.pdf`);
  }

  /**
   * Generates and downloads an Official Certificate of Enrollment (Certificat de Scolarité)
   */
  static generateEnrollmentCertificatePDF(student: Student, db: DatabaseSchema): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const cfg = db.schoolConfig;
    this.addSchoolLogo(doc, db);
    const studentYear = db.schoolYears.find(y => y.id === student.schoolYearId);
    const currentYear = studentYear?.label || 'Année scolaire';
    const certificateYear = studentYear?.startDate.slice(0, 4) || new Date().getFullYear().toString();
    const cls = db.classes.find(c => c.id === student.classId);

    // Official Madagascar Top Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text("REPOBLIKAN'I MADAGASIKARA", 105, 15, { align: 'center' });
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text("Fitiavana - Tanindrazana - Fandrosoana", 105, 20, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("MINISTÈRE DE L'ÉDUCATION NATIONALE", 14, 28);
    doc.text(cfg.dren || 'DREN ANALAMANGA', 14, 33);
    doc.text(cfg.cisco || 'CISCO ANTANANARIVO RENIVOHITRA', 14, 38);

    doc.setFont('helvetica', 'bold');
    doc.text(cfg.name.toUpperCase(), 196, 28, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(cfg.menCode || '', 196, 33, { align: 'right' });
    doc.text(cfg.address || '', 196, 38, { align: 'right' });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.8);
    doc.line(14, 43, 196, 43);

    // Document Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(cfg.certificateTitle || "CERTIFICAT DE SCOLARITÉ", 105, 60, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`N° Réf : CERT/${student.matricule}/${certificateYear}`, 105, 68, { align: 'center' });

    // Certificate Body Text
    const bodyY = 85;
    doc.setFontSize(11);
    doc.setLineHeightFactor(1.6);
    
    const defaultTemplate =
      "Je soussigné(e), {DIRECTEUR}, {FONCTION} de l'établissement {ETABLISSEMENT}, certifie que l'élève {NOM_ET_PRENOMS}, né(e) le {DATE_NAISSANCE} à {LIEU_NAISSANCE}, titulaire du matricule {MATRICULE}, est régulièrement inscrit(e) et fréquente les cours en classe de {CLASSE} au titre de l'année scolaire {ANNEE_SCOLAIRE}.\n\nEn foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.";

    const textBody = this.fillCertificateTemplate(
      cfg.certificateTemplate || defaultTemplate,
      student,
      db,
      cls?.name || 'Non assignée',
      currentYear
    );

    const splitText = doc.splitTextToSize(textBody, 170);
    doc.setDrawColor(190, 198, 208);
    doc.setLineWidth(0.3);
    doc.rect(15, 78, 180, Math.min(118, Math.max(70, splitText.length * 7 + 20)));
    doc.text(splitText, 20, bodyY);

    // Bottom Date & Official Seal
    const calculatedDateY = bodyY + splitText.length * 7 + 22;
    const dateY = Math.min(232, Math.max(175, calculatedDateY));
    const signatureX = 126;
    const signatureWidth = 66;
    const dateText = `Fait à ${cfg.city}, le ${new Date().toLocaleDateString('fr-FR')}`;
    const dateLines = doc.splitTextToSize(dateText, signatureWidth);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(dateLines, signatureX, dateY);

    const dateBlockHeight = Math.max(6, dateLines.length * 5);
    const titleY = dateY + dateBlockHeight + 4;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const titleLines = doc.splitTextToSize(cfg.directorTitle, signatureWidth);
    doc.text(titleLines, signatureX, titleY);

    const titleBlockHeight = Math.max(6, titleLines.length * 5);
    const nameY = titleY + titleBlockHeight + 14;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const directorLines = doc.splitTextToSize(cfg.directorName, signatureWidth);
    doc.text(directorLines, signatureX, nameY);

    const directorBlockHeight = Math.max(5, directorLines.length * 5);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text("(Cachet officiel et signature)", signatureX, nameY + directorBlockHeight + 3);

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.6);
    doc.rect(8, 8, 194, 281);

    doc.save(`CERTIFICAT_SCOLARITE_${student.matricule}.pdf`);
  }
}
