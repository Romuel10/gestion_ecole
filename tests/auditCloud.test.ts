import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness,schoolFixture } from './support/serviceLoader.cjs';

function cloudFixture() {
  let remote:Record<string,any[]>={};let beforeFetch=async()=>{};
  const harness=createHarness({fetch:async(input:any)=>{await beforeFetch();const url=new URL(input);return Response.json(remote[url.pathname.split('/').at(-1)!]??[]);}});
  const {CloudSyncService:cloud,cloudEntityUuid:uuid}=harness.load('src/services/cloudSync.ts');
  cloud.setSchoolId('00000000-0000-4000-8000-000000000001');cloud.setIdNamespaceVersion(2);
  harness.localStorage.setItem('SEKOLY_CLOUD_SESSION_V2',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:9999999999}));
  const assessment=(id='a',max=40,coefficient=1,type='CONTINUOUS')=>({id,school_year_id:uuid('year','year-test'),class_id:uuid('class','year-test:class-test'),subject_id:uuid('subject','math-test'),term_id:uuid('term','term-test'),assessment_type:type,assessment_date:'2026-10-04',max_score:max,coefficient});
  const score=(id='a',value:number|null=32)=>({id:'score-'+id,assessment_id:id,student_id:uuid('student','TEST001'),score:value,status:value===null?'NOT_GRADED':'GRADED'});
  return {cloud,uuid,...harness,assessment,score,setRemote:(value:typeof remote)=>{remote=value;},gate:(value:typeof beforeFetch)=>{beforeFetch=value;}};
}

test('Cloud : conversion de 32/40 en 16/20 et pondérations des contrôles', async () => {
  const f=cloudFixture();f.setRemote({sekoly_assessments:[f.assessment('a',40,3),f.assessment('b',20,1)],sekoly_assessment_scores:[f.score('a',32),f.score('b',8)]});
  const result=await f.cloud.pullTeacherChanges(schoolFixture());const grade=result.db.grades[0];
  assert.deepEqual(Array.from(grade.evaluations),[16,8]);assert.deepEqual(Array.from(grade.evaluationWeights),[3,1]);assert.equal(grade.subjectAverage,14);
});

test('Cloud : note effacée, score supprimé et évaluation supprimée retirent la note locale', async () => {
  for (const mode of ['null','score-deleted','assessment-deleted']) {
    const f=cloudFixture();f.setRemote({sekoly_assessments:[f.assessment()],sekoly_assessment_scores:[f.score()]});
    const first=await f.cloud.pullTeacherChanges(schoolFixture());
    f.setRemote({sekoly_assessments:mode==='assessment-deleted'?[]:[f.assessment()],sekoly_assessment_scores:mode==='null'?[f.score('a',null)]:mode==='score-deleted'?[]:[f.score()]});
    const second=await f.cloud.pullTeacherChanges(first.db);
    assert.equal(second.gradesChanged,1);assert.equal(second.db.grades[0].evaluations.length,0);
    assert.equal((await f.cloud.pullTeacherChanges(second.db)).gradesChanged,0);
  }
});

test('Cloud : une correction de présence seule et sa suppression déclenchent l’enregistrement', async () => {
  const f=cloudFixture();const session={id:'session',class_id:f.uuid('class','year-test:class-test'),session_date:'2026-10-04'};
  const entry={id:'entry',session_id:'session',student_id:f.uuid('student','TEST001'),status:'ABSENT_UNJUSTIFIED'};
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[entry]});const first=await f.cloud.pullTeacherChanges(schoolFixture());
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[{...entry,status:'PRESENT'}]});const second=await f.cloud.pullTeacherChanges(first.db);
  assert.equal(second.attendanceAdded,1);assert.equal(second.db.attendanceRecords[0].type,'PRESENT');assert.equal(second.gradesChanged,0);
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[]});const third=await f.cloud.pullTeacherChanges(second.db);
  assert.equal(third.attendanceAdded,1);assert.equal(third.db.attendanceRecords.length,0);
});

test('le curseur n’est validé qu’après l’écriture durable ; un paiement ajouté pendant le réseau reste présent', async () => {
  const f=cloudFixture();const {StorageService}=f.load('src/services/storage.ts');const base=schoolFixture();await StorageService.saveDatabase(base);
  let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});f.gate(()=>gate);
  f.setRemote({sekoly_assessments:[f.assessment()],sekoly_assessment_scores:[f.score()]});const pull=f.cloud.pullTeacherChanges(base);
  await StorageService.saveDatabase({...base,tuitionPayments:[{id:'new-payment',amount:50000}]},base);
  release();const result=await pull;
  const cursor=()=>[...f.localStorage.map.keys()].filter((key:string)=>key.includes('PULL_CURSOR'));
  assert.equal(cursor().length,0);
  const saved=await StorageService.saveDatabase(result.db,base,true);result.commitCursor();
  assert.equal(saved.tuitionPayments.length,1);assert.equal(saved.grades[0].evaluations[0],16);assert.equal(cursor().length,1);
});

test('une modification de grille garde les contrôles supplémentaires et protège les corrections locales', async () => {
  const f=cloudFixture();const {applyGradeDraft}=f.load('src/services/gradeDraft.ts');
  const base=schoolFixture();const identity={id:'grade',studentId:'student-test',classId:'class-test',subjectId:'math-test',termCode:'T1',schoolYearId:'year-test'};
  const grade={...identity,evaluations:[16,8,10],evaluationWeights:[3,1,2],cloudEvaluationIds:['a','b','c'],subjectAverage:13.33};
  const unchanged=applyGradeDraft(grade,{dev1:'16',dev2:'8',exam:'',comment:''},identity);
  assert.deepEqual(Array.from(unchanged.evaluations),[16,8,10]);assert.deepEqual(Array.from(unchanged.evaluationWeights),[3,1,2]);
  const changed=applyGradeDraft(grade,{dev1:'18',dev2:'8',exam:'',comment:''},identity);
  f.setRemote({sekoly_assessments:[f.assessment('a',40,3),f.assessment('b',20,1),f.assessment('c',20,2)],sekoly_assessment_scores:[f.score('a',32),f.score('b',8),f.score('c',10)]});
  const result=await f.cloud.pullTeacherChanges({...base,grades:[changed]});
  assert.deepEqual(Array.from(result.db.grades[0].evaluations),[18,8,10]);
});

test('une panne de sauvegarde Cloud est visible et relancée après cinq minutes', async () => {
  let now=Date.now();class Clock extends Date {static now(){return now;}}
  let fail=true,calls=0;
  const f=createHarness({Date:Clock,fetch:async()=>{calls++;return fail?Response.json({error:'storage unavailable'},{status:500}):Response.json({created:true,backup:{id:'backup'}});}});
  const {CloudSyncService:cloud}=f.load('src/services/cloudSync.ts');cloud.setSchoolId('school');
  f.localStorage.setItem('SEKOLY_CLOUD_SESSION_V2',JSON.stringify({access_token:'fixture',refresh_token:'fixture',expires_at:9999999999}));
  await assert.rejects(cloud.ensureDailyBackup(),/storage unavailable/);assert.match(cloud.dailyBackupError(),/storage unavailable/);
  await cloud.ensureDailyBackup();assert.equal(calls,1);
  now+=5*60*1000+1;fail=false;await cloud.ensureDailyBackup();assert.equal(calls,2);assert.equal(cloud.dailyBackupError(),null);
});


test('correction Excel : les anciennes évaluations Cloud ne rétablissent pas les valeurs remplacées', async () => {
  const f = cloudFixture(); const { protectImportedGrade } = f.load('src/services/gradeDraft.ts');
  f.setRemote({sekoly_assessments:[f.assessment('a',20,1)],sekoly_assessment_scores:[f.score('a',10)]});
  const first = await f.cloud.pullTeacherChanges(schoolFixture());
  const corrected = protectImportedGrade(first.db.grades[0], { ...first.db.grades[0], evaluations: [18], evaluationWeights: [1] });
  const result = await f.cloud.pullTeacherChanges({ ...first.db, grades: [corrected] });
  assert.deepEqual(Array.from(result.db.grades[0].evaluations), [18]);
});

test('appel importé : correction locale protégée des anciennes valeurs Cloud et divergences visibles', async () => {
  const f = cloudFixture(); const base = schoolFixture();
  const session={id:'session',class_id:f.uuid('class','year-test:class-test'),session_date:'2026-10-04'};
  const entry={id:'entry',session_id:'session',student_id:f.uuid('student','TEST001'),status:'ABSENT_UNJUSTIFIED'};
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[entry]});
  const first = await f.cloud.pullTeacherChanges(base);
  const current = { ...first.db, attendanceRecords: [{ ...first.db.attendanceRecords[0], type: 'PRESENT', cloudIgnoredFingerprint: JSON.stringify(['ABSENT_NON_JUSTIFIE', null, '']) }] };
  const stale = await f.cloud.pullTeacherChanges(current); assert.equal(stale.db.attendanceRecords[0].type, 'PRESENT');
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[{...entry,status:'LATE',minutes_late:5}]});
  const conflict = await f.cloud.pullTeacherChanges(stale.db); assert.equal(conflict.db.attendanceRecords[0].type, 'PRESENT'); assert.ok(conflict.db.attendanceRecords[0].cloudSyncConflict);
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[]});
  const deleted = await f.cloud.pullTeacherChanges(conflict.db); assert.equal(deleted.db.attendanceRecords[0].type, 'PRESENT'); assert.ok(deleted.db.attendanceRecords[0].cloudSyncConflict);
});

test('appel local et appel Cloud du même jour : pas de doublon', async () => {
  const f = cloudFixture(), db = schoolFixture();
  const session={id:'session',class_id:f.uuid('class','year-test:class-test'),session_date:'2026-10-04'};
  const entry={id:'entry',session_id:'session',student_id:f.uuid('student','TEST001'),status:'PRESENT'};
  db.attendanceRecords=[{id:'excel-local',studentId:'student-test',classId:'class-test',schoolYearId:'year-test',date:'2026-10-04',type:'PRESENT'}];
  f.setRemote({sekoly_attendance_sessions:[session],sekoly_attendance_entries:[entry]});
  const result = await f.cloud.pullTeacherChanges(db); assert.equal(result.db.attendanceRecords.length, 1); assert.equal(result.db.attendanceRecords[0].id, 'excel-local');
});

test('réponse Cloud retardée : correction et suppression d’appel concurrentes gardent la saisie locale', () => {
  const { mergeTeacherChanges } = createHarness().load('src/services/databaseMerge.ts'); const db = schoolFixture();
  db.attendanceRecords=[{id:'cloud-att-example',studentId:'student-test',classId:'class-test',schoolYearId:'year-test',date:'2026-10-04',type:'ABSENT_NON_JUSTIFIE'}];
  const current={...db,attendanceRecords:[{...db.attendanceRecords[0],type:'PRESENT'}]};
  for (const records of [[{...db.attendanceRecords[0],type:'RETARD',minutesLate:5}],[]]) {
    const merged=mergeTeacherChanges(current,db,{...db,attendanceRecords:records}); assert.equal(merged.attendanceRecords.length,1); assert.equal(merged.attendanceRecords[0].type,'PRESENT');
  }
});


test('correction Excel : appréciation et coefficient de l’examen conservés pendant la synchronisation', async () => {
  const f = cloudFixture(); const { protectImportedGrade } = f.load('src/services/gradeDraft.ts');
  f.setRemote({sekoly_assessments:[f.assessment('a',20,1),f.assessment('exam',20,3,'EXAM')],sekoly_assessment_scores:[{...f.score('a',10),comment:'Ancienne appréciation'},f.score('exam',12)]});
  const first = await f.cloud.pullTeacherChanges(schoolFixture());
  const corrected = protectImportedGrade(first.db.grades[0], { ...first.db.grades[0], evaluations: [18], evaluationWeights: [1], examGrade: 16, cloudExamCoefficient: 3, teacherComment: 'Nouvelle appréciation Excel' });
  const result = await f.cloud.pullTeacherChanges({ ...first.db, grades: [corrected] });
  assert.equal(result.db.grades[0].teacherComment, 'Nouvelle appréciation Excel'); assert.equal(result.db.grades[0].cloudExamCoefficient, 3);
  assert.equal(result.db.grades[0].subjectAverage, 16.29);
});
