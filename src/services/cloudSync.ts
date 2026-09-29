import { CalculationService } from './calculations';
import { DatabaseSchema, GradeEntry, AttendanceRecord } from '../types/school';

const DEFAULT_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://cmpbrouwcfoauwyeiyfj.supabase.co';
const DEFAULT_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_ox4EuxE10F3DLNxr1wP74A_fI_dhJgQ';

const SESSION_KEY = 'SEKOLY_CLOUD_SESSION_V2';
const SCHOOL_KEY = 'SEKOLY_CLOUD_SCHOOL_ID_V2';
const ADMIN_DEVICE_KEY = 'SEKOLY_ADMIN_DEVICE_ID_V1';
const PULL_CURSOR_PREFIX = 'SEKOLY_CLOUD_PULL_CURSOR_V1';
const ID_NAMESPACE_KEY = 'SEKOLY_CLOUD_ID_NAMESPACE_VERSION_V1';

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
  gradeConflicts: number;
};

export type PilotStatus = {
  school: { id: string; name: string };
  activeYear: { id: string; label: string; status: string } | null;
  counts: {
    years: number;
    terms: number;
    subjects: number;
    classes: number;
    students: number;
    teachers: number;
    teachersWithAccess: number;
    assignments: number;
    timetable: number;
  };
  checks: Record<string, boolean>;
  dataReady: boolean;
  mobileReady: boolean;
  resendConfigured: boolean;
};

export type PilotSmokeTest = {
  ready: boolean;
  checkedAt: string;
  school: { id: string; name: string; status: string };
  activeYear: { id: string; label: string; status: string } | null;
  checks: Array<{
    key: string;
    label: string;
    ok: boolean;
    required: boolean;
    detail: string;
  }>;
  blocking: string[];
  stats: {
    teachers: number;
    teachersWithEmail: number;
    teachersWithAccess: number;
    assignments: number;
    mobileAssignments: number;
    students: number;
    enrollments: number;
    classes: number;
    subjects: number;
    unlockedTerms: number;
    timetable: number;
    attendanceSessions: number;
    assessments: number;
  };
};

export type SchoolCloudCapacity = {
  limits: {
    school_id: string;
    plan_code: 'PILOT' | 'STANDARD' | 'PRO' | 'ENTERPRISE';
    status: 'ACTIVE' | 'SUSPENDED';
    max_students: number;
    max_teachers: number;
    max_families: number;
    max_document_bytes: number;
    backup_retention_days: number;
  };
  usage: {
    students: number;
    teachers: number;
    families: number;
    documentBytes: number;
  };
  latestBackup: SchoolBackup | null;
};

export type SchoolBackup = {
  id: string;
  backup_type: 'AUTOMATIC' | 'MANUAL';
  status: 'CREATING' | 'READY' | 'FAILED' | 'EXPIRED';
  size_bytes: number | null;
  row_counts: Record<string, number>;
  created_at: string;
  expires_at: string | null;
};

export type SyncMonitor = {
  generatedAt: string;
  summary: {
    devices: number;
    active24h: number;
    pendingDevices: number;
    unhealthyDevices: number;
    errors24h: number;
    recentEvents: number;
    auditEntries: number;
  };
  devices: Array<{
    deviceId: string;
    platform: string;
    teacher: { id: string; name: string; email: string | null; status: string } | null;
    lastEventType: string;
    lastStatus: string;
    queueCount: number;
    lastError: string | null;
    lastSeenAt: string;
    health: 'OK' | 'PENDING' | 'ERROR' | 'STALE';
  }>;
  events: Array<{
    id: string;
    teacher_id: string | null;
    device_id: string;
    platform: string;
    event_type: string;
    status: string;
    queue_count: number;
    error_message: string | null;
    metadata: Record<string, unknown>;
    occurred_at: string;
    teacher: { id: string; name: string; email: string | null; status: string } | null;
  }>;
  audit: Array<{
    id: number;
    user_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    actor: string;
  }>;
};

export type EnrollmentFormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'DATE'
  | 'EMAIL'
  | 'PHONE'
  | 'NUMBER'
  | 'SELECT'
  | 'YES_NO'
  | 'CLASS';

export type EnrollmentFormSection = {
  id: string;
  scope: 'FAMILY' | 'CHILD';
  title: string;
  description?: string;
  order: number;
  visible: boolean;
  locked?: boolean;
};

export type EnrollmentFormField = {
  key: string;
  scope: 'FAMILY' | 'CHILD';
  group: 'PRIMARY' | 'SECONDARY' | 'CHILD' | 'CUSTOM';
  label: string;
  type: EnrollmentFormFieldType;
  visible: boolean;
  required: boolean;
  locked?: boolean;
  custom?: boolean;
  sectionId?: string;
  order: number;
  placeholder?: string;
  helpText?: string;
  options?: string[];
};

export type EnrollmentFormDocument = {
  code: string;
  scope: 'FAMILY' | 'CHILD';
  label: string;
  visible: boolean;
  required: boolean;
  order: number;
  custom?: boolean;
  helpText?: string;
};

export type EnrollmentFormSchema = {
  schemaVersion: number;
  sections?: EnrollmentFormSection[];
  fields: EnrollmentFormField[];
  documents: EnrollmentFormDocument[];
};

export type EnrollmentSubmissionPayload = {
  guardian?: Record<string, unknown>;
  child?: Record<string, unknown>;
  customAnswers?: Record<string, unknown>;
  submittedAt?: string;
};

export type EnrollmentCampaign = {
  id: string;
  school_id: string;
  school_year_id: string;
  name: string;
  public_code: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  allow_new_admission: boolean;
  allow_re_registration: boolean;
  instructions: string | null;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  form_schema: EnrollmentFormSchema;
  form_schema_version: number;
  publicUrl: string;
  qrUrl: string;
};

export type EnrollmentQueueItem = {
  id: string;
  school_id: string;
  campaign_id: string;
  family_id: string;
  application_type: 'NEW' | 'RE_REGISTRATION';
  status:
    | 'SUBMITTED'
    | 'TO_CONTACT'
    | 'CONTACTED'
    | 'APPOINTMENT_SCHEDULED'
    | 'INCOMPLETE'
    | 'COMPLETE'
    | 'ACCEPTED'
    | 'PAYMENT_PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'WITHDRAWN';
  existing_matricule: string | null;
  desired_class_id: string | null;
  child_last_name: string;
  child_first_name: string;
  child_gender: 'M' | 'F' | null;
  child_birth_date: string | null;
  child_birth_place: string | null;
  child_nationality: string;
  child_address: string | null;
  child_neighborhood: string | null;
  child_city: string | null;
  previous_school: string | null;
  birth_certificate_number: string | null;
  birth_certificate_date: string | null;
  birth_certificate_place: string | null;
  blood_type: string | null;
  medical_notes: string | null;
  contact_note: string | null;
  contacted_at: string | null;
  approved_at: string | null;
  appointment_at: string | null;
  decision_note: string | null;
  payment_status: 'NOT_REQUIRED' | 'PENDING' | 'PAID' | 'WAIVED';
  final_student_id: string | null;
  created_at: string;
  form_schema_version: number | null;
  form_schema_snapshot: EnrollmentFormSchema | null;
  custom_answers: Record<string, unknown>;
  submitted_payload: EnrollmentSubmissionPayload;
  family: {
    id: string;
    reference_code: string;
    family_profile_id: string | null;
    guardian_last_name: string;
    guardian_first_name: string;
    relationship: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';
    phone_primary: string;
    phone_secondary: string | null;
    email: string | null;
    cin_number: string | null;
    cin_issued_at: string | null;
    cin_issue_place: string | null;
    occupation: string | null;
    address: string | null;
    city: string | null;
    preferred_contact: string;
    form_schema_version: number | null;
    form_schema_snapshot: EnrollmentFormSchema | null;
    custom_answers: Record<string, unknown>;
    submitted_payload: EnrollmentSubmissionPayload;
  } | null;
  desiredClassName: string | null;
  familyProfileCode: string | null;
  checklist: EnrollmentChecklistItem[];
  documents: EnrollmentDocument[];
};

export type EnrollmentChecklistItem = {
  id: string;
  application_id: string;
  code: string;
  label: string;
  scope: 'FAMILY' | 'CHILD';
  required: boolean;
  status: 'MISSING' | 'PROVIDED' | 'VERIFIED' | 'NOT_REQUIRED';
  document_id: string | null;
  note: string | null;
  sort_order: number;
};

export type EnrollmentDocument = {
  id: string;
  family_id: string;
  application_id: string | null;
  document_type: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  status: 'UPLOADED' | 'VERIFIED' | 'REJECTED';
  verification_note: string | null;
  created_at: string;
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

export function cloudEntityUuid(scope: string, value: string) {
  const base = cloudUuid(scope, value);
  const schoolId =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(SCHOOL_KEY)
      : null;
  const version =
    typeof localStorage !== 'undefined'
      ? Number(localStorage.getItem(ID_NAMESPACE_KEY) || '1')
      : 1;

  if (!schoolId || version < 2) return base;

  return cloudUuid(
    `tenant-${scope}`,
    `${schoolId}:${base}`
  );
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

const getAdminDeviceId = () => {
  const existing = localStorage.getItem(ADMIN_DEVICE_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : cloudUuid(
          'admin-device',
          `${Date.now()}:${Math.random().toString(36).slice(2)}`
        );

  localStorage.setItem(ADMIN_DEVICE_KEY, id);
  return id;
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

async function restSelectPaged<T>(
  table: string,
  query = '',
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 100; page += 1) {
    const offset = page * pageSize;
    const response = await authRequest(
      `/rest/v1/${table}?${query}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Range: `${offset}-${offset + pageSize - 1}`,
        },
      }
    );
    const chunk = await parseResponse<T[]>(response);
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
  }
  throw new Error(
    `Volume Cloud trop important pour ${table}. Une synchronisation complète est requise.`
  );
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

async function restInsertReturning<T>(
  table: string,
  row: Record<string, unknown>
): Promise<T> {
  const response = await authRequest(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const rows = await parseResponse<T[]>(response);
  if (!rows[0]) throw new Error('Le Cloud n’a retourné aucune donnée.');
  return rows[0];
}

async function restPatch(
  table: string,
  query: string,
  values: Record<string, unknown>
) {
  const response = await authRequest(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(values),
  });
  if (!response.ok) await parseResponse(response);
}

async function restDelete(table: string, query: string) {
  const response = await authRequest(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!response.ok) await parseResponse(response);
}

async function patchIds(
  table: string,
  ids: string[],
  values: Record<string, unknown>
) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    if (chunk.length === 0) continue;
    await restPatch(table, `id=in.(${chunk.join(',')})`, values);
  }
}

async function deleteIds(table: string, ids: string[]) {
  for (let offset = 0; offset < ids.length; offset += 100) {
    const chunk = ids.slice(offset, offset + 100);
    if (chunk.length === 0) continue;
    await restDelete(table, `id=in.(${chunk.join(',')})`);
  }
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
    else {
      localStorage.removeItem(SCHOOL_KEY);
      localStorage.removeItem(ID_NAMESPACE_KEY);
    }
  }

  static setIdNamespaceVersion(version: number) {
    localStorage.setItem(ID_NAMESPACE_KEY, String(version >= 2 ? 2 : 1));
  }

  static getIdNamespaceVersion() {
    return Number(localStorage.getItem(ID_NAMESPACE_KEY) || '1');
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
      'select=school_id,role,status,sekoly_schools(id,name,slug,acronym,settings)&status=eq.ACTIVE'
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

    const result = await parseResponse<{
      school: {
        id: string;
        name: string;
        settings?: { id_namespace_version?: number };
      };
    }>(response);
    this.setSchoolId(result.school.id);
    this.setIdNamespaceVersion(
      Number(result.school.settings?.id_namespace_version || 2)
    );
    return result.school;
  }

  static async attachExistingMembership() {
    const memberships = await this.memberships();
    const adminMembership = memberships.find((item) =>
      ['SCHOOL_ADMIN', 'DIRECTOR'].includes(item.role)
    );
    if (adminMembership) {
      this.setSchoolId(adminMembership.school_id);
      this.setIdNamespaceVersion(
        Number(
          adminMembership.sekoly_schools?.settings?.id_namespace_version || 1
        )
      );
      return adminMembership;
    }
    return null;
  }

  static async syncLocalStructure(db: DatabaseSchema) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error("Aucun établissement Cloud n'est lié.");

    const years = db.schoolYears.map((year) => ({
      id: cloudEntityUuid('year', year.id),
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
        id: cloudEntityUuid('term', term.id),
        school_id: schoolId,
        school_year_id: cloudEntityUuid('year', year.id),
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
      id: cloudEntityUuid('subject', subject.id),
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
        id: cloudEntityUuid('class', `${year.id}:${schoolClass.id}`),
        school_id: schoolId,
        school_year_id: cloudEntityUuid('year', year.id),
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
        id: cloudEntityUuid('student', student.matricule.toUpperCase()),
        school_id: schoolId,
        matricule: student.matricule,
        last_name: student.lastName,
        first_name: student.firstName,
        gender: student.gender,
        birth_date: student.birthDate || null,
        birth_place: student.birthPlace || null,
        nationality: student.nationality || 'Malgache',
        address: student.address || null,
        neighborhood: student.neighborhood || null,
        city: student.city || null,
        emergency_contact: student.emergencyContact || null,
        emergency_phone: student.emergencyPhone || null,
        blood_type: student.bloodType || null,
        medical_notes: student.medicalNotes || null,
        previous_school: student.previousSchool || null,
        birth_certificate_number: student.birthCertificateNumber || null,
        birth_certificate_date: student.birthCertificateDate || null,
        birth_certificate_place: student.birthCertificatePlace || null,
        photo_url: student.photoUrl || null,
      });
    });
    await restUpsert(
      'sekoly_students',
      Array.from(uniqueStudents.values()),
      'id'
    );

    const cloudExistingGuardians = await restSelect<any>(
      'sekoly_guardians',
      `select=id,last_name,first_name,phone_primary,email,cin_number&school_id=eq.${schoolId}`
    );
    const guardianCloudIdMap = new Map<string, string>();

    const normalizedKey = (value?: string | null) =>
      (value || '').replace(/\s+/g, '').toUpperCase();

    const guardians = (db.guardians ?? []).map((guardian) => {
      const cinKey = normalizedKey(guardian.cinNumber);
      const phoneKey = normalizedKey(guardian.phonePrimary);
      const emailKey = (guardian.email || '').trim().toLowerCase();
      const matching = cloudExistingGuardians.find((candidate) => {
        if (cinKey && normalizedKey(candidate.cin_number) === cinKey) return true;
        if (
          phoneKey &&
          normalizedKey(candidate.phone_primary) === phoneKey &&
          normalizedKey(candidate.last_name) === normalizedKey(guardian.lastName)
        ) {
          return true;
        }
        if (
          emailKey &&
          (candidate.email || '').trim().toLowerCase() === emailKey &&
          normalizedKey(candidate.last_name) === normalizedKey(guardian.lastName)
        ) {
          return true;
        }
        return false;
      });

      const cloudGuardianId =
        matching?.id || cloudEntityUuid('guardian', guardian.id);
      guardianCloudIdMap.set(guardian.id, cloudGuardianId);

      return {
        id: cloudGuardianId,
        school_id: schoolId,
        last_name: guardian.lastName,
        first_name: guardian.firstName,
        phone_primary: guardian.phonePrimary || null,
        phone_secondary: guardian.phoneSecondary || null,
        email: guardian.email || null,
        cin_number: guardian.cinNumber || null,
        cin_issued_at: guardian.cinIssuedAt || null,
        cin_issue_place: guardian.cinIssuePlace || null,
        occupation: guardian.occupation || null,
        employer: guardian.employer || null,
        address: guardian.address || null,
        city: guardian.city || null,
        nationality: guardian.nationality || 'Malgache',
        status: guardian.status || 'ACTIVE',
      };
    });
    await restUpsert('sekoly_guardians', guardians, 'id');

    const guardianLinkMap = new Map<string, Record<string, unknown>>();
    (db.studentGuardianLinks ?? []).forEach((link) => {
      const student = db.students.find((item) => item.id === link.studentId);
      if (!student) return;
      const cloudStudentId = cloudEntityUuid(
        'student',
        student.matricule.toUpperCase()
      );
      const cloudGuardianId =
        guardianCloudIdMap.get(link.guardianId) ||
        cloudEntityUuid('guardian', link.guardianId);
      const key = `${cloudStudentId}:${cloudGuardianId}`;
      guardianLinkMap.set(key, {
        id: cloudEntityUuid('student-guardian', key),
        school_id: schoolId,
        student_id: cloudStudentId,
        guardian_id: cloudGuardianId,
        relationship: link.relationship,
        is_primary: Boolean(link.isPrimary),
        has_legal_custody: link.hasLegalCustody !== false,
        authorized_pickup: link.authorizedPickup !== false,
        emergency_priority: link.emergencyPriority || null,
        notes: link.notes || null,
      });
    });
    const guardianLinks = Array.from(guardianLinkMap.values());
    await restUpsert('sekoly_student_guardians', guardianLinks, 'id');

    const existingFamilyGuardianLinks = await restSelect<any>(
      'sekoly_family_guardians',
      `select=family_id,guardian_id,is_primary&school_id=eq.${schoolId}`
    );
    const existingFamilyByGuardian = new Map<string, string>();
    existingFamilyGuardianLinks
      .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)))
      .forEach((link) => {
        if (!existingFamilyByGuardian.has(link.guardian_id)) {
          existingFamilyByGuardian.set(link.guardian_id, link.family_id);
        }
      });

    const familyMap = new Map<string, Record<string, unknown>>();
    const familyGuardianMap = new Map<string, Record<string, unknown>>();
    const familyStudentMap = new Map<string, Record<string, unknown>>();

    db.students.forEach((student) => {
      const localLinks = (db.studentGuardianLinks ?? []).filter(
        (link) => link.studentId === student.id
      );
      if (localLinks.length === 0) return;

      const primaryLink =
        localLinks.find((link) => link.isPrimary) || localLinks[0];
      const primaryGuardian = (db.guardians ?? []).find(
        (guardian) => guardian.id === primaryLink.guardianId
      );
      if (!primaryGuardian) return;

      const cloudPrimaryGuardianId =
        guardianCloudIdMap.get(primaryGuardian.id) ||
        cloudEntityUuid('guardian', primaryGuardian.id);
      const cloudFamilyId =
        existingFamilyByGuardian.get(cloudPrimaryGuardianId) ||
        cloudEntityUuid('family', cloudPrimaryGuardianId);

      familyMap.set(cloudFamilyId, {
        id: cloudFamilyId,
        school_id: schoolId,
        display_name: `Famille ${primaryGuardian.lastName}`,
        address: primaryGuardian.address || student.address || null,
        city: primaryGuardian.city || student.city || null,
        status: 'ACTIVE',
      });

      localLinks.forEach((link) => {
        const cloudGuardianId =
          guardianCloudIdMap.get(link.guardianId) ||
          cloudEntityUuid('guardian', link.guardianId);
        const key = `${cloudFamilyId}:${cloudGuardianId}`;
        familyGuardianMap.set(key, {
          id: cloudEntityUuid('family-guardian', key),
          school_id: schoolId,
          family_id: cloudFamilyId,
          guardian_id: cloudGuardianId,
          is_primary: cloudGuardianId === cloudPrimaryGuardianId,
          relationship: link.relationship,
        });
      });

      const cloudStudentId = cloudEntityUuid(
        'student',
        student.matricule.toUpperCase()
      );
      const familyStudentKey = `${cloudFamilyId}:${cloudStudentId}`;
      familyStudentMap.set(familyStudentKey, {
        id: cloudEntityUuid('family-student', familyStudentKey),
        school_id: schoolId,
        family_id: cloudFamilyId,
        student_id: cloudStudentId,
        relationship_label: 'ENFANT',
      });
    });

    const families = Array.from(familyMap.values());
    const familyGuardians = Array.from(familyGuardianMap.values());
    const familyStudents = Array.from(familyStudentMap.values());
    await restUpsert('sekoly_families', families, 'id');
    await restUpsert('sekoly_family_guardians', familyGuardians, 'id');
    await restUpsert('sekoly_family_students', familyStudents, 'id');

    const enrollments = db.students.map((student) => ({
      id: cloudEntityUuid(
        'enrollment',
        `${student.schoolYearId}:${student.matricule.toUpperCase()}`
      ),
      school_id: schoolId,
      student_id: cloudEntityUuid('student', student.matricule.toUpperCase()),
      school_year_id: cloudEntityUuid('year', student.schoolYearId),
      class_id: cloudEntityUuid(
        'class',
        `${student.schoolYearId}:${student.classId}`
      ),
      status: enrollmentStatus(student.status),
      enrolled_at: student.enrollmentDate || new Date().toISOString().slice(0, 10),
      final_decision: student.councilDecision || null,
    }));
    await restUpsert('sekoly_enrollments', enrollments, 'id');

    const cloudEnrollments = await restSelect<{ id: string }>(
      'sekoly_enrollments',
      `select=id&school_id=eq.${schoolId}&school_year_id=eq.${cloudEntityUuid(
        'year',
        db.currentSchoolYearId
      )}`
    );
    const localEnrollmentIds = new Set(enrollments.map((item) => item.id));
    await patchIds(
      'sekoly_enrollments',
      cloudEnrollments
        .map((item) => item.id)
        .filter((id) => !localEnrollmentIds.has(id)),
      { status: 'DROPPED' }
    );

    const teachers = db.teachers.map((teacher) => ({
      id: cloudEntityUuid('teacher', teacher.id),
      school_id: schoolId,
      matricule: teacher.matricule || null,
      last_name: teacher.lastName,
      first_name: teacher.firstName,
      phone: teacher.phone || null,
      email: teacher.email || null,
      status: 'ACTIVE',
    }));
    await restUpsert('sekoly_teachers', teachers, 'id');

    const cloudTeachers = await restSelect<{ id: string }>(
      'sekoly_teachers',
      `select=id&school_id=eq.${schoolId}`
    );
    const localTeacherIds = new Set(teachers.map((item) => item.id));
    await patchIds(
      'sekoly_teachers',
      cloudTeachers
        .map((item) => item.id)
        .filter((id) => !localTeacherIds.has(id)),
      { status: 'INACTIVE' }
    );

    const currentYearId = db.currentSchoolYearId;
    const classSubjects = db.classes.flatMap((schoolClass) =>
      schoolClass.subjects.map((config) => ({
        id: cloudEntityUuid(
          'class-subject',
          `${currentYearId}:${schoolClass.id}:${config.subjectId}`
        ),
        school_id: schoolId,
        class_id: cloudEntityUuid(
          'class',
          `${currentYearId}:${schoolClass.id}`
        ),
        subject_id: cloudEntityUuid('subject', config.subjectId),
        teacher_id: config.teacherId
          ? cloudEntityUuid('teacher', config.teacherId)
          : null,
        coefficient: config.coefficient,
        weekly_hours: config.weeklyHours || 2,
      }))
    );
    await restUpsert('sekoly_class_subjects', classSubjects, 'id');

    const currentClassIds = new Set(
      db.classes.map((schoolClass) =>
        cloudEntityUuid('class', `${currentYearId}:${schoolClass.id}`)
      )
    );
    const cloudClassSubjects = await restSelect<{ id: string; class_id: string }>(
      'sekoly_class_subjects',
      `select=id,class_id&school_id=eq.${schoolId}`
    );
    const localClassSubjectIds = new Set(classSubjects.map((item) => item.id));
    await deleteIds(
      'sekoly_class_subjects',
      cloudClassSubjects
        .filter(
          (item) =>
            currentClassIds.has(item.class_id) &&
            !localClassSubjectIds.has(item.id)
        )
        .map((item) => item.id)
    );

    const assignments = db.classes.flatMap((schoolClass) =>
      schoolClass.subjects
        .filter((config) => Boolean(config.teacherId))
        .map((config) => ({
          id: cloudEntityUuid(
            'assignment',
            `${currentYearId}:${schoolClass.id}:${config.subjectId}:${config.teacherId}`
          ),
          school_id: schoolId,
          school_year_id: cloudEntityUuid('year', currentYearId),
          teacher_id: cloudEntityUuid('teacher', config.teacherId!),
          class_id: cloudEntityUuid(
            'class',
            `${currentYearId}:${schoolClass.id}`
          ),
          subject_id: cloudEntityUuid('subject', config.subjectId),
          weekly_hours: config.weeklyHours || 2,
          active: true,
        }))
    );
    await restUpsert('sekoly_teacher_assignments', assignments, 'id');

    const cloudAssignments = await restSelect<{ id: string }>(
      'sekoly_teacher_assignments',
      `select=id&school_id=eq.${schoolId}&school_year_id=eq.${cloudEntityUuid(
        'year',
        currentYearId
      )}`
    );
    const localAssignmentIds = new Set(assignments.map((item) => item.id));
    await patchIds(
      'sekoly_teacher_assignments',
      cloudAssignments
        .map((item) => item.id)
        .filter((id) => !localAssignmentIds.has(id)),
      { active: false }
    );

    const timetable = db.timetableSlots.map((slot) => ({
      id: cloudEntityUuid('timetable', slot.id),
      school_id: schoolId,
      school_year_id: cloudEntityUuid('year', currentYearId),
      class_id: cloudEntityUuid('class', `${currentYearId}:${slot.classId}`),
      subject_id: cloudEntityUuid('subject', slot.subjectId),
      teacher_id: cloudEntityUuid('teacher', slot.teacherId),
      day_of_week: slot.dayOfWeek,
      start_time: slot.startTime,
      end_time: slot.endTime,
      room: slot.room,
    }));
    await restUpsert('sekoly_timetable_slots', timetable, 'id');

    const cloudTimetable = await restSelect<{ id: string }>(
      'sekoly_timetable_slots',
      `select=id&school_id=eq.${schoolId}&school_year_id=eq.${cloudEntityUuid(
        'year',
        currentYearId
      )}`
    );
    const localTimetableIds = new Set(timetable.map((item) => item.id));
    await deleteIds(
      'sekoly_timetable_slots',
      cloudTimetable
        .map((item) => item.id)
        .filter((id) => !localTimetableIds.has(id))
    );

    return {
      years: years.length,
      terms: terms.length,
      subjects: subjects.length,
      classes: classes.length,
      students: uniqueStudents.size,
      guardians: guardians.length,
      guardianLinks: guardianLinks.length,
      families: families.length,
      familyGuardians: familyGuardians.length,
      familyStudents: familyStudents.length,
      enrollments: enrollments.length,
      teachers: teachers.length,
      assignments: assignments.length,
      timetable: timetable.length,
    };
  }

  static publicEnrollmentUrl(publicCode: string) {
    return `https://romuel10.github.io/romuel-app-store/sekoly/enrollment/index.html?code=${encodeURIComponent(
      publicCode
    )}`;
  }

  static publicEnrollmentQrUrl(publicCode: string) {
    return `${DEFAULT_URL}/functions/v1/sekoly-public-enrollment?code=${encodeURIComponent(
      publicCode
    )}&format=qr&v=7`;
  }

  static async getOpenEnrollmentCampaign(
    db: DatabaseSchema
  ): Promise<EnrollmentCampaign | null> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const rows = await restSelect<any>(
      'sekoly_enrollment_campaigns',
      `select=*&school_id=eq.${schoolId}&school_year_id=eq.${cloudEntityUuid(
        'year',
        db.currentSchoolYearId
      )}&status=eq.OPEN&order=created_at.desc&limit=1`
    );

    const campaign = rows[0];
    if (!campaign) return null;
    const publicUrl = this.publicEnrollmentUrl(campaign.public_code);
    return {
      ...campaign,
      publicUrl,
      qrUrl: this.publicEnrollmentQrUrl(campaign.public_code),
    } as EnrollmentCampaign;
  }

  static async createEnrollmentCampaign(
    db: DatabaseSchema
  ): Promise<EnrollmentCampaign> {
    const schoolId = this.getSchoolId();
    const session = this.getSession();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const currentYear = db.schoolYears.find(
      (item) => item.id === db.currentSchoolYearId
    );
    if (!currentYear) throw new Error('Année scolaire active introuvable.');

    const existing = await this.getOpenEnrollmentCampaign(db);
    if (existing) return existing;

    const previousCampaigns = await restSelect<any>(
      'sekoly_enrollment_campaigns',
      `select=form_schema&school_id=eq.${schoolId}&order=created_at.desc&limit=1`
    );
    const inheritedSchema = previousCampaigns[0]?.form_schema as
      | EnrollmentFormSchema
      | undefined;

    const campaign = await restInsertReturning<any>(
      'sekoly_enrollment_campaigns',
      {
        school_id: schoolId,
        school_year_id: cloudEntityUuid('year', db.currentSchoolYearId),
        name: `Inscriptions ${currentYear.label}`,
        status: 'OPEN',
        allow_new_admission: true,
        allow_re_registration: true,
        instructions:
          "Remplissez les informations de la famille et de chaque enfant. L'établissement vous contactera avant toute validation définitive.",
        opens_at: new Date().toISOString(),
        created_by: session?.user?.id || null,
        ...(inheritedSchema
          ? {
              form_schema: inheritedSchema,
              form_schema_version: 1,
            }
          : {}),
      }
    );

    const publicUrl = this.publicEnrollmentUrl(campaign.public_code);
    return {
      ...campaign,
      publicUrl,
      qrUrl: this.publicEnrollmentQrUrl(campaign.public_code),
    } as EnrollmentCampaign;
  }

  static async updateEnrollmentFormSchema(
    campaign: EnrollmentCampaign,
    schema: EnrollmentFormSchema
  ): Promise<EnrollmentCampaign> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const fields = Array.isArray(schema.fields) ? schema.fields : [];
    const sections = Array.isArray(schema.sections) ? schema.sections : [];
    const documents = Array.isArray(schema.documents) ? schema.documents : [];

    const sectionIds = new Set<string>();
    for (const section of sections) {
      if (!section.id || !section.title || !['FAMILY', 'CHILD'].includes(section.scope)) {
        throw new Error('La configuration contient une section incomplète.');
      }
      if (sectionIds.has(section.id)) {
        throw new Error(`La section « ${section.title} » est présente deux fois.`);
      }
      sectionIds.add(section.id);
    }

    const lockedRequired = [
      ['FAMILY', 'guardianLastName'],
      ['FAMILY', 'relationship'],
      ['FAMILY', 'phonePrimary'],
      ['CHILD', 'type'],
      ['CHILD', 'existingMatricule'],
      ['CHILD', 'lastName'],
      ['CHILD', 'firstName'],
    ] as const;

    for (const [scope, key] of lockedRequired) {
      const field = fields.find((item) => item.scope === scope && item.key === key);
      if (!field || !field.visible) {
        throw new Error(`Le champ essentiel « ${key} » ne peut pas être masqué.`);
      }
      if (key !== 'existingMatricule' && !field.required) {
        throw new Error(`Le champ essentiel « ${field.label} » doit rester obligatoire.`);
      }
      if (field.sectionId) {
        const section = sections.find((item) => item.id === field.sectionId);
        if (section && section.visible === false) {
          throw new Error(
            `La section « ${section.title} » contient un champ essentiel et doit rester visible.`
          );
        }
      }
    }

    const customKeys = new Set<string>();
    for (const field of fields) {
      if (!field.key || !field.label || !field.scope || !field.type) {
        throw new Error('La configuration contient un champ incomplet.');
      }
      if (field.sectionId) {
        const section = sections.find((item) => item.id === field.sectionId);
        if (!section || section.scope !== field.scope) {
          throw new Error(
            `Le champ « ${field.label} » est rattaché à une section invalide.`
          );
        }
      }
      if (field.custom) {
        const composite = `${field.scope}:${field.key}`;
        if (customKeys.has(composite)) {
          throw new Error(`Le champ personnalisé « ${field.label} » est présent deux fois.`);
        }
        customKeys.add(composite);
      }
      if (field.type === 'SELECT' && (!field.options || field.options.length === 0)) {
        throw new Error(`Ajoutez au moins une option au champ « ${field.label} ».`);
      }
    }

    const documentCodes = new Set<string>();
    for (const document of documents) {
      const code = document.code?.trim().toUpperCase();
      if (!code || !document.label?.trim() || !['FAMILY', 'CHILD'].includes(document.scope)) {
        throw new Error('La configuration contient une pièce justificative incomplète.');
      }
      if (!/^[A-Z0-9_]{2,80}$/.test(code)) {
        throw new Error(
          `Le code de la pièce « ${document.label} » contient des caractères non autorisés.`
        );
      }
      if (documentCodes.has(code)) {
        throw new Error(`La pièce « ${document.label} » est présente deux fois.`);
      }
      documentCodes.add(code);
    }

    const nextVersion = Math.max(1, Number(campaign.form_schema_version || 1) + 1);
    await restPatch(
      'sekoly_enrollment_campaigns',
      `id=eq.${encodeURIComponent(campaign.id)}&school_id=eq.${schoolId}`,
      {
        form_schema: {
          schemaVersion: Math.max(3, Number(schema.schemaVersion || 3)),
          sections: sections
            .map((item, index) => ({
              ...item,
              id: item.id.trim(),
              title: item.title.trim(),
              description: item.description?.trim() || undefined,
              order: Number.isFinite(item.order) ? item.order : (index + 1) * 10,
              visible: item.visible !== false,
            }))
            .sort((a, b) => a.order - b.order),
          fields: fields
            .map((item, index) => ({
              ...item,
              label: item.label.trim(),
              order: Number.isFinite(item.order) ? item.order : (index + 1) * 10,
            }))
            .sort((a, b) => a.order - b.order),
          documents: documents
            .map((item, index) => ({
              ...item,
              code: item.code.trim().toUpperCase(),
              label: item.label.trim(),
              helpText: item.helpText?.trim() || undefined,
              visible: item.visible !== false,
              required: item.visible !== false && Boolean(item.required),
              order: Number.isFinite(item.order) ? item.order : (index + 1) * 10,
            }))
            .sort((a, b) => a.order - b.order),
        },
        form_schema_version: nextVersion,
      }
    );

    const rows = await restSelect<any>(
      'sekoly_enrollment_campaigns',
      `select=*&id=eq.${encodeURIComponent(campaign.id)}&school_id=eq.${schoolId}&limit=1`
    );
    const updated = rows[0];
    if (!updated) throw new Error('Campagne introuvable après la mise à jour.');

    return {
      ...updated,
      publicUrl: this.publicEnrollmentUrl(updated.public_code),
      qrUrl: this.publicEnrollmentQrUrl(updated.public_code),
    } as EnrollmentCampaign;
  }

  static async closeEnrollmentCampaign(campaignId: string) {
    await restPatch(
      'sekoly_enrollment_campaigns',
      `id=eq.${encodeURIComponent(campaignId)}`,
      { status: 'CLOSED' }
    );
  }

  static async listEnrollmentApplications(): Promise<EnrollmentQueueItem[]> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const [applications, families, classes, profiles, checklist, documents] =
      await Promise.all([
        restSelect<any>(
          'sekoly_enrollment_applications',
          `select=*&school_id=eq.${schoolId}&order=created_at.desc&limit=500`
        ),
        restSelect<any>(
          'sekoly_enrollment_families',
          `select=*&school_id=eq.${schoolId}&order=submitted_at.desc&limit=500`
        ),
        restSelect<any>(
          'sekoly_classes',
          `select=id,name&school_id=eq.${schoolId}`
        ),
        restSelect<any>(
          'sekoly_families',
          `select=id,family_code,display_name&school_id=eq.${schoolId}&limit=500`
        ),
        restSelect<any>(
          'sekoly_enrollment_checklist_items',
          `select=*&school_id=eq.${schoolId}&order=sort_order.asc&limit=5000`
        ),
        restSelect<any>(
          'sekoly_enrollment_documents',
          `select=id,family_id,application_id,document_type,original_name,mime_type,file_size,status,verification_note,created_at&school_id=eq.${schoolId}&order=created_at.desc&limit=5000`
        ),
      ]);

    const familyMap = new Map(families.map((item) => [item.id, item]));
    const classMap = new Map(classes.map((item) => [item.id, item.name]));
    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    const checklistMap = new Map<string, EnrollmentChecklistItem[]>();
    const documentMap = new Map<string, EnrollmentDocument[]>();
    const familyDocumentMap = new Map<string, EnrollmentDocument[]>();

    checklist.forEach((item) => {
      const rows = checklistMap.get(item.application_id) ?? [];
      rows.push(item as EnrollmentChecklistItem);
      checklistMap.set(item.application_id, rows);
    });
    documents.forEach((item) => {
      if (item.application_id) {
        const rows = documentMap.get(item.application_id) ?? [];
        rows.push(item as EnrollmentDocument);
        documentMap.set(item.application_id, rows);
        return;
      }
      const rows = familyDocumentMap.get(item.family_id) ?? [];
      rows.push(item as EnrollmentDocument);
      familyDocumentMap.set(item.family_id, rows);
    });

    return applications.map((item) => {
      const family = familyMap.get(item.family_id) || null;
      const profile = family?.family_profile_id
        ? profileMap.get(family.family_profile_id)
        : null;

      return {
        ...item,
        family,
        familyProfileCode: profile?.family_code || null,
        desiredClassName: item.desired_class_id
          ? classMap.get(item.desired_class_id) || null
          : null,
        checklist: checklistMap.get(item.id) ?? [],
        documents: [
          ...(profile?.id ? familyDocumentMap.get(profile.id) ?? [] : []),
          ...(documentMap.get(item.id) ?? []),
        ],
      };
    }) as EnrollmentQueueItem[];
  }

  static async updateEnrollmentApplication(
    applicationId: string,
    status: EnrollmentQueueItem['status'],
    contactNote?: string,
    options?: {
      appointmentAt?: string | null;
      decisionNote?: string | null;
      paymentStatus?: EnrollmentQueueItem['payment_status'];
    }
  ) {
    const session = this.getSession();
    const values: Record<string, unknown> = {
      status,
      contact_note: contactNote?.trim() || null,
      reviewed_by: session?.user?.id || null,
    };
    if (status === 'CONTACTED') values.contacted_at = new Date().toISOString();
    if (status === 'APPOINTMENT_SCHEDULED') {
      values.appointment_at = options?.appointmentAt || null;
    }
    if (status === 'APPROVED') values.approved_at = new Date().toISOString();
    if (options?.decisionNote !== undefined) {
      values.decision_note = options.decisionNote?.trim() || null;
    }
    if (options?.paymentStatus) values.payment_status = options.paymentStatus;

    await restPatch(
      'sekoly_enrollment_applications',
      `id=eq.${encodeURIComponent(applicationId)}`,
      values
    );
  }

  static async logEnrollmentContact(
    applicationId: string,
    contactType: 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL' | 'IN_PERSON' | 'APPOINTMENT',
    note?: string,
    scheduledAt?: string
  ) {
    const schoolId = this.getSchoolId();
    const session = this.getSession();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    await restInsertReturning<any>('sekoly_enrollment_contacts', {
      school_id: schoolId,
      application_id: applicationId,
      contact_type: contactType,
      note: note?.trim() || null,
      scheduled_at: scheduledAt || null,
      completed_at: contactType === 'APPOINTMENT' ? null : new Date().toISOString(),
      created_by: session?.user?.id || null,
    });
  }

  static async updateEnrollmentChecklistItem(
    checklistId: string,
    status: EnrollmentChecklistItem['status'],
    note?: string
  ) {
    await restPatch(
      'sekoly_enrollment_checklist_items',
      `id=eq.${encodeURIComponent(checklistId)}`,
      { status, note: note?.trim() || null }
    );
  }

  static async verifyEnrollmentDocument(
    documentId: string,
    status: EnrollmentDocument['status'],
    note?: string
  ) {
    const session = this.getSession();
    await restPatch(
      'sekoly_enrollment_documents',
      `id=eq.${encodeURIComponent(documentId)}`,
      {
        status,
        verification_note: note?.trim() || null,
        verified_by: status === 'UPLOADED' ? null : session?.user?.id || null,
        verified_at: status === 'UPLOADED' ? null : new Date().toISOString(),
      }
    );
  }

  static async getEnrollmentDocumentUrl(documentId: string) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const rows = await restSelect<{ storage_path: string; original_name: string }>(
      'sekoly_enrollment_documents',
      `select=storage_path,original_name&id=eq.${encodeURIComponent(
        documentId
      )}&school_id=eq.${schoolId}&limit=1`
    );
    const document = rows[0];
    if (!document) throw new Error('Document introuvable.');

    const encodedPath = document.storage_path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const response = await authRequest(
      `/storage/v1/object/sign/sekoly-enrollment-documents/${encodedPath}`,
      {
        method: 'POST',
        body: JSON.stringify({ expiresIn: 300 }),
      }
    );
    const signed = await parseResponse<{ signedURL?: string; signedUrl?: string }>(
      response
    );
    const relative = signed.signedURL || signed.signedUrl;
    if (!relative) throw new Error('Lien temporaire du document indisponible.');
    return relative.startsWith('http') ? relative : `${DEFAULT_URL}${relative}`;
  }

  static async finalizeEnrollmentApplication(
    applicationId: string,
    studentMatricule: string,
    paymentStatus: EnrollmentQueueItem['payment_status'] = 'NOT_REQUIRED'
  ) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const applications = await restSelect<any>(
      'sekoly_enrollment_applications',
      `select=id,family_id&id=eq.${encodeURIComponent(
        applicationId
      )}&school_id=eq.${schoolId}&limit=1`
    );
    const application = applications[0];
    if (!application) throw new Error('Demande QR introuvable.');

    const families = await restSelect<any>(
      'sekoly_enrollment_families',
      `select=id,family_profile_id&id=eq.${encodeURIComponent(
        application.family_id
      )}&school_id=eq.${schoolId}&limit=1`
    );
    const family = families[0];
    const cloudStudentId = cloudEntityUuid(
      'student',
      studentMatricule.trim().toUpperCase()
    );

    await restPatch(
      'sekoly_enrollment_applications',
      `id=eq.${encodeURIComponent(applicationId)}`,
      {
        status: 'APPROVED',
        final_student_id: cloudStudentId,
        approved_at: new Date().toISOString(),
        payment_status: paymentStatus,
      }
    );

    if (family?.family_profile_id) {
      const linkKey = `${family.family_profile_id}:${cloudStudentId}`;
      await restUpsert(
        'sekoly_family_students',
        [
          {
            id: cloudEntityUuid('family-student', linkKey),
            school_id: schoolId,
            family_id: family.family_profile_id,
            student_id: cloudStudentId,
            relationship_label: 'ENFANT',
          },
        ],
        'id'
      );
    }
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
          teacherId: cloudEntityUuid('teacher', teacher.id),
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
          teacherId: cloudEntityUuid('teacher', teacher.id),
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

  static async cloudCapacity(): Promise<SchoolCloudCapacity> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest('/functions/v1/sekoly-backup-school', {
      method: 'POST',
      body: JSON.stringify({ schoolId, action: 'status' }),
    });
    return parseResponse<SchoolCloudCapacity>(response);
  }

  static async schoolBackups(): Promise<SchoolBackup[]> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest('/functions/v1/sekoly-backup-school', {
      method: 'POST',
      body: JSON.stringify({ schoolId, action: 'list' }),
    });
    const result = await parseResponse<{ backups: SchoolBackup[] }>(response);
    return result.backups;
  }

  static async createSchoolBackup(
    mode: 'AUTOMATIC' | 'MANUAL' = 'MANUAL'
  ): Promise<{ created: boolean; backup: SchoolBackup }> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest('/functions/v1/sekoly-backup-school', {
      method: 'POST',
      body: JSON.stringify({ schoolId, mode, action: 'create' }),
    });
    return parseResponse<{ created: boolean; backup: SchoolBackup }>(response);
  }

  static async backupSignedUrl(backupId: string) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest('/functions/v1/sekoly-backup-school', {
      method: 'POST',
      body: JSON.stringify({ schoolId, action: 'signed_url', backupId }),
    });
    return parseResponse<{ url: string }>(response);
  }

  static async ensureDailyBackup() {
    const throttleKey = `SEKOLY_DAILY_BACKUP_CHECK:${this.getSchoolId() || 'none'}`;
    const lastCheck = Number(localStorage.getItem(throttleKey) || '0');
    if (Date.now() - lastCheck < 6 * 60 * 60 * 1000) return null;

    try {
      const result = await this.createSchoolBackup('AUTOMATIC');
      localStorage.setItem(throttleKey, String(Date.now()));
      return result;
    } catch (error) {
      localStorage.setItem(throttleKey, String(Date.now()));
      console.warn('Sekoly automatic backup:', error);
      return null;
    }
  }

  static async pilotStatus(): Promise<PilotStatus> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest(
      '/functions/v1/sekoly-pilot-status',
      {
        method: 'POST',
        body: JSON.stringify({ schoolId }),
      }
    );

    return parseResponse<PilotStatus>(response);
  }

  static async runPilotSmokeTest(): Promise<PilotSmokeTest> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest(
      '/functions/v1/sekoly-pilot-smoke-test',
      {
        method: 'POST',
        body: JSON.stringify({ schoolId }),
      }
    );

    return parseResponse<PilotSmokeTest>(response);
  }

  static async recordAdminSyncEvent(
    eventType: 'SYNC_START' | 'SYNC_SUCCESS' | 'SYNC_ERROR',
    status: 'OK' | 'WARNING' | 'ERROR' = 'OK',
    metadata: Record<string, unknown> = {},
    errorMessage?: string | null
  ) {
    const schoolId = this.getSchoolId();
    const session = this.getSession();
    if (!schoolId || !session?.user?.id) return;

    try {
      const response = await authRequest('/rest/v1/sekoly_sync_events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          school_id: schoolId,
          user_id: session.user.id,
          teacher_id: null,
          device_id: getAdminDeviceId(),
          platform: 'DESKTOP',
          event_type: eventType,
          status,
          queue_count: 0,
          error_message: errorMessage?.slice(0, 1000) || null,
          metadata,
          occurred_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) await parseResponse(response);
    } catch (error) {
      console.warn('Sekoly Admin sync event:', error);
    }
  }

  static async syncMonitor(): Promise<SyncMonitor> {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const response = await authRequest(
      '/functions/v1/sekoly-sync-monitor',
      {
        method: 'POST',
        body: JSON.stringify({ schoolId }),
      }
    );

    return parseResponse<SyncMonitor>(response);
  }

  static async sendTeacherActivation(db: DatabaseSchema, teacherId: string) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');

    const teacher = db.teachers.find((item) => item.id === teacherId);
    if (!teacher) throw new Error('Enseignant introuvable.');

    const response = await authRequest(
      '/functions/v1/sekoly-send-teacher-activation',
      {
        method: 'POST',
        body: JSON.stringify({
          schoolId,
          teacherId: cloudEntityUuid('teacher', teacher.id),
        }),
      }
    );

    return parseResponse<{ sent: boolean }>(response);
  }

  static resetPullCursor(db: DatabaseSchema) {
    const schoolId = this.getSchoolId();
    if (!schoolId) throw new Error('Établissement Cloud non lié.');
    const cloudYearId = cloudEntityUuid('year', db.currentSchoolYearId);
    localStorage.removeItem(
      `${PULL_CURSOR_PREFIX}:${schoolId}:${cloudYearId}`
    );
  }

  static async pullTeacherChanges(db: DatabaseSchema): Promise<PullResult> {
    const schoolId = this.getSchoolId();
    if (!schoolId || !this.isConnected()) {
      return { db, attendanceAdded: 0, gradesChanged: 0, gradeConflicts: 0 };
    }

    const yearId = db.currentSchoolYearId;
    const cloudYearId = cloudEntityUuid('year', yearId);

    const cursorKey = `${PULL_CURSOR_PREFIX}:${schoolId}:${cloudYearId}`;
    const previousCursor = localStorage.getItem(cursorKey);
    const nextCursor = new Date(Date.now() - 5000).toISOString();

    let sessions: any[] = [];
    let entries: any[] = [];
    let assessments: any[] = [];
    let scores: any[] = [];

    if (!previousCursor) {
      [sessions, entries, assessments, scores] = await Promise.all([
        restSelectPaged<any>(
          'sekoly_attendance_sessions',
          `select=*&school_id=eq.${schoolId}&school_year_id=eq.${cloudYearId}`
        ),
        restSelectPaged<any>(
          'sekoly_attendance_entries',
          `select=*&school_id=eq.${schoolId}`
        ),
        restSelectPaged<any>(
          'sekoly_assessments',
          `select=*&school_id=eq.${schoolId}&school_year_id=eq.${cloudYearId}`
        ),
        restSelectPaged<any>(
          'sekoly_assessment_scores',
          `select=*&school_id=eq.${schoolId}`
        ),
      ]);
    } else {
      const cursor = encodeURIComponent(previousCursor);
      [entries, scores] = await Promise.all([
        restSelectPaged<any>(
          'sekoly_attendance_entries',
          `select=*&school_id=eq.${schoolId}&recorded_at=gte.${cursor}`
        ),
        restSelectPaged<any>(
          'sekoly_assessment_scores',
          `select=*&school_id=eq.${schoolId}&updated_at=gte.${cursor}`
        ),
      ]);

      const sessionIds = Array.from(
        new Set(entries.map((item) => String(item.session_id)).filter(Boolean))
      );
      const assessmentIds = Array.from(
        new Set(scores.map((item) => String(item.assessment_id)).filter(Boolean))
      );

      [sessions, assessments] = await Promise.all([
        sessionIds.length > 0
          ? restSelectPaged<any>(
              'sekoly_attendance_sessions',
              `select=*&school_id=eq.${schoolId}&id=in.(${sessionIds.join(',')})`
            )
          : Promise.resolve([]),
        assessmentIds.length > 0
          ? restSelectPaged<any>(
              'sekoly_assessments',
              `select=*&school_id=eq.${schoolId}&school_year_id=eq.${cloudYearId}&id=in.(${assessmentIds.join(',')})`
            )
          : Promise.resolve([]),
      ]);
    }

    const studentByCloudId = new Map(
      db.students
        .filter((student) => student.schoolYearId === yearId)
        .map((student) => [
          cloudEntityUuid('student', student.matricule.toUpperCase()),
          student,
        ])
    );
    const classByCloudId = new Map(
      db.classes.map((schoolClass) => [
        cloudEntityUuid('class', `${yearId}:${schoolClass.id}`),
        schoolClass,
      ])
    );
    const subjectByCloudId = new Map(
      db.subjects.map((subject) => [
        cloudEntityUuid('subject', subject.id),
        subject,
      ])
    );
    const termByCloudId = new Map(
      (
        db.schoolYears.find((year) => year.id === yearId)?.terms || []
      ).map((term) => [cloudEntityUuid('term', term.id), term])
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
      evaluations: Array<{ assessmentId: string; date: string; score: number }>;
      exam?: { assessmentId: string; date: string; score: number };
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
        const candidateExam = {
          assessmentId: assessment.id,
          date: assessment.assessment_date,
          score: Number(score.score),
        };
        if (!bucket.exam || candidateExam.date >= bucket.exam.date) {
          bucket.exam = candidateExam;
        }
      } else {
        bucket.evaluations.push({
          assessmentId: assessment.id,
          date: assessment.assessment_date,
          score: Number(score.score),
        });
      }

      if (score.comment) bucket.comments.push(score.comment);
      buckets.set(key, bucket);
    });

    const nextGrades = [...db.grades];
    let gradesChanged = 0;
    let gradeConflicts = 0;

    for (const bucket of buckets.values()) {
      const existingIndex = nextGrades.findIndex(
        (grade) =>
          grade.studentId === bucket.studentId &&
          grade.subjectId === bucket.subjectId &&
          grade.termCode === bucket.termCode &&
          grade.schoolYearId === yearId
      );

      const existing = existingIndex >= 0 ? nextGrades[existingIndex] : undefined;
      const evaluations = [...(existing?.evaluations ?? [])];
      const cloudEvaluationIds = [
        ...(existing?.cloudEvaluationIds ??
          Array.from({ length: evaluations.length }, () => null)),
      ];

      while (cloudEvaluationIds.length < evaluations.length) {
        cloudEvaluationIds.push(null);
      }

      for (const item of bucket.evaluations.sort((a, b) =>
        a.date.localeCompare(b.date)
      )) {
        const cloudIndex = cloudEvaluationIds.indexOf(item.assessmentId);
        if (cloudIndex >= 0) {
          evaluations[cloudIndex] = item.score;
        } else {
          evaluations.push(item.score);
          cloudEvaluationIds.push(item.assessmentId);
        }
      }

      let examGrade = existing?.examGrade;
      let cloudExamAssessmentId = existing?.cloudExamAssessmentId;
      const ignoredExamIds = [...(existing?.cloudIgnoredExamAssessmentIds ?? [])];
      let cloudSyncConflict = existing?.cloudSyncConflict;

      if (bucket.exam) {
        if (cloudExamAssessmentId === bucket.exam.assessmentId) {
          examGrade = bucket.exam.score;
          cloudSyncConflict = undefined;
        } else if (examGrade === undefined) {
          examGrade = bucket.exam.score;
          cloudExamAssessmentId = bucket.exam.assessmentId;
          cloudSyncConflict = undefined;
        } else if (!ignoredExamIds.includes(bucket.exam.assessmentId)) {
          ignoredExamIds.push(bucket.exam.assessmentId);
          gradeConflicts += 1;
          cloudSyncConflict =
            "Un examen saisi sur mobile n'a pas remplacé l'examen local déjà présent.";
        }
      }

      const next: GradeEntry = {
        id:
          existing?.id ??
          `cloud-grade-${cloudEntityUuid(
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
        teacherComment: bucket.comments.at(-1) || existing?.teacherComment,
        updatedAt: new Date().toISOString().slice(0, 10),
        cloudEvaluationIds,
        cloudExamAssessmentId,
        cloudIgnoredExamAssessmentIds:
          ignoredExamIds.length > 0 ? ignoredExamIds : undefined,
        cloudSyncConflict,
      };

      if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) {
        gradesChanged += 1;
      }

      if (existingIndex >= 0) nextGrades[existingIndex] = next;
      else nextGrades.push(next);
    }

    if (attendanceAdded === 0 && gradesChanged === 0 && gradeConflicts === 0) {
      localStorage.setItem(cursorKey, nextCursor);
      return { db, attendanceAdded, gradesChanged, gradeConflicts };
    }

    localStorage.setItem(cursorKey, nextCursor);
    return {
      db: {
        ...db,
        attendanceRecords: Array.from(existingAttendance.values()),
        grades: nextGrades,
      },
      attendanceAdded,
      gradesChanged,
      gradeConflicts,
    };
  }
}
