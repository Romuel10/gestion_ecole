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
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 14;
    const right = pageWidth - 14;
    const center = pageWidth / 2;

    this.addSchoolLogo(doc, db, 8, 15);

    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(cfg.name.toUpperCase(), center, 12, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...muted);
    doc.text(
      [cfg.dren, cfg.cisco].filter(Boolean).join(' • '),
      center,
      16.5,
      { align: 'center' }
    );
    doc.text(
      [cfg.address, cfg.city, cfg.phone ? `Tél. ${cfg.phone}` : '']
        .filter(Boolean)
        .join(' • '),
      center,
      20.5,
      { align: 'center', maxWidth: 150 }
    );

    doc.setDrawColor(...line);
    doc.setLineWidth(0.25);
    doc.line(left, 25, right, 25);

    doc.setTextColor(...accent);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.text(documentTitle.toUpperCase(), left, 33);

    if (metaLine) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text(metaLine, right, 33, { align: 'right' });
    }

    doc.setTextColor(...ink);
    return 38;
  }

  private static drawDocumentFooter(doc: jsPDF, db: DatabaseSchema, note?: string): void {
    const cfg = db.schoolConfig;
    const { muted, line } = this.BRAND;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 14;
    const right = pageWidth - 14;

    doc.setDrawColor(...line);
    doc.setLineWidth(0.2);
    doc.line(left, pageHeight - 14, right, pageHeight - 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(
      note || `${cfg.acronym} • ${cfg.email || cfg.phone || ''}`,
      left,
      pageHeight - 9
    );
    doc.text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')}`,
      right,
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [148, 210] });
    const student = db.students.find((item) => item.id === payment.studentId);
    const schoolClass = db.classes.find((item) => item.id === payment.classId);
    const { ink, muted, line, soft, accent } = this.BRAND;

    let y = this.drawInstitutionHeader(
      doc,
      db,
      'Reçu de paiement',
      payment.receiptNumber
    );

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      body: [
        ['DATE', payment.paymentDate],
        ['ÉLÈVE', student ? `${student.lastName.toUpperCase()} ${student.firstName}` : '—'],
        ['MATRICULE', student?.matricule || '—'],
        ['CLASSE', schoolClass?.name || '—'],
        ['OBJET', `${payment.feeType.replaceAll('_', ' ')}${payment.monthTarget ? ` — ${payment.monthTarget}` : ''}`],
        ['MODE DE PAIEMENT', payment.paymentMethod],
        ['PAYEUR', payment.payerName || 'Parent / Tuteur'],
        ['RÉFÉRENCE', payment.referenceNumber || '—'],
      ],
      styles: {
        fontSize: 7.3,
        textColor: ink,
        lineColor: line,
        lineWidth: 0.15,
        cellPadding: 2.2,
      },
      columnStyles: {
        0: { cellWidth: 37, fillColor: soft, fontStyle: 'bold', textColor: muted },
        1: { cellWidth: 91 },
      },
      margin: { left: 10, right: 10 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    doc.setDrawColor(...line);
    doc.setFillColor(...soft);
    doc.rect(10, y, 128, 18, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    doc.text('MONTANT ENCAISSÉ', 14, y + 6);
    doc.setTextColor(...accent);
    doc.setFontSize(13);
    doc.text(CalculationService.formatAriary(payment.amount), 134, y + 12, { align: 'right' });

    if (payment.discount > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...muted);
      doc.text(
        `Montant dû : ${CalculationService.formatAriary(payment.totalDue)} • Remise : ${CalculationService.formatAriary(payment.discount)}`,
        14,
        y + 12
      );
    }

    const signY = y + 32;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(...ink);
    doc.text('Payeur', 32, signY, { align: 'center' });
    doc.text('Caisse / Direction', 106, signY, { align: 'center' });
    doc.setDrawColor(...line);
    doc.line(16, signY + 17, 48, signY + 17);
    doc.line(88, signY + 17, 124, signY + 17);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...muted);
    doc.text(`Émis par ${payment.cashierName}`, 106, signY + 22, { align: 'center' });

    this.drawDocumentFooter(doc, db, 'Reçu de paiement — original à conserver');
    doc.save(`RECU_${payment.receiptNumber}.pdf`);
  }

  /**
   * Generates and downloads a Teacher / Staff Payslip (Fiche de Paie / Bulletin de Salaire)
   */
  static generateSalaryPayslipPDF(salary: SalaryPayment, db: DatabaseSchema): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const teacher = db.teachers.find((item) => item.id === salary.teacherId);
    const { ink, muted, line, soft, accent } = this.BRAND;

    let y = this.drawInstitutionHeader(
      doc,
      db,
      'Bulletin de paie',
      salary.month
    );

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      body: [
        ['SALARIÉ', teacher ? `${teacher.lastName.toUpperCase()} ${teacher.firstName}` : 'Enseignant', 'MATRICULE', teacher?.matricule || '—'],
        ['CONTRAT', salary.contractType, 'DATE DE PAIEMENT', salary.paymentDate],
        ['CIN', teacher?.cinNumber || '—', 'MODE DE PAIEMENT', salary.paymentMethod],
      ],
      styles: {
        fontSize: 7.4,
        textColor: ink,
        lineColor: line,
        lineWidth: 0.15,
        cellPadding: 2.2,
      },
      columnStyles: {
        0: { cellWidth: 29, fillColor: soft, fontStyle: 'bold', textColor: muted },
        1: { cellWidth: 62 },
        2: { cellWidth: 31, fillColor: soft, fontStyle: 'bold', textColor: muted },
        3: { cellWidth: 60 },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 5;

    const rows = [
      [
        salary.contractType === 'VACATAIRE'
          ? `Vacations (${salary.hoursWorked} h)`
          : 'Salaire de base',
        salary.grossSalary,
        0,
      ],
      ['Primes et indemnités', salary.bonuses, 0],
      ['Avances sur salaire', 0, salary.advances],
      ['Cotisation CNaPS', 0, salary.cnapsDeduction],
      ['Cotisation sanitaire', 0, salary.ostieDeduction],
      ['Autres retenues', 0, salary.otherDeductions],
    ].map(([label, gain, deduction]) => [
      label,
      Number(gain) ? CalculationService.formatAriary(Number(gain)) : '—',
      Number(deduction) ? CalculationService.formatAriary(Number(deduction)) : '—',
    ]);

    autoTable(doc, {
      startY: y,
      head: [['RUBRIQUE', 'GAINS', 'RETENUES']],
      body: rows,
      theme: 'grid',
      headStyles: {
        fillColor: [239, 242, 246],
        textColor: ink,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: ink,
        lineColor: line,
        lineWidth: 0.15,
        cellPadding: 2.4,
      },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 41, halign: 'right' },
        2: { cellWidth: 41, halign: 'right' },
      },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
    doc.setDrawColor(...line);
    doc.setFillColor(...soft);
    doc.rect(14, y, 182, 18, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...muted);
    doc.setFontSize(7);
    doc.text('NET À PAYER', 19, y + 7);
    doc.setTextColor(...accent);
    doc.setFontSize(13);
    doc.text(CalculationService.formatAriary(salary.netSalary), 190, y + 12, { align: 'right' });

    const signY = y + 36;
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('Salarié', 52, signY, { align: 'center' });
    doc.text('Direction / Administration', 158, signY, { align: 'center' });
    doc.setDrawColor(...line);
    doc.line(30, signY + 18, 74, signY + 18);
    doc.line(132, signY + 18, 184, signY + 18);

    this.drawDocumentFooter(doc, db, `Bulletin de paie • ${salary.month}`);
    doc.save(`FICHE_PAIE_${salary.voucherNumber}.pdf`);
  }

  /**
   * Generates and downloads an Official Certificate of Enrollment (Certificat de Scolarité)
   */
  static generateEnrollmentCertificatePDF(student: Student, db: DatabaseSchema): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const cfg = db.schoolConfig;
    const schoolYear = db.schoolYears.find((item) => item.id === student.schoolYearId);
    const schoolClass = db.classes.find((item) => item.id === student.classId);
    const yearLabel = schoolYear?.label || 'Année scolaire';
    const referenceYear = schoolYear?.startDate.slice(0, 4) || new Date().getFullYear().toString();
    const { ink, muted, line } = this.BRAND;

    let y = this.drawInstitutionHeader(
      doc,
      db,
      cfg.certificateTitle || 'Certificat de scolarité',
      `Réf. CERT/${student.matricule}/${referenceYear}`
    );

    const defaultTemplate =
      "Je soussigné(e), {DIRECTEUR}, {FONCTION} de l'établissement {ETABLISSEMENT}, certifie que l'élève {NOM_ET_PRENOMS}, né(e) le {DATE_NAISSANCE} à {LIEU_NAISSANCE}, titulaire du matricule {MATRICULE}, est régulièrement inscrit(e) et fréquente les cours en classe de {CLASSE} au titre de l'année scolaire {ANNEE_SCOLAIRE}.\n\nEn foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.";

    const body = this.fillCertificateTemplate(
      cfg.certificateTemplate || defaultTemplate,
      student,
      db,
      schoolClass?.name || 'Non assignée',
      yearLabel
    );

    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.setLineHeightFactor(1.55);
    const bodyLines = doc.splitTextToSize(body, 164);
    doc.text(bodyLines, 23, y);

    const bodyHeight = bodyLines.length * 7.1;
    const infoY = y + bodyHeight + 14;

    doc.setDrawColor(...line);
    doc.setLineWidth(0.2);
    doc.line(23, infoY, 187, infoY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    const dateText = `Fait à ${cfg.city}, le ${new Date().toLocaleDateString('fr-FR')}`;
    const dateLines = doc.splitTextToSize(dateText, 60);
    doc.text(dateLines, 128, infoY + 10);

    const signatureY = infoY + 10 + dateLines.length * 5 + 4;
    doc.setTextColor(...ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const titleLines = doc.splitTextToSize(cfg.directorTitle, 60);
    doc.text(titleLines, 128, signatureY);

    const nameY = signatureY + titleLines.length * 5 + 18;
    doc.setFontSize(9);
    doc.text(cfg.directorName, 128, nameY, { maxWidth: 60 });

    doc.setDrawColor(...line);
    doc.line(128, nameY + 9, 188, nameY + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...muted);
    doc.text('Cachet et signature', 158, nameY + 14, { align: 'center' });

    this.drawDocumentFooter(
      doc,
      db,
      'Certificat de scolarité — délivré à la demande de la famille'
    );

    doc.save(`CERTIFICAT_SCOLARITE_${student.matricule}.pdf`);
  }

}
