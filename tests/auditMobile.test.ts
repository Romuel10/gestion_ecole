import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHarness } from './support/serviceLoader.cjs';

function storeFixture() {
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE mutation_queue(id TEXT PRIMARY KEY,table_name TEXT NOT NULL,operation TEXT NOT NULL,payload TEXT NOT NULL,conflict_target TEXT,created_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT);
    INSERT INTO mutation_queue(id,table_name,operation,payload,created_at) VALUES ('legacy','scores','upsert','{}','2026-09-01');`);
  const adapter={execSync:(sql:string)=>db.exec(sql),runSync:(sql:string,args:any[]=[])=>db.prepare(sql).run(...args),getFirstSync:(sql:string,args:any[]=[])=>db.prepare(sql).get(...args),getAllSync:(sql:string,args:any[]=[])=>db.prepare(sql).all(...args)};
  const {offlineStore:store}=createHarness({}, {'expo-sqlite':{openDatabaseSync:()=>adapter}}).load('apps/teacher-mobile/src/lib/offlineStore.ts');
  return {db,store};
}

test('SQLite mobile : comptes et établissements isolent le cache et la file sans perdre les opérations',()=>{
  const {db,store}=storeFixture();try {
    store.setOwner('A','school-A');store.setCache('teacher-context',{userId:'A'});store.enqueue('scores','upsert',{school_id:'school-A',score:16});
    assert.equal(store.queueCount(),1);assert.equal(store.legacyQueueCount(),1);
    store.setOwner(null);assert.equal(store.getCache('teacher-context'),null);assert.equal(store.queueCount(),0);
    store.setOwner('B','school-B');assert.equal(store.getCache('teacher-context'),null);assert.equal(store.listQueue().length,0);
    assert.throws(()=>store.setCache('teacher-context',{userId:'A'},'A'),/compte a changé/);
    assert.throws(()=>store.enqueue('scores','upsert',{school_id:'school-A'}),/autre établissement/);
    store.enqueue('scores','upsert',{school_id:'school-B',score:8});
    store.setOwner('A','school-A');assert.equal(store.queueCount(),1);assert.equal(store.getCache('teacher-context').userId,'A');
    const mutation=store.listQueue()[0];for(let i=0;i<5;i++)store.markFailed(mutation.id,'offline');assert.equal(store.queueHealth().blocked,1);
    store.retryFailures();assert.equal(store.queueHealth().blocked,0);store.revokeAccess('A');assert.equal(store.getCache('teacher-context'),null);
    store.setOwner('A','school-A');assert.equal(store.getCache('teacher-context'),null);assert.equal(store.queueCount(),1);
  } finally {db.close();}
});

test('mobile : accès refusé ne réutilise pas le cache ; accès hors réseau exige la même session valide',async()=>{
  const {db,store}=storeFixture();let mode='offline';let userId:string|null='A';
  const context={userId:'A',schoolId:'school-A',teacherId:'teacher-A',schoolYearId:'year-A',schoolName:'École fictive',teacherName:'Prof',schoolYearLabel:'2026'};
  store.setOwner('A','school-A');store.setCache('teacher-context',context);
  const supabase={auth:{getSession:async()=>({data:{session:userId?{user:{id:userId},expires_at:9999999999}:null}}),getUser:async()=>({data:{user:null},error:Error(mode==='offline'?'Failed to fetch':'Access denied')}),signOut:async()=>({error:null})}};
  const {teacherApi}=createHarness({}, {'react-native':{Platform:{OS:'android'}},'../lib/supabase':{supabase},'../lib/offlineStore':{offlineStore:store}}).load('apps/teacher-mobile/src/services/teacherApi.ts');
  try {
    assert.equal((await teacherApi.loadContext()).userId,'A');
    mode='denied';await assert.rejects(teacherApi.loadContext(),/Access denied/);assert.equal(store.getCache('teacher-context'),null);
    store.setOwner('A','school-A');store.setCache('teacher-context',context);userId='B';mode='offline';await assert.rejects(teacherApi.loadContext(),/Failed to fetch/);
    userId='A';store.setOwner('A','school-A');await teacherApi.signOut();await assert.rejects(teacherApi.loadContext(),/Connectez-vous/);
  } finally {db.close();}
});
