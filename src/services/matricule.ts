// EduGasy Pro - Dynamic Matricule Engine
import { MatriculeConfig, Student } from '../types/school';

export class MatriculeService {
  /**
   * Generates a new unique matricule based on the current configuration and existing students
   */
  static generateNextMatricule(
    config: MatriculeConfig,
    existingStudents: Student[],
    options?: { level?: string; year?: string }
  ): { matricule: string; updatedCounter: number } {
    const currentYear = new Date().getFullYear();
    const yearFull = (options?.year || String(currentYear));
    const yearShort = yearFull.slice(-2);
    
    // Find highest existing counter or use config.currentCounter + 1
    let nextCounter = config.currentCounter + 1;

    // Pattern placeholders replacement
    const numDigits = config.numDigits || 4;
    let formattedNum = String(nextCounter).padStart(numDigits, '0');

    let matricule = config.pattern;
    matricule = matricule.replace('{PREFIX}', config.prefix || 'EDG');
    matricule = matricule.replace('{YYYY}', yearFull);
    matricule = matricule.replace('{YY}', yearShort);
    matricule = matricule.replace('{LEVEL}', (options?.level || 'GEN').toUpperCase());
    matricule = matricule.replace(/\{NUM\d*\}/, formattedNum);

    // Fallback if pattern didn't contain NUM placeholder
    if (!config.pattern.includes('{NUM')) {
      matricule = `${config.prefix}${config.separator}${config.includeYear ? (config.yearFormat === 'YYYY' ? yearFull : yearShort) + config.separator : ''}${formattedNum}`;
    }

    // Ensure uniqueness
    const existingMatricules = new Set(existingStudents.map(s => s.matricule.toUpperCase()));
    while (existingMatricules.has(matricule.toUpperCase())) {
      nextCounter++;
      formattedNum = String(nextCounter).padStart(numDigits, '0');
      matricule = config.pattern;
      matricule = matricule.replace('{PREFIX}', config.prefix || 'EDG');
      matricule = matricule.replace('{YYYY}', yearFull);
      matricule = matricule.replace('{YY}', yearShort);
      matricule = matricule.replace('{LEVEL}', (options?.level || 'GEN').toUpperCase());
      matricule = matricule.replace(/\{NUM\d*\}/, formattedNum);
      if (!config.pattern.includes('{NUM')) {
        matricule = `${config.prefix}${config.separator}${config.includeYear ? (config.yearFormat === 'YYYY' ? yearFull : yearShort) + config.separator : ''}${formattedNum}`;
      }
    }

    return {
      matricule,
      updatedCounter: nextCounter
    };
  }

  /**
   * Generates a sample preview of how the matricule will look with current configuration
   */
  static previewPattern(config: MatriculeConfig): string {
    const yearFull = String(new Date().getFullYear());
    const yearShort = yearFull.slice(-2);
    const formattedNum = String(config.currentCounter || 1).padStart(config.numDigits || 4, '0');
    
    let matricule = config.pattern || '{PREFIX}-{YYYY}-{NUM4}';
    matricule = matricule.replace('{PREFIX}', config.prefix || 'EDG');
    matricule = matricule.replace('{YYYY}', yearFull);
    matricule = matricule.replace('{YY}', yearShort);
    matricule = matricule.replace('{LEVEL}', 'LYC');
    matricule = matricule.replace(/\{NUM\d*\}/, formattedNum);

    if (!config.pattern.includes('{NUM')) {
      matricule = `${config.prefix}${config.separator}${config.includeYear ? (config.yearFormat === 'YYYY' ? yearFull : yearShort) + config.separator : ''}${formattedNum}`;
    }

    return matricule;
  }
}
