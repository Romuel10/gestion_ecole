import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { supabase } from './src/lib/supabase';
import {
  Assignment,
  Assessment,
  AttendanceValue,
  StudentRow,
  TeacherContext,
  teacherApi,
} from './src/services/teacherApi';

type Tab = 'HOME' | 'ATTENDANCE' | 'GRADES';

type AttendanceDraft = {
  status: AttendanceValue;
  minutesLate?: number;
  reason?: string;
};

const COLORS = {
  navy: '#173f49',
  green: '#2f7a54',
  red: '#b94141',
  ink: '#17212b',
  muted: '#65717f',
  border: '#d9dee4',
  soft: '#f5f7f8',
  white: '#ffffff',
  amber: '#a86f14',
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const assignmentLabel = (assignment?: Assignment | null) => {
  if (!assignment) return 'Classe / matière';
  const className = assignment.sekoly_classes?.name ?? 'Classe';
  const subjectName = assignment.sekoly_subjects?.name ?? 'Matière';
  return `${className} · ${subjectName}`;
};

function PrimaryButton({
  label,
  onPress,
  disabled,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
}) {
  const background =
    kind === 'primary'
      ? COLORS.navy
      : kind === 'danger'
      ? COLORS.red
      : COLORS.white;
  const color = kind === 'secondary' ? COLORS.ink : COLORS.white;

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: kind === 'secondary' ? COLORS.border : background,
          opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
        },
      ]}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.segmentRow}
    >
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => onChange(option.key)}
          style={[
            styles.segment,
            value === option.key && styles.segmentActive,
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              value === option.key && styles.segmentTextActive,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function LoginScreen({
  onLoggedIn,
}: {
  onLoggedIn: () => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Connexion', 'Saisissez votre email et votre mot de passe.');
      return;
    }

    setBusy(true);
    try {
      await teacherApi.signIn(email, password);
      await onLoggedIn();
    } catch (error) {
      Alert.alert(
        'Connexion impossible',
        error instanceof Error ? error.message : 'Vérifiez vos identifiants.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.full}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={styles.loginPage}>
        <View style={styles.brandSeal}>
          <Text style={styles.brandSealText}>S</Text>
        </View>
        <Text style={styles.brandTitle}>SEKOLY ENSEIGNANT</Text>
        <Text style={styles.brandSubtitle}>
          Présences, évaluations et suivi de vos classes
        </Text>

        <View style={styles.loginCard}>
          <Text style={styles.label}>Adresse email</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="enseignant@ecole.mg"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Mot de passe</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            style={styles.input}
          />

          <View style={{ marginTop: 18 }}>
            <PrimaryButton
              label={busy ? 'Connexion…' : 'Se connecter'}
              onPress={submit}
              disabled={busy}
            />
          </View>

          <Text style={styles.helper}>
            Votre compte est créé ou invité par la direction de votre établissement.
          </Text>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Header({
  context,
  queueCount,
  syncing,
  onSync,
  onLogout,
}: {
  context: TeacherContext;
  queueCount: number;
  syncing: boolean;
  onSync: () => void;
  onLogout: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerProduct}>SEKOLY</Text>
        <Text style={styles.headerSchool}>{context.schoolName}</Text>
        <Text style={styles.headerTeacher}>
          {context.teacherName} · {context.schoolYearLabel}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable onPress={onSync} style={styles.syncChip}>
          <Text style={styles.syncChipText}>
            {syncing
              ? 'Synchronisation…'
              : queueCount > 0
              ? `${queueCount} en attente`
              : 'Synchronisé'}
          </Text>
        </Pressable>
        <Pressable onPress={onLogout}>
          <Text style={styles.logoutText}>Quitter</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HomeScreen({
  context,
  assignments,
  timetable,
  refreshing,
  onRefresh,
  onOpenAttendance,
  onOpenGrades,
}: {
  context: TeacherContext;
  assignments: Assignment[];
  timetable: any[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenAttendance: (assignment: Assignment) => void;
  onOpenGrades: (assignment: Assignment) => void;
}) {
  const jsDay = new Date().getDay();
  const dbDay = jsDay === 0 ? 7 : jsDay;
  const todaySlots = timetable.filter((slot) => slot.day_of_week === dbDay);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>AUJOURD’HUI</Text>
        <Text style={styles.heroTitle}>
          {new Intl.DateTimeFormat('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }).format(new Date())}
        </Text>
        <Text style={styles.heroSubtitle}>
          {todaySlots.length} cours prévu(s) · {assignments.length} affectation(s)
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Cours du jour</Text>
      {todaySlots.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Aucun cours prévu aujourd’hui</Text>
          <Text style={styles.emptyText}>
            L’emploi du temps publié par l’établissement apparaîtra ici.
          </Text>
        </View>
      ) : (
        todaySlots.map((slot) => {
          const assignment = assignments.find(
            (item) =>
              item.class_id === slot.class_id &&
              item.subject_id === slot.subject_id
          );
          const className =
            slot.sekoly_classes?.name ??
            assignment?.sekoly_classes?.name ??
            'Classe';
          const subjectName =
            slot.sekoly_subjects?.name ??
            assignment?.sekoly_subjects?.name ??
            'Matière';

          return (
            <View key={slot.id} style={styles.courseCard}>
              <View style={styles.courseTime}>
                <Text style={styles.courseTimeText}>{slot.start_time?.slice(0, 5)}</Text>
                <Text style={styles.courseTimeEnd}>{slot.end_time?.slice(0, 5)}</Text>
              </View>
              <View style={styles.courseBody}>
                <Text style={styles.courseSubject}>{subjectName}</Text>
                <Text style={styles.courseMeta}>
                  {className}
                  {slot.room ? ` · ${slot.room}` : ''}
                </Text>
                {assignment && (
                  <View style={styles.courseButtons}>
                    <PrimaryButton
                      label="Faire l’appel"
                      onPress={() => onOpenAttendance(assignment)}
                    />
                    <PrimaryButton
                      kind="secondary"
                      label="Notes"
                      onPress={() => onOpenGrades(assignment)}
                    />
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      <Text style={styles.sectionTitle}>Mes classes et matières</Text>
      {assignments.map((assignment) => (
        <View key={assignment.id} style={styles.assignmentRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.assignmentTitle}>
              {assignment.sekoly_classes?.name ?? 'Classe'}
            </Text>
            <Text style={styles.assignmentMeta}>
              {assignment.sekoly_subjects?.name ?? 'Matière'} ·{' '}
              {assignment.weekly_hours} h/semaine
            </Text>
          </View>
          <View style={styles.assignmentButtons}>
            <Pressable
              style={styles.smallLink}
              onPress={() => onOpenAttendance(assignment)}
            >
              <Text style={styles.smallLinkText}>Appel</Text>
            </Pressable>
            <Pressable
              style={styles.smallLink}
              onPress={() => onOpenGrades(assignment)}
            >
              <Text style={styles.smallLinkText}>Notes</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function AttendanceScreen({
  context,
  assignments,
  initialAssignment,
  onDone,
  onQueued,
}: {
  context: TeacherContext;
  assignments: Assignment[];
  initialAssignment: Assignment | null;
  onDone: () => void;
  onQueued: () => void;
}) {
  const [assignmentId, setAssignmentId] = useState(
    initialAssignment?.id ?? assignments[0]?.id ?? ''
  );
  const assignment =
    assignments.find((item) => item.id === assignmentId) ?? null;
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AttendanceDraft>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadStudents = useCallback(async () => {
    if (!assignment) return;
    setLoading(true);
    try {
      const rows = await teacherApi.loadStudents(context, assignment.class_id);
      setStudents(rows);
      const next: Record<string, AttendanceDraft> = {};
      rows.forEach((student) => {
        next[student.id] = { status: 'PRESENT' };
      });
      setDrafts(next);
    } catch (error) {
      Alert.alert(
        'Élèves indisponibles',
        error instanceof Error ? error.message : 'Impossible de charger la classe.'
      );
    } finally {
      setLoading(false);
    }
  }, [assignment, context]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const updateDraft = (
    studentId: string,
    patch: Partial<AttendanceDraft>
  ) => {
    setDrafts((current) => ({
      ...current,
      [studentId]: {
        ...(current[studentId] ?? { status: 'PRESENT' as const }),
        ...patch,
      },
    }));
  };

  const save = async () => {
    if (!assignment) return;
    setSaving(true);
    try {
      const result = await teacherApi.saveAttendance({
        context,
        assignment,
        sessionDate: todayIso(),
        entries: students.map((student) => ({
          studentId: student.id,
          status: drafts[student.id]?.status ?? 'PRESENT',
          minutesLate: drafts[student.id]?.minutesLate,
          reason: drafts[student.id]?.reason,
        })),
      });

      if (result.queued) {
        Alert.alert(
          'Enregistré hors ligne',
          'L’appel est conservé sur ce téléphone et sera envoyé dès la prochaine synchronisation.'
        );
        onQueued();
      } else {
        Alert.alert('Appel enregistré', 'Les présences sont disponibles dans Sekoly Admin.');
      }
      onDone();
    } catch (error) {
      Alert.alert(
        'Enregistrement impossible',
        error instanceof Error ? error.message : 'Erreur inconnue.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.subHeader}>
        <Pressable onPress={onDone}>
          <Text style={styles.backText}>‹ Retour</Text>
        </Pressable>
        <Text style={styles.subHeaderTitle}>Cahier de présences</Text>
      </View>

      <ScrollView contentContainerStyle={styles.screenContent}>
        <Text style={styles.label}>Classe / matière</Text>
        <Segmented
          options={assignments.map((item) => ({
            key: item.id,
            label: assignmentLabel(item),
          }))}
          value={assignmentId}
          onChange={setAssignmentId}
        />

        <View style={styles.summaryStrip}>
          <Text style={styles.summaryValue}>{students.length}</Text>
          <Text style={styles.summaryLabel}>élèves · {todayIso()}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.navy} style={{ marginTop: 30 }} />
        ) : (
          students.map((student) => {
            const draft = drafts[student.id] ?? { status: 'PRESENT' as const };
            return (
              <View key={student.id} style={styles.studentCard}>
                <View style={styles.studentTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentName}>
                      {student.last_name} {student.first_name}
                    </Text>
                    <Text style={styles.studentMatricule}>{student.matricule}</Text>
                  </View>
                </View>

                <Segmented
                  options={[
                    { key: 'PRESENT', label: 'Présent' },
                    { key: 'LATE', label: 'Retard' },
                    { key: 'ABSENT_JUSTIFIED', label: 'Abs. justifiée' },
                    { key: 'ABSENT_UNJUSTIFIED', label: 'Abs. injustifiée' },
                  ]}
                  value={draft.status}
                  onChange={(status) =>
                    updateDraft(student.id, {
                      status: status as AttendanceValue,
                      minutesLate:
                        status === 'LATE'
                          ? draft.minutesLate ?? 5
                          : undefined,
                    })
                  }
                />

                {draft.status === 'LATE' && (
                  <TextInput
                    keyboardType="number-pad"
                    value={String(draft.minutesLate ?? 5)}
                    onChangeText={(value) =>
                      updateDraft(student.id, {
                        minutesLate: Math.max(1, Number(value) || 5),
                      })
                    }
                    placeholder="Minutes de retard"
                    style={[styles.input, { marginTop: 8 }]}
                  />
                )}

                {draft.status !== 'PRESENT' && (
                  <TextInput
                    value={draft.reason ?? ''}
                    onChangeText={(value) =>
                      updateDraft(student.id, { reason: value })
                    }
                    placeholder="Motif / observation"
                    style={[styles.input, { marginTop: 8 }]}
                  />
                )}
              </View>
            );
          })
        )}

        <View style={{ marginTop: 16 }}>
          <PrimaryButton
            label={saving ? 'Enregistrement…' : 'Valider l’appel'}
            disabled={saving || !assignment || students.length === 0}
            onPress={save}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function GradesScreen({
  context,
  assignments,
  initialAssignment,
  onDone,
  onQueued,
}: {
  context: TeacherContext;
  assignments: Assignment[];
  initialAssignment: Assignment | null;
  onDone: () => void;
  onQueued: () => void;
}) {
  const [assignmentId, setAssignmentId] = useState(
    initialAssignment?.id ?? assignments[0]?.id ?? ''
  );
  const assignment =
    assignments.find((item) => item.id === assignmentId) ?? null;
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assessmentId, setAssessmentId] = useState('');
  const assessment =
    assessments.find((item) => item.id === assessmentId) ?? null;
  const [scores, setScores] = useState<Record<string, string>>({});
  const [newTitle, setNewTitle] = useState('Devoir');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!assignment) return;
    try {
      const [studentRows, termRows, assessmentRows] = await Promise.all([
        teacherApi.loadStudents(context, assignment.class_id),
        teacherApi.loadTerms(context),
        teacherApi.loadAssessments(context, assignment),
      ]);
      setStudents(studentRows);
      setTerms(termRows);
      setAssessments(assessmentRows);
      if (!assessmentId && assessmentRows[0]) {
        setAssessmentId(assessmentRows[0].id);
      }
    } catch (error) {
      Alert.alert(
        'Notes',
        error instanceof Error ? error.message : 'Impossible de charger les notes.'
      );
    }
  }, [assignment, assessmentId, context]);

  useEffect(() => {
    setAssessmentId('');
    setScores({});
    void refresh();
  }, [assignmentId]);

  useEffect(() => {
    if (!assessment) return;
    void teacherApi
      .loadScores(assessment.id)
      .then((rows: any[]) => {
        const next: Record<string, string> = {};
        rows.forEach((row) => {
          next[row.student_id] =
            row.score === null || row.score === undefined ? '' : String(row.score);
        });
        setScores(next);
      })
      .catch(() => {
        setScores({});
      });
  }, [assessmentId]);

  const createAssessment = async () => {
    if (!assignment || !newTitle.trim()) return;
    const term =
      terms.find((item) => !item.is_locked) ??
      terms[0];
    if (!term) {
      Alert.alert('Évaluation', 'Aucune période n’est configurée.');
      return;
    }
    if (term.is_locked) {
      Alert.alert('Évaluation', 'Toutes les périodes sont verrouillées.');
      return;
    }

    setCreating(true);
    try {
      const created = await teacherApi.createAssessment({
        context,
        assignment,
        termId: term.id,
        title: newTitle,
        date: todayIso(),
        coefficient: 1,
        maxScore: 20,
      });
      setAssessments((current) => [created, ...current]);
      setAssessmentId(created.id);
      setScores({});
      setNewTitle('Devoir');
      onQueued();
    } catch (error) {
      Alert.alert(
        'Évaluation',
        error instanceof Error ? error.message : 'Création impossible.'
      );
    } finally {
      setCreating(false);
    }
  };

  const save = async () => {
    if (!assessment) return;
    const invalid = students.find((student) => {
      const raw = scores[student.id]?.trim() ?? '';
      if (!raw) return false;
      const value = Number(raw.replace(',', '.'));
      return !Number.isFinite(value) || value < 0 || value > assessment.max_score;
    });

    if (invalid) {
      Alert.alert(
        'Note invalide',
        `${invalid.last_name} ${invalid.first_name} : la note doit être comprise entre 0 et ${assessment.max_score}.`
      );
      return;
    }

    setSaving(true);
    try {
      const result = await teacherApi.saveScores(
        context,
        assessment.id,
        students.map((student) => {
          const raw = scores[student.id]?.trim() ?? '';
          return {
            studentId: student.id,
            score: raw ? Number(raw.replace(',', '.')) : null,
          };
        })
      );

      if (result.queued) {
        Alert.alert(
          'Notes enregistrées hors ligne',
          'Elles seront envoyées au logiciel principal lors de la prochaine synchronisation.'
        );
        onQueued();
      } else {
        Alert.alert('Notes enregistrées', 'Sekoly Admin a reçu les mises à jour.');
      }
    } catch (error) {
      Alert.alert(
        'Notes',
        error instanceof Error ? error.message : 'Enregistrement impossible.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.subHeader}>
        <Pressable onPress={onDone}>
          <Text style={styles.backText}>‹ Retour</Text>
        </Pressable>
        <Text style={styles.subHeaderTitle}>Fiche de notes</Text>
      </View>

      <ScrollView contentContainerStyle={styles.screenContent}>
        <Text style={styles.label}>Classe / matière</Text>
        <Segmented
          options={assignments.map((item) => ({
            key: item.id,
            label: assignmentLabel(item),
          }))}
          value={assignmentId}
          onChange={setAssignmentId}
        />

        <View style={styles.createBox}>
          <Text style={styles.createTitle}>Nouvelle évaluation</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Ex. Devoir surveillé 1"
            style={styles.input}
          />
          <View style={{ marginTop: 8 }}>
            <PrimaryButton
              kind="secondary"
              label={creating ? 'Création…' : 'Créer l’évaluation'}
              onPress={createAssessment}
              disabled={creating || !assignment}
            />
          </View>
        </View>

        <Text style={styles.label}>Évaluation</Text>
        {assessments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Aucune évaluation</Text>
            <Text style={styles.emptyText}>
              Créez la première évaluation de cette classe et matière.
            </Text>
          </View>
        ) : (
          <Segmented
            options={assessments.map((item) => ({
              key: item.id,
              label: `${item.title} · ${item.assessment_date}`,
            }))}
            value={assessmentId}
            onChange={setAssessmentId}
          />
        )}

        {assessment && (
          <>
            <View style={styles.summaryStrip}>
              <Text style={styles.summaryValue}>{assessment.max_score}</Text>
              <Text style={styles.summaryLabel}>
                barème · coefficient {assessment.coefficient}
              </Text>
            </View>

            {students.map((student) => (
              <View key={student.id} style={styles.scoreRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentName}>
                    {student.last_name} {student.first_name}
                  </Text>
                  <Text style={styles.studentMatricule}>{student.matricule}</Text>
                </View>
                <TextInput
                  keyboardType="decimal-pad"
                  value={scores[student.id] ?? ''}
                  onChangeText={(value) =>
                    setScores((current) => ({
                      ...current,
                      [student.id]: value,
                    }))
                  }
                  placeholder="—"
                  style={styles.scoreInput}
                />
                <Text style={styles.scoreMax}>/{assessment.max_score}</Text>
              </View>
            ))}

            <View style={{ marginTop: 16 }}>
              <PrimaryButton
                label={saving ? 'Enregistrement…' : 'Enregistrer les notes'}
                onPress={save}
                disabled={saving}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [context, setContext] = useState<TeacherContext | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('HOME');
  const [selectedAssignment, setSelectedAssignment] =
    useState<Assignment | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshQueue = () => setQueueCount(teacherApi.queueCount());

  const loadWorkspace = useCallback(async () => {
    const nextContext = await teacherApi.loadContext();
    const [nextAssignments, nextTimetable] = await Promise.all([
      teacherApi.loadAssignments(nextContext),
      teacherApi.loadTimetable(nextContext),
    ]);
    setContext(nextContext);
    setAssignments(nextAssignments);
    setTimetable(nextTimetable);
    refreshQueue();
  }, []);

  const boot = useCallback(async () => {
    try {
      const session = await teacherApi.getSession();
      if (session) {
        await loadWorkspace();
      }
    } catch (error) {
      console.warn(error);
    } finally {
      setBooting(false);
    }
  }, [loadWorkspace]);

  useEffect(() => {
    void boot();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setContext(null);
        setAssignments([]);
        setTimetable([]);
        setTab('HOME');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!context) return;
    return teacherApi.subscribeSchool(context.schoolId, () => {
      if (tab === 'HOME') {
        void loadWorkspace();
      }
    });
  }, [context?.schoolId, tab]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await teacherApi.flushQueue();
      refreshQueue();
      if (result.synced > 0) {
        Alert.alert(
          'Synchronisation',
          `${result.synced} opération(s) envoyée(s). ${result.remaining} restante(s).`
        );
      }
      await loadWorkspace();
    } catch (error) {
      Alert.alert(
        'Synchronisation',
        error instanceof Error
          ? error.message
          : 'Le réseau est indisponible. Les données restent sur le téléphone.'
      );
    } finally {
      setSyncing(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await teacherApi.flushQueue();
      await loadWorkspace();
    } finally {
      setRefreshing(false);
    }
  };

  if (booting) {
    return (
      <View style={[styles.full, styles.center]}>
        <ExpoStatusBar style="dark" />
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text style={styles.bootText}>Ouverture de Sekoly Enseignant…</Text>
      </View>
    );
  }

  if (!context) {
    return (
      <>
        <StatusBar barStyle="dark-content" />
        <ExpoStatusBar style="dark" />
        <LoginScreen
          onLoggedIn={async () => {
            await loadWorkspace();
          }}
        />
      </>
    );
  }

  const openAttendance = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setTab('ATTENDANCE');
  };

  const openGrades = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setTab('GRADES');
  };

  return (
    <SafeAreaView style={styles.full}>
      <ExpoStatusBar style="light" />
      <Header
        context={context}
        queueCount={queueCount}
        syncing={syncing}
        onSync={sync}
        onLogout={() => void teacherApi.signOut()}
      />

      {tab === 'HOME' && (
        <HomeScreen
          context={context}
          assignments={assignments}
          timetable={timetable}
          refreshing={refreshing}
          onRefresh={refresh}
          onOpenAttendance={openAttendance}
          onOpenGrades={openGrades}
        />
      )}

      {tab === 'ATTENDANCE' && (
        <AttendanceScreen
          context={context}
          assignments={assignments}
          initialAssignment={selectedAssignment}
          onQueued={refreshQueue}
          onDone={() => {
            setTab('HOME');
            setSelectedAssignment(null);
            refreshQueue();
          }}
        />
      )}

      {tab === 'GRADES' && (
        <GradesScreen
          context={context}
          assignments={assignments}
          initialAssignment={selectedAssignment}
          onQueued={refreshQueue}
          onDone={() => {
            setTab('HOME');
            setSelectedAssignment(null);
            refreshQueue();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: COLORS.soft },
  center: { alignItems: 'center', justifyContent: 'center' },
  bootText: { marginTop: 14, color: COLORS.muted, fontSize: 13 },

  loginPage: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    backgroundColor: COLORS.soft,
  },
  brandSeal: {
    width: 62,
    height: 62,
    alignSelf: 'center',
    borderRadius: 31,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.green,
  },
  brandSealText: { color: COLORS.white, fontSize: 27, fontWeight: '800' },
  brandTitle: {
    marginTop: 16,
    textAlign: 'center',
    color: COLORS.ink,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandSubtitle: {
    marginTop: 6,
    marginBottom: 28,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 12,
  },
  loginCard: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
  },

  header: {
    minHeight: 88,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerProduct: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  headerSchool: {
    marginTop: 4,
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
  },
  headerTeacher: {
    marginTop: 2,
    color: '#c9d7da',
    fontSize: 10,
  },
  headerActions: { alignItems: 'flex-end', gap: 8 },
  syncChip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#6d8990',
  },
  syncChipText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  logoutText: { color: '#d8e3e5', fontSize: 9 },

  screen: { flex: 1, backgroundColor: COLORS.soft },
  screenContent: { padding: 16, paddingBottom: 42 },
  hero: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.green,
  },
  heroEyebrow: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  heroTitle: {
    marginTop: 5,
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  heroSubtitle: { marginTop: 4, color: COLORS.muted, fontSize: 11 },

  sectionTitle: {
    marginTop: 22,
    marginBottom: 9,
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  courseCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 9,
  },
  courseTime: {
    width: 64,
    paddingVertical: 14,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: '#f0f4f4',
  },
  courseTimeText: { color: COLORS.navy, fontSize: 14, fontWeight: '800' },
  courseTimeEnd: { marginTop: 3, color: COLORS.muted, fontSize: 9 },
  courseBody: { flex: 1, padding: 13 },
  courseSubject: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  courseMeta: { marginTop: 3, color: COLORS.muted, fontSize: 10 },
  courseButtons: { marginTop: 10, flexDirection: 'row', gap: 7 },

  assignmentRow: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 13,
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  assignmentTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  assignmentMeta: { marginTop: 2, color: COLORS.muted, fontSize: 9.5 },
  assignmentButtons: { flexDirection: 'row', gap: 6 },
  smallLink: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  smallLinkText: { color: COLORS.navy, fontSize: 9, fontWeight: '800' },

  emptyCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    padding: 18,
  },
  emptyTitle: { color: COLORS.ink, fontSize: 12, fontWeight: '800' },
  emptyText: { marginTop: 4, color: COLORS.muted, fontSize: 10.5 },

  button: {
    minHeight: 38,
    borderWidth: 1,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 10.5, fontWeight: '800' },

  subHeader: {
    minHeight: 54,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: { color: COLORS.navy, fontSize: 13, fontWeight: '700' },
  subHeaderTitle: {
    marginLeft: 18,
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
  },

  label: {
    marginBottom: 6,
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    minHeight: 42,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.ink,
    fontSize: 12,
  },
  helper: {
    marginTop: 14,
    color: COLORS.muted,
    fontSize: 9.5,
    lineHeight: 14,
  },

  segmentRow: { gap: 6, paddingBottom: 4 },
  segment: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  segmentText: { color: COLORS.ink, fontSize: 9.5, fontWeight: '700' },
  segmentTextActive: { color: COLORS.white },

  summaryStrip: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  summaryValue: { color: COLORS.navy, fontSize: 20, fontWeight: '900' },
  summaryLabel: { color: COLORS.muted, fontSize: 10 },

  studentCard: {
    marginBottom: 8,
    padding: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  studentTop: { flexDirection: 'row', alignItems: 'center' },
  studentName: { color: COLORS.ink, fontSize: 11.5, fontWeight: '800' },
  studentMatricule: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 8.5,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },

  createBox: {
    marginTop: 14,
    marginBottom: 16,
    padding: 13,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  createTitle: {
    marginBottom: 8,
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '800',
  },

  scoreRow: {
    minHeight: 60,
    paddingHorizontal: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreInput: {
    width: 62,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.soft,
    textAlign: 'center',
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  scoreMax: {
    width: 32,
    marginLeft: 5,
    color: COLORS.muted,
    fontSize: 9,
  },
});
