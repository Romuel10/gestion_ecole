import type { DatabaseSchema, SchoolYear } from '../types/school';

export function needsFirstSetup(db: DatabaseSchema): boolean {
  if (db.schoolConfig.setupState)
    return !db.schoolConfig.setupState.completedAt;
  return (
    db.schoolConfig.name === 'Nouvel établissement' &&
    db.classes.length === 0 &&
    db.subjects.length === 0 &&
    db.students.length === 0 &&
    db.teachers.length === 0 &&
    db.grades.length === 0 &&
    db.tuitionPayments.length === 0
  );
}

export function validCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function setupErrors(db: DatabaseSchema, step: number): string[] {
  const errors: string[] = [];
  const config = db.schoolConfig;
  if (step === 0 || step === 4) {
    if (!config.name.trim() || config.name === 'Nouvel établissement')
      errors.push('Indiquez le nom de votre établissement.');
    if (!/^[A-Za-z0-9_-]{2,16}$/.test(config.acronym))
      errors.push(
        'Le sigle doit contenir 2 à 16 lettres ou chiffres, sans espace.',
      );
    if (!config.city.trim()) errors.push('Indiquez la ville.');
    if (!config.currency.trim()) errors.push('Indiquez la devise.');
    if (config.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.email))
      errors.push('L’adresse email de l’école est invalide.');
  }
  if (step === 1 || step === 4) {
    const year = db.schoolYears.find(
      (item) => item.id === db.currentSchoolYearId,
    );
    if (
      !year ||
      !year.label.trim() ||
      !validCivilDate(year.startDate) ||
      !validCivilDate(year.endDate) ||
      year.startDate >= year.endDate
    ) {
      errors.push(
        'Renseignez une année scolaire avec des dates de début et de fin valides.',
      );
    } else {
      if (!year.terms.length) errors.push('Ajoutez au moins une période.');
      const codes = new Set<string>();
      const terms = [...year.terms].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      );
      terms.forEach((term, index) => {
        if (
          !term.code.trim() ||
          !term.label.trim() ||
          codes.has(term.code.toUpperCase())
        )
          errors.push('Chaque période doit avoir un code unique et un nom.');
        codes.add(term.code.toUpperCase());
        if (
          !validCivilDate(term.startDate) ||
          !validCivilDate(term.endDate) ||
          term.startDate > term.endDate ||
          term.startDate < year.startDate ||
          term.endDate > year.endDate
        )
          errors.push(
            `Les dates de ${term.label || 'la période'} doivent être comprises dans l’année scolaire.`,
          );
        if (index > 0 && terms[index - 1].endDate >= term.startDate)
          errors.push('Les périodes ne doivent pas se chevaucher.');
        if (!Number.isFinite(term.weight) || term.weight <= 0)
          errors.push('Le coefficient de chaque période doit être positif.');
      });
    }
  }
  if (step === 2 || step === 4) {
    if (!db.classes.length) errors.push('Ajoutez au moins une classe.');
    const codes = new Set<string>();
    db.classes.forEach((cls) => {
      if (
        !cls.name.trim() ||
        !cls.code.trim() ||
        codes.has(cls.code.trim().toUpperCase())
      )
        errors.push('Chaque classe doit avoir un nom et un code unique.');
      codes.add(cls.code.trim().toUpperCase());
      if (!Number.isInteger(cls.capacity) || cls.capacity <= 0)
        errors.push('L’effectif maximal doit être un entier positif.');
      if (
        [
          cls.monthlyTuitionFee,
          cls.registrationFee,
          cls.reRegistrationFee,
        ].some((value) => !Number.isFinite(value) || value < 0)
      )
        errors.push('Les frais scolaires doivent être positifs ou nuls.');
    });
  }
  if (step === 3 || step === 4) {
    if (!db.subjects.length) errors.push('Ajoutez au moins une matière.');
    const codes = new Set<string>();
    db.subjects.forEach((subject) => {
      if (
        !subject.name.trim() ||
        !subject.code.trim() ||
        codes.has(subject.code.trim().toUpperCase())
      )
        errors.push('Chaque matière doit avoir un nom et un code unique.');
      codes.add(subject.code.trim().toUpperCase());
      if (!Number.isFinite(subject.defaultCoeff) || subject.defaultCoeff <= 0)
        errors.push('Les coefficients des matières doivent être positifs.');
    });
    if (db.classes.some((cls) => !cls.subjects.length))
      errors.push('Sélectionnez au moins une matière pour chaque classe.');
  }
  return [...new Set(errors)];
}

export function splitSetupTerms(year: SchoolYear): SchoolYear['terms'] {
  if (
    !validCivilDate(year.startDate) ||
    !validCivilDate(year.endDate) ||
    year.startDate >= year.endDate
  )
    return year.terms;
  const start = Date.parse(`${year.startDate}T12:00:00Z`);
  const days =
    Math.round((Date.parse(`${year.endDate}T12:00:00Z`) - start) / 86400000) +
    1;
  return Array.from({ length: 3 }, (_, index) => ({
    id: year.terms[index]?.id || crypto.randomUUID(),
    code: `TRIMESTRE_${index + 1}`,
    label: `${index + 1}${index === 0 ? 'er' : 'e'} trimestre`,
    weight: 1,
    isLocked: false,
    startDate: new Date(start + Math.floor((days * index) / 3) * 86400000)
      .toISOString()
      .slice(0, 10),
    endDate: new Date(
      start + (Math.floor((days * (index + 1)) / 3) - 1) * 86400000,
    )
      .toISOString()
      .slice(0, 10),
  }));
}

export function finishFirstSetup(db: DatabaseSchema): DatabaseSchema {
  const errors = setupErrors(db, 4);
  if (errors.length) throw new Error(errors.join(' '));
  const year = db.schoolYears.find(
    (item) => item.id === db.currentSchoolYearId,
  )!;
  const monthNames = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre',
  ];
  const firstMonth = Number(year.startDate.slice(5, 7)) - 1;
  const monthCount =
    (Number(year.endDate.slice(0, 4)) - Number(year.startDate.slice(0, 4))) *
      12 +
    Number(year.endDate.slice(5, 7)) -
    firstMonth;
  const schoolMonths = Array.from(
    { length: Math.min(12, monthCount) },
    (_, index) => monthNames[(firstMonth + index) % 12],
  );
  return {
    ...db,
    schoolConfig: {
      ...db.schoolConfig,
      name: db.schoolConfig.name.trim(),
      acronym: db.schoolConfig.acronym.trim().toUpperCase(),
      schoolMonths,
      offlineExchangeId:
        db.schoolConfig.offlineExchangeId || crypto.randomUUID(),
      setupState: { step: 4, completedAt: new Date().toISOString() },
    },
    matriculeConfig: {
      ...db.matriculeConfig,
      prefix: db.schoolConfig.acronym.trim().toUpperCase(),
      pattern: `${db.schoolConfig.acronym.trim().toUpperCase()}-{YYYY}-{NUM4}`,
    },
    currentTermCode: db.schoolYears.find(
      (year) => year.id === db.currentSchoolYearId,
    )!.terms[0].code,
  };
}
