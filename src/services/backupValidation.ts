const isObject = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const coreArrays = ['schoolYears', 'subjects', 'classes', 'students', 'teachers', 'grades', 'tuitionPayments', 'salaryPayments', 'cashTransactions', 'cashDayClosures', 'timetableSlots', 'attendanceRecords'];

export function validateBackup(value: unknown): asserts value is Record<string, any> {
  const fail = (message: string): never => { throw new Error(`Sauvegarde invalide : ${message}`); };
  if (!isObject(value)) fail('objet JSON attendu.');
  const data = value as Record<string, any>;
  if (typeof data.version !== 'string' || !/^(2\.[0-4]\.\d+|3\.0\.\d+|4\.0\.\d+)$/.test(data.version)) fail('version absente ou incompatible (formats 2.0 à 2.4, 3.0 et 4.0 pris en charge).');
  for (const key of ['schoolConfig', 'matriculeConfig']) if (!isObject(data[key])) fail(`${key} absent.`);
  if (typeof data.schoolConfig.name !== 'string' || !data.schoolConfig.name.trim()) fail('nom d’établissement absent.');
  if (!Array.isArray(data.schoolConfig.schoolMonths)) fail('mois scolaires absents.');
  if (data.schoolConfig.schoolMonths.some((month:any)=>typeof month!=='string'||!month.trim())) fail('mois scolaires invalides.');
  const requiredText: Record<string,string[]> = {
    schoolYears:['label'],subjects:['code','name'],classes:['code','name'],
    students:['matricule','lastName'],teachers:['matricule','lastName'],guardians:['lastName'],
  };
  const text = (value: unknown, label: string, nonempty = false) => {
    if (typeof value !== 'string' || (nonempty && !value.trim())) fail(`champ ${label} invalide.`);
  };
  for (const key of ['pattern','prefix','yearFormat','separator']) if (data.matriculeConfig[key] !== undefined) text(data.matriculeConfig[key],`matriculeConfig.${key}`);
  for (const key of ['name','acronym','motto','address','city','phone','email','directorName','directorTitle','currency','reminderTemplate','badgeThemeColor']) if (data.schoolConfig[key] !== undefined) text(data.schoolConfig[key],`schoolConfig.${key}`);
  if (typeof data.currentSchoolYearId !== 'string' || typeof data.currentTermCode !== 'string') fail('période courante absente.');
  for (const key of coreArrays) if (!Array.isArray(data[key])) fail(`tableau ${key} absent.`);
  for (const key of ['guardians', 'studentGuardianLinks']) if (data[key] !== undefined && !Array.isArray(data[key])) fail(`${key} doit être un tableau.`);
  const ids = new Map<string, Set<string>>();
  for (const key of [...coreArrays, 'guardians', 'studentGuardianLinks']) {
    const set = new Set<string>();
    for (const row of data[key] ?? []) {
      if (!isObject(row) || typeof row.id !== 'string' || !row.id || set.has(row.id)) fail(`identifiant invalide ou dupliqué dans ${key}.`);
      set.add(row.id);
      for (const field of requiredText[key] ?? []) text(row[field],`${key}.${field}`,true);
      for (const field of ['firstName','room','receiptNumber','voucherNumber','payerName','cashierName','beneficiaryOrPayer','description']) if (row[field] !== undefined) text(row[field],`${key}.${field}`);
      for (const field of ['birthDate', 'enrollmentDate', 'paymentDate', 'date', 'startDate', 'endDate', 'hireDate']) {
        const date = row[field];
        if (date !== undefined && date !== '') {
          if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date) fail(`date impossible dans ${key}.${field}.`);
        }
      }
    }
    ids.set(key,set);
  }
  const ref = (table: string, id: unknown, label: string, optional = false) => {
    if (optional && (id === undefined || id === null || id === '')) return;
    if (typeof id !== 'string' || !ids.get(table)?.has(id)) fail(`référence ${label} introuvable.`);
  };
  ref('schoolYears',data.currentSchoolYearId,'année courante');
  const currentYear=data.schoolYears.find((year:any)=>year.id===data.currentSchoolYearId);
  const validDate = (date: unknown) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date+'T12:00:00Z')) && new Date(date+'T12:00:00Z').toISOString().slice(0,10) === date;
  const finite = (value: unknown, label: string) => { if (typeof value !== 'number' || !Number.isFinite(value)) fail(`montant ou nombre invalide : ${label}.`); };
  for (const year of data.schoolYears) {
    if (!validDate(year.startDate) || !validDate(year.endDate) || year.startDate >= year.endDate) fail('calendrier d’année absent ou impossible.');
    if (!Array.isArray(year.terms) || year.terms.some((t:any)=>!isObject(t)||!t.id||!t.code)) fail('périodes scolaires invalides.');
    if (new Set(year.terms.map((term:any)=>term.id)).size !== year.terms.length || new Set(year.terms.map((term:any)=>term.code)).size !== year.terms.length) fail('périodes scolaires dupliquées.');
    for (const term of year.terms) {
      text(term.label,'période.label',true);text(term.id,'période.id',true);text(term.code,'période.code',true);
      if (!validDate(term.startDate) || !validDate(term.endDate) || term.startDate > term.endDate) fail('calendrier de période impossible.');
      finite(term.weight,'poids de période');if(term.weight<=0 || typeof term.isLocked!=='boolean') fail('paramètres de période invalides.');
    }
  }
  if (currentYear.terms.length && !currentYear.terms.some((t:any)=>t.code===data.currentTermCode)) fail('période courante inconnue.');
  for (const row of data.classes) {
    if (!Array.isArray(row.subjects)) fail('matières de classe absentes.');
    for (const subject of row.subjects) {
      ref('subjects',subject.subjectId,'matière de classe');ref('teachers',subject.teacherId,'enseignant',true);
      finite(subject.coefficient,'coefficient');
      if (subject.coefficient <= 0) fail('coefficient nul ou négatif.');
    }
  }
  for (const row of data.students) { ref('classes',row.classId,'classe de l’élève');ref('schoolYears',row.schoolYearId,'année de l’élève'); }
  for (const row of data.grades) {
    ref('students',row.studentId,'élève noté');ref('subjects',row.subjectId,'matière notée');ref('classes',row.classId,'classe notée');ref('schoolYears',row.schoolYearId,'année notée');
    if (!data.schoolYears.find((year:any)=>year.id===row.schoolYearId)?.terms.some((term:any)=>term.code===row.termCode)) fail('période de note inconnue.');
    if (!Array.isArray(row.evaluations) || row.evaluations.some((n:any)=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>20)) fail('notes de contrôle invalides.');
    if (row.examGrade!==undefined && (typeof row.examGrade!=='number'||!Number.isFinite(row.examGrade)||row.examGrade<0||row.examGrade>20)) fail('note d’examen invalide.');
    if (row.evaluationWeights !== undefined && (!Array.isArray(row.evaluationWeights) || row.evaluationWeights.length !== row.evaluations.length || row.evaluationWeights.some((weight:any)=>typeof weight!=='number'||!Number.isFinite(weight)||weight<=0))) fail('pondérations des notes invalides.');
    if (row.cloudExamCoefficient !== undefined && (typeof row.cloudExamCoefficient!=='number'||!Number.isFinite(row.cloudExamCoefficient)||row.cloudExamCoefficient<=0)) fail('coefficient d’examen invalide.');
  }
  for (const row of data.tuitionPayments) {ref('students',row.studentId,'élève payé');ref('classes',row.classId,'classe du paiement');ref('schoolYears',row.schoolYearId,'année du paiement');finite(row.amount,'paiement');}
  for (const row of data.salaryPayments) {ref('teachers',row.teacherId,'enseignant payé');ref('schoolYears',row.schoolYearId,'année du salaire');finite(row.netSalary,'salaire');}
  for (const row of [...data.cashTransactions,...data.cashDayClosures]) ref('schoolYears',row.schoolYearId,'année de caisse');
  for (const row of data.cashTransactions) finite(row.amount,'opération de caisse');
  for (const row of data.cashDayClosures) for (const field of ['openingBalance','expectedBalance','countedBalance','difference','transactionCount']) finite(row[field],`clôture : ${field}`);
  for (const row of data.attendanceRecords) {ref('students',row.studentId,'élève de présence');ref('classes',row.classId,'classe de présence');ref('schoolYears',row.schoolYearId,'année de présence',true);}
  for (const row of data.timetableSlots) {ref('classes',row.classId,'classe du créneau');ref('subjects',row.subjectId,'matière du créneau');ref('teachers',row.teacherId,'enseignant du créneau');}
  for (const row of data.studentGuardianLinks??[]) {ref('students',row.studentId,'élève du responsable');ref('guardians',row.guardianId,'responsable');}
}
