import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { excelStore } from '../lib/excelStore';
import {
  attendanceKey,
  civilDate,
  displayCivilDate,
  gradeKey,
  MAX_EXCHANGE_BYTES,
  packageKey,
  readExchangeWorkbook,
  readTeacherPackage,
  teacherResultsWorkbook,
} from '../shared/teacherExchange';
import type {
  ExchangeAttendance,
  ExchangeGrade,
} from '../shared/teacherExchange';
import {
  emptyExcelWorkspace,
  refreshExcelWorkspace,
  saveExcelAttendance,
  saveExcelGrades,
  workspaceConflicts,
} from '../shared/exchangeWorkspace';
import type { ExcelWorkspaceData } from '../shared/exchangeWorkspace';

type Colors = {
  ink: string;
  muted: string;
  surface: string;
  soft: string;
  border: string;
  navy: string;
  white: string;
  green: string;
  red: string;
};
type GradeDraft = {
  controls: string[];
  weights: string[];
  exam: string;
  examCoefficient: number;
  comment: string;
};
type AttendanceDraft = {
  type: ExchangeAttendance['type'];
  minutes: string;
  reason: string;
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Réessayez sans fermer l’application.';
const exportTimestamp = () => Date.now();
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function ExcelWorkspace({
  colors,
  textScale,
  onExit,
}: {
  colors: Colors;
  textScale: number;
  onExit: () => void;
}) {
  const styles = useMemo(
    () => createStyles(colors, textScale / 100),
    [colors, textScale],
  );
  const [initial] = useState(() => {
    try {
      return {
        workspace: excelStore.last(),
        saved: excelStore.list(),
        error: '',
      };
    } catch (error) {
      return {
        workspace: null,
        saved: [] as ExcelWorkspaceData[],
        error: message(error),
      };
    }
  });
  const [workspace, setWorkspace] = useState<ExcelWorkspaceData | null>(
    initial.workspace,
  );
  const [savedWorkspaces, setSavedWorkspaces] = useState<ExcelWorkspaceData[]>(
    initial.saved,
  );
  const [busy, setBusy] = useState(false);
  const storageError = initial.error;
  const initialDate =
    initial.workspace &&
    (today() < initial.workspace.package.schoolYear.startDate ||
      today() > initial.workspace.package.schoolYear.endDate)
      ? initial.workspace.package.schoolYear.startDate
      : today();
  const [tab, setTab] = useState<'home' | 'grades' | 'attendance'>('home');
  const [assignmentId, setAssignmentId] = useState('');
  const [termCode, setTermCode] = useState('');
  const [dateText, setDateText] = useState(displayCivilDate(initialDate));
  const [attendanceDate, setAttendanceDate] = useState(initialDate);
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, GradeDraft>>(
    {},
  );
  const [attendanceDrafts, setAttendanceDrafts] = useState<
    Record<string, AttendanceDraft>
  >({});
  const [controlCount, setControlCount] = useState(2);
  const [dirty, setDirty] = useState(false);
  const data = workspace?.package;
  const assignment =
    data?.assignments.find(
      (item) => `${item.classId}|${item.subjectId}` === assignmentId,
    ) || data?.assignments[0];
  const term =
    data?.terms.find((item) => item.code === termCode) ||
    data?.terms.find((item) => !item.isLocked) ||
    data?.terms[0];
  const date = attendanceDate;
  const students = useMemo(
    () =>
      data?.students
        .filter((item) => item.classId === assignment?.classId)
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(
            `${b.lastName} ${b.firstName}`,
          ),
        ) || [],
    [data, assignment?.classId],
  );
  useEffect(() => {
    if (!workspace || !assignment || !term) return;
    const grades: Record<string, GradeDraft> = {},
      attendance: Record<string, AttendanceDraft> = {};
    let count = 2;
    students.forEach((student) => {
      const key = gradeKey({
        studentId: student.id,
        subjectId: assignment.subjectId,
        termCode: term.code,
      });
      const grade =
        workspace.grades[key] ||
        data!.grades.find((item) => gradeKey(item) === key);
      count = Math.max(count, grade?.evaluations.length || 0);
      grades[student.id] = {
        controls: grade?.evaluations.map(String) || [],
        weights:
          grade?.evaluations.map((_, index) =>
            String(grade.evaluationWeights?.[index] ?? 1),
          ) || [],
        exam: grade?.examGrade === undefined ? '' : String(grade.examGrade),
        examCoefficient: grade?.examCoefficient ?? 1,
        comment: grade?.teacherComment || '',
      };
      const keyAttendance = attendanceKey({
        studentId: student.id,
        classId: assignment.classId,
        date,
      });
      const record =
        workspace.attendance[keyAttendance] ||
        data!.attendance.find((item) => attendanceKey(item) === keyAttendance);
      attendance[student.id] = {
        type: record?.type || 'PRESENT',
        minutes:
          record?.minutesLate === undefined ? '5' : String(record.minutesLate),
        reason: record?.reason || '',
      };
    });
    // The selected persisted worksheet changed: reload its editable form.
    // oxlint-disable-next-line react(set-state-in-effect)
    setGradeDrafts(grades);
    // oxlint-disable-next-line react(set-state-in-effect)
    setAttendanceDrafts(attendance);
    setControlCount(count);
    setDirty(false);
  }, [workspace, assignment, term, data, date, students, tab]);
  const discardThen = (action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    Alert.alert(
      'Saisie non enregistrée',
      'Enregistrez votre saisie avant de changer d’écran, ou confirmez son abandon.',
      [
        { text: 'Rester', style: 'cancel' },
        {
          text: 'Abandonner cette saisie',
          style: 'destructive',
          onPress: () => {
            setDirty(false);
            action();
          },
        },
      ],
    );
  };
  const persist = (next: ExcelWorkspaceData) => {
    excelStore.save(next);
    setWorkspace(next);
    setSavedWorkspaces(excelStore.list());
  };
  const openFile = async () => {
    if (busy || storageError) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset || !/\.xlsx?$/i.test(asset.name))
        throw new Error(
          'Choisissez un fichier Excel .xlsx ou .xls fourni par l’école.',
        );
      const file = new File(asset.uri);
      if ((asset.size || file.size || 0) > MAX_EXCHANGE_BYTES)
        throw new Error('Le fichier dépasse 20 Mo.');
      const incoming = readTeacherPackage(
        readExchangeWorkbook(await file.arrayBuffer()),
      );
      const existing = excelStore.read(packageKey(incoming));
      const next = existing
        ? refreshExcelWorkspace(existing, incoming)
        : emptyExcelWorkspace(incoming);
      persist(next);
      setAssignmentId('');
      setTermCode('');
      setTab('home');
      setDirty(false);
      const initialDate =
        today() >= incoming.schoolYear.startDate &&
        today() <= incoming.schoolYear.endDate
          ? today()
          : incoming.schoolYear.startDate;
      setDateText(displayCivilDate(initialDate));
      setAttendanceDate(initialDate);
      Alert.alert(
        'Fichier enregistré',
        `${incoming.school.name}\n${incoming.teacher.name}\n${incoming.students.length} élève(s). Les saisies sont disponibles sans Internet. Les travaux non confirmés par l’école sont conservés.`,
      );
    } catch (error) {
      Alert.alert('Import impossible', message(error));
    } finally {
      setBusy(false);
    }
  };
  const conflicts = workspace
    ? workspaceConflicts(workspace, tab === 'grades' ? 'grades' : 'attendance')
    : [];
  const save = (acceptConflicts = false) => {
    if (!workspace || !assignment || !term || busy) return;
    const currentConflicts = conflicts.filter(
      (conflict) =>
        students.some((student) => student.id === conflict.studentId) &&
        conflict.key ===
          (tab === 'grades'
            ? gradeKey({
                studentId: conflict.studentId,
                subjectId: assignment.subjectId,
                termCode: term.code,
              })
            : attendanceKey({
                studentId: conflict.studentId,
                classId: assignment.classId,
                date,
              })),
    );
    if (currentConflicts.length && !acceptConflicts) {
      const details = currentConflicts
        .slice(0, 3)
        .map(
          (conflict) =>
            `${data!.students.find((student) => student.id === conflict.studentId)?.matricule} — École : ${conflict.schoolValue}\nTéléphone : ${conflict.teacherValue}`,
        )
        .join('\n\n');
      Alert.alert(
        'Relire les modifications de l’école',
        `${currentConflicts.length} conflit(s). Les valeurs de l’école ont changé. Vérifiez votre saisie avant de confirmer la correction.\n\n${details}`,
        [
          { text: 'Relire', style: 'cancel' },
          { text: 'Confirmer ma saisie', onPress: () => save(true) },
        ],
      );
      return;
    }
    try {
      if (tab === 'grades') {
        const numeric = (raw: string, max = Infinity) => {
          const value = Number(raw.replace(',', '.'));
          if (!Number.isFinite(value) || value < 0 || value > max)
            throw new Error(
              'Les notes doivent être comprises entre 0 et 20 et les coefficients positifs.',
            );
          return value;
        };
        const entries: Omit<ExchangeGrade, 'baseFingerprint'>[] = students.map(
          (student) => {
            const draft = gradeDrafts[student.id]!;
            const evaluations: number[] = [],
              evaluationWeights: number[] = [];
            draft.controls.forEach((raw, index) => {
              if (raw.trim() !== '') {
                evaluations.push(numeric(raw, 20));
                evaluationWeights.push(numeric(draft.weights[index] ?? '1'));
              }
            });
            return {
              studentId: student.id,
              subjectId: assignment.subjectId,
              termCode: term.code,
              evaluations,
              evaluationWeights,
              examGrade:
                draft.exam.trim() === '' ? undefined : numeric(draft.exam, 20),
              examCoefficient: draft.examCoefficient,
              teacherComment: draft.comment.trim(),
            };
          },
        );
        persist(saveExcelGrades(workspace, entries, acceptConflicts));
      } else {
        if (!civilDate(dateText) || civilDate(dateText) !== date)
          throw new Error('Validez la date d’appel avant d’enregistrer.');
        const entries: Omit<ExchangeAttendance, 'baseFingerprint'>[] =
          students.map((student) => {
            const draft = attendanceDrafts[student.id]!;
            return {
              studentId: student.id,
              classId: assignment.classId,
              date,
              type: draft.type,
              minutesLate:
                draft.type === 'RETARD'
                  ? Number(draft.minutes.replace(',', '.'))
                  : undefined,
              reason: draft.reason.trim(),
            };
          });
        persist(saveExcelAttendance(workspace, entries, acceptConflicts));
      }
      setDirty(false);
      Alert.alert(
        'Enregistré sur ce téléphone',
        'Vous pouvez fermer l’application et reprendre plus tard. Exportez ensuite le fichier Excel à remettre à l’école.',
      );
    } catch (error) {
      Alert.alert('Enregistrement impossible', message(error));
    }
  };
  const exportFile = async (kind: 'grades' | 'attendance') => {
    if (!workspace || busy) return;
    if (dirty) {
      Alert.alert(
        'Enregistrez d’abord',
        'Les exports contiennent les saisies enregistrées sur le téléphone.',
      );
      return;
    }
    const grades = kind === 'grades' ? Object.values(workspace.grades) : [];
    const attendance =
      kind === 'attendance' ? Object.values(workspace.attendance) : [];
    if (!grades.length && !attendance.length) {
      Alert.alert(
        'Aucun travail à exporter',
        'Enregistrez de nouvelles notes ou de nouveaux appels. Les saisies confirmées dans le dernier fichier de l’école n’ont plus besoin d’être envoyées.',
      );
      return;
    }
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync()))
        throw new Error(
          'Le partage de fichiers n’est pas disponible sur cet appareil.',
        );
      const workbook = teacherResultsWorkbook(
        workspace.package,
        grades,
        attendance,
      );
      const bytes = new Uint8Array(
        XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }),
      );
      const filename = `SEKOLY_${kind === 'grades' ? 'NOTES' : 'APPELS'}_${workspace.package.teacher.matricule.replace(/[^A-Za-z0-9_-]/g, '_')}_${exportTimestamp()}.xlsx`;
      const file = new File(Paths.cache, filename);
      file.create();
      file.write(bytes);
      await Sharing.shareAsync(file.uri, {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: 'Remettre le fichier Excel à l’école',
        UTI: 'org.openxmlformats.spreadsheetml.sheet',
      });
      // Sharing can be cancelled; it never confirms receipt or deletes local work.
      Alert.alert(
        'Votre travail est conservé',
        'L’école devra importer le fichier. Demandez ensuite un nouveau fichier de l’école pour confirmer les saisies et actualiser vos listes.',
      );
    } catch (error) {
      Alert.alert('Export impossible', message(error));
    } finally {
      setBusy(false);
    }
  };
  const button = (
    label: string,
    action: () => void,
    secondary = false,
    disabled = false,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={() => action()}
      style={[
        styles.button,
        secondary && styles.secondary,
        (disabled || busy) && { opacity: 0.45 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar
        barStyle={colors.ink === '#eef4f6' ? 'light-content' : 'dark-content'}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={styles.card}>
            <Text style={styles.title}>SEKOLY · Échanges Excel</Text>
            <Text style={styles.text}>
              Travail sans Internet · enregistré sur ce téléphone
            </Text>
            {button(
              'Revenir au mode connecté',
              () => discardThen(onExit),
              true,
            )}
          </View>
          {!!storageError && (
            <View style={styles.card}>
              <Text style={styles.error}>
                Lecture des données impossible : {storageError}
              </Text>
              <Text style={styles.text}>
                Ne désinstallez pas l’application. Faites vérifier le stockage
                du téléphone avant de poursuivre.
              </Text>
            </View>
          )}
          {!workspace ? (
            <View style={styles.card}>
              <Text style={styles.heading}>
                Ouvrir le fichier de votre école
              </Text>
              <Text style={styles.text}>
                La direction prépare votre fichier depuis le module Enseignants
                du logiciel. Copiez-le sur le téléphone par USB, Bluetooth ou
                carte mémoire, puis ouvrez-le ici. Aucun compte ni connexion
                Internet n’est nécessaire.
              </Text>
              {button(
                busy ? 'Ouverture…' : 'Choisir le fichier de l’école',
                () => void openFile(),
                false,
                !!storageError,
              )}
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.heading}>{data!.school.name}</Text>
                <Text style={styles.text}>
                  {data!.teacher.name} · {data!.schoolYear.label}
                </Text>
                <Text style={styles.helper}>
                  Le fichier scolaire identifie l’enseignant. Confiez ce
                  téléphone et ces fichiers uniquement au professeur concerné.
                </Text>
                <View style={styles.row}>
                  {(['home', 'grades', 'attendance'] as const).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      onPress={() => discardThen(() => setTab(value))}
                      style={[
                        styles.chip,
                        tab === value && { borderColor: colors.navy },
                      ]}
                    >
                      <Text style={styles.text}>
                        {value === 'home'
                          ? 'Mes fichiers'
                          : value === 'grades'
                            ? 'Notes'
                            : 'Appel'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {tab === 'home' ? (
                <>
                  <View style={styles.card}>
                    <Text style={styles.heading}>
                      Travail à remettre à l’école
                    </Text>
                    <Text style={styles.text}>
                      {Object.keys(workspace.grades).length} fiche(s) de notes ·{' '}
                      {Object.keys(workspace.attendance).length} appel(s)
                    </Text>
                    <Text style={styles.helper}>
                      Un export conserve vos saisies. Seul un nouveau fichier
                      contenant les mêmes valeurs confirme leur réception par
                      l’école.
                    </Text>
                    {button(
                      'Exporter les notes en Excel',
                      () => void exportFile('grades'),
                      false,
                      !Object.keys(workspace.grades).length,
                    )}
                    {button(
                      'Exporter les appels en Excel',
                      () => void exportFile('attendance'),
                      false,
                      !Object.keys(workspace.attendance).length,
                    )}
                    {button(
                      'Actualiser avec un fichier de l’école',
                      () => void openFile(),
                      true,
                    )}
                    <Text style={styles.helper}>
                      Si l’école a modifié une note ou un appel entre-temps,
                      l’import signale un conflit. Relisez les valeurs
                      actualisées avant d’enregistrer de nouveau votre saisie.
                    </Text>
                  </View>
                  <View style={styles.card}>
                    <Text style={styles.heading}>Mes classes</Text>
                    {data!.assignments.map((item) => (
                      <View
                        key={`${item.classId}|${item.subjectId}`}
                        style={styles.assignment}
                      >
                        <Text style={styles.text}>
                          {item.className} · {item.subjectName}
                        </Text>
                        {button(
                          'Saisir les notes',
                          () => {
                            setAssignmentId(
                              `${item.classId}|${item.subjectId}`,
                            );
                            setTab('grades');
                          },
                          true,
                        )}
                        {button(
                          'Faire l’appel',
                          () => {
                            setAssignmentId(
                              `${item.classId}|${item.subjectId}`,
                            );
                            setTab('attendance');
                          },
                          true,
                        )}
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.card}>
                    <Text style={styles.heading}>
                      {tab === 'grades'
                        ? 'Saisir les notes sur 20'
                        : 'Faire l’appel'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.row}
                    >
                      {data!.assignments.map((item) => (
                        <Pressable
                          key={`${item.classId}|${item.subjectId}`}
                          onPress={() =>
                            discardThen(() =>
                              setAssignmentId(
                                `${item.classId}|${item.subjectId}`,
                              ),
                            )
                          }
                          style={[
                            styles.chip,
                            assignment === item && { borderColor: colors.navy },
                          ]}
                        >
                          <Text style={styles.text}>
                            {item.className} · {item.subjectName}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    {tab === 'grades' ? (
                      <>
                        <View style={styles.row}>
                          {data!.terms.map((item) => (
                            <Pressable
                              key={item.code}
                              onPress={() =>
                                discardThen(() => setTermCode(item.code))
                              }
                              style={[
                                styles.chip,
                                item.code === term?.code && {
                                  borderColor: colors.navy,
                                },
                              ]}
                            >
                              <Text style={styles.text}>
                                {item.label}
                                {item.isLocked ? ' · verrouillée' : ''}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={styles.helper}>
                          Une cellule vide reste sans note. Le chiffre 0 est une
                          note. Les contrôles déjà présents et leurs
                          coefficients sont conservés.
                        </Text>
                        {button(
                          'Ajouter un contrôle',
                          () => {
                            setControlCount((value) =>
                              Math.min(100, value + 1),
                            );
                            setDirty(true);
                          },
                          true,
                          controlCount >= 100 || term?.isLocked,
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={styles.label}>
                          Date de l’appel (JJ-MM-AAAA)
                        </Text>
                        <TextInput
                          accessibilityLabel="Date de l’appel"
                          value={dateText}
                          onChangeText={setDateText}
                          placeholder="JJ-MM-AAAA"
                          style={styles.input}
                          keyboardType="numbers-and-punctuation"
                        />
                        <Text style={styles.helper}>
                          Appel sélectionné : {displayCivilDate(attendanceDate)}
                          . Du {displayCivilDate(data!.schoolYear.startDate)} au{' '}
                          {displayCivilDate(data!.schoolYear.endDate)}
                        </Text>
                        {button(
                          'Valider la date de l’appel',
                          () => {
                            const selected = civilDate(dateText);
                            if (
                              !selected ||
                              selected < data!.schoolYear.startDate ||
                              selected > data!.schoolYear.endDate
                            ) {
                              Alert.alert(
                                'Date invalide',
                                'Utilisez JJ-MM-AAAA dans l’année scolaire.',
                              );
                              return;
                            }
                            discardThen(() => setAttendanceDate(selected));
                          },
                          true,
                        )}
                      </>
                    )}
                    <Text style={styles.helper}>
                      {students.length} élève(s)
                      {dirty ? ' · Saisie non enregistrée' : ''}
                    </Text>
                    {button(
                      'Enregistrer sur ce téléphone',
                      save,
                      false,
                      !students.length || (tab === 'grades' && term?.isLocked),
                    )}
                  </View>
                  {students.map((student) => (
                    <View key={student.id} style={styles.card}>
                      <Text style={styles.heading}>
                        {student.lastName} {student.firstName}
                      </Text>
                      <Text style={styles.helper}>{student.matricule}</Text>
                      {conflicts
                        .filter(
                          (conflict) =>
                            conflict.key ===
                            (tab === 'grades'
                              ? gradeKey({
                                  studentId: student.id,
                                  subjectId: assignment!.subjectId,
                                  termCode: term!.code,
                                })
                              : attendanceKey({
                                  studentId: student.id,
                                  classId: assignment!.classId,
                                  date,
                                })),
                        )
                        .map((conflict) => (
                          <View key={conflict.key}>
                            <Text style={styles.error}>
                              L’école a modifié cette saisie.
                            </Text>
                            <Text style={styles.helper}>
                              École : {conflict.schoolValue}
                            </Text>
                            <Text style={styles.helper}>
                              Votre téléphone : {conflict.teacherValue}
                            </Text>
                          </View>
                        ))}
                      {tab === 'grades' ? (
                        <>
                          {Array.from({ length: controlCount }, (_, index) => (
                            <View key={index} style={styles.row}>
                              <View style={styles.grow}>
                                <Text style={styles.label}>
                                  Contrôle {index + 1}
                                </Text>
                                <TextInput
                                  accessibilityLabel={`${student.matricule} contrôle ${index + 1}`}
                                  keyboardType="decimal-pad"
                                  editable={!term?.isLocked}
                                  style={styles.input}
                                  value={
                                    gradeDrafts[student.id]?.controls[index] ||
                                    ''
                                  }
                                  onChangeText={(value) => {
                                    setDirty(true);
                                    setGradeDrafts((current) => {
                                      const draft = current[student.id]!;
                                      const controls = [...draft.controls];
                                      controls[index] = value;
                                      return {
                                        ...current,
                                        [student.id]: { ...draft, controls },
                                      };
                                    });
                                  }}
                                />
                              </View>
                              <View style={styles.grow}>
                                <Text style={styles.label}>Coefficient</Text>
                                <TextInput
                                  accessibilityLabel={`${student.matricule} coefficient ${index + 1}`}
                                  keyboardType="decimal-pad"
                                  editable={!term?.isLocked}
                                  style={styles.input}
                                  value={
                                    gradeDrafts[student.id]?.weights[index] ??
                                    '1'
                                  }
                                  onChangeText={(value) => {
                                    setDirty(true);
                                    setGradeDrafts((current) => {
                                      const draft = current[student.id]!;
                                      const weights = [...draft.weights];
                                      weights[index] = value;
                                      return {
                                        ...current,
                                        [student.id]: { ...draft, weights },
                                      };
                                    });
                                  }}
                                />
                              </View>
                            </View>
                          ))}
                          <Text style={styles.label}>Examen</Text>
                          <TextInput
                            accessibilityLabel={`${student.matricule} examen`}
                            keyboardType="decimal-pad"
                            editable={!term?.isLocked}
                            style={styles.input}
                            value={gradeDrafts[student.id]?.exam || ''}
                            onChangeText={(value) => {
                              setDirty(true);
                              setGradeDrafts((current) => ({
                                ...current,
                                [student.id]: {
                                  ...current[student.id]!,
                                  exam: value,
                                },
                              }));
                            }}
                          />
                          <Text style={styles.label}>Appréciation</Text>
                          <TextInput
                            accessibilityLabel={`${student.matricule} appréciation`}
                            editable={!term?.isLocked}
                            style={styles.input}
                            value={gradeDrafts[student.id]?.comment || ''}
                            onChangeText={(value) => {
                              setDirty(true);
                              setGradeDrafts((current) => ({
                                ...current,
                                [student.id]: {
                                  ...current[student.id]!,
                                  comment: value,
                                },
                              }));
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <View style={styles.row}>
                            {(
                              [
                                { type: 'PRESENT', label: 'Présent' },
                                {
                                  type: 'ABSENT_NON_JUSTIFIE',
                                  label: 'Absent',
                                },
                                { type: 'ABSENT_JUSTIFIE', label: 'Justifié' },
                                { type: 'RETARD', label: 'Retard' },
                              ] as const
                            ).map((status) => (
                              <Pressable
                                key={status.type}
                                accessibilityRole="button"
                                onPress={() => {
                                  setDirty(true);
                                  setAttendanceDrafts((current) => ({
                                    ...current,
                                    [student.id]: {
                                      ...current[student.id]!,
                                      type: status.type,
                                    },
                                  }));
                                }}
                                style={[
                                  styles.chip,
                                  attendanceDrafts[student.id]?.type ===
                                    status.type && {
                                    borderColor: colors.green,
                                    borderWidth: 2,
                                  },
                                ]}
                              >
                                <Text style={styles.text}>{status.label}</Text>
                              </Pressable>
                            ))}
                          </View>
                          {attendanceDrafts[student.id]?.type === 'RETARD' && (
                            <>
                              <Text style={styles.label}>
                                Minutes de retard
                              </Text>
                              <TextInput
                                accessibilityLabel={`${student.matricule} minutes retard`}
                                keyboardType="number-pad"
                                style={styles.input}
                                value={
                                  attendanceDrafts[student.id]?.minutes || ''
                                }
                                onChangeText={(value) => {
                                  setDirty(true);
                                  setAttendanceDrafts((current) => ({
                                    ...current,
                                    [student.id]: {
                                      ...current[student.id]!,
                                      minutes: value,
                                    },
                                  }));
                                }}
                              />
                            </>
                          )}
                          {attendanceDrafts[student.id]?.type !== 'PRESENT' && (
                            <>
                              <Text style={styles.label}>Motif</Text>
                              <TextInput
                                style={styles.input}
                                value={
                                  attendanceDrafts[student.id]?.reason || ''
                                }
                                onChangeText={(value) => {
                                  setDirty(true);
                                  setAttendanceDrafts((current) => ({
                                    ...current,
                                    [student.id]: {
                                      ...current[student.id]!,
                                      reason: value,
                                    },
                                  }));
                                }}
                              />
                            </>
                          )}
                        </>
                      )}
                    </View>
                  ))}
                  {!!students.length &&
                    button(
                      'Enregistrer sur ce téléphone',
                      save,
                      false,
                      tab === 'grades' && term?.isLocked,
                    )}
                </>
              )}
            </>
          )}
          {tab === 'home' && savedWorkspaces.length > 1 && (
            <View style={styles.card}>
              <Text style={styles.heading}>Fichiers enregistrés</Text>
              {savedWorkspaces.map((item) => (
                <View key={packageKey(item.package)}>
                  {button(
                    `${item.package.school.name} · ${item.package.teacher.name} · ${item.package.schoolYear.label}`,
                    () => {
                      persist(item);
                      setAssignmentId('');
                      setTermCode('');
                      setDirty(false);
                    },
                    true,
                  )}
                </View>
              ))}
            </View>
          )}
          {busy && <ActivityIndicator color={colors.navy} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function createStyles(colors: Colors, scale: number) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.soft,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0,
    },
    content: { padding: 16, paddingBottom: 48, gap: 14 },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      backgroundColor: colors.soft,
    },
    card: {
      padding: 16,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 10,
    },
    title: { fontWeight: '800', fontSize: 20 * scale, color: colors.ink },
    heading: { fontWeight: '700', fontSize: 16 * scale, color: colors.ink },
    text: { color: colors.ink, fontSize: 14 * scale, lineHeight: 21 * scale },
    helper: {
      color: colors.muted,
      fontSize: 12 * scale,
      lineHeight: 19 * scale,
    },
    error: { color: colors.red, fontSize: 14 * scale },
    label: { color: colors.muted, fontSize: 12 * scale, marginTop: 4 },
    input: {
      color: colors.ink,
      fontSize: 16 * scale,
      minHeight: 46,
      padding: 10,
      backgroundColor: colors.soft,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
    },
    button: {
      minHeight: 46,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.navy,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.navy,
    },
    secondary: { backgroundColor: colors.surface, borderColor: colors.border },
    buttonText: {
      fontWeight: '700',
      fontSize: 13 * scale,
      color: colors.white,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.soft,
    },
    grow: { flex: 1, minWidth: 90, gap: 5 },
    assignment: {
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 10,
      gap: 8,
    },
  });
}
