import { DatabaseSchema } from '../types/school';
import { INITIAL_DATA } from '../data/initialData';
import { DesktopStorageService } from './desktopStorage';
import { mergeDatabaseChanges, mergeTeacherChanges } from './databaseMerge';
import { validateBackup } from './backupValidation';

const DB_KEY = 'SEKOLY_BROWSER_CACHE_V1';

export class StorageService {
  private static current: DatabaseSchema | null = null;
  private static writes: Promise<unknown> = Promise.resolve();
  private static dailyBackupDate = '';

  private static cache(db: DatabaseSchema): void {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  }

  static getCurrentDatabase(): DatabaseSchema {
    return structuredClone(this.current ?? this.loadDatabase());
  }
  private static normalizeDatabase(candidate: Partial<DatabaseSchema>): DatabaseSchema {
    if (!candidate || typeof candidate !== 'object' || !candidate.schoolConfig) {
      throw new Error('Schéma de base de données invalide.');
    }

    const rawSchoolYears = Array.isArray(candidate.schoolYears) ? candidate.schoolYears : [];
    const currentSchoolYearId =
      candidate.currentSchoolYearId ||
      rawSchoolYears.find((year) => year.isCurrent)?.id ||
      rawSchoolYears[0]?.id ||
      INITIAL_DATA.currentSchoolYearId;
    const schoolYears = rawSchoolYears.map((year) => ({
      ...year,
      status:
        year.status ||
        (year.id === currentSchoolYearId
          ? ('ACTIVE' as const)
          : year.closedAt
          ? ('CLOSED' as const)
          : ('PLANNED' as const)),
    }));

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
      cashDayClosures: Array.isArray(candidate.cashDayClosures) ? candidate.cashDayClosures : [],
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
        localStorage.setItem(DB_KEY, JSON.stringify(INITIAL_DATA));
        this.current = structuredClone(INITIAL_DATA);
        return this.current;
      }
      const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
      this.current = this.normalizeDatabase(parsed);
      return this.current;
    } catch (e) {
      console.error('Failed to load browser cache, fallback to initial data', e);
      this.current = structuredClone(INITIAL_DATA);
      return this.current;
    }
  }

  static async hydrateDesktopDatabase(): Promise<DatabaseSchema | null> {
    if (!DesktopStorageService.isDesktop()) return null;

    try {
      const desktopDb = await DesktopStorageService.loadDatabase();
      if (!desktopDb) {
        const fresh = JSON.parse(JSON.stringify(INITIAL_DATA)) as DatabaseSchema;
        await DesktopStorageService.saveDatabase(fresh);
        this.current = fresh;
        try { this.cache(fresh); } catch { /* SQLite is the durable source. */ }
        return fresh;
      }

      const normalized = this.normalizeDatabase(desktopDb);
      this.current = normalized;
      try { this.cache(normalized); } catch { /* A full browser cache must not block SQLite. */ }
      return normalized;
    } catch (error) {
      console.error('Failed to hydrate SQLite database', error);
      throw new Error('Impossible de lire la base locale. Fermez puis relancez Sekoly, ou vérifiez l’accès au dossier de données. Vos données ne sont pas réinitialisées.', { cause: error });
    }
  }

  /**
   * Serializes writes and publishes state only after durable storage succeeds.
   */
  static saveDatabase(db: DatabaseSchema, base?: DatabaseSchema, teacherSync = false, guard?: (current: DatabaseSchema) => void): Promise<DatabaseSchema> {
    const proposed = structuredClone(db);
    const original = base ? structuredClone(base) : null;
    const write = this.writes.catch(() => undefined).then(async () => {
      guard?.(this.current || original || proposed);
      const next = original && this.current
        ? (teacherSync ? mergeTeacherChanges : mergeDatabaseChanges)(this.current, original, proposed)
        : proposed;
      next.lastUpdated = new Date().toISOString();
      if (DesktopStorageService.isDesktop()) {
        await DesktopStorageService.saveDatabase(next);
        try { this.cache(next); } catch (error) { console.warn('Cache navigateur indisponible.', error); }
      } else {
        this.cache(next);
      }
      this.current = structuredClone(next);
      return next;
    });
    this.writes = write;
    return write;
  }

  static async saveDatabaseOrNotify(db: DatabaseSchema, base: DatabaseSchema, notify: (message: string, type: 'error') => void, teacherSync = false, guard?: (current: DatabaseSchema) => void): Promise<DatabaseSchema | null> {
    try { return await this.saveDatabase(db, base, teacherSync, guard); }
    catch (error) {
      notify(`Enregistrement impossible : ${error instanceof Error ? error.message : String(error)}. Réessayez avant de fermer.`, 'error');
      return null;
    }
  }

  /**
   * Resets database to default Madagascar sample dataset
   */
  static async resetToDefault(): Promise<DatabaseSchema> {
    const fresh = JSON.parse(JSON.stringify(INITIAL_DATA)) as DatabaseSchema;
    return this.saveDatabase(fresh);
  }

  static async getDesktopDatabasePath(): Promise<string | null> {
    return DesktopStorageService.getDatabasePath();
  }

  static async createRecoveryBackup(): Promise<string> {
    await this.writes.catch(() => undefined);
    const current = this.getCurrentDatabase();
    if (DesktopStorageService.isDesktop()) return DesktopStorageService.createRecoveryBackup(current);
    localStorage.setItem('SEKOLY_RECOVERY_BACKUP_V1', JSON.stringify(current));
    return 'Copie de secours du navigateur';
  }

  static async ensureDailyLocalBackup(): Promise<string | null> {
    const today = new Date().toISOString().slice(0, 10);
    if (this.dailyBackupDate === today) return null;
    await this.writes.catch(() => undefined);
    const current = this.getCurrentDatabase();
    const path = DesktopStorageService.isDesktop()
      ? await DesktopStorageService.createDailyBackup(current)
      : (localStorage.setItem('SEKOLY_DAILY_BACKUP_V1', JSON.stringify(current)), 'Copie quotidienne du navigateur');
    this.dailyBackupDate = today;
    return path;
  }

  /**
   * Exports the entire database as a downloadable JSON backup file
   */
  static exportBackupJSON(db: DatabaseSchema): void {
    const jsonStr = JSON.stringify(db, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `SEKOLY_BACKUP_${db.schoolConfig.acronym || 'ECOLE'}_${dateStr}.json`;
    
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
  static async importBackupJSON(file: File): Promise<DatabaseSchema> {
    const parsed = JSON.parse(await file.text()) as Partial<DatabaseSchema>;
    validateBackup(parsed);
    return this.normalizeDatabase(parsed);
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
