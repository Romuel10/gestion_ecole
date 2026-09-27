import { DatabaseSchema } from '../types/school';
import { INITIAL_DATA } from '../data/initialData';

const DB_KEY = 'EDUGASY_PRO_LOCAL_DB_V2';

export class StorageService {
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
      const parsed = JSON.parse(raw) as DatabaseSchema;
      // Basic sanity checks
      if (!parsed.version || !parsed.students || !parsed.teachers || !parsed.classes) {
        console.warn('Invalid schema found in localStorage, restoring defaults...');
        this.saveDatabase(INITIAL_DATA);
        return INITIAL_DATA;
      }
      return parsed;
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
          const parsed = JSON.parse(content) as DatabaseSchema;
          if (!parsed.schoolConfig || !parsed.students || !parsed.classes) {
            throw new Error('Fichier de sauvegarde invalide ou incomplet.');
          }
          this.saveDatabase(parsed);
          resolve(parsed);
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

    const rows = db.students.map(s => [
      `"${s.matricule}"`,
      `"${s.lastName}"`,
      `"${s.firstName}"`,
      `"${s.gender}"`,
      `"${s.birthDate}"`,
      `"${s.birthPlace}"`,
      `"${classMap.get(s.classId) || s.classId}"`,
      `"${s.status}"`,
      `"${s.fatherName || ''}"`,
      `"${s.motherName || ''}"`,
      `"${s.emergencyPhone || ''}"`,
      `"${s.address || ''}"`,
      `"${s.city || ''}"`
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
