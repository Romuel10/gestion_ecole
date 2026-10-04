import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { offlineStore, QueuedMutation } from '../lib/offlineStore';

const isNetworkError = (error: unknown) => {
  const item = error as { name?: string; message?: string };
  return item?.name === 'AuthRetryableFetchError' || /failed to fetch|network request failed|networkerror|offline|ECONN/i.test(item?.message ?? '');
};
let onlineMembershipValidated = false;

export type Membership = {
  school_id: string;
  role: string;
  status: string;
  sekoly_schools?: {
    id: string;
    name: string;
    acronym: string | null;
  } | null;
};

export type TeacherContext = {
  userId: string;
  schoolId: string;
  schoolName: string;
  teacherId: string;
  teacherName: string;
  schoolYearId: string;
  schoolYearLabel: string;
};

export type Assignment = {
  id: string;
  class_id: string;
  subject_id: string;
  weekly_hours: number;
  sekoly_classes?: { id: string; name: string; code: string } | null;
  sekoly_subjects?: { id: string; name: string; code: string } | null;
};

export type StudentRow = {
  id: string;
  matricule: string;
  last_name: string;
  first_name: string;
};

export type AttendanceValue =
  | 'PRESENT'
  | 'ABSENT_JUSTIFIED'
  | 'ABSENT_UNJUSTIFIED'
  | 'LATE';

export type Assessment = {
  id: string;
  title: string;
  assessment_date: string;
  coefficient: number;
  max_score: number;
  class_id: string;
  subject_id: string;
  term_id: string;
};

type SyncEventType =
  | 'APP_OPEN'
  | 'SYNC_START'
  | 'SYNC_SUCCESS'
  | 'SYNC_ERROR'
  | 'ATTENDANCE_SAVED'
  | 'SCORES_SAVED'
  | 'QUEUE_UPDATED';

type SyncEventStatus = 'OK' | 'WARNING' | 'ERROR';

const syncPlatform = (): 'ANDROID' | 'IOS' | 'WEB' =>
  Platform.OS === 'android' ? 'ANDROID' : Platform.OS === 'ios' ? 'IOS' : 'WEB';

async function recordSyncEvent(
  context: TeacherContext,
  eventType: SyncEventType,
  status: SyncEventStatus = 'OK',
  metadata: Record<string, unknown> = {},
  errorMessage?: string | null
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('sekoly_sync_events').insert({
      school_id: context.schoolId,
      user_id: user.id,
      teacher_id: context.teacherId,
      device_id: offlineStore.deviceId(),
      platform: syncPlatform(),
      event_type: eventType,
      status,
      queue_count: offlineStore.queueCount(),
      error_message: errorMessage?.slice(0, 1000) || null,
      metadata,
      occurred_at: new Date().toISOString(),
    });

    if (error) console.warn('Sekoly sync event:', error.message);
  } catch (error) {
    console.warn('Sekoly sync event:', error);
  }
}

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const normalized = char === 'x' ? value : (value & 0x3) | 0x8;
    return normalized.toString(16);
  });

const stableUuid = (input: string) => {
  const seeds = [2166136261, 2246822519, 3266489917, 668265263];
  const hex = seeds
    .map((seed) => {
      let hash = seed >>> 0;
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    })
    .join('')
    .split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16] || '0', 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(
    12,
    16
  )}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
};

async function executeMutation(
  tableName: string,
  operation: QueuedMutation['operation'],
  payload: any,
  conflictTarget?: string
) {
  const table = supabase.from(tableName);

  if (operation === 'upsert') {
    const { error } = await table.upsert(payload, {
      onConflict: conflictTarget,
    });
    if (error) throw error;
    return;
  }

  if (operation === 'insert') {
    const { error } = await table.insert(payload);
    if (error) throw error;
    return;
  }

  throw new Error(`Opération hors-ligne non supportée: ${operation}`);
}

export const teacherApi = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw error;
    offlineStore.setOwner(data.session?.user.id ?? null);
    return data.session;
  },

  async requiresPasswordChange() {
    const session = await this.getSession();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      if (isNetworkError(error) && session) return Boolean(session.user.user_metadata?.password_change_required);
      throw error;
    }
    return Boolean(user?.user_metadata?.password_change_required);
  },

  async changeInitialPassword(password: string) {
    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        password_change_required: false,
      },
    });
    if (error) throw error;
  },

  async signOut() {
    offlineStore.setOwner(null);
    onlineMembershipValidated = false;
    await supabase.auth.signOut();
  },

  async recordDeviceEvent(
    context: TeacherContext,
    eventType: SyncEventType = 'APP_OPEN',
    status: SyncEventStatus = 'OK',
    metadata: Record<string, unknown> = {}
  ) {
    await recordSyncEvent(context, eventType, status, metadata);
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    offlineStore.setOwner(data.session?.user.id ?? null);
    return data.session;
  },

  async loadContext(): Promise<TeacherContext> {
    const session = await this.getSession();
    const userId = session?.user.id;
    if (!userId || (session.expires_at && session.expires_at * 1000 <= Date.now())) {
      offlineStore.setOwner(null);
      throw new Error('Connectez-vous à nouveau pour ouvrir les données hors ligne.');
    }
    onlineMembershipValidated = false;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user || user.id !== userId) throw new Error('Utilisateur non connecté.');

      const { data: memberships, error: memberError } = await supabase
        .from('sekoly_memberships')
        .select('school_id,role,status,sekoly_schools(id,name,acronym)')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE');
      if (memberError) throw memberError;

      const teacherMembership = (memberships ?? []).find(
        (item: any) => item.role === 'TEACHER'
      ) as Membership | undefined;
      if (!teacherMembership) {
        throw new Error("Ce compte n'est rattaché à aucun établissement comme enseignant.");
      }

      const schoolId = teacherMembership.school_id;
      const [
        { data: teacher, error: teacherError },
        { data: year, error: yearError },
      ] = await Promise.all([
        supabase
          .from('sekoly_teachers')
          .select('id,first_name,last_name')
          .eq('school_id', schoolId)
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE')
          .single(),
        supabase
          .from('sekoly_school_years')
          .select('id,label')
          .eq('school_id', schoolId)
          .eq('status', 'ACTIVE')
          .single(),
      ]);

      if (teacherError) throw teacherError;
      if (yearError) throw yearError;

      const schoolRelation = teacherMembership.sekoly_schools as any;
      const context: TeacherContext = {
        userId,
        schoolId,
        schoolName: schoolRelation?.name ?? 'Établissement',
        teacherId: teacher.id,
        teacherName: `${teacher.last_name} ${teacher.first_name}`,
        schoolYearId: year.id,
        schoolYearLabel: year.label,
      };
      if (!offlineStore.isOwner(userId)) throw new Error('Le compte a changé pendant le chargement.');
      offlineStore.setOwner(userId, schoolId);
      offlineStore.setCache('teacher-context', context, userId);
      onlineMembershipValidated = true;
      return context;
    } catch (error) {
      const cached = offlineStore.getCache<TeacherContext>('teacher-context', userId);
      if (isNetworkError(error) && cached?.userId === userId) {
        offlineStore.setOwner(userId, cached.schoolId);
        return cached;
      }
      offlineStore.revokeAccess(userId);
      throw error;
    }
  },

  async loadAssignments(context: TeacherContext): Promise<Assignment[]> {
    const ownerAtStart = offlineStore.currentOwner();
    try {
      const { data, error } = await supabase
        .from('sekoly_teacher_assignments')
        .select(
          'id,class_id,subject_id,weekly_hours,sekoly_classes!sekoly_assignments_same_school_year_class_fk(id,name,code),sekoly_subjects!sekoly_assignments_same_school_subject_fk(id,name,code)'
        )
        .eq('school_id', context.schoolId)
        .eq('school_year_id', context.schoolYearId)
        .eq('teacher_id', context.teacherId)
        .eq('active', true)
        .order('class_id');
      if (error) throw error;
      const rows = (data ?? []) as unknown as Assignment[];
      offlineStore.setCache(`assignments:${context.teacherId}`, rows, ownerAtStart);
      return rows;
    } catch (error) {
      const cached = offlineStore.getCache<Assignment[]>(`assignments:${context.teacherId}`, ownerAtStart);
      if (isNetworkError(error) && cached) return cached;
      throw error;
    }
  },

  async loadTimetable(context: TeacherContext) {
    const ownerAtStart = offlineStore.currentOwner();
    try {
      const { data, error } = await supabase
        .from('sekoly_timetable_slots')
        .select(
          'id,day_of_week,start_time,end_time,room,class_id,subject_id,sekoly_classes!sekoly_timetable_same_school_year_class_fk(name),sekoly_subjects!sekoly_timetable_same_school_subject_fk(name)'
        )
        .eq('school_id', context.schoolId)
        .eq('school_year_id', context.schoolYearId)
        .eq('teacher_id', context.teacherId)
        .order('day_of_week')
        .order('start_time');
      if (error) throw error;
      offlineStore.setCache(`timetable:${context.teacherId}`, data ?? [], ownerAtStart);
      return data ?? [];
    } catch (error) {
      const cached = offlineStore.getCache<any[]>(`timetable:${context.teacherId}`, ownerAtStart);
      if (isNetworkError(error) && cached) return cached;
      throw error;
    }
  },

  async loadStudents(
    context: TeacherContext,
    classId: string
  ): Promise<StudentRow[]> {
    const ownerAtStart = offlineStore.currentOwner();
    try {
      const { data, error } = await supabase
        .from('sekoly_enrollments')
        .select('sekoly_students!sekoly_enrollments_same_school_student_fk(id,matricule,last_name,first_name)')
        .eq('school_id', context.schoolId)
        .eq('school_year_id', context.schoolYearId)
        .eq('class_id', classId)
        .in('status', ['ENROLLED', 'PENDING']);
      if (error) throw error;

      const students = (data ?? [])
        .map((row: any) => row.sekoly_students)
        .filter(Boolean)
        .sort((a: StudentRow, b: StudentRow) =>
          `${a.last_name} ${a.first_name}`.localeCompare(
            `${b.last_name} ${b.first_name}`
          )
        );

      offlineStore.setCache(`students:${context.schoolYearId}:${classId}`, students, ownerAtStart);
      return students;
    } catch (error) {
      const cached = offlineStore.getCache<StudentRow[]>(`students:${context.schoolYearId}:${classId}`, ownerAtStart);
      if (isNetworkError(error) && cached) return cached;
      throw error;
    }
  },

  async saveAttendance(args: {
    context: TeacherContext;
    assignment: Assignment;
    sessionDate: string;
    startTime?: string;
    endTime?: string;
    entries: Array<{
      studentId: string;
      status: AttendanceValue;
      minutesLate?: number;
      reason?: string;
    }>;
  }) {
    const ownerAtStart = offlineStore.currentOwner();
    const sessionId = stableUuid(
      `attendance:${args.context.schoolId}:${args.context.schoolYearId}:${args.assignment.class_id}:${args.assignment.subject_id}:${args.sessionDate}:${args.startTime ?? 'daily'}`
    );
    const session = {
      id: sessionId,
      school_id: args.context.schoolId,
      school_year_id: args.context.schoolYearId,
      class_id: args.assignment.class_id,
      subject_id: args.assignment.subject_id,
      teacher_id: args.context.teacherId,
      session_date: args.sessionDate,
      start_time: args.startTime ?? null,
      end_time: args.endTime ?? null,
      status: 'SUBMITTED',
      submitted_at: new Date().toISOString(),
    };

    const entries = args.entries.map((entry) => ({
      id: uuid(),
      school_id: args.context.schoolId,
      session_id: sessionId,
      student_id: entry.studentId,
      status: entry.status,
      minutes_late:
        entry.status === 'LATE' ? Math.max(1, entry.minutesLate ?? 5) : null,
      reason: entry.reason?.trim() || null,
      recorded_at: new Date().toISOString(),
    }));

    try {
      await executeMutation(
        'sekoly_attendance_sessions',
        'upsert',
        session,
        'id'
      );
      await executeMutation(
        'sekoly_attendance_entries',
        'upsert',
        entries,
        'session_id,student_id'
      );
      void recordSyncEvent(args.context, 'ATTENDANCE_SAVED', 'OK', {
        classId: args.assignment.class_id,
        subjectId: args.assignment.subject_id,
        sessionDate: args.sessionDate,
        entries: entries.length,
      });
      return { queued: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      offlineStore.enqueue('sekoly_attendance_sessions', 'upsert', session, 'id', ownerAtStart);
      offlineStore.enqueue('sekoly_attendance_entries', 'upsert', entries, 'session_id,student_id', ownerAtStart);
      void recordSyncEvent(
        args.context,
        'QUEUE_UPDATED',
        'WARNING',
        {
          source: 'attendance',
          classId: args.assignment.class_id,
          subjectId: args.assignment.subject_id,
          queuedMutations: offlineStore.queueCount(),
        },
        error instanceof Error ? error.message : String(error)
      );
      return { queued: true };
    }
  },

  async loadTerms(context: TeacherContext) {
    const ownerAtStart = offlineStore.currentOwner();
    try {
      const { data, error } = await supabase
        .from('sekoly_terms')
        .select('id,code,label,is_locked,start_date,end_date')
        .eq('school_id', context.schoolId)
        .eq('school_year_id', context.schoolYearId)
        .order('start_date');
      if (error) throw error;
      offlineStore.setCache(`terms:${context.schoolYearId}`, data ?? [], ownerAtStart);
      return data ?? [];
    } catch (error) {
      const cached = offlineStore.getCache<any[]>(`terms:${context.schoolYearId}`, ownerAtStart);
      if (isNetworkError(error) && cached) return cached;
      throw error;
    }
  },

  async loadAssessments(
    context: TeacherContext,
    assignment: Assignment
  ): Promise<Assessment[]> {
    const ownerAtStart = offlineStore.currentOwner();
    try {
      const { data, error } = await supabase
        .from('sekoly_assessments')
        .select('*')
        .eq('school_id', context.schoolId)
        .eq('school_year_id', context.schoolYearId)
        .eq('teacher_id', context.teacherId)
        .eq('class_id', assignment.class_id)
        .eq('subject_id', assignment.subject_id)
        .order('assessment_date', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Assessment[];
      offlineStore.setCache(`assessments:${assignment.class_id}:${assignment.subject_id}`, rows, ownerAtStart);
      return rows;
    } catch (error) {
      const cached = offlineStore.getCache<Assessment[]>(`assessments:${assignment.class_id}:${assignment.subject_id}`, ownerAtStart);
      if (isNetworkError(error) && cached) return cached;
      throw error;
    }
  },

  async createAssessment(args: {
    context: TeacherContext;
    assignment: Assignment;
    termId: string;
    title: string;
    type?: string;
    date: string;
    coefficient: number;
    maxScore: number;
  }): Promise<Assessment> {
    const ownerAtStart = offlineStore.currentOwner();
    const assessment: Assessment & Record<string, any> = {
      id: uuid(),
      school_id: args.context.schoolId,
      school_year_id: args.context.schoolYearId,
      term_id: args.termId,
      class_id: args.assignment.class_id,
      subject_id: args.assignment.subject_id,
      teacher_id: args.context.teacherId,
      title: args.title.trim(),
      assessment_type: args.type ?? 'CONTINUOUS',
      assessment_date: args.date,
      coefficient: args.coefficient,
      max_score: args.maxScore,
      is_locked: false,
      created_at: new Date().toISOString(),
    };

    try {
      await executeMutation('sekoly_assessments', 'upsert', assessment, 'id');
      return assessment;
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      offlineStore.enqueue('sekoly_assessments', 'upsert', assessment, 'id', ownerAtStart);
      return assessment;
    }
  },

  async loadScores(assessmentId: string) {
    const ownerAtStart = offlineStore.currentOwner();
    try {
      const { data, error } = await supabase
        .from('sekoly_assessment_scores')
        .select('student_id,score,status,comment')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      offlineStore.setCache(`scores:${assessmentId}`, data ?? [], ownerAtStart);
      return data ?? [];
    } catch (error) {
      const cached = offlineStore.getCache<any[]>(`scores:${assessmentId}`, ownerAtStart);
      if (isNetworkError(error) && cached) return cached;
      throw error;
    }
  },

  async saveScores(
    context: TeacherContext,
    assessmentId: string,
    scores: Array<{
      studentId: string;
      score: number | null;
      status?: string;
      comment?: string;
    }>
  ) {
    const ownerAtStart = offlineStore.currentOwner();
    const rows = scores.map((item) => ({
      id: uuid(),
      school_id: context.schoolId,
      assessment_id: assessmentId,
      student_id: item.studentId,
      score: item.score,
      status: item.status ?? (item.score === null ? 'NOT_GRADED' : 'GRADED'),
      comment: item.comment?.trim() || null,
      updated_at: new Date().toISOString(),
    }));

    try {
      await executeMutation(
        'sekoly_assessment_scores',
        'upsert',
        rows,
        'assessment_id,student_id'
      );
      void recordSyncEvent(context, 'SCORES_SAVED', 'OK', {
        assessmentId,
        scores: rows.length,
        graded: rows.filter((row) => row.score !== null).length,
      });
      return { queued: false };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      offlineStore.enqueue('sekoly_assessment_scores', 'upsert', rows, 'assessment_id,student_id', ownerAtStart);
      void recordSyncEvent(
        context,
        'QUEUE_UPDATED',
        'WARNING',
        {
          source: 'scores',
          assessmentId,
          queuedMutations: offlineStore.queueCount(),
        },
        error instanceof Error ? error.message : String(error)
      );
      return { queued: true };
    }
  },

  async flushQueue(retryFailed = false) {
    const context = await this.loadContext();
    if (!onlineMembershipValidated) return { synced: 0, remaining: offlineStore.queueCount(), failed: 0, blocked: 0, lastError: 'Connexion requise pour vérifier vos droits.' };
    if (retryFailed) offlineStore.retryFailures();
    const queue = offlineStore.listQueue();
    let synced = 0;
    let lastError: string | null = null;

    if (context) {
      void recordSyncEvent(context, 'SYNC_START', 'OK', {
        queuedMutations: queue.length,
      });
    }

    for (const mutation of queue) {
      if (!offlineStore.isOwner(context.userId, context.schoolId)) throw new Error('Compte modifié : synchronisation interrompue.');
      if (mutation.attempts >= 5) {
        lastError = mutation.last_error || 'Operation retry limit reached.';
        continue;
      }

      try {
        await executeMutation(
          mutation.table_name,
          mutation.operation,
          JSON.parse(mutation.payload),
          mutation.conflict_target ?? undefined
        );
        offlineStore.remove(mutation.id);
        synced += 1;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        offlineStore.markFailed(mutation.id, lastError);
        continue;
      }
    }

    const health = offlineStore.queueHealth();

    if (context) {
      void recordSyncEvent(
        context,
        lastError ? 'SYNC_ERROR' : 'SYNC_SUCCESS',
        lastError ? 'ERROR' : health.total > 0 ? 'WARNING' : 'OK',
        {
          synced,
          remaining: health.total,
          failed: health.failed,
          blocked: health.blocked,
        },
        lastError || health.lastError
      );
    }

    return {
      synced,
      remaining: health.total,
      failed: health.failed,
      blocked: health.blocked,
      lastError: lastError || health.lastError,
    };
  },

  queueCount() {
    return offlineStore.queueCount();
  },

  async subscribeSchool(schoolId: string, onChange: () => void) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      await supabase.realtime.setAuth(session.access_token);
    } else {
      await supabase.realtime.setAuth();
    }

    const channel = supabase
      .channel(`school:${schoolId}:sync`, {
        config: { private: true },
      })
      .on('broadcast', { event: '*' }, () => onChange())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
