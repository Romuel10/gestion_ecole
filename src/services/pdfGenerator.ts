import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DatabaseSchema,
  ReportCardSummary,
  TuitionPayment,
  SalaryPayment,
  Student,
} from '../types/school';
import { CalculationService } from './calculations';

export class PdfGeneratorService {
  private static readonly BRAND = {
    ink: [31, 41, 55] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    line: [203, 213, 225] as [number, number, number],
    soft: [248, 250, 252] as [number, number, number],
    accent: [36, 63, 90] as [number, number, number],
  };

  private static addSchoolLogo(doc: jsPDF, db: DatabaseSchema, y = 8, maxHeight = 14): void {
    const cfg = db.schoolConfig;
    if (!cfg.logoUrl) return;

    try {
      const properties = doc.getImageProperties(cfg.logoUrl);
      const requestedWidth = Math.min(32, Math.max(10, cfg.documentLogoWidthMm || 18));
      const ratio = properties.width / properties.height || 1;
      let width = requestedWidth;
      let height = width / ratio;
      if (height > maxHeight) {
        height = maxHeight;
        width = height * ratio;
      }

      const position = cfg.documentLogoPosition || 'LEFT';
      const pageWidth = doc.internal.pageSize.getWidth();
      const x =
        position === 'CENTER'
          ? (pageWidth - width) / 2
          : position === 'RIGHT'
          ? pageWidth - 14 - width
          : 14;

      const format = cfg.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(cfg.logoUrl, format, x, y, width, height, undefined, 'FAST');
    } catch {
      // Un logo invalide ne doit jamais empêcher la génération d'un document.
    }
  }

  private static drawInstitutionHeader(
    doc: jsPDF,
    db: DatabaseSchema,
    documentTitle: string,
    metaLine?: string
  ): number {
    const cfg = db.schoolConfig;
    const { ink, muted, line, accent } = this.BRAND;

    this.addSchoolLogo(doc, db, 8, 15);

    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(cfg.name.toUpperCase(), 105, 12, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...muted);
    doc.text(
      [cfg.dren, cfg.cisco].filter(Boolean).join(' • '),
      105,
      16.5,
      { align: 'center' }
    );
    doc.text(
      [cfg.address, cfg.city, cfg.phone ? `Tél. ${cfg.phone}` : '']
        .filter(Boolean)
        .join(' • '),
      105,
      20.5,
      { align: 'center', maxWidth: 150 }
    );

    doc.setDrawColor(...line);
    doc.setLineWidth(0.25);
    doc.line(14, 25, 196, 25);

    doc.setTextColor(...accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(documentTitle.toUpperCase(), 14, 33);

    if (metaLine) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(metaLine, 196, 33, { align: 'right' });
    }

    doc.setTextColor(...ink);
    return 38;
  }

  private static drawDocumentFooter(doc: jsPDF, db: DatabaseSchema, note?: string): void {
    const cfg = db.schoolConfig;
    const { muted, line } = this.BRAND;
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setDrawColor(...line);
    doc.setLineWidth(0.2);
    doc.line(14, pageHeight - 14, 196, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(
      note || `${cfg.acronym} • ${cfg.email || cfg.phone || ''}`,
      14,
      pageHeight - 9
    );
    doc.text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')}`,
      196,
      pageHeight - 9,
      { align: 'right' }
    );
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const yearObj = db.schoolYears.find((year) => year.id === summary.schoolYearId);
    const yearLabel = yearObj?.label || 'Année scolaire';
    const termLabel =
      yearObj?.terms.find((term) => term.code === summary.termCode)?.label ||
      summary.termCode.replace(/_/g, ' ');
    const { ink, muted, line, soft, accent } = this.BRAND;

    let y = this.drawInstitutionHeader(
      doc,
      db,
      'Bulletin scolaire',
      `${termLabel} • ${yearLabel}`
    );

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      body: [
        [
          { content: 'ÉLÈVE', styles: { fontStyle: 'bold', textColor: muted, fontSize: 6.7 } },
          { content: `${summary.student.lastName.toUpperCase()} ${summary.student.firstName}`, styles: { fontStyle: 'bold' } },
          { content: 'MATRICULE', styles: { fontStyle: 'bold', textColor: muted, fontSize: 6.7 } },
          summary.student.matricule,
        ],
        [
          { content: 'CLASSE', styles: { fontStyle: 'bold', textColor: muted, fontSize: 6.7 } },
          summary.schoolClass.name,
          { content: 'EFFECTIF', styles: { fontStyle: 'bold', textColor: muted, fontSize: 6.7 } },
          `${summary.classSize} élève(s)`,
        ],
        [
          { content: 'NÉ(E) LE', styles: { fontStyle: 'bold', textColor: muted, fontSize: 6.7 } },
          `${summary.student.birthDate} à ${summary.student.birthPlace || 'Madagascar'}`,
          { content: 'SÉRIE / SECTION', styles: { fontStyle: 'bold', textColor: muted, fontSize: 6.7 } },
          summary.schoolClass.serie || 'Générale',
        ],
      ],
      styles: {
        font: 'helvetica',
        fontSize: 7.5,
        textColor: ink,
        lineColor: line,
        lineWidth: 0.15,
        cellPadding: 2.2,
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 22, fillColor: soft },
        1: { cellWidth: 78 },
        2: { cellWidth: 24, fillColor: soft },
        3: { cellWidth: 58 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    const rows = summary.subjectDetails.map((subject) => [
      subject.subjectName,
      subject.coefficient.toString(),
      subject.evaluations.length
        ? subject.evaluations.map((value) => value.toFixed(1)).join(' / ')
        : '—',
      subject.examGrade !== undefined ? subject.examGrade.toFixed(1) : '—',
      subject.average.toFixed(2),
      `${subject.rankInSubject}/${summary.classSize}`,
      subject.classAvg.toFixed(2),
      subject.teacherComment || '',
    ]);

    autoTable(doc, {
      startY: y,
      head: [[
        'MATIÈRE',
        'COEF.',
        'CONTRÔLES',
        'EXAMEN',
        'MOY.',
        'RANG',
        'MOY. CL.',
        'APPRÉCIATION',
      ]],
      body: rows,
      theme: 'grid',
      headStyles: {
        fillColor: [239, 242, 246],
        textColor: ink,
        fontSize: 6.7,
        fontStyle: 'bold',
        halign: 'center',
        lineColor: line,
        lineWidth: 0.15,
      },
      bodyStyles: {
        font: 'helvetica',
        fontSize: 7,
        textColor: ink,
        lineColor: line,
        lineWidth: 0.12,
        cellPadding: 1.8,
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: [251, 252, 253] },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 11, halign: 'center' },
        2: { cellWidth: 23, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 15, halign: 'center' },
        6: { cellWidth: 17, halign: 'center' },
        7: { cellWidth: 44 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 4;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      body: [
        [
          { content: 'MOYENNE GÉNÉRALE', styles: { fontStyle: 'bold', fillColor: soft } },
          { content: `${summary.generalAverage.toFixed(2)} / 20`, styles: { fontStyle: 'bold', textColor: accent, fontSize: 9 } },
          { content: 'RANG', styles: { fontStyle: 'bold', fillColor: soft } },
          `${summary.rank} / ${summary.classSize}`,
        ],
        [
          { content: 'MOYENNE DE CLASSE', styles: { fontStyle: 'bold', fillColor: soft } },
          summary.classGeneralAverage.toFixed(2),
          { content: 'MENTION', styles: { fontStyle: 'bold', fillColor: soft } },
          summary.honorMention,
        ],
        [
          { content: 'ASSIDUITÉ', styles: { fontStyle: 'bold', fillColor: soft } },
          `Abs. justifiées : ${summary.absencesJustified} • Abs. non justifiées : ${summary.absencesUnjustified} • Retards : ${summary.latenessCount}`,
          { content: 'CONDUITE', styles: { fontStyle: 'bold', fillColor: soft } },
          `${summary.conductGrade.toFixed(1)} / 20`,
        ],
      ],
      styles: {
        fontSize: 7.2,
        textColor: ink,
        lineColor: line,
        lineWidth: 0.15,
        cellPadding: 2.2,
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 65 },
        2: { cellWidth: 30 },
        3: { cellWidth: 52 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    doc.setDrawColor(...line);
    doc.setLineWidth(0.2);
    doc.rect(14, y, 182, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text('APPRÉCIATION GÉNÉRALE / DÉCISION', 17, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    const decision =
      summary.councilDecision ||
      summary.student.councilDecision ||
      'Avis du conseil de classe : ________________________________________________';
    const decisionLines = doc.splitTextToSize(decision, 174);
    doc.text(decisionLines, 17, y + 11);

    const signY = Math.max(y + 28, 238);
    const columns = [
      { x: 14, width: 52, title: 'Professeur principal' },
      { x: 79, width: 52, title: 'Parent / Tuteur' },
      { x: 144, width: 52, title: db.schoolConfig.directorTitle || 'Direction' },
    ];

    columns.forEach((column) => {
      doc.setTextColor(...ink);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.text(column.title, column.x + column.width / 2, signY, { align: 'center', maxWidth: column.width });
      doc.setDrawColor(...line);
      doc.line(column.x + 4, signY + 18, column.x + column.width - 4, signY + 18);
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(
      `Fait à ${db.schoolConfig.city || 'Antananarivo'}, le ${new Date().toLocaleDateString('fr-FR')}`,
      170,
      signY + 24,
      { align: 'center', maxWidth: 52 }
    );

    this.drawDocumentFooter(
      doc,
      db,
      'Bulletin scolaire — document à conserver par la famille'
    );

    doc.save(
      `BULLETIN_${summary.schoolClass.code}_${summary.student.matricule}_${summary.termCode}.pdf`
    );
  }

  static generateTimetablePDF(
    db: DatabaseSchema,
    viewType: 'CLASS' | 'TEACHER' | 'ROOM',
    selectedEntityId: string
  ): void {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const year = db.schoolYears.find((item) => item.id === db.currentSchoolYearId);
    const classMap = new Map(db.classes.map((item) => [item.id, item]));
    const teacherMap = new Map(db.teachers.map((item) => [item.id, item]));
    const subjectMap = new Map(db.subjects.map((item) => [item.id, item]));
    const days = [
      { id: 1, label: 'Lundi' },
      { id: 2, label: 'Mardi' },
      { id: 3, label: 'Mercredi' },
      { id: 4, label: 'Jeudi' },
      { id: 5, label: 'Vendredi' },
      { id: 6, label: 'Samedi' },
    ];

    const slots = db.timetableSlots.filter((slot) => {
      if (viewType === 'CLASS') return slot.classId === selectedEntityId;
      if (viewType === 'TEACHER') return slot.teacherId === selectedEntityId;
      return slot.room === selectedEntityId;
    });

    const title =
      viewType === 'CLASS'
        ? classMap.get(selectedEntityId)?.name || 'Classe'
        : viewType === 'TEACHER'
        ? `${teacherMap.get(selectedEntityId)?.lastName || ''} ${teacherMap.get(selectedEntityId)?.firstName || ''}`.trim()
        : selectedEntityId;

    const timeRanges = Array.from(
      new Set(slots.map((slot) => `${slot.startTime}|${slot.endTime}`))
    )
      .sort((a, b) => a.localeCompare(b))
      .map((value) => {
        const [start, end] = value.split('|');
        return { start, end };
      });

    let y = this.drawInstitutionHeader(
      doc,
      db,
      'Emploi du temps',
      `${title} • ${year?.label || ''}`
    );

    const body = timeRanges.map((range) => [
      `${range.start} – ${range.end}`,
      ...days.map((day) => {
        const slot = slots.find(
          (item) =>
            item.dayOfWeek === day.id &&
            item.startTime === range.start &&
            item.endTime === range.end
        );
        if (!slot) return '';
        const subject = subjectMap.get(slot.subjectId)?.name || 'Cours';
        const teacher = teacherMap.get(slot.teacherId);
        const schoolClass = classMap.get(slot.classId);
        const context =
          viewType === 'CLASS'
            ? teacher?.lastName || ''
            : viewType === 'TEACHER'
            ? schoolClass?.name || ''
            : `${schoolClass?.name || ''} · ${teacher?.lastName || ''}`;
        return `${subject}\n${context}\n${slot.room}`;
      }),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['HORAIRES', ...days.map((day) => day.label.toUpperCase())]],
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        textColor: this.BRAND.ink,
        lineColor: this.BRAND.line,
        lineWidth: 0.15,
        cellPadding: 2.2,
        valign: 'middle',
        minCellHeight: 17,
      },
      headStyles: {
        fillColor: [239, 242, 246],
        textColor: this.BRAND.ink,
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 7,
      },
      columnStyles: {
        0: { cellWidth: 25, halign: 'center', fillColor: [248, 250, 252], fontStyle: 'bold' },
        1: { cellWidth: 42 },
        2: { cellWidth: 42 },
        3: { cellWidth: 42 },
        4: { cellWidth: 42 },
        5: { cellWidth: 42 },
        6: { cellWidth: 34 },
      },
      margin: { left: 10, right: 10 },
    });

    this.drawDocumentFooter(doc, db, `Emploi du temps • ${title}`);
    doc.save(`EMPLOI_DU_TEMPS_${title.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}.pdf`);
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
