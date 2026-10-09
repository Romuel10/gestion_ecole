import * as XLSX from 'xlsx';
import type { DatabaseSchema, Teacher, TeacherContract } from '../types/school';
import {
  civilDate,
  exchangeKey,
  readExchangeWorkbook,
  teacherPackageWorkbook,
  makeTeacherPackage,
} from '../shared/teacherExchange';
import type { ExcelImportIssue } from './excelImporter';
import { localDateIso } from './dateFormat';

export type TeacherImportPreview = {
  teachers: Teacher[];
  issues: ExcelImportIssue[];
  warnings: ExcelImportIssue[];
  validateCurrent: (db: DatabaseSchema) => void;
};
const headers = [
  'Matricule',
  'Nom',
  'Prénoms',
  'Sexe',
  'Téléphone',
  'Email',
  'Adresse',
  'Contrat',
  'Diplôme',
  'Matières',
  'Classes',
  'Salaire mensuel',
  'Taux horaire',
  'Heures hebdomadaires',
  'Date embauche',
  'Numéro CIN',
];
const text = (value: unknown) => String(value ?? '').trim();
const columnKey = (value: string) =>
  exchangeKey(value).replace(/[^A-Z0-9]+/g, '_');

export function downloadTeachersTemplate(db: DatabaseSchema) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  sheet['!cols'] = headers.map((item) => ({
    wch: Math.max(16, item.length + 3),
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, 'Enseignants');
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Code classe', 'Classe'],
      ...db.classes.map((item) => [item.code, item.name]),
    ]),
    'Classes',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Code matière', 'Matière'],
      ...db.subjects.map((item) => [item.code, item.name]),
    ]),
    'Matieres',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['IMPORT ENSEIGNANTS — SEKOLY'],
      [
        'Remplissez la feuille Enseignants. Nom, Prénoms et Sexe (M/F) sont obligatoires.',
      ],
      [
        'Matricule vide : création automatique d’un numéro ENS-xxx unique. Un matricule déjà utilisé bloque l’import.',
      ],
      ['Contrat : TITULAIRE, VACATAIRE, FRAM ou STAGIAIRE. Vide : TITULAIRE.'],
      [
        'Matières et Classes : codes ou noms séparés par un point-virgule. Utilisez les feuilles de référence.',
      ],
      ['Date embauche : JJ-MM-AAAA ou date Excel. Vide : date du jour.'],
      ['Salaire, taux horaire et heures : nombres positifs ou nuls. Vide : 0.'],
      [
        'Les classes et spécialités permettent l’échange Excel. Les affectations explicites dans Paramètres restent prioritaires.',
      ],
      [
        'Ce fichier crée des fiches enseignants ; les invitations aux comptes cloud se font séparément.',
      ],
    ]),
    'Instructions',
  );
  XLSX.writeFile(workbook, 'MODELE_IMPORT_ENSEIGNANTS_SEKOLY.xlsx');
}

export async function parseTeachers(
  file: File,
  db: DatabaseSchema,
): Promise<TeacherImportPreview> {
  const workbook = readExchangeWorkbook(await file.arrayBuffer());
  const sheet =
    workbook.Sheets.Enseignants || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('Aucune feuille Excel lisible.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });
  const teachers: Teacher[] = [],
    issues: ExcelImportIssue[] = [],
    warnings: ExcelImportIssue[] = [];
  const used = new Set(db.teachers.map((item) => exchangeKey(item.matricule)));
  const contracts: TeacherContract[] = [
    'TITULAIRE',
    'VACATAIRE',
    'FRAM',
    'STAGIAIRE',
  ];
  let counter = Math.max(
    0,
    ...db.teachers.map((item) =>
      Number(item.matricule.match(/^ENS-(\d+)$/i)?.[1] || 0),
    ),
  );
  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    if (Object.values(raw).every((value) => value === '' || value === null))
      return;
    const row = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [columnKey(key), value]),
    );
    const get = (...keys: string[]) =>
      keys
        .map((key) => row[columnKey(key)])
        .find((value) => value !== undefined && value !== '') ?? '';
    const error = (message: string) => issues.push({ row: rowNumber, message });
    const lastName = text(get('Nom')).toUpperCase(),
      firstName = text(get('Prénoms', 'Prénom', 'Prenom'));
    const gender = exchangeKey(text(get('Sexe')));
    let matricule = text(get('Matricule')).toUpperCase();
    if (!matricule) {
      do {
        matricule = `ENS-${String(++counter).padStart(3, '0')}`;
      } while (used.has(exchangeKey(matricule)));
    }
    if (!lastName || !firstName) error('Nom et prénoms obligatoires.');
    if (!['M', 'F'].includes(gender)) error('Sexe invalide : M ou F attendu.');
    if (used.has(exchangeKey(matricule)))
      error(
        `Le matricule ${matricule} est déjà utilisé dans le logiciel ou le fichier.`,
      );
    used.add(exchangeKey(matricule));
    const contractType = (exchangeKey(text(get('Contrat', 'Type contrat'))) ||
      'TITULAIRE') as TeacherContract;
    if (!contracts.includes(contractType))
      error(
        'Contrat inconnu : TITULAIRE, VACATAIRE, FRAM ou STAGIAIRE attendu.',
      );
    const email = text(get('Email', 'E-mail')).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      error('Adresse email invalide.');
    const number = (label: string) => {
      const value = text(get(label));
      const parsed = value === '' ? 0 : Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0) {
        error(`${label} doit être un nombre positif ou nul.`);
        return 0;
      }
      return parsed;
    };
    const resolve = (
      label: string,
      list: Array<{ id: string; code: string; name: string }>,
    ) => {
      const codes = text(get(label))
        .split(/[;,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      const ids: string[] = [];
      codes.forEach((code) => {
        const matches = list.filter(
          (item) =>
            exchangeKey(item.code) === exchangeKey(code) ||
            exchangeKey(item.name) === exchangeKey(code),
        );
        if (matches.length !== 1)
          error(`${label} : code ou nom inconnu / ambigu « ${code} ».`);
        else ids.push(matches[0].id);
      });
      return [...new Set(ids)];
    };
    const specialtySubjectIds = resolve('Matières', db.subjects),
      assignedClassIds = resolve('Classes', db.classes);
    const rawDate = get('Date embauche', 'Date d’embauche');
    const hireDate = rawDate === '' ? localDateIso() : civilDate(rawDate);
    if (!hireDate) error('Date d’embauche invalide : utilisez JJ-MM-AAAA.');
    const teacher: Teacher = {
      id: crypto.randomUUID(),
      matricule,
      lastName,
      firstName,
      gender: gender as Teacher['gender'],
      phone: text(get('Téléphone')),
      email,
      address: text(get('Adresse')),
      contractType,
      qualification: text(get('Diplôme', 'Qualification')),
      specialtySubjectIds,
      assignedClassIds,
      baseMonthlySalary: number('Salaire mensuel'),
      hourlyRate: number('Taux horaire'),
      weeklyAssignedHours: number('Heures hebdomadaires'),
      hireDate,
      cinNumber: text(get('Numéro CIN', 'CIN')),
    };
    if (!issues.some((item) => item.row === rowNumber)) {
      teachers.push(teacher);
      if (!specialtySubjectIds.length || !assignedClassIds.length)
        warnings.push({
          row: rowNumber,
          message:
            'Classes ou matières non renseignées. Affectez cet enseignant avant de préparer son fichier hors connexion.',
        });
    }
  });
  if (!rows.length)
    warnings.push({
      row: 1,
      message: 'La feuille ne contient aucun enseignant.',
    });
  return {
    teachers,
    issues,
    warnings,
    validateCurrent: (current) => {
      if (
        teachers.some((teacher) =>
          current.teachers.some(
            (item) =>
              exchangeKey(item.matricule) === exchangeKey(teacher.matricule),
          ),
        )
      )
        throw new Error(
          'Un matricule vient d’être utilisé. Rechargez le fichier avant l’import.',
        );
      if (
        teachers.some(
          (teacher) =>
            teacher.assignedClassIds.some(
              (id) => !current.classes.some((cls) => cls.id === id),
            ) ||
            teacher.specialtySubjectIds.some(
              (id) => !current.subjects.some((subject) => subject.id === id),
            ),
        )
      )
        throw new Error(
          'Les classes ou matières ont changé. Rechargez le fichier.',
        );
    },
  };
}

export function downloadTeacherPackage(db: DatabaseSchema, teacher: Teacher) {
  const data = makeTeacherPackage(db, teacher);
  XLSX.writeFile(
    teacherPackageWorkbook(data),
    `SEKOLY_ECOLE_${teacher.matricule.replace(/[^A-Za-z0-9_-]/g, '_')}.xlsx`,
  );
}
