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

function publicEnrollmentEndpoint(supabaseUrl: string) {
  return supabaseUrl.replace(/\/+$/, "") + "/functions/v1/sekoly-public-enrollment";
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
  forcedFamilyId?: string,
  forcedGuardianId?: string,
) {
  const cinNumber = nullable(guardian.cinNumber, 80);
  const phonePrimary = clean(guardian.phonePrimary, 40);
  const lastName = clean(guardian.lastName, 120).toUpperCase();
  const firstName = clean(guardian.firstName, 120);

  let guardianRow: any = null;
  if (forcedGuardianId) {
    const { data, error } = await admin
      .from("sekoly_guardians")
      .select("*")
      .eq("school_id", schoolId)
      .eq("id", forcedGuardianId)
      .maybeSingle();
    if (error) throw error;
    guardianRow = data;
  }
  if (!guardianRow && cinNumber) {
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
  if (forcedFamilyId) {
    const { data, error } = await admin
      .from("sekoly_families")
      .select("*")
      .eq("school_id", schoolId)
      .eq("id", forcedFamilyId)
      .maybeSingle();
    if (error) throw error;
    family = data;
  }
  if (!family && existingLinks?.[0]) {
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

  const primaryRelationship = ["FATHER", "MOTHER", "GUARDIAN", "OTHER"].includes(
    clean(guardian.relationship, 20),
  )
    ? clean(guardian.relationship, 20)
    : "GUARDIAN";

  await admin
    .from("sekoly_family_guardians")
    .update({ is_primary: false })
    .eq("school_id", schoolId)
    .eq("family_id", family.id)
    .neq("guardian_id", guardianRow.id);

  const { error: primaryLinkError } = await admin
    .from("sekoly_family_guardians")
    .upsert(
      {
        school_id: schoolId,
        family_id: family.id,
        guardian_id: guardianRow.id,
        is_primary: true,
        relationship: primaryRelationship,
      },
      { onConflict: "family_id,guardian_id" },
    );
  if (primaryLinkError) throw primaryLinkError;

  await admin
    .from("sekoly_families")
    .update({
      display_name: "Famille " + lastName,
      address: nullable(guardian.address, 250),
      city: nullable(guardian.city, 120),
      updated_at: new Date().toISOString(),
    })
    .eq("id", family.id)
    .eq("school_id", schoolId);

  const secondary = guardian.secondary ?? null;
  if (secondary) {
    const secondaryLastName = clean(secondary.lastName, 120).toUpperCase();
    const secondaryFirstName = clean(secondary.firstName, 120);
    const secondaryPhone = clean(secondary.phonePrimary, 40);
    const secondaryCin = nullable(secondary.cinNumber, 80);
    const secondaryEmail = nullable(secondary.email, 160)?.toLowerCase() ?? null;

    if (
      secondaryLastName ||
      secondaryPhone ||
      secondaryCin ||
      secondaryEmail
    ) {
      let secondaryGuardian: any = null;

      if (secondaryCin) {
        const { data } = await admin
          .from("sekoly_guardians")
          .select("*")
          .eq("school_id", schoolId)
          .ilike("cin_number", secondaryCin)
          .maybeSingle();
        secondaryGuardian = data;
      }

      if (!secondaryGuardian && secondaryPhone) {
        const { data } = await admin
          .from("sekoly_guardians")
          .select("*")
          .eq("school_id", schoolId)
          .eq("phone_primary", secondaryPhone)
          .limit(1);
        secondaryGuardian = data?.[0] ?? null;
      }

      const secondaryValues = {
        last_name: secondaryLastName || "RESPONSABLE",
        first_name: secondaryFirstName,
        phone_primary: secondaryPhone || null,
        phone_secondary: nullable(secondary.phoneSecondary, 40),
        email: secondaryEmail,
        cin_number: secondaryCin,
        cin_issued_at: nullable(secondary.cinIssuedAt, 10),
        cin_issue_place: nullable(secondary.cinIssuePlace, 160),
        occupation: nullable(secondary.occupation, 160),
        address: nullable(guardian.address, 250),
        city: nullable(guardian.city, 120),
        status: "ACTIVE",
      };

      if (secondaryGuardian) {
        const { data, error } = await admin
          .from("sekoly_guardians")
          .update(secondaryValues)
          .eq("id", secondaryGuardian.id)
          .select("*")
          .single();
        if (error) throw error;
        secondaryGuardian = data;
      } else {
        const { data, error } = await admin
          .from("sekoly_guardians")
          .insert({ school_id: schoolId, ...secondaryValues })
          .select("*")
          .single();
        if (error) throw error;
        secondaryGuardian = data;
      }

      if (secondaryGuardian.id !== guardianRow.id) {
        const secondaryRelationship = [
          "FATHER",
          "MOTHER",
          "GUARDIAN",
          "OTHER",
        ].includes(clean(secondary.relationship, 20))
          ? clean(secondary.relationship, 20)
          : "OTHER";

        const { error: secondaryLinkError } = await admin
          .from("sekoly_family_guardians")
          .upsert(
            {
              school_id: schoolId,
              family_id: family.id,
              guardian_id: secondaryGuardian.id,
              is_primary: false,
              relationship: secondaryRelationship,
            },
            { onConflict: "family_id,guardian_id" },
          );
        if (secondaryLinkError) throw secondaryLinkError;
      }
    }
  }

  return { family, guardian: guardianRow };
}

async function documentStorageUsage(admin: any, schoolId: string) {
  let total = 0;
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await admin
      .from("sekoly_enrollment_documents")
      .select("file_size")
      .eq("school_id", schoolId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    total += rows.reduce(
      (sum: number, row: any) => sum + Number(row.file_size ?? 0),
      0,
    );
    if (rows.length < pageSize) break;
  }
  return total;
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

  const { data: limits, error: limitsError } = await admin
    .from("sekoly_school_limits")
    .select("max_document_bytes,status")
    .eq("school_id", access.family.school_id)
    .maybeSingle();
  if (limitsError) throw limitsError;
  if (limits?.status === "SUSPENDED") {
    return jsonResponse(
      { error: "Le dépôt de documents est temporairement suspendu pour cet établissement." },
      403,
    );
  }
  if (limits?.max_document_bytes) {
    const usedBytes = await documentStorageUsage(admin, access.family.school_id);
    if (usedBytes + file.size > Number(limits.max_document_bytes)) {
      return jsonResponse(
        { error: "L’espace de documents de l’établissement est momentanément saturé. Contactez l’école pour transmettre cette pièce." },
        507,
      );
    }
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

  let documentGuardianId: string | null = null;
  if (documentType.startsWith("CIN_")) {
    const wantedRelationship =
      documentType === "CIN_FATHER"
        ? "FATHER"
        : documentType === "CIN_MOTHER"
          ? "MOTHER"
          : "GUARDIAN";
    const guardianLink =
      access.links.find(
        (item: any) => item.relationship === wantedRelationship,
      ) ?? access.links.find((item: any) => item.is_primary);
    documentGuardianId = guardianLink?.guardian_id ?? null;
  }

  const { data: document, error: docError } = await admin
    .from("sekoly_enrollment_documents")
    .insert({
      school_id: access.family.school_id,
      family_id: access.family.id,
      application_id: application?.id ?? null,
      guardian_id: documentGuardianId,
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
  if (checklistCode) {
    let targetApplicationIds: string[] = [];
    if (application?.id) {
      targetApplicationIds = [application.id];
    } else {
      const { data: campaignFamilies, error: campaignFamiliesError } = await admin
        .from("sekoly_enrollment_families")
        .select("id")
        .eq("school_id", access.family.school_id)
        .eq("family_profile_id", access.family.id);
      if (campaignFamiliesError) throw campaignFamiliesError;

      const campaignFamilyIds = (campaignFamilies ?? []).map(
        (item: any) => item.id,
      );
      if (campaignFamilyIds.length > 0) {
        const { data: familyApplications, error: familyApplicationsError } =
          await admin
            .from("sekoly_enrollment_applications")
            .select("id,status")
            .eq("school_id", access.family.school_id)
            .in("family_id", campaignFamilyIds)
            .not("status", "in", '("APPROVED","REJECTED","WITHDRAWN")');
        if (familyApplicationsError) throw familyApplicationsError;
        targetApplicationIds = (familyApplications ?? []).map(
          (item: any) => item.id,
        );
      }
    }

    if (targetApplicationIds.length > 0) {
      await admin
        .from("sekoly_enrollment_checklist_items")
        .update({
          status: "PROVIDED",
          document_id: document.id,
          note: "Document transmis par la famille.",
        })
        .in("application_id", targetApplicationIds)
        .eq("code", checklistCode);
    }
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

async function loadPortalData(admin: any, token: string) {
  const access = await familyFromToken(admin, token);
  if (!access) return null;

  const { data: school, error: schoolError } = await admin
    .from("sekoly_schools")
    .select("id,name,acronym,city")
    .eq("id", access.family.school_id)
    .single();
  if (schoolError) throw schoolError;

  const { data: familyStudents, error: familyStudentsError } = await admin
    .from("sekoly_family_students")
    .select("student_id")
    .eq("school_id", access.family.school_id)
    .eq("family_id", access.family.id);
  if (familyStudentsError) throw familyStudentsError;

  const studentIds = (familyStudents ?? []).map((item: any) => item.student_id);
  let students: any[] = [];
  if (studentIds.length > 0) {
    const { data, error } = await admin
      .from("sekoly_students")
      .select("id,matricule,last_name,first_name,birth_date,status")
      .eq("school_id", access.family.school_id)
      .in("id", studentIds);
    if (error) throw error;
    students = data ?? [];
  }

  const { data: enrollmentFamilies, error: enrollmentFamiliesError } = await admin
    .from("sekoly_enrollment_families")
    .select("id,campaign_id,reference_code")
    .eq("school_id", access.family.school_id)
    .eq("family_profile_id", access.family.id);
  if (enrollmentFamiliesError) throw enrollmentFamiliesError;

  const enrollmentFamilyIds = (enrollmentFamilies ?? []).map((item: any) => item.id);
  let applications: any[] = [];
  if (enrollmentFamilyIds.length > 0) {
    const { data, error } = await admin
      .from("sekoly_enrollment_applications")
      .select("id,family_id,application_type,status,existing_matricule,child_last_name,child_first_name,child_birth_date,created_at")
      .eq("school_id", access.family.school_id)
      .in("family_id", enrollmentFamilyIds)
      .order("created_at", { ascending: false });
    if (error) throw error;
    applications = data ?? [];
  }

  const applicationIds = applications.map((item: any) => item.id);
  let checklist: any[] = [];
  let documents: any[] = [];
  if (applicationIds.length > 0) {
    const [
      { data: checklistRows, error: checklistError },
      { data: documentRows, error: documentError },
    ] = await Promise.all([
      admin
        .from("sekoly_enrollment_checklist_items")
        .select("id,application_id,code,label,required,status,document_id,note,sort_order")
        .eq("school_id", access.family.school_id)
        .in("application_id", applicationIds)
        .order("sort_order"),
      admin
        .from("sekoly_enrollment_documents")
        .select("id,application_id,document_type,original_name,status,created_at")
        .eq("school_id", access.family.school_id)
        .eq("family_id", access.family.id)
        .order("created_at", { ascending: false }),
    ]);
    if (checklistError) throw checklistError;
    if (documentError) throw documentError;
    checklist = checklistRows ?? [];
    documents = documentRows ?? [];
  }

  const { data: campaigns, error: campaignsError } = await admin
    .from("sekoly_enrollment_campaigns")
    .select("id,public_code,name,school_year_id")
    .eq("school_id", access.family.school_id)
    .eq("status", "OPEN")
    .order("created_at", { ascending: false })
    .limit(1);
  if (campaignsError) throw campaignsError;

  return {
    ...access,
    school,
    students,
    applications,
    checklist,
    documents,
    campaign: campaigns?.[0] ?? null,
  };
}

function renderPortalPage(ctx: any, token: string, publicEndpoint: string) {
  const statusLabels: Record<string, string> = {
    SUBMITTED: "Demande reçue",
    TO_CONTACT: "À contacter",
    CONTACTED: "Famille contactée",
    APPOINTMENT_SCHEDULED: "Rendez-vous prévu",
    INCOMPLETE: "Dossier incomplet",
    COMPLETE: "Dossier complet",
    ACCEPTED: "Accepté",
    PAYMENT_PENDING: "Paiement à effectuer",
    APPROVED: "Inscription confirmée",
    REJECTED: "Non retenu",
    WITHDRAWN: "Retiré",
  };

  const childrenHtml = (ctx.students ?? []).length
    ? (ctx.students ?? []).map((student: any) =>
        '<div class="row"><div><strong>' +
        htmlEscape(student.last_name) + ' ' + htmlEscape(student.first_name) +
        '</strong><small>' + htmlEscape(student.matricule) + '</small></div>' +
        '<span class="pill ok">' + htmlEscape(student.status) + '</span></div>'
      ).join("")
    : '<div class="empty">Aucun enfant déjà inscrit n’est encore lié à ce dossier familial.</div>';

  const primaryRelationship =
    (ctx.links ?? []).find(
      (item: any) =>
        item.guardian_id === ctx.primaryGuardian?.id,
    )?.relationship ?? "GUARDIAN";
  const cinDocumentType =
    primaryRelationship === "FATHER"
      ? "CIN_FATHER"
      : primaryRelationship === "MOTHER"
        ? "CIN_MOTHER"
        : "CIN_GUARDIAN";
  const checklistDocumentType: Record<string, string> = {
    BIRTH_CERTIFICATE: "BIRTH_CERTIFICATE",
    CIN_PRIMARY: cinDocumentType,
    STUDENT_PHOTO: "STUDENT_PHOTO",
    RESIDENCE: "RESIDENCE_CERTIFICATE",
    TRANSFER: "TRANSFER_CERTIFICATE",
    REPORT_CARD: "REPORT_CARD",
  };

  const requestsHtml = (ctx.applications ?? []).length
    ? (ctx.applications ?? []).map((app: any) => {
        const items = (ctx.checklist ?? []).filter(
          (item: any) => item.application_id === app.id,
        );
        const missing = items.filter(
          (item: any) =>
            item.required &&
            !["PROVIDED", "VERIFIED", "NOT_REQUIRED"].includes(item.status),
        );
        const checklistHtml = items.length
          ? '<div class="checklist">' +
            items
              .map((item: any) => {
                const state =
                  item.status === "VERIFIED"
                    ? "Vérifié"
                    : item.status === "PROVIDED"
                      ? "Reçu"
                      : item.status === "NOT_REQUIRED"
                        ? "Non requis"
                        : "Manquant";
                const input =
                  item.status === "MISSING" && checklistDocumentType[item.code]
                    ? '<label class="mini-upload">Ajouter<input type="file" data-portal-upload="' +
                      htmlEscape(app.id) + '" data-doc-type="' +
                      htmlEscape(checklistDocumentType[item.code]) +
                      '" accept=".pdf,image/jpeg,image/png,image/webp"></label>'
                    : "";
                return '<div class="check"><span>' +
                  htmlEscape(item.label) + '</span><b class="' +
                  (item.status === "VERIFIED" ? "good" : item.status === "PROVIDED" ? "ready" : "missing") +
                  '">' + htmlEscape(state) + '</b>' + input + '</div>';
              })
              .join("") +
            '</div>'
          : "";
        return '<article class="request-card"><div class="row"><div><strong>' +
          htmlEscape(app.child_last_name) + ' ' + htmlEscape(app.child_first_name) +
          '</strong><small>' +
          (app.application_type === "RE_REGISTRATION" ? "Réinscription" : "Nouvelle inscription") +
          (missing.length ? " · " + missing.length + " pièce(s) obligatoire(s) manquante(s)" : "") +
          '</small></div><span class="pill">' +
          htmlEscape(statusLabels[app.status] ?? app.status) +
          '</span></div>' + checklistHtml + '</article>';
      }).join("")
    : '<div class="empty">Aucune demande récente.</div>';

  const campaignAction = ctx.campaign
    ? '<a class="primary" href="' + publicEndpoint + '?code=' +
      encodeURIComponent(ctx.campaign.public_code) + '&family=' +
      encodeURIComponent(token) + '">Inscrire ou réinscrire un enfant</a>'
    : '<div class="notice">Aucune campagne d’inscription n’est ouverte actuellement.</div>';

  return '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>Portail famille · ' + htmlEscape(ctx.school.name) + '</title><style>' +
    ':root{color-scheme:light;--bg:#f3f7f7;--card:#fff;--surface2:#f4f8f8;--ink:#17232a;--muted:#66757d;--line:#dbe5e7;--brand:#173f49;--accent:#2f7a54}html[data-theme="dark"]{color-scheme:dark;--bg:#0c1519;--card:#142128;--surface2:#18272e;--ink:#eef5f6;--muted:#9eb0b8;--line:#2b3d45;--brand:#1c5663;--accent:#70c096}' +
    '*{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#eaf3f2,#f5f8f8 420px);color:var(--ink);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;transition:background .2s,color .2s}html[data-theme="dark"] body{background:linear-gradient(180deg,#0b171b,#101b20 420px)}' +
    'main{max-width:820px;margin:auto;padding:18px 14px 70px}.hero{padding:26px;border-radius:24px;background:linear-gradient(145deg,#173f49,#245f6b);color:#fff;box-shadow:0 18px 55px rgba(20,60,70,.18)}' +
    '.hero{position:relative}.hero-tools{position:absolute;right:16px;top:14px;display:flex;gap:7px}.hero-tool{border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);color:#fff;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:850;cursor:pointer}.net-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#79d6a5;margin-right:5px}.net-dot.offline{background:#efb26b}.brand{font-size:11px;font-weight:900;letter-spacing:.18em;opacity:.82}.hero h1{margin:10px 0 4px;font-size:28px}.hero p{margin:0;color:#d7e5e8}.code{display:inline-block;margin-top:14px;padding:7px 10px;border:1px solid rgba(255,255,255,.24);border-radius:999px;font-size:11px}' +
    '.card{margin-top:14px;padding:20px;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:0 8px 26px rgba(20,55,64,.05)}h2{margin:0 0 12px;font-size:15px}' +
    '.row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}.row small{display:block;margin-top:3px;color:var(--muted)}' +
    '.pill{font-size:10px;font-weight:850;padding:6px 9px;border-radius:999px;background:#eef4f4;color:var(--brand);text-align:right}.pill.ok{background:#eaf5ef;color:var(--accent)}' +
    '.primary{display:block;margin-top:14px;padding:14px 16px;border-radius:12px;background:var(--brand);color:#fff;text-decoration:none;text-align:center;font-weight:850}.notice,.empty{padding:12px;border-radius:10px;background:var(--surface2);color:var(--muted);font-size:12px}' +
    '.request-card{padding:4px 0 8px;border-bottom:1px solid var(--line)}.request-card:last-child{border-bottom:0}.request-card .row{border-bottom:0}.checklist{display:grid;gap:6px;padding:0 0 8px 2px}.check{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px}.check>span{min-width:150px;color:var(--muted)}.check b{font-size:9px;padding:4px 7px;border-radius:999px;background:#f1f4f5}.check b.good{background:#e8f5ed;color:#2f7a54}.check b.ready{background:#e9f1fa;color:#2563eb}.check b.missing{background:#fff2df;color:#9b6b22}.mini-upload{display:inline-flex;align-items:center;padding:5px 7px;border-radius:8px;background:#edf4f2;color:var(--accent);font-size:9px;font-weight:800;cursor:pointer}.mini-upload input{display:none}.uploading{opacity:.55;pointer-events:none}.security{margin:16px 3px;color:var(--muted);font-size:10px;line-height:1.6}@media(max-width:620px){.hero{padding:20px}.hero h1{font-size:22px}.card{padding:16px}.row{align-items:flex-start}.check>span{min-width:120px}}' +
    '</style></head><body><main>' +
    '<section class="hero"><div class="hero-tools"><span class="hero-tool"><span class="net-dot" id="portalNetDot"></span><span id="portalNetLabel">En ligne</span></span><button class="hero-tool" type="button" id="portalTheme">Mode sombre</button></div><div class="brand">SEKOLY · PORTAIL FAMILLE</div><h1>' +
    htmlEscape(ctx.family.display_name || "Votre famille") + '</h1><p>' +
    htmlEscape(ctx.school.name) + '</p><div class="code">Référence famille · ' +
    htmlEscape(ctx.family.family_code) + '</div></section>' +
    '<section class="card"><h2>Mes enfants inscrits</h2>' + childrenHtml + '</section>' +
    '<section class="card"><h2>Mes demandes</h2>' + requestsHtml + campaignAction + '</section>' +
    '<p class="security">Ce lien est personnel. Conservez-le pour les prochaines inscriptions et réinscriptions. Ne le partagez pas.</p>' +
    '</main><script>(function(){var token=' + JSON.stringify(token) + ';var PUBLIC_ENDPOINT=' + JSON.stringify(publicEndpoint) + ';var themeButton=document.getElementById("portalTheme");var netDot=document.getElementById("portalNetDot");var netLabel=document.getElementById("portalNetLabel");function applyTheme(theme){document.documentElement.dataset.theme=theme;themeButton.textContent=theme==="dark"?"Mode clair":"Mode sombre";try{localStorage.setItem("sekoly-family-theme",theme)}catch(_){}}var preferred="light";try{preferred=localStorage.getItem("sekoly-family-theme")||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch(_){}applyTheme(preferred);themeButton.addEventListener("click",function(){applyTheme(document.documentElement.dataset.theme==="dark"?"light":"dark")});function network(){var online=navigator.onLine;netDot.classList.toggle("offline",!online);netLabel.textContent=online?"En ligne":"Hors connexion"}window.addEventListener("online",network);window.addEventListener("offline",network);network();document.querySelectorAll("[data-portal-upload]").forEach(function(input){input.addEventListener("change",async function(){var file=input.files&&input.files[0];if(!file)return;var label=input.closest(".mini-upload");label.classList.add("uploading");label.firstChild.textContent="Envoi…";var fd=new FormData();fd.append("file",file);fd.append("applicationId",input.dataset.portalUpload);fd.append("documentType",input.dataset.docType);try{var response=await fetch(PUBLIC_ENDPOINT+"?action=upload&family="+encodeURIComponent(token),{method:"POST",body:fd});var result=await response.json();if(!response.ok)throw new Error(result.error||"Envoi impossible.");location.reload();}catch(error){alert(error.message||"Envoi impossible.");label.classList.remove("uploading");label.firstChild.textContent="Ajouter";}});});})();<\/script></body></html>';
}

function renderPage(
  ctx: any,
  publicCode: string,
  familyAccess: any = null,
  publicEndpoint = "",
) {
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

  const familyBootstrap = familyAccess
    ? {
        token: clean(familyAccess.tokenRow ? "" : "", 1),
        guardian: familyAccess.primaryGuardian
          ? {
              lastName: familyAccess.primaryGuardian.last_name ?? "",
              firstName: familyAccess.primaryGuardian.first_name ?? "",
              phonePrimary: familyAccess.primaryGuardian.phone_primary ?? "",
              phoneSecondary: familyAccess.primaryGuardian.phone_secondary ?? "",
              email: familyAccess.primaryGuardian.email ?? "",
              cinNumber: familyAccess.primaryGuardian.cin_number ?? "",
              cinIssuedAt: familyAccess.primaryGuardian.cin_issued_at ?? "",
              cinIssuePlace: familyAccess.primaryGuardian.cin_issue_place ?? "",
              occupation: familyAccess.primaryGuardian.occupation ?? "",
              address: familyAccess.primaryGuardian.address ?? "",
              city: familyAccess.primaryGuardian.city ?? "",
              relationship:
                familyAccess.links.find(
                  (link: any) =>
                    link.guardian_id === familyAccess.primaryGuardian.id,
                )?.relationship ?? "GUARDIAN",
            }
          : null,
        secondaryGuardian: (() => {
          const secondary = (familyAccess.guardians ?? []).find(
            (item: any) => item.id !== familyAccess.primaryGuardian?.id,
          );
          if (!secondary) return null;
          return {
            lastName: secondary.last_name ?? "",
            firstName: secondary.first_name ?? "",
            phonePrimary: secondary.phone_primary ?? "",
            email: secondary.email ?? "",
            cinNumber: secondary.cin_number ?? "",
            cinIssuedAt: secondary.cin_issued_at ?? "",
            cinIssuePlace: secondary.cin_issue_place ?? "",
            occupation: secondary.occupation ?? "",
            relationship:
              familyAccess.links.find(
                (link: any) => link.guardian_id === secondary.id,
              )?.relationship ?? "OTHER",
          };
        })(),
        students: (familyAccess.students ?? []).map((student: any) => ({
          matricule: student.matricule,
          lastName: student.last_name,
          firstName: student.first_name,
          birthDate: student.birth_date,
        })),
      }
    : null;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Préinscription — ${htmlEscape(ctx.school.name)}</title>
<style>
:root{color-scheme:light;--bg:#f1f6f6;--surface:#fff;--surface2:#fbfcfc;--ink:#142127;--muted:#68777f;--line:#d9e4e7;--brand:#173f49;--brand2:#245e6a;--accent:#2f7a54;--accent-soft:#eaf5ef;--danger:#b94141;--shadow:0 16px 50px rgba(19,55,64,.08)}
html[data-theme="dark"]{color-scheme:dark;--bg:#0c1519;--surface:#132027;--surface2:#17262d;--ink:#eef5f6;--muted:#9eb0b8;--line:#2a3d45;--brand:#194b57;--brand2:#266a77;--accent:#69b98f;--accent-soft:#18372a;--danger:#ef8d8d;--shadow:0 18px 55px rgba(0,0,0,.25)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#e9f2f1 0,#f6f9f9 420px);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;transition:background .2s,color .2s}html[data-theme="dark"] body{background:linear-gradient(180deg,#0b171b 0,#0f1a1f 420px)}
button,input,select,textarea{font:inherit}.shell{max-width:980px;margin:auto;padding:18px 16px 72px}.hero{position:relative;overflow:hidden;padding:28px;border-radius:26px;background:linear-gradient(145deg,var(--brand),var(--brand2));color:white;box-shadow:0 20px 70px rgba(22,63,73,.18)}
.hero:after{content:"";position:absolute;width:280px;height:280px;border-radius:50%;background:rgba(255,255,255,.055);right:-100px;top:-130px}.hero-tools{position:absolute;z-index:2;right:18px;top:16px;display:flex;align-items:center;gap:7px}.hero-tool{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:white;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:850;backdrop-filter:blur(8px)}.net-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#79d6a5;margin-right:5px}.net-dot.offline{background:#efb26b}.brand{position:relative;font-weight:900;letter-spacing:.2em;font-size:11px;opacity:.84}.hero h1{position:relative;margin:10px 0 5px;font-size:clamp(24px,5vw,34px);letter-spacing:-.02em}.hero p{position:relative;margin:0;color:#d8e6e9}.badge{position:relative;display:inline-flex;margin-top:15px;padding:7px 10px;border:1px solid rgba(255,255,255,.24);border-radius:999px;font-size:11px}
.notice{margin-top:14px;padding:12px 14px;border:1px solid #d2e8dc;border-radius:12px;background:#edf7f2;color:#315e49;font-size:12px;line-height:1.5}
.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:18px 1px}.progress button{border:0;background:transparent;padding:0;text-align:left;color:var(--muted);cursor:pointer}.progress i{display:block;height:5px;border-radius:999px;background:#d8e3e5;margin-bottom:7px;transition:.22s}.progress button.active i,.progress button.done i{background:var(--accent)}.progress span{font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.055em}
.card{margin-top:14px;padding:22px;border:1px solid var(--line);border-radius:20px;background:var(--surface);box-shadow:var(--shadow)}.step{display:none;animation:enter .22s ease}.step.active{display:block}@keyframes enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}.section-title h2{margin:0;font-size:18px}.section-title p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.5}.chip{padding:6px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:850;white-space:nowrap}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.span2{grid-column:span 2}.field label{display:block;margin-bottom:6px;color:#53636b;font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.045em}.field small{display:block;margin-top:5px;color:var(--muted);font-size:10px}
.field input,.field select,.field textarea{width:100%;min-height:46px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface2);color:var(--ink);outline:none;transition:.15s}.field textarea{min-height:82px;resize:vertical}.field input:focus,.field select:focus,.field textarea:focus{border-color:#75ad94;box-shadow:0 0 0 3px rgba(47,122,84,.11);background:var(--surface)}
.children{display:grid;gap:13px}.child{padding:17px;border:1px solid var(--line);border-radius:17px;background:var(--surface2)}.child-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.child-head h3{margin:0;font-size:14px}.known{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:15px}.known button{border:1px solid #cfe0d7;background:#f3faf6;color:#315f4a;border-radius:11px;padding:9px 11px;font-size:11px;font-weight:750;cursor:pointer}
button{border:0;border-radius:11px;padding:11px 14px;font-weight:800;cursor:pointer}.primary{background:var(--brand);color:white}.secondary{background:#edf4f2;color:var(--accent)}.remove{background:#fff0f0;color:var(--danger);font-size:10px;padding:7px 9px}
.doc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.doc{display:block;padding:14px;border:1px dashed #ccd9dc;border-radius:15px;background:var(--surface2)}.doc strong{display:block;font-size:12px}.doc small{display:block;margin:4px 0 9px;color:var(--muted);font-size:10px}.doc input{width:100%;font-size:11px}.doc-child{margin-top:12px;padding:15px;border:1px solid var(--line);border-radius:14px}
.review{display:grid;gap:2px}.review-row{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid var(--line);font-size:12px}.review-row span{color:var(--muted)}.review-row strong{text-align:right}.consent{display:flex;gap:9px;align-items:flex-start;margin-top:15px;padding:13px;border-radius:12px;background:#f5f8f8;font-size:11px;line-height:1.55}.consent input{width:auto;min-height:auto;margin-top:2px}
.actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px}.btn{min-height:46px;padding:10px 16px;border-radius:12px}.btn-primary{background:var(--brand);color:#fff}.btn-secondary{background:#eef3f4;color:#33484f}.btn-add{background:var(--accent-soft);color:var(--accent)}.btn:disabled{opacity:.55;cursor:not-allowed}.fine{font-size:11px;color:var(--muted);line-height:1.6}.saving{margin-top:8px;color:var(--muted);font-size:10px}.success{display:none;text-align:center}.success .check{width:64px;height:64px;margin:0 auto 14px;display:grid;place-items:center;border-radius:50%;background:var(--accent-soft);color:var(--accent);font-size:31px;font-weight:900}.success h2{font-size:24px;margin:5px 0}.reference{display:inline-flex;margin:12px 0;padding:10px 13px;border-radius:10px;background:var(--surface2);font:800 15px ui-monospace,monospace}.portal-link{display:block;margin-top:14px;padding:13px;border-radius:12px;background:var(--brand);color:#fff;text-decoration:none;font-weight:850}.honeypot{position:absolute;left:-9999px}
@media(max-width:700px){.shell{padding:8px 10px 60px}.hero{padding:56px 20px 22px;border-radius:20px}.hero-tools{right:12px;top:12px}.grid,.doc-grid{grid-template-columns:1fr}.span2{grid-column:auto}.card{padding:16px;border-radius:16px}.section-title{display:block}.chip{display:inline-flex;margin-top:8px}.progress span{font-size:8px}.actions{position:sticky;bottom:8px;padding:8px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);z-index:3}.actions .btn{flex:1}}
</style>
</head>
<body>
<main class="shell">
<section class="hero">
<div class="hero-tools">
  <span class="hero-tool" id="networkState"><span class="net-dot" id="networkDot"></span><span id="networkLabel">En ligne</span></span>
  <button class="hero-tool" type="button" id="themeToggle">Mode sombre</button>
</div>
<div class="brand">SEKOLY</div>
<h1>${htmlEscape(ctx.school.name)}</h1>
<p>Préinscription en ligne · Année scolaire ${htmlEscape(ctx.year.label)}</p>
<div class="badge">${htmlEscape(ctx.campaign.name)}</div>
</section>
${instructions}
<nav class="progress" aria-label="Étapes du formulaire">
<button type="button" data-go="0" class="active"><i></i><span>Responsable</span></button>
<button type="button" data-go="1"><i></i><span>Enfant(s)</span></button>
<button type="button" data-go="2"><i></i><span>Documents</span></button>
<button type="button" data-go="3"><i></i><span>Vérifier</span></button>
</nav>

<form id="form" novalidate>
<section class="card step active" data-step="0">
<div class="section-title">
<div><h2>Responsable familial</h2><p>Ces informations sont conservées dans un dossier famille unique et pourront être réutilisées pour vos autres enfants.</p></div>
<span class="chip">Une seule saisie</span>
</div>
<div class="grid">
<div class="field"><label>Nom *</label><input name="guardianLastName" required maxlength="120" autocomplete="family-name"></div>
<div class="field"><label>Prénoms</label><input name="guardianFirstName" maxlength="120" autocomplete="given-name"></div>
<div class="field"><label>Lien avec l'enfant *</label><select name="relationship"><option value="FATHER">Père</option><option value="MOTHER">Mère</option><option value="GUARDIAN">Tuteur / responsable légal</option><option value="OTHER">Autre</option></select></div>
<div class="field"><label>Téléphone principal *</label><input name="phonePrimary" required maxlength="40" inputmode="tel" autocomplete="tel"></div>
<div class="field"><label>Deuxième téléphone</label><input name="phoneSecondary" maxlength="40" inputmode="tel"></div>
<div class="field"><label>Email</label><input name="email" type="email" maxlength="160" autocomplete="email"></div>
<div class="field"><label>N° CIN</label><input name="cinNumber" maxlength="80"></div>
<div class="field"><label>Date de délivrance CIN</label><input name="cinIssuedAt" type="date"></div>
<div class="field"><label>Lieu de délivrance CIN</label><input name="cinIssuePlace" maxlength="160"></div>
<div class="field"><label>Profession</label><input name="occupation" maxlength="160"></div>
<div class="field span2"><label>Adresse</label><input name="address" maxlength="250" autocomplete="street-address"></div>
<div class="field"><label>Ville / Commune</label><input name="city" maxlength="120"></div>
<div class="field"><label>Contact préféré</label><select name="preferredContact"><option value="PHONE">Appel</option><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">Email</option></select></div>
<div class="honeypot"><label>Site</label><input name="website" autocomplete="off"></div>
</div>

<details id="secondGuardianBox" style="margin-top:16px;border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:#fafcfc">
<summary style="cursor:pointer;font-size:12px;font-weight:850;color:var(--brand)">Ajouter le deuxième parent / responsable</summary>
<p class="fine">Facultatif, mais recommandé pour un dossier familial complet.</p>
<div class="grid" style="margin-top:12px">
<div class="field"><label>Lien</label><select name="secondaryRelationship"><option value="MOTHER">Mère</option><option value="FATHER">Père</option><option value="GUARDIAN">Tuteur</option><option value="OTHER">Autre</option></select></div>
<div class="field"><label>Nom</label><input name="secondaryLastName" maxlength="120"></div>
<div class="field"><label>Prénoms</label><input name="secondaryFirstName" maxlength="120"></div>
<div class="field"><label>Téléphone</label><input name="secondaryPhonePrimary" inputmode="tel" maxlength="40"></div>
<div class="field"><label>Email</label><input name="secondaryEmail" type="email" maxlength="160"></div>
<div class="field"><label>N° CIN</label><input name="secondaryCinNumber" maxlength="80"></div>
<div class="field"><label>Date CIN</label><input name="secondaryCinIssuedAt" type="date"></div>
<div class="field"><label>Lieu CIN</label><input name="secondaryCinIssuePlace" maxlength="160"></div>
<div class="field span2"><label>Profession</label><input name="secondaryOccupation" maxlength="160"></div>
</div>
</details>

<div class="actions"><span></span><button type="button" class="btn btn-primary" data-next>Continuer</button></div>
</section>

<section class="card step" data-step="1">
<div class="section-title">
<div><h2>Enfant(s) concerné(s)</h2><p>Vous pouvez envoyer plusieurs inscriptions ou réinscriptions en une seule demande familiale.</p></div>
<button class="btn btn-add" type="button" id="addChild">+ Ajouter un enfant</button>
</div>
<div id="knownChildren" class="known"></div>
<div id="children" class="children"></div>
<div class="actions"><button type="button" class="btn btn-secondary" data-prev>Retour</button><button type="button" class="btn btn-primary" data-next>Continuer</button></div>
</section>

<section class="card step" data-step="2">
<div class="section-title">
<div><h2>Pièces justificatives</h2><p>Ajoutez des photos lisibles ou des PDF. Chaque fichier doit faire moins de 10 Mo. Vous pourrez compléter les pièces manquantes plus tard.</p></div>
<span class="chip">Dépôt sécurisé</span>
</div>
<div class="doc-grid">
<label class="doc"><strong>CIN du responsable principal</strong><small>PDF, JPG, PNG ou WEBP</small><input type="file" data-family-doc="CIN_PRIMARY" accept=".pdf,image/jpeg,image/png,image/webp"></label>
<label class="doc"><strong>CIN du deuxième parent / responsable</strong><small>Si un deuxième responsable a été renseigné</small><input type="file" data-family-doc="CIN_SECONDARY" accept=".pdf,image/jpeg,image/png,image/webp"></label>
<label class="doc"><strong>Justificatif de domicile</strong><small>Facultatif selon l’établissement</small><input type="file" data-family-doc="RESIDENCE_CERTIFICATE" accept=".pdf,image/jpeg,image/png,image/webp"></label>
</div>
<div id="childDocs"></div>
<div class="actions"><button type="button" class="btn btn-secondary" data-prev>Retour</button><button type="button" class="btn btn-primary" data-next>Vérifier</button></div>
</section>

<section class="card step" data-step="3">
<div class="section-title">
<div><h2>Vérification avant envoi</h2><p>Une demande en ligne n’inscrit pas automatiquement l’enfant. L’établissement vérifie les informations, appelle la famille, puis confirme l’admission.</p></div>
<span class="chip">Dernière étape</span>
</div>
<div id="review" class="review"></div>
<label class="consent"><input id="consent" type="checkbox" required><span>Je certifie que les informations fournies sont exactes et j’autorise l’établissement à les utiliser pour le traitement administratif de l’inscription et de la scolarité.</span></label>
<div class="actions"><button type="button" class="btn btn-secondary" data-prev>Retour</button><button class="btn btn-primary" id="submitBtn" type="submit">Envoyer la demande</button></div>
<div id="saving" class="saving"></div>
</section>
</form>

<section class="card success" id="success">
<div class="check">✓</div>
<h2>Demande transmise</h2>
<p>Votre référence familiale :</p>
<div class="reference" id="reference"></div>
<p class="fine">Conservez cette référence. L’établissement vous contactera avant toute inscription définitive.</p>
<div id="uploadStatus" class="fine"></div>
<a id="portalLink" class="portal-link" href="#">Ouvrir mon portail famille</a>
</section>
</main>
<script>
const THEME_KEY='sekoly-family-theme';
const themeToggle=document.getElementById('themeToggle');
const networkDot=document.getElementById('networkDot');
const networkLabel=document.getElementById('networkLabel');

function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  themeToggle.textContent=theme==='dark'?'Mode clair':'Mode sombre';
  try{localStorage.setItem(THEME_KEY,theme)}catch{}
}
let preferredTheme='light';
try{
  preferredTheme=localStorage.getItem(THEME_KEY)||
    (window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
}catch{}
applyTheme(preferredTheme);
themeToggle.addEventListener('click',function(){
  applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
});

function refreshNetworkState(){
  const online=navigator.onLine;
  networkDot.classList.toggle('offline',!online);
  networkLabel.textContent=online?'En ligne':'Hors connexion';
}
window.addEventListener('online',refreshNetworkState);
window.addEventListener('offline',refreshNetworkState);
refreshNetworkState();

const PUBLIC_ENDPOINT=${JSON.stringify(publicEndpoint)};
const PUBLIC_CODE=${JSON.stringify(publicCode)};
const CLASS_OPTIONS=${JSON.stringify(classOptions)};
const TYPE_OPTIONS=${JSON.stringify(allowedTypes)};
const FAMILY_BOOT=${JSON.stringify(familyBootstrap)};
const FAMILY_TOKEN=new URLSearchParams(location.search).get('family')||'';
const DRAFT_KEY='sekoly-enrollment-draft:'+PUBLIC_CODE;
const form=document.getElementById('form');
const children=document.getElementById('children');
const childDocs=document.getElementById('childDocs');
let childCount=0;
let currentStep=0;

function qa(selector,root=document){return Array.from(root.querySelectorAll(selector))}
function q(selector,root=document){return root.querySelector(selector)}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]})}

function showStep(next){
  currentStep=Math.max(0,Math.min(3,next));
  qa('[data-step]').forEach(function(el,index){el.classList.toggle('active',index===currentStep)});
  qa('[data-go]').forEach(function(el,index){
    el.classList.toggle('active',index===currentStep);
    el.classList.toggle('done',index<currentStep);
  });
  if(currentStep===2) renderDocuments();
  if(currentStep===3) renderReview();
  window.scrollTo({top:0,behavior:'smooth'});
}

function validateStep(){
  const active=q('[data-step="'+currentStep+'"]');
  const required=qa('input[required],select[required]',active);
  for(const input of required){
    if(!input.checkValidity()){input.reportValidity();return false}
  }
  if(currentStep===1&&qa('[data-child]').length===0){
    alert('Ajoutez au moins un enfant.');
    return false;
  }
  return true;
}

function childTemplate(index){
  return '<article class="child" data-child>'+
    '<div class="child-head"><h3>Enfant '+(index+1)+'</h3><button type="button" class="remove" data-remove>Retirer</button></div>'+
    '<div class="grid">'+
    '<div class="field"><label>Type *</label><select data-field="type">'+TYPE_OPTIONS+'</select></div>'+
    '<div class="field"><label>Matricule actuel</label><input data-field="existingMatricule" maxlength="80"><small>Obligatoire uniquement pour une réinscription.</small></div>'+
    '<div class="field"><label>Nom *</label><input data-field="lastName" required maxlength="120"></div>'+
    '<div class="field"><label>Prénoms *</label><input data-field="firstName" required maxlength="160"></div>'+
    '<div class="field"><label>Sexe</label><select data-field="gender"><option value="M">Masculin</option><option value="F">Féminin</option></select></div>'+
    '<div class="field"><label>Date de naissance</label><input data-field="birthDate" type="date"></div>'+
    '<div class="field"><label>Lieu de naissance</label><input data-field="birthPlace" maxlength="180"></div>'+
    '<div class="field"><label>Nationalité</label><input data-field="nationality" value="Malgache" maxlength="80"></div>'+
    '<div class="field"><label>Classe souhaitée</label><select data-field="desiredClassId"><option value="">À déterminer avec l\'école</option>'+CLASS_OPTIONS+'</select></div>'+
    '<div class="field"><label>Ancien établissement</label><input data-field="previousSchool" maxlength="180"></div>'+
    '<div class="field"><label>N° acte de naissance</label><input data-field="birthCertificateNumber" maxlength="100"></div>'+
    '<div class="field"><label>Date acte</label><input data-field="birthCertificateDate" type="date"></div>'+
    '<div class="field"><label>Lieu acte</label><input data-field="birthCertificatePlace" maxlength="180"></div>'+
    '<div class="field"><label>Groupe sanguin</label><input data-field="bloodType" maxlength="20"></div>'+
    '<div class="field span2"><label>Adresse si différente</label><input data-field="address" maxlength="250"></div>'+
    '<div class="field"><label>Fokontany / quartier</label><input data-field="neighborhood" maxlength="120"></div>'+
    '<div class="field"><label>Ville / Commune</label><input data-field="city" maxlength="120"></div>'+
    '<div class="field span2"><label>Informations utiles / médicales</label><textarea data-field="medicalNotes" maxlength="1000"></textarea></div>'+
    '</div></article>';
}

function renumberChildren(){
  qa('[data-child]').forEach(function(block,index){
    q('.child-head h3',block).textContent='Enfant '+(index+1);
  });
}

function addChild(data){
  if(qa('[data-child]').length>=10)return;
  children.insertAdjacentHTML('beforeend',childTemplate(childCount++));
  const block=children.lastElementChild;
  const values=data||{};
  Object.keys(values).forEach(function(key){
    const field=q('[data-field="'+key+'"]',block);
    if(field&&values[key]!=null) field.value=values[key];
  });
  renumberChildren();
  saveDraft();
}

function readChildren(){
  return qa('[data-child]').map(function(block){
    const get=function(name){const field=q('[data-field="'+name+'"]',block);return field?field.value.trim():''};
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
}

function guardianDraft(){
  const fd=new FormData(form);
  const result={};
  ['guardianLastName','guardianFirstName','relationship','phonePrimary','phoneSecondary','email','cinNumber','cinIssuedAt','cinIssuePlace','occupation','address','city','preferredContact','secondaryRelationship','secondaryLastName','secondaryFirstName','secondaryPhonePrimary','secondaryEmail','secondaryCinNumber','secondaryCinIssuedAt','secondaryCinIssuePlace','secondaryOccupation'].forEach(function(name){
    result[name]=String(fd.get(name)||'');
  });
  return result;
}

function saveDraft(){
  try{
    localStorage.setItem(DRAFT_KEY,JSON.stringify({guardian:guardianDraft(),children:readChildren()}));
  }catch{}
}

function applyGuardian(values){
  if(!values)return;
  Object.keys(values).forEach(function(key){
    const field=form.elements[key];
    if(field&&values[key]!=null) field.value=values[key];
  });
}

function restoreDraft(){
  let draft=null;
  try{draft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null')}catch{}
  if(FAMILY_BOOT&&FAMILY_BOOT.guardian) {
    applyGuardian(FAMILY_BOOT.guardian);
    if(FAMILY_BOOT.guardian.relationship && form.elements.relationship) {
      form.elements.relationship.value=FAMILY_BOOT.guardian.relationship;
    }
  } else if(draft&&draft.guardian) {
    applyGuardian(draft.guardian);
  }

  if(FAMILY_BOOT&&FAMILY_BOOT.secondaryGuardian) {
    const secondary=FAMILY_BOOT.secondaryGuardian;
    const values={
      secondaryRelationship:secondary.relationship,
      secondaryLastName:secondary.lastName,
      secondaryFirstName:secondary.firstName,
      secondaryPhonePrimary:secondary.phonePrimary,
      secondaryEmail:secondary.email,
      secondaryCinNumber:secondary.cinNumber,
      secondaryCinIssuedAt:secondary.cinIssuedAt,
      secondaryCinIssuePlace:secondary.cinIssuePlace,
      secondaryOccupation:secondary.occupation
    };
    applyGuardian(values);
    const box=document.getElementById('secondGuardianBox');
    if(box) box.open=true;
  }

  const savedChildren=draft&&Array.isArray(draft.children)?draft.children:[];
  if(savedChildren.length) savedChildren.forEach(addChild);
  else addChild();

  const known=document.getElementById('knownChildren');
  const existing=FAMILY_BOOT&&Array.isArray(FAMILY_BOOT.students)?FAMILY_BOOT.students:[];
  if(existing.length){
    known.innerHTML='<span style="width:100%;font-size:11px;color:#68777f">Enfant déjà connu : cliquez pour préparer sa réinscription.</span>'+
      existing.map(function(student,index){
        return '<button type="button" data-known="'+index+'">'+escapeHtml(student.lastName+' '+student.firstName)+' · '+escapeHtml(student.matricule)+'</button>';
      }).join('');
    qa('[data-known]',known).forEach(function(button){
      button.addEventListener('click',function(){
        const student=existing[Number(button.dataset.known)];
        addChild({
          type:'RE_REGISTRATION',
          existingMatricule:student.matricule,
          lastName:student.lastName,
          firstName:student.firstName,
          birthDate:student.birthDate||''
        });
      });
    });
  }
}

function primaryCinType(){
  const relationship=String(form.elements.relationship.value||'GUARDIAN');
  if(relationship==='FATHER')return 'CIN_FATHER';
  if(relationship==='MOTHER')return 'CIN_MOTHER';
  return 'CIN_GUARDIAN';
}

function secondaryCinType(){
  const relationship=String(form.elements.secondaryRelationship.value||'OTHER');
  if(relationship==='FATHER')return 'CIN_FATHER';
  if(relationship==='MOTHER')return 'CIN_MOTHER';
  return 'CIN_GUARDIAN';
}

function renderDocuments(){
  const list=readChildren();
  childDocs.innerHTML=list.map(function(child,index){
    const name=escapeHtml((child.lastName||'Enfant '+(index+1))+' '+(child.firstName||''));
    return '<div class="doc-child"><strong>'+name+'</strong><div class="doc-grid" style="margin-top:10px">'+
      '<label class="doc"><strong>Acte de naissance</strong><small>Recommandé</small><input type="file" data-child-index="'+index+'" data-doc-type="BIRTH_CERTIFICATE" accept=".pdf,image/jpeg,image/png,image/webp"></label>'+
      '<label class="doc"><strong>Photo d\'identité</strong><small>Portrait récent</small><input type="file" data-child-index="'+index+'" data-doc-type="STUDENT_PHOTO" accept="image/jpeg,image/png,image/webp"></label>'+
      '<label class="doc"><strong>Dernier bulletin</strong><small>Facultatif</small><input type="file" data-child-index="'+index+'" data-doc-type="REPORT_CARD" accept=".pdf,image/jpeg,image/png,image/webp"></label>'+
      '<label class="doc"><strong>Certificat de transfert</strong><small>Si changement d\'établissement</small><input type="file" data-child-index="'+index+'" data-doc-type="TRANSFER_CERTIFICATE" accept=".pdf,image/jpeg,image/png,image/webp"></label>'+
      '</div></div>';
  }).join('');
}

function renderReview(){
  const fd=new FormData(form);
  const list=readChildren();
  document.getElementById('review').innerHTML=
    '<div class="review-row"><span>Responsable</span><strong>'+escapeHtml(String(fd.get('guardianLastName')||'')+' '+String(fd.get('guardianFirstName')||''))+'</strong></div>'+
    '<div class="review-row"><span>Téléphone</span><strong>'+escapeHtml(String(fd.get('phonePrimary')||''))+'</strong></div>'+
    '<div class="review-row"><span>Nombre d\'enfants</span><strong>'+list.length+'</strong></div>'+
    list.map(function(child){
      return '<div class="review-row"><span>'+(child.type==='RE_REGISTRATION'?'Réinscription':'Nouvelle inscription')+'</span><strong>'+escapeHtml(child.lastName+' '+child.firstName)+'</strong></div>';
    }).join('');
}

async function uploadOne(file,applicationId,documentType,familyToken){
  const fd=new FormData();
  fd.append('file',file);
  fd.append('applicationId',applicationId||'');
  fd.append('documentType',documentType);
  const response=await fetch(PUBLIC_ENDPOINT+'?action=upload&family='+encodeURIComponent(familyToken),{method:'POST',body:fd});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'Envoi du document impossible.');
  return result;
}

async function uploadDocuments(result){
  const jobs=[];
  qa('[data-family-doc]').forEach(function(input){
    const file=input.files&&input.files[0];
    if(!file)return;
    const type=
      input.dataset.familyDoc==='CIN_PRIMARY'
        ? primaryCinType()
        : input.dataset.familyDoc==='CIN_SECONDARY'
          ? secondaryCinType()
          : input.dataset.familyDoc;
    if(input.dataset.familyDoc==='CIN_SECONDARY' && !String(form.elements.secondaryLastName.value||'').trim()) return;
    jobs.push(uploadOne(file,'',type,result.familyToken));
  });
  qa('[data-doc-type]').forEach(function(input){
    const file=input.files&&input.files[0];
    if(!file)return;
    const app=result.applications&&result.applications[Number(input.dataset.childIndex)];
    if(app) jobs.push(uploadOne(file,app.id,input.dataset.docType,result.familyToken));
  });
  if(!jobs.length)return{uploaded:0,failed:0};
  const settled=await Promise.allSettled(jobs);
  return {
    uploaded:settled.filter(function(item){return item.status==='fulfilled'}).length,
    failed:settled.filter(function(item){return item.status==='rejected'}).length
  };
}

qa('[data-next]').forEach(function(button){button.addEventListener('click',function(){if(validateStep())showStep(currentStep+1)})});
qa('[data-prev]').forEach(function(button){button.addEventListener('click',function(){showStep(currentStep-1)})});
qa('[data-go]').forEach(function(button,index){button.addEventListener('click',function(){if(index<=currentStep||validateStep())showStep(index)})});
document.getElementById('addChild').addEventListener('click',function(){addChild()});
children.addEventListener('click',function(event){
  const button=event.target.closest('[data-remove]');
  if(!button)return;
  if(qa('[data-child]').length===1)return;
  button.closest('[data-child]').remove();
  renumberChildren();
  saveDraft();
});
let draftTimer=0;
form.addEventListener('input',function(){clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,250)});

form.addEventListener('submit',async function(event){
  event.preventDefault();
  if(!document.getElementById('consent').checked){
    alert('Veuillez confirmer l’exactitude des informations.');
    return;
  }
  const fd=new FormData(form);
  if(String(fd.get('website')||'').trim())return;
  const childrenPayload=readChildren();
  if(childrenPayload.some(function(child){return !child.lastName||!child.firstName})){
    alert('Nom et prénoms sont obligatoires pour chaque enfant.');
    showStep(1);
    return;
  }
  const button=document.getElementById('submitBtn');
  const saving=document.getElementById('saving');
  button.disabled=true;
  button.textContent='Envoi en cours…';
  saving.textContent='Création sécurisée du dossier familial…';
  try{
    const response=await fetch(PUBLIC_ENDPOINT+'?code='+encodeURIComponent(PUBLIC_CODE),{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        code:PUBLIC_CODE,
        familyToken:FAMILY_TOKEN,
        clientRequestId:crypto.randomUUID(),
        guardian:{
          lastName:String(fd.get('guardianLastName')||''),
          firstName:String(fd.get('guardianFirstName')||''),
          relationship:String(fd.get('relationship')||'GUARDIAN'),
          phonePrimary:String(fd.get('phonePrimary')||''),
          phoneSecondary:String(fd.get('phoneSecondary')||''),
          email:String(fd.get('email')||''),
          cinNumber:String(fd.get('cinNumber')||''),
          cinIssuedAt:String(fd.get('cinIssuedAt')||''),
          cinIssuePlace:String(fd.get('cinIssuePlace')||''),
          occupation:String(fd.get('occupation')||''),
          address:String(fd.get('address')||''),
          city:String(fd.get('city')||''),
          preferredContact:String(fd.get('preferredContact')||'PHONE'),
          secondary:{
            relationship:String(fd.get('secondaryRelationship')||'OTHER'),
            lastName:String(fd.get('secondaryLastName')||''),
            firstName:String(fd.get('secondaryFirstName')||''),
            phonePrimary:String(fd.get('secondaryPhonePrimary')||''),
            email:String(fd.get('secondaryEmail')||''),
            cinNumber:String(fd.get('secondaryCinNumber')||''),
            cinIssuedAt:String(fd.get('secondaryCinIssuedAt')||''),
            cinIssuePlace:String(fd.get('secondaryCinIssuePlace')||''),
            occupation:String(fd.get('secondaryOccupation')||'')
          }
        },
        children:childrenPayload
      })
    });
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Envoi impossible.');
    saving.textContent='Dossier créé. Envoi des pièces justificatives…';
    const uploads=await uploadDocuments(result);
    try{localStorage.removeItem(DRAFT_KEY)}catch{}
    form.style.display='none';
    q('.progress').style.display='none';
    document.getElementById('reference').textContent=result.referenceCode;
    document.getElementById('uploadStatus').textContent=
      uploads.uploaded>0
        ? uploads.uploaded+' document(s) transmis'+(uploads.failed?' · '+uploads.failed+' échec(s)':'')
        : 'Les pièces manquantes pourront être complétées avec l’établissement.';
    const portal=document.getElementById('portalLink');
    portal.href=result.portalUrl||('#');
    document.getElementById('success').style.display='block';
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(error){
    alert(error&&error.message?error.message:'Envoi impossible.');
    button.disabled=false;
    button.textContent='Envoyer la demande';
    saving.textContent='';
  }
});

restoreDraft();
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

    const publicEndpoint = publicEnrollmentEndpoint(supabaseUrl);

    if (url.searchParams.get("action") === "upload" && req.method === "POST") {
      return await uploadEnrollmentDocument(
        admin,
        req,
        clean(url.searchParams.get("family"), 160),
      );
    }

    const portalToken = clean(url.searchParams.get("portal"), 160);
    if (portalToken && req.method === "GET") {
      const portal = await loadPortalData(admin, portalToken);
      if (!portal) {
        return new Response("Lien famille invalide ou expiré.", {
          status: 404,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return new Response(renderPortalPage(portal, portalToken, publicEndpoint), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "DENY",
        },
      });
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
        const target = new URL(publicEndpoint);
        target.searchParams.set("code", publicCode);
        const familyToken = clean(url.searchParams.get("family"), 160);
        if (familyToken) target.searchParams.set("family", familyToken);
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

      const familyToken = clean(url.searchParams.get("family"), 160);
      const familyAccess = familyToken
        ? await loadPortalData(admin, familyToken)
        : null;

      return new Response(
        renderPage(
          context,
          publicCode,
          familyAccess?.family?.school_id === context.campaign.school_id
            ? familyAccess
            : null,
          publicEndpoint,
        ),
        {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "no-referrer",
          "X-Frame-Options": "DENY",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Content-Security-Policy":
            "default-src 'self'; img-src 'self' data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' https://*.supabase.co; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        },
      },
      );
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

    let persistent: any = null;
    const suppliedFamilyToken = clean(body.familyToken, 160);
    if (suppliedFamilyToken) {
      const tokenAccess = await familyFromToken(admin, suppliedFamilyToken);
      if (
        tokenAccess &&
        tokenAccess.family.school_id === context.campaign.school_id
      ) {
        persistent = await findOrCreatePersistentFamily(
          admin,
          context.campaign.school_id,
          guardian,
          tokenAccess.family.id,
          tokenAccess.primaryGuardian?.id,
        );
      }
    }

    if (!persistent) {
      persistent = await findOrCreatePersistentFamily(
        admin,
        context.campaign.school_id,
        guardian,
      );
    }

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

    const familyToken =
      suppliedFamilyToken ||
      (await issuePortalToken(
        admin,
        context.campaign.school_id,
        persistent.family.id,
      ));
    const portalUrl =
      publicEndpoint +
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
