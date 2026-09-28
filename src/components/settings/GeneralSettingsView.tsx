import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CalendarRange,
  School,
  BookOpen,
  Hash,
  Database,
  Plus,
  Pencil,
  Trash2,
  Save,
  Download,
  Upload,
  RotateCcw,
  X,
  ListChecks,
  Archive,
  FileCog,
  Cloud,
  LogIn,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import {
  AnnualDecisionRule,
  DatabaseSchema,
  MatriculeConfig,
  SchoolClass,
  SchoolConfig,
  SchoolLevel,
  SchoolYear,
  Subject,
  TermType,
} from '../../types/school';
import { StorageService } from '../../services/storage';
import { MatriculeService } from '../../services/matricule';
import { CalculationService } from '../../services/calculations';
import { SchoolYearClosureService } from '../../services/schoolYearClosure';
import { CloudSyncService, PilotSmokeTest, PilotStatus, SyncMonitor } from '../../services/cloudSync';
import { Modal } from '../common/Modal';

interface GeneralSettingsViewProps {
  db: DatabaseSchema;
  onUpdateDb: (updated: DatabaseSchema) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type SettingsTab =
  | 'SCHOOL'
  | 'ACADEMIC'
  | 'CLOSURE'
  | 'DECISIONS'
  | 'DOCUMENTS'
  | 'CLASSES'
  | 'SUBJECTS'
  | 'MATRICULE'
  | 'CLOUD'
  | 'DATA';

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const slugCode = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export const GeneralSettingsView: React.FC<GeneralSettingsViewProps> = ({
  db,
  onUpdateDb,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('SCHOOL');
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>(db.schoolConfig);
  const [matriculeConfig, setMatriculeConfig] = useState<MatriculeConfig>(db.matriculeConfig);

  const [classDraft, setClassDraft] = useState<SchoolClass | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);

  const [subjectDraft, setSubjectDraft] = useState<Subject | null>(null);
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);

  const [yearDraft, setYearDraft] = useState<SchoolYear | null>(null);
  const [editingYearId, setEditingYearId] = useState<string | null>(null);
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termDraft, setTermDraft] = useState<{
    schoolYearId: string;
    id: string;
    code: TermType;
    label: string;
    startDate: string;
    endDate: string;
    weight: number;
    isLocked: boolean;
  } | null>(null);

  const [newSchoolMonth, setNewSchoolMonth] = useState('');
  const [allowClosureWithReview, setAllowClosureWithReview] = useState(false);
  const [closureNote, setClosureNote] = useState('');
  const [cloudEmail, setCloudEmail] = useState('');
  const [cloudPassword, setCloudPassword] = useState('');
  const [cloudConnected, setCloudConnected] = useState(CloudSyncService.isConnected());
  const [cloudSchoolId, setCloudSchoolId] = useState<string | null>(
    CloudSyncService.getSchoolId()
  );
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudStats, setCloudStats] = useState<Record<string, number> | null>(null);
  const [invitingTeacherId, setInvitingTeacherId] = useState<string | null>(null);
  const [pilotAccess, setPilotAccess] = useState<{
    teacherName: string;
    email: string;
    temporaryPassword: string;
  } | null>(null);
  const [pilotStatus, setPilotStatus] = useState<PilotStatus | null>(null);
  const [pilotStatusBusy, setPilotStatusBusy] = useState(false);
  const [pilotSmokeTest, setPilotSmokeTest] = useState<PilotSmokeTest | null>(null);
  const [pilotSmokeBusy, setPilotSmokeBusy] = useState(false);
  const [syncMonitor, setSyncMonitor] = useState<SyncMonitor | null>(null);
  const [syncMonitorBusy, setSyncMonitorBusy] = useState(false);

  useEffect(() => {
    if (!cloudConnected || cloudSchoolId) return;

    CloudSyncService.attachExistingMembership()
      .then((membership) => {
        if (membership?.school_id) setCloudSchoolId(membership.school_id);
      })
      .catch(() => undefined);
  }, [cloudConnected, cloudSchoolId]);

  const activeSchoolYear = db.schoolYears.find((year) => year.id === db.currentSchoolYearId);
  const activeSchoolYearStart = activeSchoolYear?.startDate.slice(0, 4);
  const matriculePreview = MatriculeService.previewPattern(matriculeConfig, activeSchoolYearStart);

  const updateDatabase = (updated: DatabaseSchema, message: string) => {
    StorageService.saveDatabase(updated);
    onUpdateDb(updated);
    onShowToast(message, 'success');
  };

  const closurePreview = (() => {
    try {
      return SchoolYearClosureService.preview(db);
    } catch {
      return null;
    }
  })();

  const handleCloseSchoolYear = () => {
    if (!closurePreview) {
      onShowToast('Impossible de préparer la clôture de cette année.', 'error');
      return;
    }
    if (!closurePreview.nextYear) {
      onShowToast('Créez d’abord l’année scolaire suivante.', 'error');
      return;
    }

    const warning = [
      `Clôturer définitivement ${closurePreview.year.label} ?`,
      '',
      'Cette action va :',
      '- verrouiller toutes les périodes ;',
      '- enregistrer les décisions annuelles ;',
      '- préparer les dossiers admis/redoublants pour l’année suivante ;',
      `- activer ${closurePreview.nextYear.label}.`,
      '',
      'Les notes et paiements de l’année clôturée resteront archivés.',
    ].join('\n');

    if (!window.confirm(warning)) return;

    try {
      const result = SchoolYearClosureService.close(db, db.currentSchoolYearId, {
        allowReview: allowClosureWithReview,
        closureNote,
      });
      StorageService.saveDatabase(result.db);
      onUpdateDb(result.db);
      setClosureNote('');
      onShowToast(
        `Année clôturée. ${result.report.preparedNextYear} dossier(s) préparé(s) pour la rentrée suivante.`,
        'success'
      );
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Erreur pendant la clôture.',
        'error'
      );
    }
  };

  const handleCloudSignup = async () => {
    if (!cloudEmail.trim() || cloudPassword.length < 8) {
      onShowToast(
        'Utilisez une adresse email valide et un mot de passe d’au moins 8 caractères.',
        'error'
      );
      return;
    }

    setCloudBusy(true);
    try {
      const result = await CloudSyncService.signup(cloudEmail, cloudPassword);
      if (result.session) {
        setCloudConnected(true);
        onShowToast('Compte Sekoly Cloud créé et connecté.', 'success');
      } else {
        onShowToast(
          'Compte créé. Confirmez l’adresse email puis utilisez Se connecter.',
          'info'
        );
      }
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Création du compte impossible.',
        'error'
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudLogin = async () => {
    if (!cloudEmail.trim() || !cloudPassword) {
      onShowToast('Saisissez votre email et votre mot de passe Cloud.', 'error');
      return;
    }

    setCloudBusy(true);
    try {
      await CloudSyncService.login(cloudEmail, cloudPassword);
      setCloudConnected(true);
      const membership = await CloudSyncService.attachExistingMembership();
      if (membership?.school_id) setCloudSchoolId(membership.school_id);
      onShowToast('Connexion Sekoly Cloud réussie.', 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Connexion Cloud impossible.',
        'error'
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCreateCloudSchool = async () => {
    if (
      !db.schoolConfig.name.trim() ||
      db.schoolConfig.name === 'Nouvel établissement'
    ) {
      onShowToast(
        'Configurez d’abord le nom réel de l’établissement dans Informations établissement.',
        'error'
      );
      return;
    }

    setCloudBusy(true);
    try {
      const school = await CloudSyncService.createSchool(db);
      setCloudSchoolId(school.id);
      onShowToast(`${school.name} est maintenant créé dans Sekoly Cloud.`, 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Création Cloud impossible.',
        'error'
      );
    } finally {
      setCloudBusy(false);
    }
  };

  const handleCloudSync = async () => {
    setCloudBusy(true);
    void CloudSyncService.recordAdminSyncEvent('SYNC_START', 'OK', {
      source: 'manual_bidirectional_sync',
    });

    try {
      const stats = await CloudSyncService.syncLocalStructure(db);
      const pulled = await CloudSyncService.pullTeacherChanges(db);

      if (pulled.attendanceAdded > 0 || pulled.gradesChanged > 0) {
        StorageService.saveDatabase(pulled.db);
        onUpdateDb(pulled.db);
      }

      setCloudStats({
        ...stats,
        attendanceAdded: pulled.attendanceAdded,
        gradesChanged: pulled.gradesChanged,
      });

      void CloudSyncService.recordAdminSyncEvent('SYNC_SUCCESS', 'OK', {
        students: stats.students,
        teachers: stats.teachers,
        assignments: stats.assignments,
        attendanceAdded: pulled.attendanceAdded,
        gradesChanged: pulled.gradesChanged,
      });

      onShowToast(
        `Synchronisation bidirectionnelle terminée : ${stats.students} élève(s), ${stats.teachers} enseignant(s), ${pulled.attendanceAdded} présence(s) reçue(s), ${pulled.gradesChanged} fiche(s) de notes mise(s) à jour.`,
        'success'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Synchronisation Cloud impossible.';

      void CloudSyncService.recordAdminSyncEvent(
        'SYNC_ERROR',
        'ERROR',
        { source: 'manual_bidirectional_sync' },
        message
      );

      onShowToast(message, 'error');
    } finally {
      setCloudBusy(false);
    }
  };

  const handlePilotStatus = async () => {
    setPilotStatusBusy(true);
    try {
      const status = await CloudSyncService.pilotStatus();
      setPilotStatus(status);
      onShowToast(
        status.mobileReady
          ? 'Pilote mobile prêt pour les tests.'
          : 'Diagnostic pilote actualisé.',
        status.mobileReady ? 'success' : 'info'
      );
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Diagnostic pilote impossible.',
        'error'
      );
    } finally {
      setPilotStatusBusy(false);
    }
  };

  const handlePilotSmokeTest = async () => {
    setPilotSmokeBusy(true);
    try {
      const result = await CloudSyncService.runPilotSmokeTest();
      setPilotSmokeTest(result);
      onShowToast(
        result.ready
          ? 'Test pilote réussi : le parcours mobile peut être testé.'
          : `Test pilote : ${result.blocking.length} prérequis obligatoire(s) à compléter.`,
        result.ready ? 'success' : 'info'
      );
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Test pilote impossible.',
        'error'
      );
    } finally {
      setPilotSmokeBusy(false);
    }
  };

  const handleSyncMonitor = async () => {
    setSyncMonitorBusy(true);
    try {
      const monitor = await CloudSyncService.syncMonitor();
      setSyncMonitor(monitor);
      onShowToast('Supervision des synchronisations actualisée.', 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Supervision Cloud impossible.',
        'error'
      );
    } finally {
      setSyncMonitorBusy(false);
    }
  };

  const handleProvisionPilotTeacher = async (teacherId: string) => {
    const teacher = db.teachers.find((item) => item.id === teacherId);
    if (!teacher) return;

    setInvitingTeacherId(teacherId);
    try {
      await CloudSyncService.syncLocalStructure(db);
      const result = await CloudSyncService.provisionTeacherPilot(db, teacherId);
      setPilotAccess({
        teacherName: `${teacher.lastName} ${teacher.firstName}`,
        email: teacher.email || '',
        temporaryPassword: result.temporaryPassword,
      });
      onShowToast(
        'Accès pilote créé. Communiquez le mot de passe temporaire à l’enseignant.',
        'success'
      );
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Création de l’accès pilote impossible.',
        'error'
      );
    } finally {
      setInvitingTeacherId(null);
    }
  };

  const handleSendTeacherActivation = async (teacherId: string) => {
    setInvitingTeacherId(teacherId);
    try {
      await CloudSyncService.sendTeacherActivation(db, teacherId);
      onShowToast('Lien d’activation Sekoly envoyé par email.', 'success');
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Envoi du lien d’activation impossible.',
        'error'
      );
    } finally {
      setInvitingTeacherId(null);
    }
  };

  const handleInviteCloudTeacher = async (teacherId: string) => {
    setInvitingTeacherId(teacherId);
    try {
      await CloudSyncService.syncLocalStructure(db);
      await CloudSyncService.inviteTeacher(db, teacherId);
      onShowToast(
        'Invitation envoyée. L’enseignant pourra activer son compte mobile depuis son email.',
        'success'
      );
    } catch (error) {
      onShowToast(
        error instanceof Error ? error.message : 'Invitation impossible.',
        'error'
      );
    } finally {
      setInvitingTeacherId(null);
    }
  };

  const handleCloudLogout = () => {
    CloudSyncService.logout();
    setCloudConnected(false);
    setCloudSchoolId(null);
    setCloudStats(null);
    onShowToast('Session Sekoly Cloud fermée.', 'info');
  };

  const handleSaveSchool = (event: React.FormEvent) => {
    event.preventDefault();
    if (!schoolConfig.name.trim()) {
      onShowToast("Le nom de l'établissement est obligatoire.", 'error');
      return;
    }
    updateDatabase({ ...db, schoolConfig }, 'Paramètres de l’établissement enregistrés.');
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onShowToast('Sélectionnez une image PNG ou JPG.', 'error');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onShowToast('Le logo doit faire moins de 2 Mo.', 'error');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const logoUrl = typeof reader.result === 'string' ? reader.result : '';
      setSchoolConfig((current) => ({ ...current, logoUrl }));
      onShowToast('Logo chargé. Enregistrez les paramètres pour le conserver.', 'info');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSaveMatricule = (event: React.FormEvent) => {
    event.preventDefault();
    if (!matriculeConfig.pattern.trim() || !matriculeConfig.prefix.trim()) {
      onShowToast('Le modèle et le préfixe du matricule sont obligatoires.', 'error');
      return;
    }
    updateDatabase({ ...db, matriculeConfig }, 'Règles de matricule enregistrées.');
  };

  const setMatriculePreset = (preset: 'CLASSIC' | 'SIMPLE' | 'LEVEL') => {
    const prefix = matriculeConfig.prefix || db.schoolConfig.acronym || 'ECOLE';
    const separator = matriculeConfig.separator || '-';
    const numberToken = `{NUM${matriculeConfig.numDigits || 4}}`;
    const yearToken = matriculeConfig.yearFormat === 'YY' ? '{YY}' : '{YYYY}';

    const pattern =
      preset === 'SIMPLE'
        ? `{PREFIX}${separator}${numberToken}`
        : preset === 'LEVEL'
        ? `{PREFIX}${separator}{LEVEL}${separator}${yearToken}${separator}${numberToken}`
        : `{PREFIX}${separator}${yearToken}${separator}${numberToken}`;

    setMatriculeConfig({
      ...matriculeConfig,
      prefix,
      pattern,
      includeYear: preset !== 'SIMPLE',
    });
  };

  const rebuildSimpleMatriculePattern = (patch: Partial<MatriculeConfig>) => {
    const next = { ...matriculeConfig, ...patch };
    const separator = next.separator || '-';
    const numberToken = `{NUM${next.numDigits || 4}}`;
    const yearToken = next.yearFormat === 'YY' ? '{YY}' : '{YYYY}';
    const hasLevel = next.pattern.includes('{LEVEL}');
    const pattern = [
      '{PREFIX}',
      ...(hasLevel ? ['{LEVEL}'] : []),
      ...(next.includeYear ? [yearToken] : []),
      numberToken,
    ].join(separator);
    setMatriculeConfig({ ...next, pattern });
  };

  const decisionRules =
    schoolConfig.annualDecisionRules || db.schoolConfig.annualDecisionRules || [];

  const updateDecisionRule = (
    ruleId: string,
    patch: Partial<AnnualDecisionRule>
  ) => {
    setSchoolConfig({
      ...schoolConfig,
      annualDecisionRules: decisionRules.map((rule) =>
        rule.id === ruleId ? { ...rule, ...patch } : rule
      ),
    });
  };

  const addDecisionRule = () => {
    const nextRule: AnnualDecisionRule = {
      id: makeId('decision'),
      label: 'Nouvelle décision',
      outcome: 'REVIEW',
      minAverage: 0,
      maxAverage: 20,
    };
    setSchoolConfig({
      ...schoolConfig,
      annualDecisionRules: [...decisionRules, nextRule],
    });
  };

  const removeDecisionRule = (ruleId: string) => {
    setSchoolConfig({
      ...schoolConfig,
      annualDecisionRules: decisionRules.filter((rule) => rule.id !== ruleId),
    });
  };

  const saveDecisionRules = () => {
    const rules = schoolConfig.annualDecisionRules || [];
    const invalid = rules.some(
      (rule) =>
        !rule.label.trim() ||
        rule.minAverage < 0 ||
        rule.maxAverage > 20 ||
        rule.minAverage > rule.maxAverage
    );
    if (invalid) {
      onShowToast('Vérifiez les libellés et les intervalles de moyenne.', 'error');
      return;
    }

    const updatedConfig: SchoolConfig = {
      ...schoolConfig,
      annualDecisionRules: rules,
    };
    setSchoolConfig(updatedConfig);
    updateDatabase(
      { ...db, schoolConfig: updatedConfig },
      'Règles de décision annuelle enregistrées.'
    );
  };

  const saveMonths = (months: string[]) => {
    const cleaned = months.map((month) => month.trim()).filter(Boolean);
    const updatedConfig = { ...schoolConfig, schoolMonths: Array.from(new Set(cleaned)) };
    setSchoolConfig(updatedConfig);
    updateDatabase({ ...db, schoolConfig: updatedConfig }, 'Calendrier d’écolage mis à jour.');
  };

  const addSchoolMonth = () => {
    const month = newSchoolMonth.trim();
    if (!month) return;
    if (db.schoolConfig.schoolMonths.some((item) => item.toLowerCase() === month.toLowerCase())) {
      onShowToast('Cette période d’écolage existe déjà.', 'error');
      return;
    }
    saveMonths([...db.schoolConfig.schoolMonths, month]);
    setNewSchoolMonth('');
  };

  const openNewClass = () => {
    setEditingClassId(null);
    setClassDraft({
      id: makeId('cls'),
      code: '',
      name: '',
      level: 'college',
      serie: 'GENERALE',
      room: '',
      capacity: 35,
      mainTeacherId: undefined,
      subjects: [],
      monthlyTuitionFee: 0,
      registrationFee: 0,
      reRegistrationFee: 0,
    });
  };

  const saveClass = () => {
    if (!classDraft) return;
    if (!classDraft.name.trim() || !classDraft.code.trim()) {
      onShowToast('Le nom et le code de la classe sont obligatoires.', 'error');
      return;
    }

    const duplicateCode = db.classes.some(
      (schoolClass) =>
        schoolClass.id !== editingClassId &&
        schoolClass.code.trim().toUpperCase() === classDraft.code.trim().toUpperCase()
    );
    if (duplicateCode) {
      onShowToast('Ce code de classe est déjà utilisé.', 'error');
      return;
    }

    const normalized: SchoolClass = {
      ...classDraft,
      name: classDraft.name.trim(),
      code: classDraft.code.trim().toUpperCase(),
      serie: classDraft.serie?.trim() || 'GENERALE',
      room: classDraft.room.trim(),
      capacity: Math.max(1, Number(classDraft.capacity) || 1),
      monthlyTuitionFee: Math.max(0, Number(classDraft.monthlyTuitionFee) || 0),
      registrationFee: Math.max(0, Number(classDraft.registrationFee) || 0),
      reRegistrationFee: Math.max(0, Number(classDraft.reRegistrationFee) || 0),
    };

    const classes = editingClassId
      ? db.classes.map((item) => (item.id === editingClassId ? normalized : item))
      : [...db.classes, normalized];

    updateDatabase({ ...db, classes }, editingClassId ? 'Classe modifiée.' : 'Classe ajoutée.');
    setClassDraft(null);
    setEditingClassId(null);
  };

  const deleteClass = (schoolClass: SchoolClass) => {
    const isUsed =
      db.students.some((student) => student.classId === schoolClass.id) ||
      db.grades.some((grade) => grade.classId === schoolClass.id) ||
      db.timetableSlots.some((slot) => slot.classId === schoolClass.id) ||
      db.tuitionPayments.some((payment) => payment.classId === schoolClass.id);

    if (isUsed) {
      onShowToast('Cette classe possède un historique. Elle ne peut pas être supprimée.', 'error');
      return;
    }
    if (!window.confirm(`Supprimer la classe « ${schoolClass.name} » ?`)) return;

    updateDatabase(
      { ...db, classes: db.classes.filter((item) => item.id !== schoolClass.id) },
      'Classe supprimée.'
    );
  };

  const toggleClassSubject = (subject: Subject) => {
    if (!classDraft) return;
    const existing = classDraft.subjects.find((item) => item.subjectId === subject.id);
    setClassDraft({
      ...classDraft,
      subjects: existing
        ? classDraft.subjects.filter((item) => item.subjectId !== subject.id)
        : [
            ...classDraft.subjects,
            {
              subjectId: subject.id,
              coefficient: subject.defaultCoeff,
              weeklyHours: 1,
            },
          ],
    });
  };

  const updateClassSubject = (
    subjectId: string,
    patch: Partial<SchoolClass['subjects'][number]>
  ) => {
    if (!classDraft) return;
    setClassDraft({
      ...classDraft,
      subjects: classDraft.subjects.map((item) =>
        item.subjectId === subjectId ? { ...item, ...patch } : item
      ),
    });
  };

  const openNewSubject = () => {
    setEditingSubjectId(null);
    setSubjectDraft({
      id: makeId('sub'),
      code: '',
      name: '',
      category: 'LITTERAIRE',
      color: '#64748b',
      defaultCoeff: 1,
    });
  };

  const saveSubject = () => {
    if (!subjectDraft) return;
    if (!subjectDraft.name.trim() || !subjectDraft.code.trim()) {
      onShowToast('Le nom et le code de la matière sont obligatoires.', 'error');
      return;
    }
    const duplicate = db.subjects.some(
      (subject) =>
        subject.id !== editingSubjectId &&
        subject.code.trim().toUpperCase() === subjectDraft.code.trim().toUpperCase()
    );
    if (duplicate) {
      onShowToast('Ce code matière est déjà utilisé.', 'error');
      return;
    }

    const normalized = {
      ...subjectDraft,
      code: subjectDraft.code.trim().toUpperCase(),
      name: subjectDraft.name.trim(),
      defaultCoeff: Math.max(0.5, Number(subjectDraft.defaultCoeff) || 1),
    };

    const subjects = editingSubjectId
      ? db.subjects.map((subject) => (subject.id === editingSubjectId ? normalized : subject))
      : [...db.subjects, normalized];

    updateDatabase({ ...db, subjects }, editingSubjectId ? 'Matière modifiée.' : 'Matière ajoutée.');
    setSubjectDraft(null);
    setEditingSubjectId(null);
  };

  const deleteSubject = (subject: Subject) => {
    const isUsed =
      db.classes.some((schoolClass) =>
        schoolClass.subjects.some((item) => item.subjectId === subject.id)
      ) ||
      db.grades.some((grade) => grade.subjectId === subject.id) ||
      db.timetableSlots.some((slot) => slot.subjectId === subject.id);

    if (isUsed) {
      onShowToast('Cette matière est utilisée dans une classe ou possède des notes.', 'error');
      return;
    }
    if (!window.confirm(`Supprimer la matière « ${subject.name} » ?`)) return;

    updateDatabase(
      { ...db, subjects: db.subjects.filter((item) => item.id !== subject.id) },
      'Matière supprimée.'
    );
  };

  const openNewYear = () => {
    setEditingYearId(null);
    const latest = [...db.schoolYears].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const startYear = latest ? Number(latest.startDate.slice(0, 4)) + 1 : new Date().getFullYear();
    setYearDraft({
      id: makeId('sy'),
      label: `${startYear} - ${startYear + 1}`,
      startDate: `${startYear}-09-01`,
      endDate: `${startYear + 1}-06-30`,
      isCurrent: false,
      status: 'PLANNED',
      terms: [],
    });
  };

  const saveYear = () => {
    if (!yearDraft) return;
    if (!yearDraft.label.trim() || !yearDraft.startDate || !yearDraft.endDate) {
      onShowToast('Le libellé et les dates de l’année scolaire sont obligatoires.', 'error');
      return;
    }
    if (yearDraft.startDate >= yearDraft.endDate) {
      onShowToast('La date de fin doit être postérieure à la date de début.', 'error');
      return;
    }

    const schoolYears = editingYearId
      ? db.schoolYears.map((year) =>
          year.id === editingYearId ? { ...yearDraft, id: editingYearId } : year
        )
      : [...db.schoolYears, yearDraft];

    updateDatabase(
      { ...db, schoolYears },
      editingYearId ? 'Année scolaire modifiée.' : 'Année scolaire ajoutée.'
    );
    setYearDraft(null);
    setEditingYearId(null);
  };

  const deleteYear = (schoolYear: SchoolYear) => {
    if (schoolYear.id === db.currentSchoolYearId) {
      onShowToast('L’année scolaire active ne peut pas être supprimée.', 'error');
      return;
    }
    const hasHistory =
      db.students.some((student) => student.schoolYearId === schoolYear.id) ||
      db.grades.some((grade) => grade.schoolYearId === schoolYear.id) ||
      db.tuitionPayments.some((payment) => payment.schoolYearId === schoolYear.id) ||
      db.salaryPayments.some((payment) => payment.schoolYearId === schoolYear.id) ||
      db.cashTransactions.some((transaction) => transaction.schoolYearId === schoolYear.id);
    if (hasHistory) {
      onShowToast('Cette année possède un historique et ne peut pas être supprimée.', 'error');
      return;
    }
    if (!window.confirm(`Supprimer l’année scolaire « ${schoolYear.label} » ?`)) return;
    updateDatabase(
      { ...db, schoolYears: db.schoolYears.filter((year) => year.id !== schoolYear.id) },
      'Année scolaire supprimée.'
    );
  };

  const activateYear = (schoolYear: SchoolYear) => {
    const nextTermCode = schoolYear.terms[0]?.code || '';
    updateDatabase(
      {
        ...db,
        currentSchoolYearId: schoolYear.id,
        currentTermCode: nextTermCode,
        schoolYears: db.schoolYears.map((year) => ({
          ...year,
          isCurrent: year.id === schoolYear.id,
          status:
            year.id === schoolYear.id
              ? 'ACTIVE'
              : year.status === 'CLOSED'
              ? 'CLOSED'
              : 'PLANNED',
        })),
      },
      `Année scolaire ${schoolYear.label} activée.`
    );
  };

  const openNewTerm = (schoolYear: SchoolYear) => {
    setEditingTermId(null);
    const sequence = schoolYear.terms.length + 1;
    setTermDraft({
      schoolYearId: schoolYear.id,
      id: makeId('term'),
      code: `PERIODE_${sequence}`,
      label: `Période ${sequence}`,
      startDate: schoolYear.startDate,
      endDate: schoolYear.endDate,
      weight: 1,
      isLocked: false,
    });
  };

  const saveTerm = () => {
    if (!termDraft) return;
    const year = db.schoolYears.find((item) => item.id === termDraft.schoolYearId);
    if (!year) return;

    const code = slugCode(termDraft.code || termDraft.label) || `PERIODE_${year.terms.length + 1}`;
    if (!termDraft.label.trim() || !termDraft.startDate || !termDraft.endDate) {
      onShowToast('Le nom et les dates de la période sont obligatoires.', 'error');
      return;
    }
    if (termDraft.startDate >= termDraft.endDate) {
      onShowToast('La date de fin doit être postérieure à la date de début.', 'error');
      return;
    }
    if (year.terms.some((term) => term.id !== editingTermId && term.code === code)) {
      onShowToast('Ce code de période existe déjà pour cette année.', 'error');
      return;
    }

    const normalizedTerm = {
      id: editingTermId || termDraft.id,
      code,
      label: termDraft.label.trim(),
      startDate: termDraft.startDate,
      endDate: termDraft.endDate,
      weight: Math.max(0.1, Number(termDraft.weight) || 1),
      isLocked: termDraft.isLocked,
    };

    const schoolYears = db.schoolYears.map((item) =>
      item.id === year.id
        ? {
            ...item,
            terms: editingTermId
              ? item.terms.map((term) => (term.id === editingTermId ? normalizedTerm : term))
              : [...item.terms, normalizedTerm],
          }
        : item
    );

    const currentTermCode =
      db.currentSchoolYearId === year.id && year.terms.length === 0 ? code : db.currentTermCode;

    const previousCode = year.terms.find((term) => term.id === editingTermId)?.code;
    updateDatabase(
      {
        ...db,
        schoolYears,
        currentTermCode:
          editingTermId &&
          db.currentSchoolYearId === year.id &&
          db.currentTermCode === previousCode
            ? code
            : currentTermCode,
      },
      editingTermId ? 'Période académique modifiée.' : 'Période académique ajoutée.'
    );
    setTermDraft(null);
    setEditingTermId(null);
  };

  const toggleTermLock = (schoolYearId: string, termId: string) => {
    const schoolYears = db.schoolYears.map((year) =>
      year.id === schoolYearId
        ? {
            ...year,
            terms: year.terms.map((term) =>
              term.id === termId ? { ...term, isLocked: !term.isLocked } : term
            ),
          }
        : year
    );
    updateDatabase({ ...db, schoolYears }, 'État de la période mis à jour.');
  };

  const deleteTerm = (schoolYear: SchoolYear, termId: string) => {
    const term = schoolYear.terms.find((item) => item.id === termId);
    if (!term) return;
    const isUsed = db.grades.some(
      (grade) =>
        grade.schoolYearId === schoolYear.id &&
        grade.termCode === term.code
    );
    if (isUsed) {
      onShowToast('Cette période contient déjà des notes et ne peut pas être supprimée.', 'error');
      return;
    }
    if (!window.confirm(`Supprimer la période « ${term.label} » ?`)) return;

    const schoolYears = db.schoolYears.map((year) =>
      year.id === schoolYear.id
        ? { ...year, terms: year.terms.filter((item) => item.id !== termId) }
        : year
    );
    const fallbackTerm =
      schoolYears.find((year) => year.id === db.currentSchoolYearId)?.terms[0]?.code ||
      db.currentTermCode;
    updateDatabase(
      {
        ...db,
        schoolYears,
        currentTermCode:
          db.currentSchoolYearId === schoolYear.id && db.currentTermCode === term.code
            ? fallbackTerm
            : db.currentTermCode,
      },
      'Période supprimée.'
    );
  };

  const handleBackupUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await StorageService.importBackupJSON(file);
      StorageService.saveDatabase(imported);
      onUpdateDb(imported);
      setSchoolConfig(imported.schoolConfig);
      setMatriculeConfig(imported.matriculeConfig);
      onShowToast('Sauvegarde restaurée.', 'success');
    } catch (error) {
      onShowToast(error instanceof Error ? error.message : 'Sauvegarde invalide.', 'error');
    } finally {
      event.target.value = '';
    }
  };

  const resetDefaults = () => {
    if (!window.confirm('Réinitialiser toutes les données avec le jeu de démonstration ?')) return;
    const reset = StorageService.resetToDefault();
    onUpdateDb(reset);
    setSchoolConfig(reset.schoolConfig);
    setMatriculeConfig(reset.matriculeConfig);
    onShowToast('Données réinitialisées.', 'info');
  };

  const tabs = [
    { id: 'SCHOOL' as const, label: 'Établissement', icon: Building2 },
    { id: 'ACADEMIC' as const, label: 'Années et périodes', icon: CalendarRange },
    { id: 'CLOSURE' as const, label: 'Clôture annuelle', icon: Archive },
    { id: 'DECISIONS' as const, label: 'Décisions annuelles', icon: ListChecks },
    { id: 'DOCUMENTS' as const, label: 'Documents', icon: FileCog },
    { id: 'CLASSES' as const, label: 'Classes', icon: School },
    { id: 'SUBJECTS' as const, label: 'Matières', icon: BookOpen },
    { id: 'MATRICULE' as const, label: 'Matricules', icon: Hash },
    { id: 'CLOUD' as const, label: 'Cloud & mobile', icon: Cloud },
    { id: 'DATA' as const, label: 'Données', icon: Database },
  ];

  const teacherName = useMemo(
    () =>
      new Map(
        db.teachers.map((teacher) => [
          teacher.id,
          `${teacher.lastName} ${teacher.firstName}`,
        ])
      ),
    [db.teachers]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4">
      <aside className="page-panel p-2 h-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-left text-[11.5px] transition ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </aside>

      <div className="min-w-0">
        {activeTab === 'SCHOOL' && (
          <form onSubmit={handleSaveSchool} className="page-panel">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Informations de l’établissement</h2>
                <p className="page-panel__subtitle">Ces informations apparaissent sur les documents officiels.</p>
              </div>
              <button type="submit" className="button button--primary">
                <Save className="w-4 h-4" />
                Enregistrer
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <Field label="Nom de l’établissement">
                <input value={schoolConfig.name} onChange={(e) => setSchoolConfig({ ...schoolConfig, name: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Sigle">
                <input value={schoolConfig.acronym} onChange={(e) => setSchoolConfig({ ...schoolConfig, acronym: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Devise / slogan">
                <input value={schoolConfig.motto} onChange={(e) => setSchoolConfig({ ...schoolConfig, motto: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Code MEN / autorisation">
                <input value={schoolConfig.menCode || ''} onChange={(e) => setSchoolConfig({ ...schoolConfig, menCode: e.target.value })} className="settings-input" />
              </Field>
              <Field label="DREN">
                <input value={schoolConfig.dren || ''} onChange={(e) => setSchoolConfig({ ...schoolConfig, dren: e.target.value })} className="settings-input" />
              </Field>
              <Field label="CISCO">
                <input value={schoolConfig.cisco || ''} onChange={(e) => setSchoolConfig({ ...schoolConfig, cisco: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Adresse">
                <input value={schoolConfig.address} onChange={(e) => setSchoolConfig({ ...schoolConfig, address: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Ville">
                <input value={schoolConfig.city} onChange={(e) => setSchoolConfig({ ...schoolConfig, city: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Téléphone">
                <input value={schoolConfig.phone} onChange={(e) => setSchoolConfig({ ...schoolConfig, phone: e.target.value })} className="settings-input" />
              </Field>
              <Field label="E-mail">
                <input value={schoolConfig.email} onChange={(e) => setSchoolConfig({ ...schoolConfig, email: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Responsable de l’établissement">
                <input value={schoolConfig.directorName} onChange={(e) => setSchoolConfig({ ...schoolConfig, directorName: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Fonction du responsable">
                <input value={schoolConfig.directorTitle} onChange={(e) => setSchoolConfig({ ...schoolConfig, directorTitle: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Seuil de passage">
                <input type="number" min="0" max="20" step="0.25" value={schoolConfig.passingGrade} onChange={(e) => setSchoolConfig({ ...schoolConfig, passingGrade: Number(e.target.value) })} className="settings-input" />
              </Field>
              <Field label="Couleur des cartes scolaires">
                <input type="color" value={schoolConfig.badgeThemeColor} onChange={(e) => setSchoolConfig({ ...schoolConfig, badgeThemeColor: e.target.value })} className="settings-input h-9" />
              </Field>

              <div className="md:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-5">
                  <div>
                    <div className="text-[10.5px] font-semibold mb-2">Logo de l’établissement</div>
                    <div className="h-28 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex items-center justify-center overflow-hidden">
                      {schoolConfig.logoUrl ? (
                        <img src={schoolConfig.logoUrl} alt="Logo établissement" className="max-h-24 max-w-[150px] object-contain" />
                      ) : (
                        <span className="text-[10px] text-slate-400">Aucun logo</span>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <label className="button button--secondary cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        Choisir
                        <input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload} className="hidden" />
                      </label>
                      {schoolConfig.logoUrl && (
                        <button
                          type="button"
                          onClick={() => setSchoolConfig({ ...schoolConfig, logoUrl: undefined })}
                          className="button button--secondary"
                        >
                          Retirer
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Position du logo sur les documents">
                      <select
                        value={schoolConfig.documentLogoPosition || 'LEFT'}
                        onChange={(e) =>
                          setSchoolConfig({
                            ...schoolConfig,
                            documentLogoPosition: e.target.value as 'LEFT' | 'CENTER' | 'RIGHT',
                          })
                        }
                        className="settings-input"
                      >
                        <option value="LEFT">À gauche</option>
                        <option value="CENTER">Au centre</option>
                        <option value="RIGHT">À droite</option>
                      </select>
                    </Field>
                    <Field label="Largeur du logo sur PDF (mm)">
                      <input
                        type="number"
                        min="8"
                        max="40"
                        value={schoolConfig.documentLogoWidthMm || 18}
                        onChange={(e) =>
                          setSchoolConfig({
                            ...schoolConfig,
                            documentLogoWidthMm: Number(e.target.value),
                          })
                        }
                        className="settings-input"
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Titre du certificat de scolarité">
                        <input
                          value={schoolConfig.certificateTitle || 'CERTIFICAT DE SCOLARITÉ'}
                          onChange={(e) =>
                            setSchoolConfig({ ...schoolConfig, certificateTitle: e.target.value })
                          }
                          className="settings-input"
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Contenu du certificat de scolarité">
                        <textarea
                          rows={7}
                          value={schoolConfig.certificateTemplate || ''}
                          onChange={(e) =>
                            setSchoolConfig({ ...schoolConfig, certificateTemplate: e.target.value })
                          }
                          className="settings-input resize-y leading-relaxed"
                        />
                      </Field>
                      <div className="mt-1.5 text-[10px] text-slate-500">
                        Variables : {'{NOM_ET_PRENOMS}'}, {'{MATRICULE}'}, {'{DATE_NAISSANCE}'}, {'{LIEU_NAISSANCE}'}, {'{CLASSE}'}, {'{ANNEE_SCOLAIRE}'}, {'{DIRECTEUR}'}, {'{FONCTION}'}, {'{ETABLISSEMENT}'}, {'{VILLE}'}.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">Périodes d’écolage</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {db.schoolConfig.schoolMonths.map((month) => (
                    <span key={month} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px]">
                      {month}
                      <button type="button" onClick={() => saveMonths(db.schoolConfig.schoolMonths.filter((item) => item !== month))} className="text-slate-400 hover:text-rose-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex gap-2 max-w-md">
                  <input value={newSchoolMonth} onChange={(e) => setNewSchoolMonth(e.target.value)} placeholder="Ex. Juillet" className="settings-input" />
                  <button type="button" onClick={addSchoolMonth} className="button button--secondary">Ajouter</button>
                </div>
              </div>

              <div className="md:col-span-2">
                <Field label="Modèle du rappel d’écolage">
                  <textarea rows={4} value={schoolConfig.reminderTemplate} onChange={(e) => setSchoolConfig({ ...schoolConfig, reminderTemplate: e.target.value })} className="settings-input resize-y" />
                </Field>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'DOCUMENTS' && (
          <form onSubmit={handleSaveSchool} className="page-panel">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Documents scolaires</h2>
                <p className="page-panel__subtitle">
                  Titres, pied de page et identité commune des PDF/impressions.
                </p>
              </div>
              <button type="submit" className="button button--primary">
                <Save className="w-4 h-4" />
                Enregistrer
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <Field label="Titre du bulletin scolaire">
                <input
                  value={schoolConfig.reportCardTitle || 'BULLETIN SCOLAIRE'}
                  onChange={(event) =>
                    setSchoolConfig({ ...schoolConfig, reportCardTitle: event.target.value })
                  }
                  className="settings-input"
                />
              </Field>
              <Field label="Titre de l’emploi du temps">
                <input
                  value={schoolConfig.timetableTitle || 'EMPLOI DU TEMPS'}
                  onChange={(event) =>
                    setSchoolConfig({ ...schoolConfig, timetableTitle: event.target.value })
                  }
                  className="settings-input"
                />
              </Field>
              <Field label="Titre du reçu de paiement">
                <input
                  value={schoolConfig.tuitionReceiptTitle || 'REÇU DE PAIEMENT'}
                  onChange={(event) =>
                    setSchoolConfig({ ...schoolConfig, tuitionReceiptTitle: event.target.value })
                  }
                  className="settings-input"
                />
              </Field>
              <Field label="Titre du bulletin de paie">
                <input
                  value={schoolConfig.payslipTitle || 'BULLETIN DE PAIE'}
                  onChange={(event) =>
                    setSchoolConfig({ ...schoolConfig, payslipTitle: event.target.value })
                  }
                  className="settings-input"
                />
              </Field>
              <Field label="Titre de la carte scolaire">
                <input
                  value={schoolConfig.studentCardTitle || 'CARTE SCOLAIRE'}
                  onChange={(event) =>
                    setSchoolConfig({ ...schoolConfig, studentCardTitle: event.target.value })
                  }
                  className="settings-input"
                />
              </Field>
              <Field label="Titre du certificat">
                <input
                  value={schoolConfig.certificateTitle || 'CERTIFICAT DE SCOLARITÉ'}
                  onChange={(event) =>
                    setSchoolConfig({ ...schoolConfig, certificateTitle: event.target.value })
                  }
                  className="settings-input"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Pied de page commun des documents">
                  <input
                    value={schoolConfig.documentFooterText || ''}
                    onChange={(event) =>
                      setSchoolConfig({ ...schoolConfig, documentFooterText: event.target.value })
                    }
                    placeholder="Ex. Document officiel de l’établissement — à conserver"
                    className="settings-input"
                  />
                </Field>
              </div>

              <div className="md:col-span-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <Field label="Contenu du certificat de scolarité">
                  <textarea
                    rows={8}
                    value={schoolConfig.certificateTemplate || ''}
                    onChange={(event) =>
                      setSchoolConfig({ ...schoolConfig, certificateTemplate: event.target.value })
                    }
                    className="settings-input resize-y"
                  />
                </Field>
                <div className="mt-2 text-[10px] text-slate-500">
                  Variables : {'{NOM_ET_PRENOMS}'}, {'{MATRICULE}'}, {'{DATE_NAISSANCE}'},
                  {'{LIEU_NAISSANCE}'}, {'{CLASSE}'}, {'{ANNEE_SCOLAIRE}'},
                  {'{DIRECTEUR}'}, {'{FONCTION}'}, {'{ETABLISSEMENT}'}, {'{VILLE}'}.
                </div>
              </div>
            </div>
          </form>
        )}

        {activeTab === 'CLOSURE' && (
          <div className="page-panel overflow-hidden">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Clôture de l’année scolaire</h2>
                <p className="page-panel__subtitle">
                  Verrouillage des résultats, archivage et préparation de la rentrée suivante.
                </p>
              </div>
            </div>

            {!closurePreview ? (
              <div className="p-6 text-sm text-slate-500">
                Impossible de calculer l’état de clôture.
              </div>
            ) : (
              <div className="p-5 space-y-5">
                <div className="year-closure-summary">
                  <div>
                    <span>Année à clôturer</span>
                    <strong>{closurePreview.year.label}</strong>
                  </div>
                  <div>
                    <span>Élèves</span>
                    <strong>{closurePreview.counts.students}</strong>
                  </div>
                  <div>
                    <span>Admis</span>
                    <strong>{closurePreview.counts.promoted}</strong>
                  </div>
                  <div>
                    <span>Redoublants</span>
                    <strong>{closurePreview.counts.repeated}</strong>
                  </div>
                  <div>
                    <span>Remis à la famille</span>
                    <strong>{closurePreview.counts.dismissed}</strong>
                  </div>
                  <div>
                    <span>À examiner</span>
                    <strong>{closurePreview.counts.review}</strong>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-slate-200 dark:border-slate-700 p-4">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                      Année suivante
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {closurePreview.nextYear?.label || 'Non configurée'}
                    </div>
                    <p className="mt-2 text-[10.5px] text-slate-500">
                      Les admis seront placés dans leur classe suivante configurée. Les redoublants
                      resteront dans leur classe actuelle. Les dossiers seront créés avec le statut
                      « En attente ».
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-700 p-4">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                      Contrôle avant clôture
                    </div>
                    <div className="mt-2 space-y-2 text-[11px]">
                      <div className="flex justify-between gap-3">
                        <span>Périodes configurées</span>
                        <strong>{closurePreview.year.terms.length}</strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span>Dossiers à examiner</span>
                        <strong>{closurePreview.counts.review}</strong>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span>Classe suivante disponible</span>
                        <strong>{closurePreview.nextYear ? 'Oui' : 'Non'}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <label className="block">
                  <span className="block mb-1.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                    Note de clôture
                  </span>
                  <textarea
                    value={closureNote}
                    onChange={(event) => setClosureNote(event.target.value)}
                    rows={3}
                    placeholder="Ex. Année clôturée après conseil de classe du 28 juin."
                    className="settings-input resize-y"
                  />
                </label>

                {closurePreview.counts.review > 0 && (
                  <label className="flex items-start gap-2 p-3 border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
                    <input
                      type="checkbox"
                      checked={allowClosureWithReview}
                      onChange={(event) => setAllowClosureWithReview(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-[10.5px] text-amber-900 dark:text-amber-200">
                      Autoriser la clôture malgré {closurePreview.counts.review} dossier(s)
                      « À examiner ». Ces élèves ne seront pas préparés automatiquement pour
                      l’année suivante.
                    </span>
                  </label>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCloseSchoolYear}
                    disabled={!closurePreview.nextYear || closurePreview.year.status === 'CLOSED'}
                    className="button button--primary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Archive className="w-4 h-4" />
                    {closurePreview.year.status === 'CLOSED'
                      ? 'Année déjà clôturée'
                      : 'Clôturer et préparer la rentrée'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'DECISIONS' && (
          <div className="page-panel overflow-hidden">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Règles de décision annuelle</h2>
                <p className="page-panel__subtitle">
                  Le logiciel applique ces règles à la moyenne annuelle calculée.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={addDecisionRule} className="button button--secondary">
                  <Plus className="w-4 h-4" />
                  Ajouter une règle
                </button>
                <button type="button" onClick={saveDecisionRules} className="button button--primary">
                  <Save className="w-4 h-4" />
                  Enregistrer
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="space-y-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={schoolConfig.requireAllPeriodsForAnnualDecision ?? true}
                      onChange={(e) =>
                        setSchoolConfig({
                          ...schoolConfig,
                          requireAllPeriodsForAnnualDecision: e.target.checked,
                        })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-[11.5px] font-semibold">
                        Exiger toutes les périodes
                      </span>
                      <span className="block mt-1 text-[10.5px] text-slate-500">
                        Une période manquante laisse l’élève « À examiner ».
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={schoolConfig.requireAllSubjectsForAnnualDecision ?? true}
                      onChange={(e) =>
                        setSchoolConfig({
                          ...schoolConfig,
                          requireAllSubjectsForAnnualDecision: e.target.checked,
                        })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-[11.5px] font-semibold">
                        Exiger toutes les matières de chaque période
                      </span>
                      <span className="block mt-1 text-[10.5px] text-slate-500">
                        Évite une décision définitive sur une période partiellement saisie.
                      </span>
                    </span>
                  </label>
                </div>

                <div>
                  <div className="mb-2 text-[11px] font-semibold">Pondération des notes</div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contrôles continus">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={schoolConfig.continuousAssessmentWeight ?? 1}
                        onChange={(e) =>
                          setSchoolConfig({
                            ...schoolConfig,
                            continuousAssessmentWeight: Number(e.target.value),
                          })
                        }
                        className="settings-input"
                      />
                    </Field>
                    <Field label="Examen / composition">
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={schoolConfig.examWeight ?? 2}
                        onChange={(e) =>
                          setSchoolConfig({
                            ...schoolConfig,
                            examWeight: Number(e.target.value),
                          })
                        }
                        className="settings-input"
                      />
                    </Field>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-500">
                    Exemple 1 / 2 : les contrôles comptent pour 1 part et l’examen pour 2 parts.
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Libellé</th>
                      <th>Décision</th>
                      <th>Moyenne min.</th>
                      <th>Moyenne max.</th>
                      <th>Absences non justifiées max.</th>
                      <th>Conduite min.</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisionRules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <input
                            value={rule.label}
                            onChange={(e) => updateDecisionRule(rule.id, { label: e.target.value })}
                            className="settings-input min-w-[140px]"
                          />
                        </td>
                        <td>
                          <select
                            value={rule.outcome}
                            onChange={(e) =>
                              updateDecisionRule(rule.id, {
                                outcome: e.target.value as AnnualDecisionRule['outcome'],
                              })
                            }
                            className="settings-input min-w-[150px]"
                          >
                            <option value="PROMOTE">Admis / passage</option>
                            <option value="REPEAT">Redoublement</option>
                            <option value="DISMISS">Remis à la famille</option>
                            <option value="REVIEW">À examiner</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.01"
                            value={rule.minAverage}
                            onChange={(e) =>
                              updateDecisionRule(rule.id, { minAverage: Number(e.target.value) })
                            }
                            className="settings-input w-24"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.01"
                            value={rule.maxAverage}
                            onChange={(e) =>
                              updateDecisionRule(rule.id, { maxAverage: Number(e.target.value) })
                            }
                            className="settings-input w-24"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={rule.maxUnjustifiedAbsences ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              updateDecisionRule(rule.id, {
                                maxUnjustifiedAbsences:
                                  e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            className="settings-input w-28"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            step="0.5"
                            value={rule.minConductGrade ?? ''}
                            placeholder="—"
                            onChange={(e) =>
                              updateDecisionRule(rule.id, {
                                minConductGrade:
                                  e.target.value === '' ? undefined : Number(e.target.value),
                              })
                            }
                            className="settings-input w-24"
                          />
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            onClick={() => removeDecisionRule(rule.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                            title="Supprimer la règle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {decisionRules.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Aucune règle configurée.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="text-[10.5px] text-slate-500">
                Les règles sont évaluées automatiquement sur la moyenne annuelle pondérée.
                Une règle peut aussi imposer un maximum d’absences non justifiées ou une note
                minimale de conduite.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ACADEMIC' && (
          <div className="page-panel overflow-hidden">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Années scolaires et périodes</h2>
                <p className="page-panel__subtitle">Les périodes peuvent être des trimestres, semestres ou toute autre organisation.</p>
              </div>
              <button type="button" onClick={openNewYear} className="button button--primary">
                <Plus className="w-4 h-4" />
                Nouvelle année
              </button>
            </div>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {db.schoolYears
                .slice()
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map((year) => (
                  <div key={year.id} className="p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="m-0 text-sm font-semibold">{year.label}</h3>
                          {year.id === db.currentSchoolYearId && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[9px] font-bold uppercase tracking-wide">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[10.5px] text-slate-500">
                          {year.startDate} au {year.endDate}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {year.id !== db.currentSchoolYearId && (
                          <button type="button" onClick={() => activateYear(year)} className="button button--secondary">
                            Activer
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingYearId(year.id);
                            setYearDraft(JSON.parse(JSON.stringify(year)));
                          }}
                          className="icon-button"
                          title="Modifier l’année"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteYear(year)}
                          className="icon-button hover:text-rose-600"
                          title="Supprimer l’année"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => openNewTerm(year)} className="button button--secondary">
                          <Plus className="w-3.5 h-3.5" />
                          Ajouter une période
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto">
                      <table className="erp-table">
                        <thead>
                          <tr>
                            <th>Période</th>
                            <th>Code</th>
                            <th>Début</th>
                            <th>Fin</th>
                            <th>Poids</th>
                            <th>État</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {year.terms.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center text-slate-500 py-6">Aucune période configurée.</td>
                            </tr>
                          ) : (
                            year.terms.map((term) => (
                              <tr key={term.id}>
                                <td className="font-semibold">{term.label}</td>
                                <td className="font-mono text-slate-500">{term.code}</td>
                                <td>{term.startDate}</td>
                                <td>{term.endDate}</td>
                                <td>{term.weight}</td>
                                <td>
                                  <button type="button" onClick={() => toggleTermLock(year.id, term.id)} className={`px-2 py-1 rounded text-[10px] font-semibold ${term.isLocked ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                                    {term.isLocked ? 'Verrouillée' : 'Ouverte'}
                                  </button>
                                </td>
                                <td className="text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTermId(term.id);
                                      setTermDraft({
                                        schoolYearId: year.id,
                                        id: term.id,
                                        code: term.code,
                                        label: term.label,
                                        startDate: term.startDate,
                                        endDate: term.endDate,
                                        weight: term.weight,
                                        isLocked: term.isLocked,
                                      });
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                    title="Modifier"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button type="button" onClick={() => deleteTerm(year, term.id)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Supprimer">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'CLASSES' && (
          <div className="page-panel overflow-hidden">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Classes et divisions</h2>
                <p className="page-panel__subtitle">Structure, tarifs, capacité et matières enseignées.</p>
              </div>
              <button type="button" onClick={openNewClass} className="button button--primary">
                <Plus className="w-4 h-4" />
                Ajouter une classe
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Classe</th>
                    <th>Code</th>
                    <th>Niveau</th>
                    <th>Salle</th>
                    <th>Capacité</th>
                    <th>Matières</th>
                    <th>Classe suivante</th>
                    <th className="text-right">Écolage</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {db.classes.map((schoolClass) => (
                    <tr key={schoolClass.id}>
                      <td className="font-semibold">{schoolClass.name}</td>
                      <td className="font-mono text-slate-500">{schoolClass.code}</td>
                      <td className="capitalize">{schoolClass.level}</td>
                      <td>{schoolClass.room || '—'}</td>
                      <td>{schoolClass.capacity}</td>
                      <td>{schoolClass.subjects.length}</td>
                      <td>
                        {schoolClass.nextClassId
                          ? db.classes.find((item) => item.id === schoolClass.nextClassId)?.name || 'Classe inconnue'
                          : '—'}
                      </td>
                      <td className="text-right font-mono">{CalculationService.formatAriary(schoolClass.monthlyTuitionFee)}</td>
                      <td className="text-right whitespace-nowrap">
                        <button type="button" onClick={() => { setEditingClassId(schoolClass.id); setClassDraft(JSON.parse(JSON.stringify(schoolClass))); }} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Modifier">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteClass(schoolClass)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'SUBJECTS' && (
          <div className="page-panel overflow-hidden">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Matières</h2>
                <p className="page-panel__subtitle">Catalogue des matières disponibles pour les classes.</p>
              </div>
              <button type="button" onClick={openNewSubject} className="button button--primary">
                <Plus className="w-4 h-4" />
                Ajouter une matière
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Matière</th>
                    <th>Catégorie</th>
                    <th>Coefficient par défaut</th>
                    <th>Classes</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {db.subjects.map((subject) => (
                    <tr key={subject.id}>
                      <td className="font-mono text-slate-500">{subject.code}</td>
                      <td className="font-semibold">{subject.name}</td>
                      <td>{subject.category.replace('_', ' ')}</td>
                      <td>{subject.defaultCoeff}</td>
                      <td>{db.classes.filter((schoolClass) => schoolClass.subjects.some((item) => item.subjectId === subject.id)).length}</td>
                      <td className="text-right whitespace-nowrap">
                        <button type="button" onClick={() => { setEditingSubjectId(subject.id); setSubjectDraft({ ...subject }); }} className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white" title="Modifier">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteSubject(subject)} className="p-1.5 text-slate-400 hover:text-rose-600" title="Supprimer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'MATRICULE' && (
          <form onSubmit={handleSaveMatricule} className="page-panel">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Règles de matricule</h2>
                <p className="page-panel__subtitle">Définissez le format utilisé lors des nouvelles inscriptions.</p>
              </div>
              <button type="submit" className="button button--primary">
                <Save className="w-4 h-4" />
                Enregistrer
              </button>
            </div>
            <div className="p-5">
              <div className="mb-5 p-4 rounded-md bg-slate-100 dark:bg-slate-800">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Prochain matricule</div>
                <div className="mt-1 font-mono text-xl font-semibold">{matriculePreview}</div>
              </div>

              <div className="mb-5">
                <div className="text-[10.5px] font-semibold mb-2">Choisir un format</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <button type="button" onClick={() => setMatriculePreset('CLASSIC')} className="matricule-preset">
                    <strong>Classique</strong>
                    <span>LPSM-2026-0001</span>
                  </button>
                  <button type="button" onClick={() => setMatriculePreset('SIMPLE')} className="matricule-preset">
                    <strong>Simple</strong>
                    <span>LPSM-0001</span>
                  </button>
                  <button type="button" onClick={() => setMatriculePreset('LEVEL')} className="matricule-preset">
                    <strong>Avec niveau</strong>
                    <span>LPSM-LYC-2026-0001</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <Field label="Préfixe de l’établissement">
                  <input
                    value={matriculeConfig.prefix}
                    onChange={(e) => rebuildSimpleMatriculePattern({ prefix: e.target.value.toUpperCase() })}
                    placeholder="Ex. LPSM"
                    className="settings-input font-mono"
                  />
                </Field>
                <Field label="Séparateur">
                  <select
                    value={matriculeConfig.separator}
                    onChange={(e) => rebuildSimpleMatriculePattern({ separator: e.target.value })}
                    className="settings-input"
                  >
                    <option value="-">Tiret : -</option>
                    <option value="/">Barre : /</option>
                    <option value=".">Point : .</option>
                    <option value="">Aucun</option>
                  </select>
                </Field>
                <Field label="Nombre de chiffres">
                  <select
                    value={matriculeConfig.numDigits}
                    onChange={(e) => rebuildSimpleMatriculePattern({ numDigits: Number(e.target.value) })}
                    className="settings-input"
                  >
                    <option value={3}>3 chiffres (001)</option>
                    <option value={4}>4 chiffres (0001)</option>
                    <option value={5}>5 chiffres (00001)</option>
                    <option value={6}>6 chiffres (000001)</option>
                  </select>
                </Field>
                <Field label="Format de l’année">
                  <select
                    value={matriculeConfig.yearFormat}
                    disabled={!matriculeConfig.includeYear}
                    onChange={(e) => rebuildSimpleMatriculePattern({ yearFormat: e.target.value as 'YYYY' | 'YY' })}
                    className="settings-input"
                  >
                    <option value="YYYY">2026</option>
                    <option value="YY">26</option>
                  </select>
                </Field>
                <Field label="Compteur actuel">
                  <input
                    type="number"
                    min="0"
                    value={matriculeConfig.currentCounter}
                    onChange={(e) => setMatriculeConfig({ ...matriculeConfig, currentCounter: Number(e.target.value) })}
                    className="settings-input"
                  />
                </Field>
                <div className="space-y-2 pt-5">
                  <label className="flex items-center gap-2 text-[11px]">
                    <input
                      type="checkbox"
                      checked={matriculeConfig.includeYear}
                      onChange={(e) => rebuildSimpleMatriculePattern({ includeYear: e.target.checked })}
                    />
                    Inclure l’année scolaire
                  </label>
                  <label className="flex items-center gap-2 text-[11px]">
                    <input
                      type="checkbox"
                      checked={matriculeConfig.resetEveryYear}
                      onChange={(e) => setMatriculeConfig({ ...matriculeConfig, resetEveryYear: e.target.checked })}
                    />
                    Recommencer à 001 chaque année
                  </label>
                </div>
              </div>

              <details className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-4">
                <summary className="cursor-pointer text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                  Réglage avancé
                </summary>
                <div className="mt-3">
                  <Field label="Modèle technique">
                    <input
                      value={matriculeConfig.pattern}
                      onChange={(e) => setMatriculeConfig({ ...matriculeConfig, pattern: e.target.value })}
                      className="settings-input font-mono"
                    />
                  </Field>
                  <p className="mt-2 text-[10px] text-slate-500">
                    Variables : {'{PREFIX}'}, {'{YYYY}'}, {'{YY}'}, {'{LEVEL}'}, {'{NUM3}'}, {'{NUM4}'}, {'{NUM5}'}.
                  </p>
                </div>
              </details>
            </div>
          </form>
        )}

        {activeTab === 'CLOUD' && (
          <div className="space-y-4">
            <div className="page-panel">
              <div className="page-panel__header">
                <div>
                  <h2 className="page-panel__title">Sekoly Cloud</h2>
                  <p className="page-panel__subtitle">
                    Reliez cet établissement au SaaS multi-écoles et aux applications mobiles des enseignants.
                  </p>
                </div>
                <div className="cloud-status">
                  <span className={cloudConnected ? 'cloud-status__dot is-online' : 'cloud-status__dot'} />
                  {cloudConnected ? 'Connecté' : 'Non connecté'}
                </div>
              </div>

              {!cloudConnected ? (
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Email administrateur">
                    <input
                      type="email"
                      value={cloudEmail}
                      onChange={(event) => setCloudEmail(event.target.value)}
                      placeholder="direction@ecole.mg"
                      className="settings-input"
                    />
                  </Field>
                  <Field label="Mot de passe">
                    <input
                      type="password"
                      value={cloudPassword}
                      onChange={(event) => setCloudPassword(event.target.value)}
                      className="settings-input"
                    />
                  </Field>
                  <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCloudSignup}
                      disabled={cloudBusy}
                      className="button button--secondary disabled:opacity-50"
                    >
                      Créer mon compte Cloud
                    </button>
                    <button
                      type="button"
                      onClick={handleCloudLogin}
                      disabled={cloudBusy}
                      className="button button--primary disabled:opacity-50"
                    >
                      <LogIn className="w-4 h-4" />
                      {cloudBusy ? 'Connexion…' : 'Se connecter à Sekoly Cloud'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="cloud-info-cell">
                      <span>Projet Supabase</span>
                      <strong>cmpbrouwcfoauwyeiyfj</strong>
                    </div>
                    <div className="cloud-info-cell">
                      <span>Établissement Cloud</span>
                      <strong>{cloudSchoolId ? 'Lié' : 'À créer / lier'}</strong>
                    </div>
                    <div className="cloud-info-cell">
                      <span>Synchronisation mobile</span>
                      <strong>{cloudSchoolId ? 'Disponible' : 'En attente'}</strong>
                    </div>
                  </div>

                  {!cloudSchoolId ? (
                    <div className="border border-slate-200 dark:border-slate-700 p-4">
                      <div className="text-[11px] font-semibold">
                        Créer cet établissement dans Sekoly Cloud
                      </div>
                      <p className="mt-1 text-[10.5px] text-slate-500">
                        Le compte connecté deviendra administrateur de l’établissement. Les autres écoles
                        resteront totalement isolées par les règles RLS.
                      </p>
                      <button
                        type="button"
                        onClick={handleCreateCloudSchool}
                        disabled={cloudBusy}
                        className="button button--primary mt-3"
                      >
                        <Cloud className="w-4 h-4" />
                        Créer l’établissement Cloud
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="border border-slate-200 dark:border-slate-700 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                          <div className="text-[11px] font-semibold">Synchroniser la structure</div>
                          <p className="mt-1 text-[10.5px] text-slate-500">
                            Envoie la structure vers Supabase puis récupère immédiatement les
                            présences et notes saisies dans Sekoly Enseignant.
                          </p>
                          {cloudStats && (
                            <div className="mt-2 text-[10px] text-slate-500">
                              Dernière synchronisation : {cloudStats.students} élèves · {cloudStats.teachers}{' '}
                              enseignants · {cloudStats.assignments} affectations ·{' '}
                              {cloudStats.attendanceAdded ?? 0} présence(s) reçue(s) ·{' '}
                              {cloudStats.gradesChanged ?? 0} fiche(s) de notes mise(s) à jour.
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleCloudSync}
                          disabled={cloudBusy}
                          className="button button--primary"
                        >
                          <RefreshCw className="w-4 h-4" />
                          {cloudBusy ? 'Synchronisation…' : 'Synchroniser dans les deux sens'}
                        </button>
                      </div>

                      <div className="border border-slate-200 dark:border-slate-700 p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <div className="text-[11px] font-semibold">Diagnostic du pilote</div>
                            <p className="mt-1 text-[10.5px] text-slate-500">
                              Vérifie automatiquement que les données Cloud, les affectations et au moins un accès enseignant sont prêts.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handlePilotStatus}
                            disabled={pilotStatusBusy}
                            className="button button--secondary"
                          >
                            <RefreshCw className="w-4 h-4" />
                            {pilotStatusBusy ? 'Vérification…' : 'Vérifier le pilote'}
                          </button>
                        </div>

                        {pilotStatus && (
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                            <div className="cloud-info-cell">
                              <span>Données Cloud</span>
                              <strong>{pilotStatus.dataReady ? 'Prêtes' : 'Incomplètes'}</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Accès enseignant</span>
                              <strong>{pilotStatus.counts.teachersWithAccess} actif(s)</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Pilote mobile</span>
                              <strong>{pilotStatus.mobileReady ? 'Prêt' : 'À compléter'}</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Resend</span>
                              <strong>{pilotStatus.resendConfigured ? 'Configuré' : 'Non configuré'}</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Élèves</span>
                              <strong>{pilotStatus.counts.students}</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Enseignants</span>
                              <strong>{pilotStatus.counts.teachers}</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Affectations</span>
                              <strong>{pilotStatus.counts.assignments}</strong>
                            </div>
                            <div className="cloud-info-cell">
                              <span>Cours planifiés</span>
                              <strong>{pilotStatus.counts.timetable}</strong>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="border border-slate-200 dark:border-slate-700 p-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div>
                            <div className="text-[11px] font-semibold">Test pilote de bout en bout</div>
                            <p className="mt-1 text-[10.5px] text-slate-500">
                              Contrôle sans modifier les données qu’un enseignant mobile possède tout le nécessaire
                              pour faire l’appel et saisir des notes.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handlePilotSmokeTest}
                            disabled={pilotSmokeBusy}
                            className="button button--primary"
                          >
                            <ListChecks className="w-4 h-4" />
                            {pilotSmokeBusy ? 'Test en cours…' : 'Lancer le test pilote'}
                          </button>
                        </div>

                        {pilotSmokeTest && (
                          <div className="mt-4">
                            <div
                              className={`p-3 border text-[10.5px] ${
                                pilotSmokeTest.ready
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200'
                                  : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200'
                              }`}
                            >
                              <strong>
                                {pilotSmokeTest.ready
                                  ? 'Pilote prêt pour un test réel sur téléphone.'
                                  : 'Pilote pas encore prêt : complétez les éléments obligatoires ci-dessous.'}
                              </strong>
                            </div>

                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                              {pilotSmokeTest.checks.map((check) => (
                                <div
                                  key={check.key}
                                  className="border border-slate-200 dark:border-slate-700 p-3 text-[10px]"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <strong>{check.label}</strong>
                                    <span
                                      className={
                                        check.ok
                                          ? 'text-emerald-700 dark:text-emerald-300'
                                          : check.required
                                          ? 'text-rose-700 dark:text-rose-300'
                                          : 'text-amber-700 dark:text-amber-300'
                                      }
                                    >
                                      {check.ok ? 'OK' : check.required ? 'À corriger' : 'Optionnel'}
                                    </span>
                                  </div>
                                  <div className="mt-1 text-slate-500">{check.detail}</div>
                                </div>
                              ))}
                            </div>

                            <div className="mt-3 text-[10px] text-slate-500">
                              Dernier contrôle : {new Date(pilotSmokeTest.checkedAt).toLocaleString('fr-FR')} ·{' '}
                              {pilotSmokeTest.stats.attendanceSessions} séance(s) d’appel Cloud ·{' '}
                              {pilotSmokeTest.stats.assessments} évaluation(s) Cloud.
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="page-panel overflow-hidden">
                        <div className="page-panel__header">
                          <div>
                            <h3 className="page-panel__title">Accès mobile enseignants</h3>
                            <p className="page-panel__subtitle">
                              L’adresse email de chaque enseignant devient son identifiant Sekoly Enseignant.
                            </p>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="erp-table">
                            <thead>
                              <tr>
                                <th>Enseignant</th>
                                <th>Email</th>
                                <th>Téléphone</th>
                                <th className="text-right">Accès mobile</th>
                              </tr>
                            </thead>
                            <tbody>
                              {db.teachers.map((teacher) => (
                                <tr key={teacher.id}>
                                  <td className="font-semibold">
                                    {teacher.lastName} {teacher.firstName}
                                  </td>
                                  <td>{teacher.email || 'Email à renseigner'}</td>
                                  <td>{teacher.phone || '—'}</td>
                                  <td className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        disabled={
                                          !teacher.email ||
                                          invitingTeacherId === teacher.id
                                        }
                                        onClick={() => handleProvisionPilotTeacher(teacher.id)}
                                        className="button button--primary disabled:opacity-40"
                                      >
                                        <UserPlus className="w-3.5 h-3.5" />
                                        {invitingTeacherId === teacher.id
                                          ? 'Création…'
                                          : 'Créer accès pilote'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          !teacher.email ||
                                          invitingTeacherId === teacher.id
                                        }
                                        onClick={() => handleSendTeacherActivation(teacher.id)}
                                        className="button button--secondary disabled:opacity-40"
                                        title="Envoie un lien d’activation sécurisé via Resend lorsque le domaine et les secrets sont configurés."
                                      >
                                        Lien Resend
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          !teacher.email ||
                                          invitingTeacherId === teacher.id
                                        }
                                        onClick={() => handleInviteCloudTeacher(teacher.id)}
                                        className="button button--secondary disabled:opacity-40"
                                        title="Utilise l’invitation email Supabase lorsque le SMTP de production est configuré."
                                      >
                                        Invitation Supabase
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {db.teachers.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="py-8 text-center text-slate-500">
                                    Aucun enseignant configuré.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  {pilotAccess && (
                    <div className="border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                      <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-200">
                        Accès pilote créé — à transmettre une seule fois
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[10.5px]">
                        <div>
                          <span className="block text-slate-500">Enseignant</span>
                          <strong>{pilotAccess.teacherName}</strong>
                        </div>
                        <div>
                          <span className="block text-slate-500">Email</span>
                          <strong>{pilotAccess.email}</strong>
                        </div>
                        <div>
                          <span className="block text-slate-500">Mot de passe temporaire</span>
                          <strong className="font-mono">{pilotAccess.temporaryPassword}</strong>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() =>
                            navigator.clipboard?.writeText(
                              `Sekoly Enseignant\nEmail : ${pilotAccess.email}\nMot de passe temporaire : ${pilotAccess.temporaryPassword}`
                            )
                          }
                        >
                          Copier les identifiants
                        </button>
                        <button
                          type="button"
                          className="button button--secondary"
                          onClick={() => setPilotAccess(null)}
                        >
                          Masquer
                        </button>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-500">
                        L’application exigera un nouveau mot de passe lors de la première connexion.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleCloudLogout}
                      className="button button--secondary"
                    >
                      Fermer la session Cloud
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'DATA' && (
          <div className="page-panel">
            <div className="page-panel__header">
              <div>
                <h2 className="page-panel__title">Sauvegarde et restauration</h2>
                <p className="page-panel__subtitle">Les données sont actuellement stockées localement dans ce navigateur.</p>
              </div>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
              <ActionCard
                icon={<Download className="w-5 h-5" />}
                title="Exporter une sauvegarde"
                description="Télécharge toutes les données dans un fichier JSON."
                action={<button type="button" onClick={() => StorageService.exportBackupJSON(db)} className="button button--secondary">Exporter</button>}
              />
              <ActionCard
                icon={<Upload className="w-5 h-5" />}
                title="Restaurer une sauvegarde"
                description="Remplace les données actuelles par un fichier précédemment exporté."
                action={<label className="button button--secondary cursor-pointer">Importer<input type="file" accept=".json" onChange={handleBackupUpload} className="hidden" /></label>}
              />
              <ActionCard
                icon={<RotateCcw className="w-5 h-5" />}
                title="Réinitialiser"
                description="Restaure le jeu de données de démonstration fourni avec l’application."
                action={<button type="button" onClick={resetDefaults} className="button button--secondary text-rose-700 dark:text-rose-300">Réinitialiser</button>}
              />
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={!!classDraft}
        onClose={() => { setClassDraft(null); setEditingClassId(null); }}
        title={editingClassId ? 'Modifier la classe' : 'Ajouter une classe'}
        subtitle="Définissez la structure, les frais et les matières."
        maxWidth="4xl"
        actions={
          <>
            <button type="button" onClick={() => { setClassDraft(null); setEditingClassId(null); }} className="button button--secondary">Annuler</button>
            <button type="button" onClick={saveClass} className="button button--primary">Enregistrer</button>
          </>
        }
      >
        {classDraft && (
          <div className="space-y-5 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Nom">
                <input value={classDraft.name} onChange={(e) => setClassDraft({ ...classDraft, name: e.target.value, code: classDraft.code || slugCode(e.target.value) })} className="settings-input" />
              </Field>
              <Field label="Code">
                <input value={classDraft.code} onChange={(e) => setClassDraft({ ...classDraft, code: e.target.value })} className="settings-input font-mono" />
              </Field>
              <Field label="Niveau">
                <select value={classDraft.level} onChange={(e) => setClassDraft({ ...classDraft, level: e.target.value as SchoolLevel })} className="settings-input">
                  <option value="primaire">Primaire</option>
                  <option value="college">Collège</option>
                  <option value="lycee">Lycée</option>
                </select>
              </Field>
              <Field label="Série / section">
                <input value={classDraft.serie || ''} onChange={(e) => setClassDraft({ ...classDraft, serie: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Salle">
                <input value={classDraft.room} onChange={(e) => setClassDraft({ ...classDraft, room: e.target.value })} className="settings-input" />
              </Field>
              <Field label="Capacité">
                <input type="number" min="1" value={classDraft.capacity} onChange={(e) => setClassDraft({ ...classDraft, capacity: Number(e.target.value) })} className="settings-input" />
              </Field>
              <Field label="Professeur principal">
                <select value={classDraft.mainTeacherId || ''} onChange={(e) => setClassDraft({ ...classDraft, mainTeacherId: e.target.value || undefined })} className="settings-input">
                  <option value="">Non défini</option>
                  {db.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.lastName} {teacher.firstName}</option>)}
                </select>
              </Field>
              <Field label="Classe suivante">
                <select
                  value={classDraft.nextClassId || ''}
                  onChange={(e) =>
                    setClassDraft({
                      ...classDraft,
                      nextClassId: e.target.value || undefined,
                    })
                  }
                  className="settings-input"
                >
                  <option value="">Fin de cycle / non définie</option>
                  {db.classes
                    .filter((item) => item.id !== classDraft.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                </select>
              </Field>
              <Field label="Écolage mensuel">
                <input type="number" min="0" value={classDraft.monthlyTuitionFee} onChange={(e) => setClassDraft({ ...classDraft, monthlyTuitionFee: Number(e.target.value) })} className="settings-input" />
              </Field>
              <Field label="Droit d’inscription">
                <input type="number" min="0" value={classDraft.registrationFee} onChange={(e) => setClassDraft({ ...classDraft, registrationFee: Number(e.target.value) })} className="settings-input" />
              </Field>
              <Field label="Droit de réinscription">
                <input type="number" min="0" value={classDraft.reRegistrationFee} onChange={(e) => setClassDraft({ ...classDraft, reRegistrationFee: Number(e.target.value) })} className="settings-input" />
              </Field>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold">Matières de la classe</div>
              <div className="border border-slate-200 dark:border-slate-700 rounded-md overflow-hidden">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th className="w-10"></th>
                      <th>Matière</th>
                      <th>Coefficient</th>
                      <th>Heures / semaine</th>
                      <th>Enseignant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.subjects.map((subject) => {
                      const config = classDraft.subjects.find((item) => item.subjectId === subject.id);
                      return (
                        <tr key={subject.id}>
                          <td>
                            <input type="checkbox" checked={!!config} onChange={() => toggleClassSubject(subject)} />
                          </td>
                          <td className="font-semibold">{subject.name}</td>
                          <td>
                            <input disabled={!config} type="number" min="0.5" step="0.5" value={config?.coefficient ?? subject.defaultCoeff} onChange={(e) => updateClassSubject(subject.id, { coefficient: Number(e.target.value) })} className="w-20 settings-input" />
                          </td>
                          <td>
                            <input disabled={!config} type="number" min="0" step="0.5" value={config?.weeklyHours ?? 0} onChange={(e) => updateClassSubject(subject.id, { weeklyHours: Number(e.target.value) })} className="w-24 settings-input" />
                          </td>
                          <td>
                            <select disabled={!config} value={config?.teacherId || ''} onChange={(e) => updateClassSubject(subject.id, { teacherId: e.target.value || undefined })} className="settings-input min-w-[180px]">
                              <option value="">Non affecté</option>
                              {db.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacherName.get(teacher.id)}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!subjectDraft}
        onClose={() => { setSubjectDraft(null); setEditingSubjectId(null); }}
        title={editingSubjectId ? 'Modifier la matière' : 'Ajouter une matière'}
        maxWidth="lg"
        actions={
          <>
            <button type="button" onClick={() => { setSubjectDraft(null); setEditingSubjectId(null); }} className="button button--secondary">Annuler</button>
            <button type="button" onClick={saveSubject} className="button button--primary">Enregistrer</button>
          </>
        }
      >
        {subjectDraft && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <Field label="Nom">
              <input value={subjectDraft.name} onChange={(e) => setSubjectDraft({ ...subjectDraft, name: e.target.value, code: subjectDraft.code || slugCode(e.target.value).slice(0, 8) })} className="settings-input" />
            </Field>
            <Field label="Code">
              <input value={subjectDraft.code} onChange={(e) => setSubjectDraft({ ...subjectDraft, code: e.target.value })} className="settings-input font-mono" />
            </Field>
            <Field label="Catégorie">
              <select value={subjectDraft.category} onChange={(e) => setSubjectDraft({ ...subjectDraft, category: e.target.value as Subject['category'] })} className="settings-input">
                <option value="LITTERAIRE">Littéraire</option>
                <option value="SCIENTIFIQUE">Scientifique</option>
                <option value="HUMAINE">Sciences humaines</option>
                <option value="SPORT_DIVERS">Sport / divers</option>
              </select>
            </Field>
            <Field label="Coefficient par défaut">
              <input type="number" min="0.5" step="0.5" value={subjectDraft.defaultCoeff} onChange={(e) => setSubjectDraft({ ...subjectDraft, defaultCoeff: Number(e.target.value) })} className="settings-input" />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!yearDraft}
        onClose={() => { setYearDraft(null); setEditingYearId(null); }}
        title={editingYearId ? 'Modifier l’année scolaire' : 'Ajouter une année scolaire'}
        maxWidth="lg"
        actions={
          <>
            <button type="button" onClick={() => { setYearDraft(null); setEditingYearId(null); }} className="button button--secondary">Annuler</button>
            <button type="button" onClick={saveYear} className="button button--primary">{editingYearId ? 'Enregistrer' : 'Créer'}</button>
          </>
        }
      >
        {yearDraft && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <Field label="Libellé">
              <input value={yearDraft.label} onChange={(e) => setYearDraft({ ...yearDraft, label: e.target.value })} className="settings-input" />
            </Field>
            <div />
            <Field label="Date de début">
              <input type="date" value={yearDraft.startDate} onChange={(e) => setYearDraft({ ...yearDraft, startDate: e.target.value })} className="settings-input" />
            </Field>
            <Field label="Date de fin">
              <input type="date" value={yearDraft.endDate} onChange={(e) => setYearDraft({ ...yearDraft, endDate: e.target.value })} className="settings-input" />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!termDraft}
        onClose={() => { setTermDraft(null); setEditingTermId(null); }}
        title={editingTermId ? 'Modifier la période académique' : 'Ajouter une période académique'}
        subtitle="Vous pouvez créer un trimestre, semestre, séquence ou toute autre période."
        maxWidth="lg"
        actions={
          <>
            <button type="button" onClick={() => { setTermDraft(null); setEditingTermId(null); }} className="button button--secondary">Annuler</button>
            <button type="button" onClick={saveTerm} className="button button--primary">{editingTermId ? 'Enregistrer' : 'Ajouter'}</button>
          </>
        }
      >
        {termDraft && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <Field label="Nom de la période">
              <input value={termDraft.label} onChange={(e) => setTermDraft({ ...termDraft, label: e.target.value, code: slugCode(e.target.value) })} placeholder="Ex. 1er Trimestre" className="settings-input" />
            </Field>
            <Field label="Code interne">
              <input value={termDraft.code} onChange={(e) => setTermDraft({ ...termDraft, code: e.target.value })} className="settings-input font-mono" />
            </Field>
            <Field label="Date de début">
              <input type="date" value={termDraft.startDate} onChange={(e) => setTermDraft({ ...termDraft, startDate: e.target.value })} className="settings-input" />
            </Field>
            <Field label="Date de fin">
              <input type="date" value={termDraft.endDate} onChange={(e) => setTermDraft({ ...termDraft, endDate: e.target.value })} className="settings-input" />
            </Field>
            <Field label="Poids dans la moyenne annuelle">
              <input type="number" min="0.1" step="0.1" value={termDraft.weight} onChange={(e) => setTermDraft({ ...termDraft, weight: Number(e.target.value) })} className="settings-input" />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block mb-1.5 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">{label}</span>
    {children}
  </label>
);

const ActionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="border border-slate-200 dark:border-slate-700 rounded-md p-4">
    <div className="text-slate-500">{icon}</div>
    <div className="mt-3 text-[11.5px] font-semibold">{title}</div>
    <p className="mt-1 min-h-10 text-[10.5px] text-slate-500">{description}</p>
    <div className="mt-3">{action}</div>
  </div>
);
