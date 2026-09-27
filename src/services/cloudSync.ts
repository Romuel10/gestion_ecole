import { CalculationService } from './calculations';
import { DatabaseSchema, GradeEntry, AttendanceRecord } from '../types/school';

const DEFAULT_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://cmpbrouwcfoauwyeiyfj.supabase.co';
const DEFAULT_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_ox4EuxE10F3DLNxr1wP74A_fI_dhJgQ';

const SESSION_KEY = 'SEKOLY_CLOUD_SESSION_V2';
const SCHOOL_KEY = 'SEKOLY_CLOUD_SCHOOL_ID_V2';

type CloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: { id: string; email?: string };
};

type PullResult = {
  db: DatabaseSchema;
  attendanceAdded: number;
  gradesChanged: number;
};

function hash32(input: string, seed: number) {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function cloudUuid(scope: string, value: string) {
  const input = `${scope}:${value}`;
  const hex = [2166136261, 2246822519, 3266489917, 668265263]
    .map((seed) => hash32(input, seed).toString(16).padStart(8, '0'))
    .join('')
    .split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16] || '0', 16) & 0x3) | 0x8).toString(16);
  const normalized = hex.join('');
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(
    12,
    16
  )}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

const getStoredSession = (): CloudSession | null => {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CloudSession;
  } catch {
    return null;
  }
};

const saveSession = (session: CloudSession | null) => {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

async function authRequest(
  path: string,
  init: RequestInit = {},
  useAuth = true
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('apikey', DEFAULT_KEY);
  headers.set('Content-Type', 'application/json');

  if (useAuth) {
    const token = await CloudSyncService.getAccessToken();
    if (!token) throw new Error('Connectez Sekoly Admin au Cloud.');
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(`${DEFAULT_URL}${path}`, {
    ...init,
    headers,
  });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      body?.message ||
        body?.msg ||
        body?.error_description ||
        body?.error ||
        `Erreur Cloud ${response.status}`
    );
  }
  return body as T;
}

async function restSelect<T>(table: string, query = ''): Promise<T[]> {
  const response = await authRequest(
    `/rest/v1/${table}?${query}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }
  );
  return parseResponse<T[]>(response);
}

async function restUpsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict?: string
) {
  if (rows.length === 0) return;
  const conflict = onConflict
    ? `?on_conflict=${encodeURIComponent(onConflict)}`
    : '';
  const response = await authRequest(
    `/rest/v1/${table}${conflict}`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    }
  );
  if (!response.ok) await parseResponse(response);
}

function enrollmentStatus(status: string) {
  if (status === 'EN_ATTENTE') return 'PENDING';
  if (status === 'TRANSFERE') return 'TRANSFERRED';
  if (status === 'ABANDON') return 'DROPPED';
  return 'ENROLLED';
}

function cloudAttendanceType(type: string): AttendanceRecord['type'] {
  if (type === 'ABSENT_JUSTIFIED') return 'ABSENT_JUSTIFIE';
  if (type === 'ABSENT_UNJUSTIFIED') return 'ABSENT_NON_JUSTIFIE';
  if (type === 'LATE') return 'RETARD';
  return 'PRESENT';
}

export class CloudSyncService {
  static projectUrl = DEFAULT_URL;

  static getSchoolId() {
    return localStorage.getItem(SCHOOL_KEY);
  }

  static setSchoolId(id: string | null) {
    if (id) localStorage.setItem(SCHOOL_KEY, id);
    else localStorage.removeItem(SCHOOL_KEY);
  }

  static getSession() {
    return getStoredSession();
  }

  static isConnected() {
    return Boolean(getStoredSession());
  }

  static async signup(email: string, password: string) {
    const response = await authRequest(
      '/auth/v1/signup',
      {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      },
      false
    );

    const result = await parseResponse<any>(response);
    if (result.access_token && result.refresh_token) {
      const session: CloudSession = {
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        expires_at:
          Math.floor(Date.now() / 1000) + Number(result.expires_in || 3600),
        user: result.user,
      };
      saveSession(session);
      return { session, requiresEmailConfirmation: false };
    }

    return {
      session: null,
      requiresEmailConfirmation: true,
    };
  }

  static async login(email: string, password: string) {
    const response = await authRequest(
      '/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      },
      false
    );
    const session = await parseResponse<CloudSession & { expires_in?: number }>(
      response
    );
    if (session.expires_in) {
      session.expires_at = Math.floor(Date.now() / 1000) + session.expires_in;
    }
    saveSession(session);
    return session;
  }

  static logout() {
    saveSession(null);
  }

  static async getAccessToken(): Promise<string | null> {
    let session = getStoredSession();
    if (!session) return null;

    const now = Math.floor(Date.now() / 1000);
    if (!session.expires_at || session.expires_at - now > 60) {
      return session.access_token;
    }

    const response = await authRequest(
      '/auth/v1/token?grant_type=refresh_token',
      {
        method: 'POST',
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      },
      false
    );

    session = await parseResponse<CloudSession & { expires_in?: number }>(
      response
    );
    if ((session as any).expires_in) {
      session.expires_at =
        Math.floor(Date.now() / 1000) + Number((session as any).expires_in);
    }
    saveSession(session);
    return session.access_token;
  }

  static async memberships() {
    return restSelect<any>(
      'sekoly_memberships',
      'select=school_id,role,status,sekoly_schools(id,name,slug,acronym)&status=eq.ACTIVE'
    );
  }

  static async createSchool(db: DatabaseSchema) {
    const token = await this.getAccessToken();
    if (!token) throw new Error('Connexion Cloud requise.');

    const slugBase = (db.schoolConfig.acronym || db.schoolConfig.name || 'ecole')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 45);
    const slug = `${slugBase || 'ecole'}-${Date.now().toString(36).slice(-6)}`;

    const response = await authRequest('/functions/v1/sekoly-create-school', {
      method: 'POST',
      body: JSON.stringify({
        name: db.schoolConfig.name,
        slug,
        acronym: db.schoolConfig.acronym,
        city: db.schoolConfig.city,
        address: db.schoolConfig.address,
        phone: db.schoolConfig.phone,
        email: db.schoolConfig.email,
      }),
    });

    const result = await parseResponse<{ school: { id: string; name: string } }>(
      response
    );
    this.setSchoolId(result.school.id);
    return result.school;
  }

  static async attachExistingMembership() {
    const memberships = await this.memberships();
    const adminMembership = memberships.find((item) =>
      ['SCHOOL_ADMIN', 'DIRECTOR'].includes(item.role)
    );
    if (adminMembership) {
      this.setSchoolId(adminMembership.school_id);
      return adminMembership;
    }
    return null;
  }

  static async syncLocalStructure(db: DatabaseSchema) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error("Aucun établissement Cloud n'est lié.");

    const years = db.schoolYears.map((year) => ({
      id: cloudUuid('year', year.id),
      school_id: schoolId,
      label: year.label,
      start_date: year.startDate,
      end_date: year.endDate,
      status:
        year.status ||
        (year.id === db.currentSchoolYearId ? 'ACTIVE' : 'PLANNED'),
    }));
    await restUpsert('sekoly_school_years', years, 'id');

    const terms = db.schoolYears.flatMap((year) =>
      year.terms.map((term) => ({
        id: cloudUuid('term', term.id),
        school_id: schoolId,
        school_year_id: cloudUuid('year', year.id),
        code: term.code,
        label: term.label,
        start_date: term.startDate,
        end_date: term.endDate,
        weight: term.weight,
        is_locked: term.isLocked,
      }))
    );
    await restUpsert('sekoly_terms', terms, 'id');

    const subjects = db.subjects.map((subject) => ({
      id: cloudUuid('subject', subject.id),
      school_id: schoolId,
      code: subject.code,
      name: subject.name,
      category: subject.category,
      default_coefficient: subject.defaultCoeff,
      color: subject.color,
    }));
    await restUpsert('sekoly_subjects', subjects, 'id');

    const classes = db.schoolYears.flatMap((year) =>
      db.classes.map((schoolClass) => ({
        id: cloudUuid('class', `${year.id}:${schoolClass.id}`),
        school_id: schoolId,
        school_year_id: cloudUuid('year', year.id),
        code: schoolClass.code,
        name: schoolClass.name,
        level: schoolClass.level,
        series: schoolClass.serie || null,
        room: schoolClass.room,
        capacity: schoolClass.capacity,
      }))
    );
    await restUpsert('sekoly_classes', classes, 'id');

    const uniqueStudents = new Map<string, any>();
    db.students.forEach((student) => {
      uniqueStudents.set(student.matricule.toUpperCase(), {
        id: cloudUuid('student', student.matricule.toUpperCase()),
        school_id: schoolId,
        matricule: student.matricule,
        last_name: student.lastName,
        first_name: student.firstName,
        gender: student.gender,
        birth_date: student.birthDate || null,
        birth_place: student.birthPlace || null,
        nationality: student.nationality || 'Malgache',
        address: student.address || null,
        city: student.city || null,
        emergency_contact: student.emergencyContact || null,
        emergency_phone: student.emergencyPhone || null,
        photo_url: student.photoUrl || null,
      });
    });
    await restUpsert(
      'sekoly_students',
      Array.from(uniqueStudents.values()),
      'id'
    );

    const enrollments = db.students.map((student) => ({
      id: cloudUuid(
        'enrollment',
        `${student.schoolYearId}:${student.matricule.toUpperCase()}`
      ),
      school_id: schoolId,
      student_id: cloudUuid('student', student.matricule.toUpperCase()),
      school_year_id: cloudUuid('year', student.schoolYearId),
      class_id: cloudUuid(
        'class',
        `${student.schoolYearId}:${student.classId}`
      ),
      status: enrollmentStatus(student.status),
      enrolled_at: student.enrollmentDate || new Date().toISOString().slice(0, 10),
      final_decision: student.councilDecision || null,
    }));
    await restUpsert('sekoly_enrollments', enrollments, 'id');

    const teachers = db.teachers.map((teacher) => ({
      id: cloudUuid('teacher', teacher.id),
      school_id: schoolId,
      matricule: teacher.matricule || null,
      last_name: teacher.lastName,
      first_name: teacher.firstName,
      phone: teacher.phone || null,
      email: teacher.email || null,
      status: 'ACTIVE',
    }));
    await restUpsert('sekoly_teachers', teachers, 'id');

    const currentYearId = db.currentSchoolYearId;
    const classSubjects = db.classes.flatMap((schoolClass) =>
      schoolClass.subjects.map((config) => ({
        id: cloudUuid(
          'class-subject',
          `${currentYearId}:${schoolClass.id}:${config.subjectId}`
        ),
        school_id: schoolId,
        class_id: cloudUuid(
          'class',
          `${currentYearId}:${schoolClass.id}`
        ),
        subject_id: cloudUuid('subject', config.subjectId),
        teacher_id: config.teacherId
          ? cloudUuid('teacher', config.teacherId)
          : null,
        coefficient: config.coefficient,
        weekly_hours: config.weeklyHours || 2,
      }))
    );
    await restUpsert('sekoly_class_subjects', classSubjects, 'id');

    const assignments = db.classes.flatMap((schoolClass) =>
      schoolClass.subjects
        .filter((config) => Boolean(config.teacherId))
        .map((config) => ({
          id: cloudUuid(
            'assignment',
            `${currentYearId}:${schoolClass.id}:${config.subjectId}:${config.teacherId}`
          ),
          school_id: schoolId,
          school_year_id: cloudUuid('year', currentYearId),
          teacher_id: cloudUuid('teacher', config.teacherId!),
          class_id: cloudUuid(
            'class',
            `${currentYearId}:${schoolClass.id}`
          ),
          subject_id: cloudUuid('subject', config.subjectId),
          weekly_hours: config.weeklyHours || 2,
          active: true,
        }))
    );
    await restUpsert('sekoly_teacher_assignments', assignments, 'id');

    const timetable = db.timetableSlots.map((slot) => ({
      id: cloudUuid('timetable', slot.id),
      school_id: schoolId,
      school_year_id: cloudUuid('year', currentYearId),
      class_id: cloudUuid('class', `${currentYearId}:${slot.classId}`),
      subject_id: cloudUuid('subject', slot.subjectId),
      teacher_id: cloudUuid('teacher', slot.teacherId),
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      room: slot.room,
    }));
    await restUpsert('sekoly_timetable_slots', timetable, 'id');

    return {
      years: years.length,
      terms: terms.length,
      subjects: subjects.length,
      classes: classes.length,
      students: uniqueStudents.size,
      enrollments: enrollments.length,
      teachers: teachers.length,
      assignments: assignments.length,
      timetable: timetable.length,
    };
  }

  static async provisionTeacherPilot(db: DatabaseSchema, teacherId: string) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const teacher = db.teachers.find((item) => item.id === teacherId);
    if (!teacher) throw new Error('Enseignant introuvable.');
    if (!teacher.email) {
      throw new Error(
        'Ajoutez une adresse email à cet enseignant avant de créer son accès mobile.'
      );
    }

    const response = await authRequest(
      '/functions/v1/sekoly-provision-teacher',
      {
        method: 'POST',
        body: JSON.stringify({
          schoolId,
          teacherId: cloudUuid('teacher', teacher.id),
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          email: teacher.email,
          phone: teacher.phone,
        }),
      }
    );

    return parseResponse<{
      teacher: Record<string, unknown>;
      userId: string;
      temporaryPassword: string;
    }>(response);
  }

  static async inviteTeacher(db: DatabaseSchema, teacherId: string) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const teacher = db.teachers.find((item) => item.id === teacherId);
    if (!teacher) throw new Error('Enseignant introuvable.');
    if (!teacher.email) {
      throw new Error(
        'Ajoutez une adresse email à cet enseignant avant de créer son accès mobile.'
      );
    }

    const response = await authRequest(
      '/functions/v1/sekoly-invite-teacher',
      {
        method: 'POST',
        body: JSON.stringify({
          schoolId,
          teacherId: cloudUuid('teacher', teacher.id),
          matricule: teacher.matricule,
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          email: teacher.email,
          phone: teacher.phone,
          redirectTo: 'sekoly-teacher://auth/callback',
        }),
      }
    );

    return parseResponse<any>(response);
  }

  static async pullTeacherChanges(db: DatabaseSchema): Promise<PullResult> {
    const schoolId = this.getSchoolId();
    if (!schoolId || !this.isConnected()) {
      return { db, attendanceAdded: 0, gradesChanged: 0 };
    }

    const yearId = db.currentSchoolYearId;
    const cloudYearId = cloudUuid('year', yearId);

    const [sessions, entries, assessments, scores] = await Promise.all([
      restSelect<any>(
        'sekoly_attendance_sessions',
        `select=*&school_id=eq.${schoolId}&school_year_id=eq.${cloudYearId}`
      ),
      restSelect<any>(
        'sekoly_attendance_entries',
        `select=*&school_id=eq.${schoolId}`
      ),
      restSelect<any>(
        'sekoly_assessments',
        `select=*&school_id=eq.${schoolId}&school_year_id=eq.${cloudYearId}`
      ),
      restSelect<any>(
        'sekoly_assessment_scores',
        `select=*&school_id=eq.${schoolId}`
      ),
    ]);

    const studentByCloudId = new Map(
      db.students
        .filter((student) => student.schoolYearId === yearId)
        .map((student) => [
          cloudUuid('student', student.matricule.toUpperCase()),
          student,
        ])
    );
    const classByCloudId = new Map(
      db.classes.map((schoolClass) => [
        cloudUuid('class', `${yearId}:${schoolClass.id}`),
        schoolClass,
      ])
    );
    const subjectByCloudId = new Map(
      db.subjects.map((subject) => [
        cloudUuid('subject', subject.id),
        subject,
      ])
    );
    const termByCloudId = new Map(
      (
        db.schoolYears.find((year) => year.id === yearId)?.terms || []
      ).map((term) => [cloudUuid('term', term.id), term])
    );
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const assessmentById = new Map(
      assessments.map((assessment) => [assessment.id, assessment])
    );

    const existingAttendance = new Map(
      db.attendanceRecords.map((record) => [record.id, record])
    );
    let attendanceAdded = 0;

    entries.forEach((entry) => {
      const session = sessionById.get(entry.session_id);
      const student = studentByCloudId.get(entry.student_id);
      const schoolClass = session
        ? classByCloudId.get(session.class_id)
        : undefined;
      if (!session || !student || !schoolClass) return;

      const id = `cloud-att-${entry.id}`;
      if (!existingAttendance.has(id)) attendanceAdded += 1;
      existingAttendance.set(id, {
        id,
        studentId: student.id,
        classId: schoolClass.id,
        schoolYearId: yearId,
        date: session.session_date,
        type: cloudAttendanceType(entry.status),
        minutesLate:
          entry.status === 'LATE' ? entry.minutes_late || undefined : undefined,
        reason: entry.reason || undefined,
      });
    });

    type GradeBucket = {
      studentId: string;
      classId: string;
      subjectId: string;
      termCode: string;
      evaluations: Array<{ date: string; score: number }>;
      exam?: { date: string; score: number };
      comments: string[];
    };

    const buckets = new Map<string, GradeBucket>();

    scores.forEach((score) => {
      if (score.score === null || score.score === undefined) return;
      const assessment = assessmentById.get(score.assessment_id);
      const student = studentByCloudId.get(score.student_id);
      if (!assessment || !student) return;

      const schoolClass = classByCloudId.get(assessment.class_id);
      const subject = subjectByCloudId.get(assessment.subject_id);
      const term = termByCloudId.get(assessment.term_id);
      if (!schoolClass || !subject || !term) return;

      const key = `${student.id}|${subject.id}|${term.code}`;
      const bucket =
        buckets.get(key) ||
        ({
          studentId: student.id,
          classId: schoolClass.id,
          subjectId: subject.id,
          termCode: term.code,
          evaluations: [],
          comments: [],
        } satisfies GradeBucket);

      if (assessment.assessment_type === 'EXAM') {
        bucket.exam = {
          date: assessment.assessment_date,
          score: Number(score.score),
        };
      } else {
        bucket.evaluations.push({
          date: assessment.assessment_date,
          score: Number(score.score),
        });
      }

      if (score.comment) bucket.comments.push(score.comment);
      buckets.set(key, bucket);
    });

    const nextGrades = [...db.grades];
    let gradesChanged = 0;

    for (const bucket of buckets.values()) {
      const evaluations = bucket.evaluations
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((item) => item.score);
      const examGrade = bucket.exam?.score;

      const existingIndex = nextGrades.findIndex(
        (grade) =>
          grade.studentId === bucket.studentId &&
          grade.subjectId === bucket.subjectId &&
          grade.termCode === bucket.termCode &&
          grade.schoolYearId === yearId
      );

      const next: GradeEntry = {
        id:
          existingIndex >= 0
            ? nextGrades[existingIndex].id
            : `cloud-grade-${cloudUuid(
                'grade',
                `${bucket.studentId}:${bucket.subjectId}:${bucket.termCode}`
              )}`,
        studentId: bucket.studentId,
        classId: bucket.classId,
        subjectId: bucket.subjectId,
        termCode: bucket.termCode,
        schoolYearId: yearId,
        evaluations,
        examGrade,
        subjectAverage: CalculationService.computeSubjectAverage(
          evaluations,
          examGrade,
          db.schoolConfig.continuousAssessmentWeight ?? 1,
          db.schoolConfig.examWeight ?? 2
        ),
        teacherComment: bucket.comments.at(-1) || undefined,
        updatedAt: new Date().toISOString().slice(0, 10),
      };

      if (
        existingIndex < 0 ||
        JSON.stringify(nextGrades[existingIndex]) !== JSON.stringify(next)
      ) {
        gradesChanged += 1;
      }

      if (existingIndex >= 0) nextGrades[existingIndex] = next;
      else nextGrades.push(next);
    }

    if (attendanceAdded === 0 && gradesChanged === 0) {
      return { db, attendanceAdded, gradesChanged };
    }

    return {
      db: {
        ...db,
        attendanceRecords: Array.from(existingAttendance.values()),
        grades: nextGrades,
      },
      attendanceAdded,
      gradesChanged,
    };
  }
}
