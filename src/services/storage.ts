import { DatabaseSchema } from '../types/school';
import { INITIAL_DATA } from '../data/initialData';

const DB_KEY = 'EDUGASY_PRO_LOCAL_DB_V3_SIMULATION';

export class StorageService {
  private static normalizeDatabase(candidate: Partial<DatabaseSchema>): DatabaseSchema {
    if (!candidate || typeof candidate !== 'object' || !candidate.schoolConfig) {
      throw new Error('Schéma de base de données invalide.');
    }

    const schoolYears = Array.isArray(candidate.schoolYears) ? candidate.schoolYears : [];
    const currentSchoolYearId =
      candidate.currentSchoolYearId ||
      schoolYears.find((year) => year.isCurrent)?.id ||
      schoolYears[0]?.id ||
      INITIAL_DATA.currentSchoolYearId;

    return {
      ...INITIAL_DATA,
      ...candidate,
      version: candidate.version || INITIAL_DATA.version,
      lastUpdated: candidate.lastUpdated || new Date().toISOString(),
      schoolConfig: {
        ...INITIAL_DATA.schoolConfig,
        ...candidate.schoolConfig,
        schoolMonths: Array.isArray(candidate.schoolConfig.schoolMonths)
          ? candidate.schoolConfig.schoolMonths
          : INITIAL_DATA.schoolConfig.schoolMonths,
      },
      matriculeConfig: {
        ...INITIAL_DATA.matriculeConfig,
        ...(candidate.matriculeConfig || {}),
      },
      schoolYears,
      currentSchoolYearId,
      subjects: Array.isArray(candidate.subjects) ? candidate.subjects : [],
      classes: Array.isArray(candidate.classes) ? candidate.classes : [],
      students: Array.isArray(candidate.students) ? candidate.students : [],
      teachers: Array.isArray(candidate.teachers) ? candidate.teachers : [],
      grades: Array.isArray(candidate.grades) ? candidate.grades : [],
      tuitionPayments: Array.isArray(candidate.tuitionPayments) ? candidate.tuitionPayments : [],
      salaryPayments: Array.isArray(candidate.salaryPayments) ? candidate.salaryPayments : [],
      cashTransactions: Array.isArray(candidate.cashTransactions) ? candidate.cashTransactions : [],
      timetableSlots: Array.isArray(candidate.timetableSlots) ? candidate.timetableSlots : [],
      attendanceRecords: Array.isArray(candidate.attendanceRecords) ? candidate.attendanceRecords : [],
    };
  }

  /**
   * Loads the current database from LocalStorage or initializes it with Madagascar defaults
   */
  static loadDatabase(): DatabaseSchema {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) {
        this.saveDatabase(INITIAL_DATA);
        return INITIAL_DATA;
      }
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      const normalized = this.normalizeDatabase(parsed);
      this.saveDatabase(normalized);
      return normalized;
    } catch (e) {
      console.error('Failed to load database from localStorage, fallback to initial data', e);
      return INITIAL_DATA;
    }
  }

  /**
   * Saves the entire database to LocalStorage
   */
  static saveDatabase(db: DatabaseSchema): boolean {
    try {
      db.lastUpdated = new Date().toISOString();
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error('Failed to save database to localStorage', e);
      return false;
    }
  }

  /**
   * Resets database to default Madagascar sample dataset
   */
  static resetToDefault(): DatabaseSchema {
    this.saveDatabase(INITIAL_DATA);
    return JSON.parse(JSON.stringify(INITIAL_DATA));
  }

  /**
   * Exports the entire database as a downloadable JSON backup file
   */
  static exportBackupJSON(db: DatabaseSchema): void {
    const jsonStr = JSON.stringify(db, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `EDUGASY_PRO_BACKUP_${db.schoolConfig.acronym || 'ECOLE'}_${dateStr}.json`;
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Imports a JSON backup file and replaces the current database
   */
  static importBackupJSON(file: File): Promise<DatabaseSchema> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content) as Partial<DatabaseSchema>;
          const normalized = this.normalizeDatabase(parsed);
          this.saveDatabase(normalized);
          resolve(normalized);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du fichier.'));
      reader.readAsText(file);
    });
  }

  /**
   * Exports student list as CSV
   */
  static exportStudentsCSV(db: DatabaseSchema): void {
    const headers = [
      'Matricule',
      'Nom',
      'Prenom',
      'Sexe',
      'Date_Naissance',
      'Lieu_Naissance',
      'Classe',
      'Statut',
      'Pere',
      'Mere',
      'Telephone_Urgence',
      'Adresse',
      'Ville'
    ];

    const classMap = new Map(db.classes.map(c => [c.id, c.name]));

    const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = db.students.map(s => [
      csvCell(s.matricule),
      csvCell(s.lastName),
      csvCell(s.firstName),
      csvCell(s.gender),
      csvCell(s.birthDate),
      csvCell(s.birthPlace),
      csvCell(classMap.get(s.classId) || s.classId),
      csvCell(s.status),
      csvCell(s.fatherName || ''),
      csvCell(s.motherName || ''),
      csvCell(s.emergencyPhone || ''),
      csvCell(s.address || ''),
      csvCell(s.city || '')
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LISTE_ELEVES_${db.schoolConfig.acronym}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
