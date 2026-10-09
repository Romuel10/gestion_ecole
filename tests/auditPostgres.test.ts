import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresFixture } from './support/postgresFixture.ts';

test('migration portail : les anciens liens sont révoqués, toute nouvelle émission porte son vérificateur', async () => {
  const school='00000000-0000-4000-8000-000000000021',family='00000000-0000-4000-8000-000000000022',staff='00000000-0000-4000-8000-000000000023';
  const db=await postgresFixture(async(db,name)=>{
    if(!name.endsWith('_prepublication_integrity_guards.sql')) return;
    await db.exec(`INSERT INTO sekoly_schools(id,name,slug) VALUES ('${school}','École fictive','audit-rotation');
      INSERT INTO sekoly_families(id,school_id) VALUES ('${family}','${school}');
      INSERT INTO auth.users(id) VALUES ('${staff}');
      INSERT INTO sekoly_family_portal_tokens(school_id,family_id,token_hash) VALUES ('${school}','${family}','old-fixture-token');`);
  });
  try {
    const old=await db.query("SELECT revoked_at IS NOT NULL AS revoked FROM sekoly_family_portal_tokens WHERE token_hash='old-fixture-token'");
    assert.equal((old.rows[0] as any).revoked,true);
    await assert.rejects(db.exec(`INSERT INTO sekoly_family_portal_tokens(school_id,family_id,token_hash) VALUES ('${school}','${family}','unverified-fixture')`),/sekoly_portal_verified_issuer/);
    await db.exec(`INSERT INTO sekoly_family_portal_tokens(school_id,family_id,token_hash,authorized_by) VALUES ('${school}','${family}','verified-fixture','${staff}')`);
    await db.exec(`DELETE FROM auth.users WHERE id='${staff}'`);
    const deleted=await db.query("SELECT count(*)::int AS count FROM sekoly_family_portal_tokens WHERE token_hash='verified-fixture'");
    assert.equal((deleted.rows[0] as any).count,0);
  } finally {await db.close();}
});

test('PostgreSQL : adhésion active, verrous et portée des documents', async t => {
  const db=await postgresFixture();
  const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const school=id(1),otherSchool=id(2),user=id(3),teacher=id(4),year=id(5),term=id(6),subject=id(7),schoolClass=id(8),student=id(9),assessment=id(10),score=id(11),session=id(12),admin=id(13),campaign=id(14),family=id(15),otherFamily=id(16),document=id(17);
  const root=()=>db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.sub','',false);");
  const asTeacher=()=>db.exec(`SELECT set_config('request.jwt.claim.sub','${user}',false); SET ROLE authenticated;`);
  try {
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('${user}'),('${admin}');
      INSERT INTO sekoly_schools(id,name,slug) VALUES ('${school}','École fictive','audit-ecole'),('${otherSchool}','Autre école fictive','audit-autre');
      INSERT INTO sekoly_memberships(school_id,user_id,role,status) VALUES ('${school}','${user}','TEACHER','ACTIVE'),('${school}','${admin}','SCHOOL_ADMIN','ACTIVE');
      INSERT INTO sekoly_school_years(id,school_id,label,start_date,end_date,status) VALUES ('${year}','${school}','2026-2027','2026-09-01','2027-06-30','ACTIVE');
      INSERT INTO sekoly_terms(id,school_id,school_year_id,code,label,start_date,end_date) VALUES ('${term}','${school}','${year}','T1','T1','2026-09-01','2026-12-31');
      INSERT INTO sekoly_subjects(id,school_id,code,name) VALUES ('${subject}','${school}','MAT','Maths');
      INSERT INTO sekoly_classes(id,school_id,school_year_id,code,name) VALUES ('${schoolClass}','${school}','${year}','C1','Classe fictive');
      INSERT INTO sekoly_students(id,school_id,matricule,last_name,first_name) VALUES ('${student}','${school}','TEST001','FICTIF','Élève');
      INSERT INTO sekoly_teachers(id,school_id,user_id,last_name,first_name) VALUES ('${teacher}','${school}','${user}','FICTIF','Prof');
      INSERT INTO sekoly_teacher_assignments(school_id,school_year_id,teacher_id,class_id,subject_id) VALUES ('${school}','${year}','${teacher}','${schoolClass}','${subject}');
      INSERT INTO sekoly_assessments(id,school_id,school_year_id,term_id,class_id,subject_id,teacher_id,title) VALUES ('${assessment}','${school}','${year}','${term}','${schoolClass}','${subject}','${teacher}','Devoir fictif');
      INSERT INTO sekoly_assessment_scores(id,school_id,assessment_id,student_id,score) VALUES ('${score}','${school}','${assessment}','${student}',16);
      INSERT INTO sekoly_attendance_sessions(id,school_id,school_year_id,class_id,subject_id,teacher_id,session_date) VALUES ('${session}','${school}','${year}','${schoolClass}','${subject}','${teacher}','2026-10-04');
      INSERT INTO sekoly_enrollment_campaigns(id,school_id,school_year_id,name,public_code) VALUES ('${campaign}','${school}','${year}','Campagne fictive','audit-fictive');
      INSERT INTO sekoly_enrollment_families(id,school_id,campaign_id,guardian_last_name,phone_primary,submission_token_hash,submission_token_expires_at) VALUES ('${family}','${school}','${campaign}','FICTIF','00000000','hash-fixture',now()+interval '2 hours');
    `);
    await t.test('un enseignant actif modifie uniquement sa propre note ouverte', async()=>{
      await asTeacher();
      const updated=await db.query(`UPDATE sekoly_assessment_scores SET score=17 WHERE id='${score}' RETURNING score`);
      assert.equal(Number((updated.rows[0] as any).score),17);
      await assert.rejects(db.query(`UPDATE sekoly_assessment_scores SET score=41 WHERE id='${score}'`));
      await assert.rejects(db.query(`UPDATE sekoly_assessment_scores SET school_id='${otherSchool}' WHERE id='${score}'`));
      await root();
    });
    await t.test('un verrou de période interdit les notes, les déplacements et les changements de barème',async()=>{
      await db.exec(`UPDATE sekoly_terms SET is_locked=true WHERE id='${term}'`);await asTeacher();
      await assert.rejects(db.query(`UPDATE sekoly_assessment_scores SET score=18 WHERE id='${score}'`),/verrouillée/);
      await assert.rejects(db.query(`UPDATE sekoly_assessments SET max_score=40 WHERE id='${assessment}'`),/verrouillée/);
      await root();await db.exec(`UPDATE sekoly_terms SET is_locked=false WHERE id='${term}'`);
    });
    await t.test('les verrous d’évaluation et d’année s’appliquent aux appels SQL directs',async()=>{
      await db.exec(`UPDATE sekoly_assessments SET is_locked=true WHERE id='${assessment}'`);await asTeacher();
      await assert.rejects(db.query(`UPDATE sekoly_assessment_scores SET score=18 WHERE id='${score}'`),/verrouillée/);
      await root();await db.exec(`UPDATE sekoly_assessments SET is_locked=false WHERE id='${assessment}'`);
      await db.exec(`UPDATE sekoly_school_years SET status='CLOSED' WHERE id='${year}'`);await asTeacher();
      await assert.rejects(db.query(`UPDATE sekoly_assessment_scores SET score=18 WHERE id='${score}'`),/verrouillée/);
      await root();await db.exec(`UPDATE sekoly_school_years SET status='ACTIVE' WHERE id='${year}'`);
    });
    await t.test('une adhésion suspendue ou un rôle modifié invalide les trois helpers enseignant',async()=>{
      for(const [status,role] of [['SUSPENDED','TEACHER'],['ACTIVE','ACCOUNTANT']]) {
        await db.exec(`UPDATE sekoly_memberships SET status='${status}',role='${role}' WHERE user_id='${user}'`);await asTeacher();
        const check=await db.query(`SELECT sekoly_private.is_teacher_for_assessment('${assessment}') AS assessment, sekoly_private.is_teacher_for_session('${session}') AS session, sekoly_private.is_teacher_for('${school}','${schoolClass}','${subject}') AS assignment`);
        assert.deepEqual(check.rows[0],{assessment:false,session:false,assignment:false});
        const result=await db.query(`UPDATE sekoly_assessment_scores SET score=18 WHERE id='${score}' RETURNING id`);assert.equal(result.rows.length,0);
        await root();
      }
      await db.exec(`UPDATE sekoly_memberships SET status='ACTIVE',role='TEACHER' WHERE user_id='${user}'`);
    });
    await t.test('un document anonyme possède une portée de demande et refuse les références croisées',async()=>{
      await db.exec(`INSERT INTO sekoly_enrollment_documents(id,school_id,enrollment_family_id,document_type,storage_path,original_name,mime_type,file_size) VALUES ('${document}','${school}','${family}','BIRTH_CERTIFICATE','fixture/document.pdf','document.pdf','application/pdf',100)`);
      const row=await db.query(`SELECT family_id,enrollment_family_id FROM sekoly_enrollment_documents WHERE id='${document}'`);
      assert.equal((row.rows[0] as any).family_id,null);assert.equal((row.rows[0] as any).enrollment_family_id,family);
      await assert.rejects(db.exec(`INSERT INTO sekoly_enrollment_documents(school_id,enrollment_family_id,document_type,storage_path,original_name,mime_type,file_size) VALUES ('${otherSchool}','${family}','OTHER','fixture/cross.pdf','cross.pdf','application/pdf',100)`));
      await assert.rejects(db.exec(`INSERT INTO sekoly_enrollment_documents(school_id,document_type,storage_path,original_name,mime_type,file_size) VALUES ('${school}','OTHER','fixture/no-scope.pdf','invalid.pdf','application/pdf',100)`));
    });
  } finally {await db.close();}
});
