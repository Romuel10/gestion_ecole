import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './support/serviceLoader.cjs';

function enrollmentFixture() {
  const school='00000000-0000-4000-8000-000000000001';
  const schema={fields:[],documents:[{code:'BIRTH_CERTIFICATE',label:'Acte de naissance',scope:'CHILD',visible:true}]};
  const tables:Record<string,any[]>={
    sekoly_enrollment_campaigns:[{id:'campaign',public_code:'fixture',school_id:school,school_year_id:'year',status:'OPEN',allow_new_admission:true,allow_re_registration:true,form_schema:schema}],
    sekoly_schools:[{id:school,name:'École fictive'}],sekoly_school_years:[{id:'year',label:'2026'}],sekoly_classes:[],
    sekoly_guardians:[{id:'victim',school_id:school,last_name:'VICTIME',phone_primary:'0340000000',cin_number:'123456'}],
    sekoly_families:[{id:'existing',school_id:school,display_name:'Famille victime',family_code:'FAM',status:'ACTIVE'}],
    sekoly_family_guardians:[],sekoly_family_portal_tokens:[],sekoly_enrollment_families:[],sekoly_enrollment_applications:[],sekoly_enrollment_documents:[],
    sekoly_memberships:[{school_id:school,user_id:'staff',role:'SCHOOL_ADMIN',status:'ACTIVE'}],
    sekoly_family_students:[],
  };
  const reads:string[]=[];let serial=0;
  class Query {
    name:string;filters:Array<(row:any)=>boolean>=[];operation='select';payload:any;singleRow=false;
    constructor(name:string){this.name=name;reads.push(name);}
    select(){return this;}eq(key:string,value:any){this.filters.push(row=>row[key]===value);return this;}
    is(key:string,value:any){this.filters.push(row=>(row[key]??null)===value);return this;}
    gt(key:string,value:any){this.filters.push(row=>row[key]>value);return this;}
    gte(key:string,value:any){this.filters.push(row=>row[key]>=value);return this;}
    in(key:string,value:any[]){this.filters.push(row=>value.includes(row[key]));return this;}
    not(key:string,operator:string,value:string){if(operator==='in'){const values=value.replace(/[()"]/g,'').split(',');this.filters.push(row=>!values.includes(row[key]));}return this;}
    order(){return this;}limit(){return this;}range(){return this;}
    insert(payload:any){this.operation='insert';this.payload=payload;return this;}
    update(payload:any){this.operation='update';this.payload=payload;return this;}
    upsert(payload:any){return this.insert(payload);}delete(){this.operation='delete';return this;}
    single(){this.singleRow=true;return this;}maybeSingle(){this.singleRow=true;return this;}
    execute(){
      let rows=tables[this.name]??=[];
      if(this.operation==='insert') {
        const added=(Array.isArray(this.payload)?this.payload:[this.payload]).map((row:any)=>({id:'generated-'+(++serial),reference_code:'REF'+serial,form_schema_snapshot:schema,...structuredClone(row)}));
        tables[this.name].push(...added);rows=added;
      } else {
        rows=rows.filter(row=>this.filters.every(filter=>filter(row)));
        if(this.operation==='update')rows.forEach(row=>Object.assign(row,structuredClone(this.payload)));
        if(this.operation==='delete')tables[this.name]=tables[this.name].filter(row=>!rows.includes(row));
      }
      return {data:this.singleRow?(rows[0]??null):rows,error:null};
    }
    then(resolve:any,reject:any){return Promise.resolve().then(()=>this.execute()).then(resolve,reject);}
  }
  const admin={from:(name:string)=>new Query(name),auth:{getUser:async(token:string)=>({data:{user:token==='staff-token'?{id:'staff'}:null},error:null})},storage:{from:()=>({upload:async()=>({data:{},error:null}),remove:async()=>({error:null})})}};
  let handler:(request:Request)=>Promise<Response>=async()=>Response.json({error:'not initialized'});
  createHarness({Deno:{env:{get:(key:string)=>key==='SUPABASE_URL'?'https://fixture.supabase.co':key==='SUPABASE_SERVICE_ROLE_KEY'?'fixture':undefined},serve:(callback:any)=>{handler=callback;}}}, {
    'jsr:@supabase/functions-js/edge-runtime.d.ts':{},'npm:@supabase/supabase-js@2':{createClient:()=>admin},'npm:qrcode@1.5.4':{toString:async()=>'<svg />'},
  }).load('supabase/functions/sekoly-public-enrollment/index.ts');
  const post=(body:any,query='code=fixture',token?:string)=>handler(new Request('https://fixture.supabase.co/enrollment?'+query,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)}));
  const body={code:'fixture',guardian:{lastName:'VICTIME',firstName:'Autre',phonePrimary:'0340000000',cinNumber:'123456'},children:[{lastName:'FICTIF',firstName:'Élève',type:'NEW'}]};
  return {school,tables,reads,handler,post,body};
}

test('demande anonyme avec nom, téléphone et CIN existants : aucun profil modifié ni jeton portail',async()=>{
  const f=enrollmentFixture();const before=JSON.stringify(f.tables.sekoly_guardians);
  const response=await f.post(f.body);const result=await response.json();
  assert.equal(response.status,201,JSON.stringify(result));assert.equal(result.familyToken,null);assert.equal(result.portalUrl,null);assert.equal(result.familyCode,null);assert.ok(result.submissionToken.length>=32);
  assert.equal(JSON.stringify(f.tables.sekoly_guardians),before);assert.equal(f.tables.sekoly_family_portal_tokens.length,0);
  assert.equal(f.tables.sekoly_enrollment_families[0].family_profile_id,null);
  assert.equal(f.reads.includes('sekoly_guardians'),false);assert.equal(f.reads.includes('sekoly_families'),false);
});

test('la capacité de dépôt ne donne pas accès au portail et refuse le dossier d’une autre demande',async()=>{
  const f=enrollmentFixture();const result=await(await f.post(f.body)).json();
  const portal=await f.handler(new Request('https://fixture.supabase.co/enrollment?action=portal-bootstrap&portal='+result.submissionToken));assert.equal(portal.status,404);
  const requestFamily=f.tables.sekoly_enrollment_families[0];const child=f.tables.sekoly_enrollment_applications[0];
  const upload=async(applicationId:string)=>{
    const form=new FormData();form.set('file',new File(['%PDF-1.7 fictif'],'acte.pdf',{type:'application/pdf'}));form.set('documentCode','BIRTH_CERTIFICATE');form.set('applicationId',applicationId);
    return f.handler(new Request('https://fixture.supabase.co/enrollment?action=upload&submission='+result.submissionToken,{method:'POST',body:form}));
  };
  assert.equal((await upload(child.id)).status,201);assert.equal(f.tables.sekoly_enrollment_documents[0].enrollment_family_id,requestFamily.id);assert.equal(f.tables.sekoly_enrollment_documents[0].family_id,null);
  f.tables.sekoly_enrollment_families.push({id:'foreign',school_id:f.school,family_profile_id:'existing'});
  f.tables.sekoly_enrollment_applications.push({id:'foreign-child',school_id:f.school,family_id:'foreign',status:'TO_CONTACT',form_schema_snapshot:child.form_schema_snapshot});
  assert.equal((await upload('foreign-child')).status,403);
  requestFamily.submission_token_expires_at='2000-01-01T00:00:00Z';assert.equal((await upload(child.id)).status,401);
});

test('un lien familial invalide ne retombe jamais sur la correspondance nom/téléphone',async()=>{
  const f=enrollmentFixture();const response=await f.post({...f.body,familyToken:'invalid-but-long-enough-to-pass-format'});assert.equal(response.status,401,await response.text());
  assert.equal(f.tables.sekoly_enrollment_families.length,0);assert.equal(f.tables.sekoly_guardians[0].last_name,'VICTIME');
});

test('création du portail : personnel actif, identité vérifiée et rattachement scolaire requis',async()=>{
  const f=enrollmentFixture();const submission=await(await f.post(f.body)).json();const requestFamily=f.tables.sekoly_enrollment_families[0];
  const body={schoolId:f.school,enrollmentFamilyId:requestFamily.id,identityVerified:true};
  assert.equal((await f.post(body,'action=authorize-family')).status,401);
  assert.equal((await f.post({...body,identityVerified:false},'action=authorize-family','staff-token')).status,400);
  assert.equal((await f.post(body,'action=authorize-family','staff-token')).status,409);
  f.tables.sekoly_enrollment_applications[0].status='APPROVED';f.tables.sekoly_enrollment_applications[0].final_student_id='student';f.tables.sekoly_family_students.push({school_id:f.school,student_id:'student',family_id:'existing'});
  const response=await f.post(body,'action=authorize-family','staff-token');const result=await response.json();assert.equal(response.status,200);assert.match(result.portalUrl,/portal=/);
  assert.equal(f.tables.sekoly_family_portal_tokens[0].authorized_by,'staff');assert.equal(requestFamily.family_profile_id,'existing');
  f.tables.sekoly_memberships[0].status='SUSPENDED';assert.equal((await f.post(body,'action=authorize-family','staff-token')).status,403);
});
