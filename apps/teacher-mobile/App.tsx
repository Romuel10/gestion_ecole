import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
  useColorScheme,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { offlineStore } from './src/lib/offlineStore';
import { acceptAuthDeepLink, supabase } from './src/lib/supabase';
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

const LIGHT_COLORS = {
  navy: '#173f49',
  navySoft: '#eaf1f2',
  green: '#2f7a54',
  red: '#b94141',
  ink: '#17212b',
  muted: '#65717f',
  border: '#d9dee4',
  soft: '#f4f7f8',
  surface: '#ffffff',
  white: '#ffffff',
  amber: '#a86f14',
  shadow: '#10242b',
};

const DARK_COLORS: typeof LIGHT_COLORS = {
  navy: '#1d5664',
  navySoft: '#183038',
  green: '#61b88c',
  red: '#e47e7e',
  ink: '#eef4f6',
  muted: '#a7b4bb',
  border: '#2d3d45',
  soft: '#0d151a',
  surface: '#151f25',
  white: '#ffffff',
  amber: '#e0ad59',
  shadow: '#000000',
};

type ThemeMode = 'light' | 'dark';
type MobileColors = typeof LIGHT_COLORS;
type MobileThemeContextValue = {
  mode: ThemeMode;
  colors: MobileColors;
  styles: ReturnType<typeof createStyles>;
  toggleTheme: () => void;
  textScale: number;
  changeTextScale: (value: number) => void;
};

const MobileThemeContext = createContext<MobileThemeContextValue | null>(null);

function useMobileTheme() {
  const value = useContext(MobileThemeContext);
  if (!value) throw new Error('Sekoly mobile theme unavailable.');
  return value;
}

const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const displayDate = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3-$2-$1');

function TextSizeControl() {
  const { styles, textScale, changeTextScale } = useMobileTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
    <Text style={styles.helper}>Taille des textes : {textScale} %</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Réduire les textes" disabled={textScale <= 100}
      onPress={() => changeTextScale(Math.max(100, textScale - 10))} style={styles.segment}>
      <Text style={styles.segmentText}>A−</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Agrandir les textes" disabled={textScale >= 150}
      onPress={() => changeTextScale(Math.min(150, textScale + 10))} style={styles.segment}>
      <Text style={styles.segmentText}>A+</Text>
    </Pressable>
  </View>;
}

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
  const { colors: COLORS, styles } = useMobileTheme();
  const background =
    kind === 'primary'
      ? COLORS.navy
      : kind === 'danger'
      ? COLORS.red
      : COLORS.surface;
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
  const { styles } = useMobileTheme();
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

function ActivateAccountScreen({
  onDone,
}: {
  onDone: () => Promise<void>;
}) {
  const { styles } = useMobileTheme();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (password.length < 8) {
      Alert.alert('Mot de passe', 'Utilisez au moins 8 caractères.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Mot de passe', 'Les deux mots de passe ne correspondent pas.');
      return;
    }

    setBusy(true);
    try {
      await teacherApi.changeInitialPassword(password);
    } catch (error) {
      Alert.alert(
        'Changement impossible',
        error instanceof Error ? error.message : 'Réessayez.'
      );
      setBusy(false);
      return;
    }

    try {
      await onDone();
    } catch (error) {
      Alert.alert(
        'Mot de passe enregistré',
        'Votre mot de passe a bien été changé, mais les données de l’établissement n’ont pas pu être chargées. Fermez puis rouvrez l’application. Si nécessaire, reconnectez-vous avec votre nouveau mot de passe.'
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
        <Text style={styles.brandTitle}>ACTIVER MON COMPTE</Text>
        <Text style={styles.brandSubtitle}>
          Choisissez le mot de passe de votre compte Sekoly Enseignant
        </Text>

        <View style={styles.loginCard}>
          <Text style={styles.label}>Nouveau mot de passe</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Confirmation</Text>
          <TextInput
            secureTextEntry
            value={confirmation}
            onChangeText={setConfirmation}
            style={styles.input}
          />

          <View style={{ marginTop: 18 }}>
            <PrimaryButton
              label={busy ? 'Activation…' : 'Activer mon compte'}
              onPress={save}
              disabled={busy}
            />
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function LoginScreen({
  onLoggedIn,
}: {
  onLoggedIn: () => Promise<void>;
}) {
  const { styles } = useMobileTheme();
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
          <TextSizeControl />
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
  const { mode, styles, toggleTheme } = useMobileTheme();
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
        <View style={styles.headerActionRow}>
          <Pressable onPress={onSync} style={styles.syncChip}>
            <Text style={styles.syncChipText}>
              {syncing
                ? 'Synchronisation…'
                : queueCount > 0
                ? `${queueCount} en attente`
                : 'Synchronisé'}
            </Text>
          </Pressable>
          <Pressable onPress={toggleTheme} style={styles.themeChip}>
            <Text style={styles.themeChipText}>
              {mode === 'dark' ? 'Jour' : 'Nuit'}
            </Text>
          </Pressable>
        </View>
        <Pressable onPress={onLogout} hitSlop={8}>
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
  const { styles } = useMobileTheme();
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
      <TextSizeControl />
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>AUJOURD’HUI</Text>
        <Text style={styles.heroTitle}>
          {displayDate(todayIso())}
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
  const { colors: COLORS, styles } = useMobileTheme();
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
  const { colors: COLORS, styles } = useMobileTheme();
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
              label: `${item.title} · ${displayDate(item.assessment_date)}`,
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

function AppContent() {
  const { colors: COLORS, mode, styles } = useMobileTheme();
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
  const [needsPassword, setNeedsPassword] = useState(false);
  const accountGeneration = useRef(0);
  const activeUserId = useRef<string | null>(null);
  const screenProgress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    screenProgress.setValue(0);
    Animated.timing(screenProgress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [tab, screenProgress]);

  const refreshQueue = () => setQueueCount(teacherApi.queueCount());

  const loadWorkspace = useCallback(async (recordOpen = false) => {
    const generation = accountGeneration.current;
    const nextContext = await teacherApi.loadContext();
    const [nextAssignments, nextTimetable] = await Promise.all([
      teacherApi.loadAssignments(nextContext),
      teacherApi.loadTimetable(nextContext),
    ]);
    if (generation !== accountGeneration.current || !offlineStore.isOwner(nextContext.userId, nextContext.schoolId)) return;
    setContext(nextContext);
    setAssignments(nextAssignments);
    setTimetable(nextTimetable);
    refreshQueue();

    if (recordOpen) {
      void teacherApi.recordDeviceEvent(nextContext, 'APP_OPEN', 'OK', {
        assignments: nextAssignments.length,
        timetable: nextTimetable.length,
      });
    }
  }, []);

  const boot = useCallback(async () => {
    try {
      const session = await teacherApi.getSession();
      const bootUserId = session?.user.id ?? null;
      if (activeUserId.current !== bootUserId) {
        activeUserId.current = bootUserId;
        accountGeneration.current += 1;
      }
      if (session) {
        const mustChange = await teacherApi.requiresPasswordChange();
        if (mustChange) {
          setNeedsPassword(true);
        } else {
          await loadWorkspace(true);
        }
      }
    } catch (error) {
      console.warn(error);
    } finally {
      setBooting(false);
    }
  }, [loadWorkspace]);

  useEffect(() => {
    const handleUrl = async (url: string | null) => {
      if (!url || !url.startsWith('sekoly-teacher://')) return;
      try {
        const result = await acceptAuthDeepLink(url);
        if (result.session) {
          setNeedsPassword(true);
        }
      } catch (error) {
        Alert.alert(
          'Invitation',
          error instanceof Error ? error.message : "Impossible d'ouvrir l'invitation."
        );
      }
    };

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void boot();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null;
      if (activeUserId.current !== nextUserId) {
        activeUserId.current = nextUserId;
        accountGeneration.current += 1;
        setContext(null);
        setAssignments([]);
        setTimetable([]);
        setSelectedAssignment(null);
        setQueueCount(0);
        setNeedsPassword(false);
        setTab('HOME');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!context) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    teacherApi
      .subscribeSchool(context.schoolId, () => {
        if (tab === 'HOME') {
          void loadWorkspace();
        }
      })
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else cleanup = unsubscribe;
      })
      .catch((error) => {
        console.warn('Sekoly Realtime:', error);
      });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [context?.schoolId, tab]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await teacherApi.flushQueue(true);
      refreshQueue();
      if (result.synced > 0) {
        Alert.alert(
          'Synchronisation',
          `${result.synced} opération(s) envoyée(s). ${result.remaining} restante(s).`
        );
      }
      if (result.lastError) Alert.alert('Synchronisation incomplète', `${result.remaining} opération(s) conservée(s) sur ce compte. ${result.lastError}`);
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
    } catch (error) {
      Alert.alert('Actualisation impossible', error instanceof Error ? error.message : 'Réessayez lorsque le réseau est disponible.');
    } finally {
      setRefreshing(false);
    }
  };

  if (booting) {
    return (
      <View style={[styles.full, styles.center]}>
        <ExpoStatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <ActivityIndicator size="large" color={COLORS.navy} />
        <Text style={styles.bootText}>Ouverture de Sekoly Enseignant…</Text>
      </View>
    );
  }

  if (needsPassword) {
    return (
      <ActivateAccountScreen
        onDone={async () => {
          setNeedsPassword(false);
          await loadWorkspace(true);
        }}
      />
    );
  }

  if (!context) {
    return (
      <>
        <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
        <ExpoStatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <LoginScreen
          onLoggedIn={async () => {
            const mustChange = await teacherApi.requiresPasswordChange();
            if (mustChange) {
              setNeedsPassword(true);
              return;
            }
            await loadWorkspace(true);
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
    <SafeAreaView style={[styles.full, styles.safeRoot]}>
      <ExpoStatusBar style="light" />
      <Header
        context={context}
        queueCount={queueCount}
        syncing={syncing}
        onSync={sync}
        onLogout={() => void teacherApi.signOut()}
      />

      {offlineStore.legacyQueueCount() > 0 && <Text style={styles.helper} accessibilityRole="alert">
        Des opérations d’une ancienne version sont conservées sur ce téléphone. Elles doivent être récupérées avec l’administrateur avant leur envoi.
      </Text>}

      <Animated.View
        style={[
          styles.screenStage,
          {
            opacity: screenProgress,
            transform: [
              {
                translateY: screenProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          },
        ]}
      >
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
      </Animated.View>
    </SafeAreaView>
  );
}

export default function App() {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(
    systemScheme === 'dark' ? 'dark' : 'light'
  );

  const [textScale, setTextScale] = useState(() => {
    const saved = offlineStore.getCache<number>('text-scale');
    return typeof saved === 'number' && saved >= 100 && saved <= 150 ? saved : 100;
  });
  const changeTextScale = useCallback((value: number) => {
    const safe = Math.max(100, Math.min(150, value));
    setTextScale(safe);
    offlineStore.setCache('text-scale', safe);
  }, []);
  const colors = mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;
  const styles = useMemo(() => createStyles(colors, textScale / 100), [colors, textScale]);
  const toggleTheme = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);
  const themeValue = useMemo(
    () => ({ mode, colors, styles, toggleTheme, textScale, changeTextScale }),
    [mode, colors, styles, toggleTheme, textScale, changeTextScale]
  );

  return (
    <MobileThemeContext.Provider value={themeValue}>
      <AppContent />
    </MobileThemeContext.Provider>
  );
}

function createStyles(COLORS: MobileColors, textScale = 1) {
  return StyleSheet.create({
  full: { flex: 1, backgroundColor: COLORS.soft },
  safeRoot: {
    paddingTop: Platform.OS === 'android' ? Math.max(StatusBar.currentHeight ?? 0, 24) : 0,
    backgroundColor: COLORS.navy,
  },
  screenStage: { flex: 1, backgroundColor: COLORS.soft },
  center: { alignItems: 'center', justifyContent: 'center' },
  bootText: { marginTop: 14, color: COLORS.muted, fontSize: 13 * textScale },

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
    borderRadius: 18,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.green,
  },
  brandSealText: { color: COLORS.white, fontSize: 27 * textScale, fontWeight: '800' },
  brandTitle: {
    marginTop: 16,
    textAlign: 'center',
    color: COLORS.ink,
    fontSize: 21 * textScale,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandSubtitle: {
    marginTop: 6,
    marginBottom: 28,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 12 * textScale,
  },
  loginCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    borderRadius: 18,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },

  header: {
    minHeight: 108,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    backgroundColor: COLORS.navy,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 5,
  },
  headerProduct: {
    color: COLORS.white,
    fontSize: 14 * textScale,
    fontWeight: '900',
    letterSpacing: 3.2,
    opacity: 0.94,
  },
  headerSchool: {
    marginTop: 8,
    color: COLORS.white,
    fontSize: 18 * textScale,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerTeacher: {
    marginTop: 4,
    color: '#c9d7da',
    fontSize: 10.5 * textScale,
  },
  headerActions: { alignItems: 'flex-end', gap: 10 },
  headerActionRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  syncChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#6d8990',
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  syncChipText: { color: COLORS.white, fontSize: 9 * textScale, fontWeight: '800' },
  themeChip: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#6d8990',
    borderRadius: 10,
  },
  themeChipText: { color: COLORS.white, fontSize: 9 * textScale, fontWeight: '800' },
  logoutText: { color: '#d8e3e5', fontSize: 9.5 * textScale, fontWeight: '700' },

  screen: { flex: 1, backgroundColor: COLORS.soft },
  screenContent: { padding: 18, paddingBottom: 48 },
  hero: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.green,
    borderRadius: 18,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  heroEyebrow: {
    color: COLORS.muted,
    fontSize: 9 * textScale,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  heroTitle: {
    marginTop: 5,
    color: COLORS.ink,
    fontSize: 20 * textScale,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  heroSubtitle: { marginTop: 4, color: COLORS.muted, fontSize: 11 * textScale },

  sectionTitle: {
    marginTop: 22,
    marginBottom: 9,
    color: COLORS.ink,
    fontSize: 12 * textScale,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  courseCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
  },
  courseTime: {
    width: 64,
    paddingVertical: 14,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.navySoft,
  },
  courseTimeText: { color: COLORS.green, fontSize: 14 * textScale, fontWeight: '800' },
  courseTimeEnd: { marginTop: 3, color: COLORS.muted, fontSize: 9 * textScale },
  courseBody: { flex: 1, padding: 13 },
  courseSubject: { color: COLORS.ink, fontSize: 14 * textScale, fontWeight: '800' },
  courseMeta: { marginTop: 3, color: COLORS.muted, fontSize: 10 * textScale },
  courseButtons: { marginTop: 10, flexDirection: 'row', gap: 7 },

  assignmentRow: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  assignmentTitle: { color: COLORS.ink, fontSize: 12 * textScale, fontWeight: '800' },
  assignmentMeta: { marginTop: 2, color: COLORS.muted, fontSize: 9.5 * textScale },
  assignmentButtons: { flexDirection: 'row', gap: 6 },
  smallLink: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
  },
  smallLinkText: { color: COLORS.green, fontSize: 9 * textScale, fontWeight: '800' },

  emptyCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 18,
    borderRadius: 16,
  },
  emptyTitle: { color: COLORS.ink, fontSize: 12 * textScale, fontWeight: '800' },
  emptyText: { marginTop: 4, color: COLORS.muted, fontSize: 10.5 * textScale },

  button: {
    minHeight: 40,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  buttonText: { fontSize: 10.5 * textScale, fontWeight: '800' },

  subHeader: {
    minHeight: 60,
    paddingHorizontal: 18,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: { color: COLORS.green, fontSize: 13 * textScale, fontWeight: '700' },
  subHeaderTitle: {
    marginLeft: 18,
    color: COLORS.ink,
    fontSize: 14 * textScale,
    fontWeight: '800',
  },

  label: {
    marginBottom: 6,
    color: COLORS.muted,
    fontSize: 9 * textScale,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  input: {
    minHeight: 42,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.ink,
    fontSize: 12 * textScale,
    borderRadius: 12,
  },
  helper: {
    marginTop: 14,
    color: COLORS.muted,
    fontSize: 9.5 * textScale,
    lineHeight: 14 * textScale,
  },

  segmentRow: { gap: 6, paddingBottom: 4 },
  segment: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  segmentActive: {
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navy,
  },
  segmentText: { color: COLORS.ink, fontSize: 9.5 * textScale, fontWeight: '700' },
  segmentTextActive: { color: COLORS.white },

  summaryStrip: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderRadius: 14,
  },
  summaryValue: { color: COLORS.green, fontSize: 20 * textScale, fontWeight: '900' },
  summaryLabel: { color: COLORS.muted, fontSize: 10 * textScale },

  studentCard: {
    marginBottom: 9,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
  },
  studentTop: { flexDirection: 'row', alignItems: 'center' },
  studentName: { color: COLORS.ink, fontSize: 11.5 * textScale, fontWeight: '800' },
  studentMatricule: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 8.5 * textScale,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },

  createBox: {
    marginTop: 14,
    marginBottom: 16,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
  },
  createTitle: {
    marginBottom: 8,
    color: COLORS.ink,
    fontSize: 11 * textScale,
    fontWeight: '800',
  },

  scoreRow: {
    minHeight: 62,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 7,
  },
  scoreInput: {
    width: 62,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.navySoft,
    textAlign: 'center',
    color: COLORS.ink,
    fontSize: 14 * textScale,
    fontWeight: '800',
  },
  scoreMax: {
    width: 32,
    marginLeft: 5,
    color: COLORS.muted,
    fontSize: 9 * textScale,
  },
  });
}
