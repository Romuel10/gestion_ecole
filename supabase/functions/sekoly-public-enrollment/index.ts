import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function envKey(name: string, legacyName: string) {
  const modern = Deno.env.get(name);
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (parsed.default) return parsed.default as string;
    } catch {}
  }
  return Deno.env.get(legacyName) ?? "";
}

function clean(value: unknown, max = 250) {
  return String(value ?? "").trim().slice(0, max);
}

function nullable(value: unknown, max = 250) {
  const normalized = clean(value, max);
  return normalized || null;
}

function htmlEscape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

const ENROLLMENT_BUCKET = "sekoly-enrollment-documents";
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function randomPortalToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hashPortalToken(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "document";
}

async function familyFromToken(admin: any, token: string) {
  if (!token || token.length < 24) return null;
  const tokenHash = await hashPortalToken(token);
  const { data: tokenRow, error } = await admin
    .from("sekoly_family_portal_tokens")
    .select("id,school_id,family_id,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!tokenRow) return null;

  await admin
    .from("sekoly_family_portal_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  const { data: family, error: familyError } = await admin
    .from("sekoly_families")
    .select("*")
    .eq("id", tokenRow.family_id)
    .eq("school_id", tokenRow.school_id)
    .single();
  if (familyError) throw familyError;

  const { data: links, error: linksError } = await admin
    .from("sekoly_family_guardians")
    .select("guardian_id,relationship,is_primary")
    .eq("school_id", family.school_id)
    .eq("family_id", family.id);
  if (linksError) throw linksError;

  const guardianIds = (links ?? []).map((item: any) => item.guardian_id);
  let guardians: any[] = [];
  if (guardianIds.length > 0) {
    const { data, error: guardiansError } = await admin
      .from("sekoly_guardians")
      .select("*")
      .eq("school_id", family.school_id)
      .in("id", guardianIds);
    if (guardiansError) throw guardiansError;
    guardians = data ?? [];
  }

  const primaryLink =
    (links ?? []).find((item: any) => item.is_primary) ?? (links ?? [])[0] ?? null;
  const primaryGuardian = primaryLink
    ? guardians.find((item: any) => item.id === primaryLink.guardian_id) ?? null
    : null;

  return { tokenRow, family, links: links ?? [], guardians, primaryGuardian };
}

async function issuePortalToken(admin: any, schoolId: string, familyId: string) {
  const token = randomPortalToken();
  const tokenHash = await hashPortalToken(token);
  const { error } = await admin.from("sekoly_family_portal_tokens").insert({
    school_id: schoolId,
    family_id: familyId,
    token_hash: tokenHash,
    label: "Portail famille",
    expires_at: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;
  return token;
}

async function findOrCreatePersistentFamily(
  admin: any,
  schoolId: string,
  guardian: any,
) {
  const cinNumber = nullable(guardian.cinNumber, 80);
  const phonePrimary = clean(guardian.phonePrimary, 40);
  const lastName = clean(guardian.lastName, 120).toUpperCase();
  const firstName = clean(guardian.firstName, 120);

  let guardianRow: any = null;
  if (cinNumber) {
    const { data } = await admin
      .from("sekoly_guardians")
      .select("*")
      .eq("school_id", schoolId)
      .ilike("cin_number", cinNumber)
      .maybeSingle();
    guardianRow = data;
  }
  if (!guardianRow && phonePrimary) {
    const { data } = await admin
      .from("sekoly_guardians")
      .select("*")
      .eq("school_id", schoolId)
      .eq("phone_primary", phonePrimary)
      .ilike("last_name", lastName)
      .limit(1);
    guardianRow = data?.[0] ?? null;
  }

  const guardianValues = {
    last_name: lastName,
    first_name: firstName,
    phone_primary: phonePrimary,
    phone_secondary: nullable(guardian.phoneSecondary, 40),
    email: nullable(guardian.email, 160)?.toLowerCase() ?? null,
    cin_number: cinNumber,
    cin_issued_at: nullable(guardian.cinIssuedAt, 10),
    cin_issue_place: nullable(guardian.cinIssuePlace, 160),
    occupation: nullable(guardian.occupation, 160),
    address: nullable(guardian.address, 250),
    city: nullable(guardian.city, 120),
    status: "ACTIVE",
  };

  if (guardianRow) {
    const { data, error } = await admin
      .from("sekoly_guardians")
      .update(guardianValues)
      .eq("id", guardianRow.id)
      .select("*")
      .single();
    if (error) throw error;
    guardianRow = data;
  } else {
    const { data, error } = await admin
      .from("sekoly_guardians")
      .insert({ school_id: schoolId, ...guardianValues })
      .select("*")
      .single();
    if (error) throw error;
    guardianRow = data;
  }

  const { data: existingLinks, error: linkLookupError } = await admin
    .from("sekoly_family_guardians")
    .select("family_id")
    .eq("school_id", schoolId)
    .eq("guardian_id", guardianRow.id)
    .limit(1);
  if (linkLookupError) throw linkLookupError;

  let family: any = null;
  if (existingLinks?.[0]) {
    const { data, error } = await admin
      .from("sekoly_families")
      .select("*")
      .eq("school_id", schoolId)
      .eq("id", existingLinks[0].family_id)
      .maybeSingle();
    if (error) throw error;
    family = data;
  }

  if (!family) {
    const { data, error } = await admin
      .from("sekoly_families")
      .insert({
        school_id: schoolId,
        display_name: "Famille " + lastName,
        address: nullable(guardian.address, 250),
        city: nullable(guardian.city, 120),
        status: "ACTIVE",
      })
      .select("*")
      .single();
    if (error) throw error;
    family = data;

    const relationship = ["FATHER", "MOTHER", "GUARDIAN", "OTHER"].includes(
      clean(guardian.relationship, 20),
    )
      ? clean(guardian.relationship, 20)
      : "GUARDIAN";

    const { error: linkError } = await admin
      .from("sekoly_family_guardians")
      .insert({
        school_id: schoolId,
        family_id: family.id,
        guardian_id: guardianRow.id,
        is_primary: true,
        relationship,
      });
    if (linkError) throw linkError;
  }

  return { family, guardian: guardianRow };
}

async function uploadEnrollmentDocument(
  admin: any,
  req: Request,
  familyToken: string,
) {
  const access = await familyFromToken(admin, familyToken);
  if (!access) return jsonResponse({ error: "Lien famille invalide ou expiré." }, 401);

  const form = await req.formData();
  const file = form.get("file");
  const applicationId = clean(form.get("applicationId"), 64);
  const documentType = clean(form.get("documentType"), 40);

  if (!(file instanceof File)) {
    return jsonResponse({ error: "Fichier manquant." }, 400);
  }
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return jsonResponse({ error: "Format non autorisé : PDF, JPG, PNG ou WEBP uniquement." }, 400);
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    return jsonResponse({ error: "Le fichier doit faire moins de 10 Mo." }, 400);
  }

  const allowedDocumentTypes = [
    "CIN_FATHER","CIN_MOTHER","CIN_GUARDIAN","BIRTH_CERTIFICATE",
    "RESIDENCE_CERTIFICATE","STUDENT_PHOTO","TRANSFER_CERTIFICATE",
    "REPORT_CARD","VACCINATION_RECORD","OTHER",
  ];
  if (!allowedDocumentTypes.includes(documentType)) {
    return jsonResponse({ error: "Type de document invalide." }, 400);
  }

  let application: any = null;
  if (applicationId) {
    const { data, error } = await admin
      .from("sekoly_enrollment_applications")
      .select("id,school_id,family_id")
      .eq("id", applicationId)
      .eq("school_id", access.family.school_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return jsonResponse({ error: "Dossier enfant introuvable." }, 404);

    const { data: campaignFamily } = await admin
      .from("sekoly_enrollment_families")
      .select("id,family_profile_id")
      .eq("id", data.family_id)
      .maybeSingle();
    if (!campaignFamily || campaignFamily.family_profile_id !== access.family.id) {
      return jsonResponse({ error: "Ce dossier ne correspond pas à votre famille." }, 403);
    }
    application = data;
  }

  const objectId = crypto.randomUUID();
  const storagePath =
    access.family.school_id + "/" +
    access.family.id + "/" +
    (applicationId || "family") + "/" +
    objectId + "_" + safeFilename(file.name);

  const { error: uploadError } = await admin.storage
    .from(ENROLLMENT_BUCKET)
    .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  const { data: document, error: docError } = await admin
    .from("sekoly_enrollment_documents")
    .insert({
      school_id: access.family.school_id,
      family_id: access.family.id,
      application_id: application?.id ?? null,
      guardian_id: documentType.startsWith("CIN_")
        ? access.primaryGuardian?.id ?? null
        : null,
      document_type: documentType,
      storage_path: storagePath,
      original_name: file.name.slice(0, 250),
      mime_type: file.type,
      file_size: file.size,
      status: "UPLOADED",
      uploaded_by_family: true,
    })
    .select("id,status,document_type,original_name")
    .single();

  if (docError) {
    await admin.storage.from(ENROLLMENT_BUCKET).remove([storagePath]);
    throw docError;
  }

  const checklistMap: Record<string, string> = {
    BIRTH_CERTIFICATE: "BIRTH_CERTIFICATE",
    RESIDENCE_CERTIFICATE: "RESIDENCE",
    STUDENT_PHOTO: "STUDENT_PHOTO",
    TRANSFER_CERTIFICATE: "TRANSFER",
    REPORT_CARD: "REPORT_CARD",
    CIN_FATHER: "CIN_PRIMARY",
    CIN_MOTHER: "CIN_PRIMARY",
    CIN_GUARDIAN: "CIN_PRIMARY",
  };
  const checklistCode = checklistMap[documentType];
  if (application?.id && checklistCode) {
    await admin
      .from("sekoly_enrollment_checklist_items")
      .update({
        status: "PROVIDED",
        document_id: document.id,
        note: "Document transmis par la famille.",
      })
      .eq("application_id", application.id)
      .eq("code", checklistCode);
  }

  return jsonResponse({ ok: true, document }, 201);
}

async function loadCampaign(admin: any, publicCode: string) {
  const { data: campaign, error } = await admin
    .from("sekoly_enrollment_campaigns")
    .select("id,school_id,school_year_id,name,status,allow_new_admission,allow_re_registration,instructions,opens_at,closes_at")
    .eq("public_code", publicCode)
    .eq("status", "OPEN")
    .maybeSingle();

  if (error) throw error;
  if (!campaign) return null;

  const now = Date.now();
  if (campaign.opens_at && new Date(campaign.opens_at).getTime() > now) return null;
  if (campaign.closes_at && new Date(campaign.closes_at).getTime() < now) return null;

  const [{ data: school, error: schoolError }, { data: year, error: yearError }, { data: classes, error: classError }] =
    await Promise.all([
      admin
        .from("sekoly_schools")
        .select("id,name,acronym,city,logo_url")
        .eq("id", campaign.school_id)
        .single(),
      admin
        .from("sekoly_school_years")
        .select("id,label")
        .eq("id", campaign.school_year_id)
        .single(),
      admin
        .from("sekoly_classes")
        .select("id,name,code,level,series,capacity")
        .eq("school_id", campaign.school_id)
        .eq("school_year_id", campaign.school_year_id)
        .order("name"),
    ]);

  if (schoolError) throw schoolError;
  if (yearError) throw yearError;
  if (classError) throw classError;

  return { campaign, school, year, classes: classes ?? [] };
}

function renderPage(ctx: any, publicCode: string) {
  const classOptions = ctx.classes
    .map(
      (item: any) =>
        `<option value="${htmlEscape(item.id)}">${htmlEscape(item.name)}${item.series ? ` — ${htmlEscape(item.series)}` : ""}</option>`,
    )
    .join("");

  const allowedTypes = [
    ctx.campaign.allow_new_admission
      ? '<option value="NEW">Nouvelle inscription</option>'
      : "",
    ctx.campaign.allow_re_registration
      ? '<option value="RE_REGISTRATION">Réinscription</option>'
      : "",
  ].join("");

  const instructions = ctx.campaign.instructions
    ? `<div class="notice">${htmlEscape(ctx.campaign.instructions)}</div>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Préinscription — ${htmlEscape(ctx.school.name)}</title>
<style>
:root{color-scheme:light;--bg:#f4f7f8;--card:#fff;--ink:#17212b;--muted:#667581;--line:#d7e0e4;--brand:#173f49;--accent:#2f7a54;--danger:#b94141}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif}
.shell{max-width:860px;margin:auto;padding:24px 16px 64px}.hero{padding:24px;border-radius:22px;background:linear-gradient(145deg,#173f49,#245c68);color:white;box-shadow:0 14px 40px rgba(23,63,73,.16)}
.brand{font-weight:900;letter-spacing:.16em;font-size:12px}.hero h1{margin:10px 0 4px;font-size:26px}.hero p{margin:0;color:#d5e3e6}.badge{display:inline-block;margin-top:14px;padding:6px 10px;border:1px solid rgba(255,255,255,.25);border-radius:999px;font-size:12px}
.card{margin-top:16px;padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 6px 20px rgba(16,36,43,.05)}
h2{margin:0 0 14px;font-size:15px}h3{margin:0 0 12px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.span2{grid-column:span 2}
label{display:block;font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
input,select,textarea{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:white;color:var(--ink);font:inherit}
textarea{min-height:76px;resize:vertical}.child{margin-top:12px;padding:16px;border:1px solid var(--line);border-radius:14px;background:#fbfcfc}.child-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
button{border:0;border-radius:11px;padding:11px 14px;font-weight:800;cursor:pointer}.primary{width:100%;margin-top:16px;background:var(--brand);color:white;min-height:48px}.secondary{background:#edf4f2;color:var(--accent)}.remove{background:#fbeeee;color:var(--danger);font-size:11px;padding:7px 9px}
.notice{margin-top:16px;padding:12px 14px;border-left:4px solid var(--accent);background:#edf6f2;border-radius:8px;font-size:13px}.fine{font-size:12px;color:var(--muted);line-height:1.5}
.success{display:none;text-align:center;padding:28px}.success strong{display:block;font-size:22px;margin:8px}.honeypot{position:absolute;left:-9999px}
@media(max-width:640px){.shell{padding-top:12px}.hero{padding:20px}.hero h1{font-size:21px}.grid{grid-template-columns:1fr}.span2{grid-column:auto}.card{padding:16px}}
</style>
</head>
<body>
<main class="shell">
<section class="hero">
<div class="brand">SEKOLY</div>
<h1>${htmlEscape(ctx.school.name)}</h1>
<p>Préinscription en ligne · Année scolaire ${htmlEscape(ctx.year.label)}</p>
<div class="badge">${htmlEscape(ctx.campaign.name)}</div>
</section>
${instructions}
<form id="form">
<section class="card">
<h2>Responsable familial</h2>
<div class="grid">
<div><label>Nom *</label><input name="guardianLastName" required maxlength="120"></div>
<div><label>Prénoms</label><input name="guardianFirstName" maxlength="120"></div>
<div><label>Lien avec l'enfant *</label><select name="relationship"><option value="FATHER">Père</option><option value="MOTHER">Mère</option><option value="GUARDIAN">Tuteur / responsable légal</option><option value="OTHER">Autre</option></select></div>
<div><label>Téléphone principal *</label><input name="phonePrimary" required maxlength="40" inputmode="tel"></div>
<div><label>Deuxième téléphone</label><input name="phoneSecondary" maxlength="40" inputmode="tel"></div>
<div><label>Email</label><input name="email" type="email" maxlength="160"></div>
<div><label>N° CIN</label><input name="cinNumber" maxlength="80"></div>
<div><label>Date CIN</label><input name="cinIssuedAt" type="date"></div>
<div><label>Lieu de délivrance CIN</label><input name="cinIssuePlace" maxlength="160"></div>
<div><label>Profession</label><input name="occupation" maxlength="160"></div>
<div class="span2"><label>Adresse</label><input name="address" maxlength="250"></div>
<div><label>Ville / Commune</label><input name="city" maxlength="120"></div>
<div><label>Contact préféré</label><select name="preferredContact"><option value="PHONE">Appel</option><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">Email</option></select></div>
<div class="honeypot"><label>Site</label><input name="website" autocomplete="off"></div>
</div>
</section>

<section class="card">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
<div><h2 style="margin-bottom:4px">Enfant(s)</h2><div class="fine">Un même parent peut envoyer plusieurs dossiers en une seule fois.</div></div>
<button class="secondary" type="button" id="addChild">+ Ajouter un enfant</button>
</div>
<div id="children"></div>
</section>

<section class="card">
<p class="fine">L'envoi de ce formulaire ne vaut pas inscription définitive. L'établissement vérifie le dossier, contacte la famille, puis un responsable confirme ou refuse l'inscription dans Sekoly.</p>
<button class="primary" id="submitBtn" type="submit">Envoyer la demande</button>
</section>
</form>

<section class="card success" id="success">
<div style="font-size:42px">✓</div>
<h2>Demande transmise</h2>
<p>Votre référence familiale est :</p>
<strong id="reference"></strong>
<p class="fine">Conservez cette référence. L'établissement vous contactera avant toute inscription définitive.</p>
</section>
</main>
<script>
const PUBLIC_CODE=${JSON.stringify(publicCode)};
const CLASS_OPTIONS=${JSON.stringify(classOptions)};
const TYPE_OPTIONS=${JSON.stringify(allowedTypes)};
let childCount=0;
const children=document.getElementById('children');
function childTemplate(index){
  return '<div class="child" data-child>' +
    '<div class="child-head"><h3>Enfant '+(index+1)+'</h3><button type="button" class="remove" data-remove>Retirer</button></div>' +
    '<div class="grid">' +
      '<div><label>Type *</label><select data-field="type">'+TYPE_OPTIONS+'</select></div>' +
      '<div><label>Matricule actuel (si réinscription)</label><input data-field="existingMatricule" maxlength="80"></div>' +
      '<div><label>Nom *</label><input data-field="lastName" required maxlength="120"></div>' +
      '<div><label>Prénoms *</label><input data-field="firstName" required maxlength="160"></div>' +
      '<div><label>Sexe</label><select data-field="gender"><option value="M">Masculin</option><option value="F">Féminin</option></select></div>' +
      '<div><label>Date de naissance</label><input data-field="birthDate" type="date"></div>' +
      '<div><label>Lieu de naissance</label><input data-field="birthPlace" maxlength="180"></div>' +
      '<div><label>Nationalité</label><input data-field="nationality" value="Malgache" maxlength="80"></div>' +
      '<div><label>Classe souhaitée</label><select data-field="desiredClassId"><option value="">À déterminer avec l\'école</option>'+CLASS_OPTIONS+'</select></div>' +
      '<div><label>Ancien établissement</label><input data-field="previousSchool" maxlength="180"></div>' +
      '<div><label>N° acte de naissance</label><input data-field="birthCertificateNumber" maxlength="100"></div>' +
      '<div><label>Date acte</label><input data-field="birthCertificateDate" type="date"></div>' +
      '<div><label>Lieu acte</label><input data-field="birthCertificatePlace" maxlength="180"></div>' +
      '<div><label>Groupe sanguin</label><input data-field="bloodType" maxlength="20"></div>' +
      '<div class="span2"><label>Adresse de l\'enfant si différente</label><input data-field="address" maxlength="250"></div>' +
      '<div><label>Fokontany / quartier</label><input data-field="neighborhood" maxlength="120"></div>' +
      '<div><label>Ville / Commune</label><input data-field="city" maxlength="120"></div>' +
      '<div class="span2"><label>Informations utiles / médicales (facultatif)</label><textarea data-field="medicalNotes" maxlength="1000"></textarea></div>' +
    '</div>' +
  '</div>';
}
function addChild(){
  if(document.querySelectorAll('[data-child]').length>=10)return;
  children.insertAdjacentHTML('beforeend',childTemplate(childCount++));
  const blocks=[...document.querySelectorAll('[data-child]')];
  blocks.forEach((block,i)=>block.querySelector('h3').textContent='Enfant '+(i+1));
}
children.addEventListener('click',e=>{
  const btn=e.target.closest('[data-remove]');
  if(!btn)return;
  if(document.querySelectorAll('[data-child]').length===1)return;
  btn.closest('[data-child]').remove();
  [...document.querySelectorAll('[data-child]')].forEach((block,i)=>block.querySelector('h3').textContent='Enfant '+(i+1));
});
document.getElementById('addChild').addEventListener('click',addChild);
addChild();

document.getElementById('form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const form=e.currentTarget;
  const fd=new FormData(form);
  if(String(fd.get('website')||'').trim()) return;
  const childBlocks=[...document.querySelectorAll('[data-child]')];
  const childrenPayload=childBlocks.map(block=>{
    const get=name=>block.querySelector('[data-field="'+name+'"]').value.trim();
    return {
      type:get('type'),existingMatricule:get('existingMatricule'),
      lastName:get('lastName'),firstName:get('firstName'),gender:get('gender'),
      birthDate:get('birthDate'),birthPlace:get('birthPlace'),nationality:get('nationality'),
      desiredClassId:get('desiredClassId'),previousSchool:get('previousSchool'),
      birthCertificateNumber:get('birthCertificateNumber'),
      birthCertificateDate:get('birthCertificateDate'),
      birthCertificatePlace:get('birthCertificatePlace'),
      bloodType:get('bloodType'),address:get('address'),
      neighborhood:get('neighborhood'),city:get('city'),medicalNotes:get('medicalNotes')
    };
  });
  if(childrenPayload.some(c=>!c.lastName||!c.firstName)){alert('Nom et prénoms sont obligatoires pour chaque enfant.');return;}
  const button=document.getElementById('submitBtn');button.disabled=true;button.textContent='Envoi…';
  try{
    const response=await fetch(location.pathname+'?code='+encodeURIComponent(PUBLIC_CODE),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        code:PUBLIC_CODE,
        clientRequestId:crypto.randomUUID(),
        guardian:{
          lastName:String(fd.get('guardianLastName')||''),firstName:String(fd.get('guardianFirstName')||''),
          relationship:String(fd.get('relationship')||'GUARDIAN'),phonePrimary:String(fd.get('phonePrimary')||''),
          phoneSecondary:String(fd.get('phoneSecondary')||''),email:String(fd.get('email')||''),
          cinNumber:String(fd.get('cinNumber')||''),cinIssuedAt:String(fd.get('cinIssuedAt')||''),
          cinIssuePlace:String(fd.get('cinIssuePlace')||''),occupation:String(fd.get('occupation')||''),
          address:String(fd.get('address')||''),city:String(fd.get('city')||''),
          preferredContact:String(fd.get('preferredContact')||'PHONE')
        },
        children:childrenPayload
      })
    });
    const result=await response.json();
    if(!response.ok) throw new Error(result.error||'Envoi impossible.');
    form.style.display='none';document.getElementById('reference').textContent=result.referenceCode;document.getElementById('success').style.display='block';
  }catch(err){alert(err.message||'Envoi impossible.');button.disabled=false;button.textContent='Envoyer la demande';}
});
</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !secret) throw new Error("Configuration serveur incomplète.");

    const admin = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (url.searchParams.get("action") === "upload" && req.method === "POST") {
      return await uploadEnrollmentDocument(
        admin,
        req,
        clean(url.searchParams.get("family"), 160),
      );
    }

    const publicCode = clean(url.searchParams.get("code"), 64);
    if (!publicCode) return jsonResponse({ error: "Code d'inscription manquant." }, 400);

    const context = await loadCampaign(admin, publicCode);
    if (!context) {
      if (req.method === "GET") {
        return new Response("<!doctype html><meta charset=utf-8><title>Inscriptions fermées</title><body style='font-family:system-ui;padding:40px'><h1>Inscriptions indisponibles</h1><p>Cette campagne est fermée ou le lien n'est plus valide.</p></body>", {
          status: 404,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      return jsonResponse({ error: "Campagne fermée ou lien invalide." }, 404);
    }

    if (req.method === "GET") {
      if (url.searchParams.get("format") === "qr") {
        const target = new URL(req.url);
        target.searchParams.delete("format");
        const svg = await QRCode.toString(target.toString(), {
          type: "svg",
          width: 360,
          margin: 2,
          color: { dark: "#173f49", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        return new Response(svg, {
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300",
          },
        });
      }

      return new Response(renderPage(context, publicCode), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "DENY",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Content-Security-Policy":
            "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' https://*.supabase.co; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        },
      });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Méthode non autorisée." }, 405);
    }

    const body = await req.json();
    if (clean(body.code, 64) !== publicCode) {
      return jsonResponse({ error: "Code de campagne invalide." }, 400);
    }

    const guardian = body.guardian ?? {};
    const children = Array.isArray(body.children) ? body.children.slice(0, 10) : [];
    const guardianLastName = clean(guardian.lastName, 120);
    const guardianFirstName = clean(guardian.firstName, 120);
    const phonePrimary = clean(guardian.phonePrimary, 40);

    if (guardianLastName.length < 2 || phonePrimary.length < 6) {
      return jsonResponse({ error: "Nom et téléphone du responsable sont obligatoires." }, 400);
    }
    if (children.length === 0) {
      return jsonResponse({ error: "Ajoutez au moins un enfant." }, 400);
    }

    const allowedClasses = new Set((context.classes ?? []).map((item: any) => item.id));
    const allowedTypes = new Set<string>();
    if (context.campaign.allow_new_admission) allowedTypes.add("NEW");
    if (context.campaign.allow_re_registration) allowedTypes.add("RE_REGISTRATION");

    const normalizedChildren = children.map((child: any) => {
      const applicationType = clean(child.type, 32) || "NEW";
      const lastName = clean(child.lastName, 120);
      const firstName = clean(child.firstName, 160);
      if (!allowedTypes.has(applicationType)) throw new Error("Type d'inscription non autorisé.");
      if (lastName.length < 1 || firstName.length < 1) throw new Error("Nom et prénoms de chaque enfant sont obligatoires.");
      const desiredClassId = clean(child.desiredClassId, 64);
      if (desiredClassId && !allowedClasses.has(desiredClassId)) throw new Error("Classe souhaitée invalide.");
      const existingMatricule = nullable(child.existingMatricule, 80);
      if (applicationType === "RE_REGISTRATION" && !existingMatricule) {
        throw new Error("Le matricule est obligatoire pour une réinscription.");
      }
      return {
        application_type: applicationType,
        existing_matricule: existingMatricule,
        desired_class_id: desiredClassId || null,
        child_last_name: lastName.toUpperCase(),
        child_first_name: firstName,
        child_gender: ["M", "F"].includes(clean(child.gender, 1)) ? clean(child.gender, 1) : null,
        child_birth_date: nullable(child.birthDate, 10),
        child_birth_place: nullable(child.birthPlace, 180),
        child_nationality: nullable(child.nationality, 80) ?? "Malgache",
        child_address: nullable(child.address, 250),
        child_neighborhood: nullable(child.neighborhood, 120),
        child_city: nullable(child.city, 120),
        previous_school: nullable(child.previousSchool, 180),
        birth_certificate_number: nullable(child.birthCertificateNumber, 100),
        birth_certificate_date: nullable(child.birthCertificateDate, 10),
        birth_certificate_place: nullable(child.birthCertificatePlace, 180),
        blood_type: nullable(child.bloodType, 20),
        medical_notes: nullable(child.medicalNotes, 1000),
      };
    });

    const rateLimitSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentFamilyCount, error: rateError } = await admin
      .from("sekoly_enrollment_families")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", context.campaign.id)
      .eq("phone_primary", phonePrimary)
      .gte("submitted_at", rateLimitSince);

    if (rateError) throw rateError;
    if ((recentFamilyCount ?? 0) >= 5) {
      return jsonResponse(
        { error: "Trop de demandes ont été envoyées avec ce numéro. Réessayez plus tard ou contactez directement l’établissement." },
        429,
      );
    }

    const clientRequestId = clean(body.clientRequestId, 64);
    if (clientRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
      return jsonResponse({ error: "Identifiant de demande invalide." }, 400);
    }
    if (clientRequestId) {
      const { data: duplicate } = await admin
        .from("sekoly_enrollment_families")
        .select("id,reference_code")
        .eq("campaign_id", context.campaign.id)
        .eq("client_request_id", clientRequestId)
        .maybeSingle();
      if (duplicate) {
        return jsonResponse({ ok: true, referenceCode: duplicate.reference_code, duplicate: true });
      }
    }

    const persistent = await findOrCreatePersistentFamily(
      admin,
      context.campaign.school_id,
      guardian,
    );

    const { data: family, error: familyError } = await admin
      .from("sekoly_enrollment_families")
      .insert({
        school_id: context.campaign.school_id,
        campaign_id: context.campaign.id,
        family_profile_id: persistent.family.id,
        guardian_last_name: guardianLastName.toUpperCase(),
        guardian_first_name: guardianFirstName,
        relationship: ["FATHER", "MOTHER", "GUARDIAN", "OTHER"].includes(clean(guardian.relationship, 20))
          ? clean(guardian.relationship, 20)
          : "GUARDIAN",
        phone_primary: phonePrimary,
        phone_secondary: nullable(guardian.phoneSecondary, 40),
        email: nullable(guardian.email, 160)?.toLowerCase() ?? null,
        cin_number: nullable(guardian.cinNumber, 80),
        cin_issued_at: nullable(guardian.cinIssuedAt, 10),
        cin_issue_place: nullable(guardian.cinIssuePlace, 160),
        occupation: nullable(guardian.occupation, 160),
        address: nullable(guardian.address, 250),
        city: nullable(guardian.city, 120),
        preferred_contact: ["PHONE", "SMS", "EMAIL", "WHATSAPP"].includes(clean(guardian.preferredContact, 20))
          ? clean(guardian.preferredContact, 20)
          : "PHONE",
        client_request_id: clientRequestId || null,
      })
      .select("id,reference_code")
      .single();

    if (familyError) throw familyError;

    const { data: applications, error: appError } = await admin
      .from("sekoly_enrollment_applications")
      .insert(
        normalizedChildren.map((child: any) => ({
          ...child,
          school_id: context.campaign.school_id,
          campaign_id: context.campaign.id,
          family_id: family.id,
          status: "TO_CONTACT",
        })),
      )
      .select("id,child_last_name,child_first_name,application_type");

    if (appError) {
      await admin.from("sekoly_enrollment_families").delete().eq("id", family.id);
      throw appError;
    }

    const familyToken = await issuePortalToken(
      admin,
      context.campaign.school_id,
      persistent.family.id,
    );
    const portalUrl =
      url.origin +
      url.pathname +
      "?portal=" +
      encodeURIComponent(familyToken);

    return jsonResponse({
      ok: true,
      referenceCode: family.reference_code,
      familyCode: persistent.family.family_code,
      familyToken,
      portalUrl,
      applications: applications ?? [],
      children: normalizedChildren.length,
    }, 201);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erreur serveur." },
      400,
    );
  }
});
