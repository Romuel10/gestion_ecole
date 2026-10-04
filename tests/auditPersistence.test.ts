import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, memoryStorage, schoolFixture } from './support/serviceLoader.cjs';
import { validateBackup } from '../src/services/backupValidation.ts';
import { mergeTeacherChanges } from '../src/services/databaseMerge.ts';

test('SQLite : aucune réussite ni publication avant la fin de l’écriture', async () => {
  const localStorage=memoryStorage();const base=schoolFixture();localStorage.setItem('SEKOLY_BROWSER_CACHE_V1',JSON.stringify(base));
  let complete: () => void = () => {};const gate=new Promise<void>(resolve=>{complete=resolve;});
  const {load}=createHarness({localStorage},{'./desktopStorage':{DesktopStorageService:{isDesktop:()=>true,saveDatabase:()=>gate}}});
  const {StorageService}=load('src/services/storage.ts');StorageService.loadDatabase();
  const changed={...base,students:[...base.students,{...base.students[0],id:'added',matricule:'TEST002'}]};
  let published=false;const pending=StorageService.saveDatabase(changed,base).then(()=>{published=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(published,false);assert.equal(StorageService.getCurrentDatabase().students.length,1);
  complete();await pending;assert.equal(StorageService.getCurrentDatabase().students.length,2);
});

test('un échec SQLite conserve les données et affiche l’erreur ; une tentative suivante peut réussir', async () => {
  const localStorage=memoryStorage();const base=schoolFixture();localStorage.setItem('SEKOLY_BROWSER_CACHE_V1',JSON.stringify(base));
  let fail=true;const {load}=createHarness({localStorage},{'./desktopStorage':{DesktopStorageService:{isDesktop:()=>true,saveDatabase:async()=>{if(fail)throw Error('DISK_FULL');}}}});
  const {StorageService}=load('src/services/storage.ts');StorageService.loadDatabase();
  const messages:string[]=[];const changed={...base,currentTermCode:'changed'};
  assert.equal(await StorageService.saveDatabaseOrNotify(changed,base,(message:string)=>messages.push(message)),null);
  assert.match(messages[0],/DISK_FULL/);assert.equal(StorageService.getCurrentDatabase().currentTermCode,'T1');
  fail=false;await StorageService.saveDatabase(changed,base);assert.equal(StorageService.getCurrentDatabase().currentTermCode,'changed');
});

test('une saturation du cache ne bloque pas SQLite ; elle bloque une écriture exclusivement navigateur', async () => {
  const base=schoolFixture();let writes=0;const localStorage={...memoryStorage(),setItem(){throw Error('QUOTA');}};
  const desktop={isDesktop:()=>true,saveDatabase:async()=>{writes++;}};
  const {StorageService}=createHarness({localStorage},{'./desktopStorage':{DesktopStorageService:desktop}}).load('src/services/storage.ts');
  await StorageService.saveDatabase(base);assert.equal(writes,1);assert.equal(StorageService.getCurrentDatabase().students.length,1);
  desktop.isDesktop=()=>false;await assert.rejects(StorageService.saveDatabase({...base,students:[]}),/QUOTA/);
  assert.equal(StorageService.getCurrentDatabase().students.length,1);
});

test('restauration : fichier incomplet, version future, date impossible et référence perdue sont refusés', () => {
  assert.throws(()=>validateBackup({schoolConfig:{name:'École'}}),/invalide/);
  for (const mutate of [
    (db:any)=>{delete db.tuitionPayments;},(db:any)=>{db.version='2.99.0';},
    (db:any)=>{db.students[0].birthDate='2015-02-31';},(db:any)=>{db.students[0].classId='absent';},
    (db:any)=>{db.students.push({...db.students[0]});},(db:any)=>{db.schoolYears[0].terms[0].endDate='2026-02-31';},
  ]) {const db=schoolFixture();mutate(db);assert.throws(()=>validateBackup(db),/invalide/);}
});

test('la lecture d’une sauvegarde complète ne remplace aucune donnée avant confirmation', async () => {
  const base=schoolFixture();base.tuitionPayments=[{id:'payment',studentId:'student-test',classId:'class-test',schoolYearId:'year-test',amount:50000,paymentDate:'2026-10-04'}];
  assert.doesNotThrow(()=>validateBackup(base));
  const {load,localStorage}=createHarness();localStorage.setItem('SEKOLY_BROWSER_CACHE_V1',JSON.stringify(schoolFixture()));
  const {StorageService}=load('src/services/storage.ts');StorageService.loadDatabase();
  const imported=await StorageService.importBackupJSON({text:async()=>JSON.stringify(base)});
  assert.equal(imported.tuitionPayments[0].amount,50000);
  assert.equal(StorageService.getCurrentDatabase().tuitionPayments.length,0);
});

test('reprise sur une installation neuve : notes, présences et comptabilité complète conservées', async () => {
  const original=schoolFixture();
  original.grades=[{id:'grade-restore',studentId:'student-test',classId:'class-test',subjectId:'math-test',schoolYearId:'year-test',termCode:'T1',evaluations:[16],subjectAverage:16}];
  original.attendanceRecords=[{id:'attendance-restore',studentId:'student-test',classId:'class-test',schoolYearId:'year-test',date:'2026-10-04',status:'ABSENT'}];
  original.tuitionPayments=[{id:'payment-restore',studentId:'student-test',classId:'class-test',schoolYearId:'year-test',amount:50000,paymentDate:'2026-10-04'}];
  original.salaryPayments=[{id:'salary-restore',teacherId:'teacher-test',schoolYearId:'year-test',netSalary:30000,paymentDate:'2026-10-04'}];
  original.cashTransactions=[{id:'cash-restore',schoolYearId:'year-test',amount:5000,date:'2026-10-04'}];
  original.cashDayClosures=[{id:'closure-restore',schoolYearId:'year-test',date:'2026-10-04',openingBalance:10000,expectedBalance:15000,countedBalance:15000,difference:0,transactionCount:1}];
  const {StorageService}=createHarness().load('src/services/storage.ts');
  const imported=await StorageService.importBackupJSON({text:async()=>JSON.stringify(original)});
  await StorageService.createRecoveryBackup();await StorageService.saveDatabase(imported);
  const restored=StorageService.getCurrentDatabase();
  for(const table of ['students','teachers','grades','attendanceRecords','tuitionPayments','salaryPayments','cashTransactions','cashDayClosures']) assert.deepEqual(restored[table],original[table]);
});

test('fusion d’une réponse Cloud retardée : paiement et modification locale d’une note sont préservés', () => {
  const base=schoolFixture();const current=structuredClone(base);current.tuitionPayments=[{id:'payment',amount:50000}];
  const identity={id:'grade',studentId:'student-test',classId:'class-test',subjectId:'math-test',schoolYearId:'year-test',termCode:'T1',evaluations:[10],subjectAverage:10};
  base.grades=[identity];current.grades=[{...identity,evaluations:[18],subjectAverage:18}];
  const proposed={...base,grades:[{...identity,evaluations:[12],subjectAverage:12}],attendanceRecords:[{id:'cloud-att-1'}]};
  const merged=mergeTeacherChanges(current,base,proposed);
  assert.equal(merged.tuitionPayments[0].amount,50000);assert.deepEqual(merged.grades[0].evaluations,[18]);assert.equal(merged.attendanceRecords.length,1);
  const changedYear={...current,currentSchoolYearId:'another'};assert.throws(()=>mergeTeacherChanges(changedYear,base,proposed),/Année scolaire/);
});

test('une note créée pendant le réseau n’est pas dupliquée par sa version Cloud', () => {
  const base=schoolFixture();const local={id:'local',studentId:'student-test',classId:'class-test',subjectId:'math-test',termCode:'T1',schoolYearId:'year-test',evaluations:[17]};
  const merged=mergeTeacherChanges({...base,grades:[local]},base,{...base,grades:[{...local,id:'cloud',evaluations:[12]}]});
  assert.equal(merged.grades.length,1);assert.equal(merged.grades[0].id,'local');
});

test('copie locale quotidienne complète : finance incluse, échec relançable et rotation quotidienne', async () => {
  const base=schoolFixture();base.cashTransactions=[{id:'cash',amount:50000}];let fail=true;const copies:any[]=[];
  const {StorageService}=createHarness({}, {'./desktopStorage':{DesktopStorageService:{isDesktop:()=>true,saveDatabase:async()=>{},createDailyBackup:async(db:any)=>{if(fail)throw Error('BACKUP_FULL');copies.push(db);return 'backup.json';}}}}).load('src/services/storage.ts');
  await StorageService.saveDatabase(base);await assert.rejects(StorageService.ensureDailyLocalBackup(),/BACKUP_FULL/);
  fail=false;assert.equal(await StorageService.ensureDailyLocalBackup(),'backup.json');assert.equal(copies[0].cashTransactions[0].amount,50000);
  assert.equal(await StorageService.ensureDailyLocalBackup(),null);assert.equal(copies.length,1);
});
