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

type FormScope = "FAMILY" | "CHILD";

function configuredFields(schema: any, scope: FormScope) {
  const hasSections = Array.isArray(schema?.sections) && schema.sections.length > 0;
  const visibleSectionIds = new Set(
    hasSections
      ? schema.sections
          .filter(
            (section: any) =>
              section &&
              section.scope === scope &&
              section.visible !== false &&
              typeof section.id === "string",
          )
          .map((section: any) => section.id)
      : [],
  );

  return Array.isArray(schema?.fields)
    ? schema.fields
        .filter(
          (field: any) =>
            field &&
            field.scope === scope &&
            field.visible !== false &&
            typeof field.key === "string" &&
            (!hasSections ||
              !field.sectionId ||
              visibleSectionIds.has(field.sectionId)),
        )
        .sort(
          (a: any, b: any) =>
            Number(a.order ?? 100) - Number(b.order ?? 100),
        )
    : [];
}

function configuredDocuments(schema: any, scope?: FormScope) {
  return Array.isArray(schema?.documents)
    ? schema.documents
        .filter(
          (document: any) =>
            document &&
            document.visible !== false &&
            typeof document.code === "string" &&
            typeof document.label === "string" &&
            (!scope || document.scope === scope),
        )
        .map((document: any) => ({
          ...document,
          code: clean(document.code, 80).toUpperCase(),
          label: clean(document.label, 180),
          scope: document.scope === "FAMILY" ? "FAMILY" : "CHILD",
        }))
        .filter((document: any) => /^[A-Z0-9_]{2,80}$/.test(document.code))
        .sort(
          (a: any, b: any) =>
            Number(a.order ?? 100) - Number(b.order ?? 100),
        )
    : [];
}

function legacyChecklistCodeFromDocumentType(documentType: string) {
  const map: Record<string, string> = {
    BIRTH_CERTIFICATE: "BIRTH_CERTIFICATE",
    RESIDENCE_CERTIFICATE: "RESIDENCE",
    STUDENT_PHOTO: "STUDENT_PHOTO",
    TRANSFER_CERTIFICATE: "TRANSFER",
    REPORT_CARD: "REPORT_CARD",
    VACCINATION_RECORD: "VACCINATION_RECORD",
    CIN_FATHER: "CIN_PRIMARY",
    CIN_MOTHER: "CIN_PRIMARY",
    CIN_GUARDIAN: "CIN_PRIMARY",
  };
  return map[documentType] ?? "";
}

function documentTypeForCode(code: string, access: any) {
  const primaryLink =
    (access.links ?? []).find((item: any) => item.is_primary) ??
    (access.links ?? [])[0] ??
    null;
  const secondaryLink =
    (access.links ?? []).find((item: any) => !item.is_primary) ?? null;
  const cinType = (relationship: string | null | undefined) =>
    relationship === "FATHER"
      ? "CIN_FATHER"
      : relationship === "MOTHER"
        ? "CIN_MOTHER"
        : "CIN_GUARDIAN";

  const map: Record<string, string> = {
    BIRTH_CERTIFICATE: "BIRTH_CERTIFICATE",
    RESIDENCE: "RESIDENCE_CERTIFICATE",
    STUDENT_PHOTO: "STUDENT_PHOTO",
    TRANSFER: "TRANSFER_CERTIFICATE",
    REPORT_CARD: "REPORT_CARD",
    VACCINATION_RECORD: "VACCINATION_RECORD",
    CIN_PRIMARY: cinType(primaryLink?.relationship),
    CIN_SECONDARY: cinType(secondaryLink?.relationship),
  };
  return map[code] ?? code;
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function safeAnswerValue(field: any, value: unknown) {
  if (value === null || value === undefined) return null;
  if (field.type === "YES_NO") {
    if (value === true || value === "true" || value === "YES") return true;
    if (value === false || value === "false" || value === "NO") return false;
    return null;
  }
  if (field.type === "NUMBER") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const normalized = clean(value, field.type === "TEXTAREA" ? 4000 : 500);
  if (!normalized) return null;

  if (field.type === "SELECT" && Array.isArray(field.options)) {
    const allowed = field.options.map((item: unknown) => clean(item, 160));
    return allowed.includes(normalized) ? normalized : null;
  }
  if (field.type === "EMAIL") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      ? normalized.toLowerCase()
      : null;
  }
  if (field.type === "DATE") {
    return isValidIsoDate(normalized) ? normalized : null;
  }
  return normalized;
}

function sanitizeCustomAnswers(
  schema: any,
  scope: FormScope,
  answers: unknown,
) {
  const input =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? (answers as Record<string, unknown>)
      : {};
  const output: Record<string, unknown> = {};
  for (const field of configuredFields(schema, scope)) {
    if (!field.custom) continue;
    const rawValue = input[field.key];
    const value = safeAnswerValue(field, rawValue);
    if (hasConfiguredValue(rawValue) && value === null) {
      throw new Error(
        `La valeur du champ « ${clean(field.label, 180) || field.key} » est invalide.`,
      );
    }
    if (value !== null && value !== "") output[field.key] = value;
  }
  return output;
}

function configuredValue(
  scope: FormScope,
  field: any,
  source: any,
  customAnswers: Record<string, unknown>,
) {
  if (field.custom) return customAnswers[field.key];

  if (scope === "FAMILY") {
    const secondary = source?.secondary ?? {};
    const map: Record<string, unknown> = {
      guardianLastName: source?.lastName,
      guardianFirstName: source?.firstName,
      relationship: source?.relationship,
      phonePrimary: source?.phonePrimary,
      phoneSecondary: source?.phoneSecondary,
      email: source?.email,
      cinNumber: source?.cinNumber,
      cinIssuedAt: source?.cinIssuedAt,
      cinIssuePlace: source?.cinIssuePlace,
      occupation: source?.occupation,
      address: source?.address,
      city: source?.city,
      preferredContact: source?.preferredContact,
      secondaryRelationship: secondary.relationship,
      secondaryLastName: secondary.lastName,
      secondaryFirstName: secondary.firstName,
      secondaryPhonePrimary: secondary.phonePrimary,
      secondaryEmail: secondary.email,
      secondaryCinNumber: secondary.cinNumber,
      secondaryCinIssuedAt: secondary.cinIssuedAt,
      secondaryCinIssuePlace: secondary.cinIssuePlace,
      secondaryOccupation: secondary.occupation,
    };
    return map[field.key];
  }

  return source?.[field.key];
}

function hasConfiguredValue(value: unknown) {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return clean(value, 4000).length > 0;
}

function validateConfiguredRequiredFields(
  schema: any,
  scope: FormScope,
  source: any,
  customAnswers: Record<string, unknown>,
) {
  for (const field of configuredFields(schema, scope)) {
    if (!field.required) continue;
    if (
      scope === "CHILD" &&
      field.key === "existingMatricule" &&
      clean(source?.type, 32) !== "RE_REGISTRATION"
    ) {
      continue;
    }
    const value = configuredValue(scope, field, source, customAnswers);
    if (!hasConfiguredValue(value)) {
      throw new Error(
        `Le champ « ${clean(field.label, 180) || field.key} » est obligatoire.`,
      );
    }
  }
}

function validateConfiguredFieldValues(
  schema: any,
  scope: FormScope,
  source: any,
  customAnswers: Record<string, unknown>,
) {
  for (const field of configuredFields(schema, scope)) {
    if (
      scope === "CHILD" &&
      field.key === "existingMatricule" &&
      clean(source?.type, 32) !== "RE_REGISTRATION"
    ) {
      continue;
    }

    const value = configuredValue(scope, field, source, customAnswers);
    if (!hasConfiguredValue(value) || field.custom) continue;

    const label = clean(field.label, 180) || field.key;
    const normalized = clean(value, field.type === "TEXTAREA" ? 4000 : 500);

    if (
      field.type === "EMAIL" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) {
      throw new Error(`Le champ « ${label} » doit contenir un email valide.`);
    }

    if (field.type === "NUMBER" && !Number.isFinite(Number(value))) {
      throw new Error(`Le champ « ${label} » doit contenir un nombre valide.`);
    }

    if (field.type === "DATE" && !isValidIsoDate(normalized)) {
      throw new Error(`Le champ « ${label} » doit contenir une date valide.`);
    }

    if (
      field.type === "SELECT" &&
      Array.isArray(field.options) &&
      field.options.length > 0
    ) {
      const allowed = field.options.map((item: unknown) => clean(item, 160));
      if (!allowed.includes(normalized)) {
        throw new Error(`La valeur choisie pour « ${label} » n’est pas autorisée.`);
      }
    }

    if (
      field.type === "YES_NO" &&
      ![
        true,
        false,
        "true",
        "false",
        "YES",
        "NO",
      ].includes(value as any)
    ) {
      throw new Error(`Le champ « ${label} » doit être Oui ou Non.`);
    }
  }
}

function guardianSubmissionSnapshot(
  guardian: any,
  customAnswers: Record<string, unknown>,
) {
  const secondary = guardian?.secondary ?? {};
  return {
    guardian: {
      lastName: clean(guardian?.lastName, 120),
      firstName: clean(guardian?.firstName, 120),
      relationship: clean(guardian?.relationship, 20),
      phonePrimary: clean(guardian?.phonePrimary, 40),
      phoneSecondary: nullable(guardian?.phoneSecondary, 40),
      email: nullable(guardian?.email, 160),
      cinNumber: nullable(guardian?.cinNumber, 80),
      cinIssuedAt: nullable(guardian?.cinIssuedAt, 10),
      cinIssuePlace: nullable(guardian?.cinIssuePlace, 160),
      occupation: nullable(guardian?.occupation, 160),
      address: nullable(guardian?.address, 250),
      city: nullable(guardian?.city, 120),
      preferredContact: clean(guardian?.preferredContact, 20) || "PHONE",
      secondary: {
        relationship: clean(secondary?.relationship, 20),
        lastName: nullable(secondary?.lastName, 120),
        firstName: nullable(secondary?.firstName, 120),
        phonePrimary: nullable(secondary?.phonePrimary, 40),
        email: nullable(secondary?.email, 160),
        cinNumber: nullable(secondary?.cinNumber, 80),
        cinIssuedAt: nullable(secondary?.cinIssuedAt, 10),
        cinIssuePlace: nullable(secondary?.cinIssuePlace, 160),
        occupation: nullable(secondary?.occupation, 160),
      },
    },
    customAnswers,
    submittedAt: new Date().toISOString(),
  };
}

const FAMILY_FRONTEND_URL =
  "https://romuel10.github.io/romuel-app-store/sekoly/enrollment/index.html";

function familyFrontendUrl(
  _supabaseUrl: string,
  params: Record<string, string | null | undefined>,
) {
  const url = new URL(FAMILY_FRONTEND_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
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
  if (!forcedFamilyId) throw new Error('Une preuve d’accès familial est requise.');
  const { data: authorizedLinks, error: authorizedError } = await admin
    .from("sekoly_family_guardians").select("guardian_id")
    .eq("school_id", schoolId).eq("family_id", forcedFamilyId);
  if (authorizedError) throw authorizedError;
  const authorizedGuardianIds = (authorizedLinks ?? []).map((link: any) => link.guardian_id);
  if (forcedGuardianId && !authorizedGuardianIds.includes(forcedGuardianId)) {
    throw new Error('Responsable extérieur à cette famille.');
  }
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
          .in("id", authorizedGuardianIds)
          .ilike("cin_number", secondaryCin)
          .maybeSingle();
        secondaryGuardian = data;
      }

      if (!secondaryGuardian && secondaryPhone) {
        const { data } = await admin
          .from("sekoly_guardians")
          .select("*")
          .eq("school_id", schoolId)
          .in("id", authorizedGuardianIds)
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

async function submissionFromToken(admin: any, token: string) {
  if (!token || token.length < 24) return null;
  const { data, error } = await admin.from("sekoly_enrollment_families")
    .select("id,school_id")
    .eq("submission_token_hash", await hashPortalToken(token))
    .gt("submission_token_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data ? { family: { id: null, school_id: data.school_id },
    submissionFamilyId: data.id, links: [], guardians: [], primaryGuardian: null } : null;
}

async function enrollmentFamiliesForAccess(admin: any, access: any) {
  let query = admin.from("sekoly_enrollment_families").select("id")
    .eq("school_id", access.family.school_id);
  query = access.submissionFamilyId ? query.eq("id", access.submissionFamilyId)
    : query.eq("family_profile_id", access.family.id);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function uploadEnrollmentDocument(
  admin: any,
  req: Request,
  familyToken: string,
  submissionToken = "",
) {
  const access: any = familyToken ? await familyFromToken(admin, familyToken)
    : await submissionFromToken(admin, submissionToken);
  if (!access) {
    return jsonResponse({ error: "Lien famille invalide ou expiré." }, 401);
  }

  const form = await req.formData();
  const file = form.get("file");
  const applicationId = clean(form.get("applicationId"), 64);
  const legacyDocumentType = clean(form.get("documentType"), 80).toUpperCase();
  const suppliedCode = clean(form.get("documentCode"), 80).toUpperCase();
  const documentCode =
    suppliedCode || legacyChecklistCodeFromDocumentType(legacyDocumentType);

  if (!(file instanceof File)) {
    return jsonResponse({ error: "Fichier manquant." }, 400);
  }
  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return jsonResponse(
      { error: "Format non autorisé : PDF, JPG, PNG ou WEBP uniquement." },
      400,
    );
  }
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    return jsonResponse({ error: "Le fichier doit faire moins de 10 Mo." }, 400);
  }
  if (!/^[A-Z0-9_]{2,80}$/.test(documentCode)) {
    return jsonResponse({ error: "Code de pièce justificative invalide." }, 400);
  }

  const { data: limits, error: limitsError } = await admin
    .from("sekoly_school_limits")
    .select("max_document_bytes,status")
    .eq("school_id", access.family.school_id)
    .maybeSingle();
  if (limitsError) throw limitsError;
  if (limits?.status === "SUSPENDED") {
    return jsonResponse(
      {
        error:
          "Le dépôt de documents est temporairement suspendu pour cet établissement.",
      },
      403,
    );
  }
  if (limits?.max_document_bytes) {
    const usedBytes = await documentStorageUsage(admin, access.family.school_id);
    if (usedBytes + file.size > Number(limits.max_document_bytes)) {
      return jsonResponse(
        {
          error:
            "L’espace de documents de l’établissement est momentanément saturé. Contactez l’école pour transmettre cette pièce.",
        },
        507,
      );
    }
  }

  let application: any = null;
  let documentConfig: any = null;

  if (applicationId) {
    const { data, error } = await admin
      .from("sekoly_enrollment_applications")
      .select("id,school_id,family_id,status,form_schema_snapshot")
      .eq("id", applicationId)
      .eq("school_id", access.family.school_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return jsonResponse({ error: "Dossier enfant introuvable." }, 404);
    }

    const { data: campaignFamily, error: campaignFamilyError } = await admin
      .from("sekoly_enrollment_families")
      .select("id,family_profile_id")
      .eq("id", data.family_id)
      .eq("school_id", access.family.school_id)
      .maybeSingle();
    if (campaignFamilyError) throw campaignFamilyError;
    if (!campaignFamily || (access.submissionFamilyId ? campaignFamily.id !== access.submissionFamilyId : campaignFamily.family_profile_id !== access.family.id)) {
      return jsonResponse(
        { error: "Ce dossier ne correspond pas à votre famille." },
        403,
      );
    }

    application = data;
    documentConfig = configuredDocuments(data.form_schema_snapshot).find(
      (item: any) => item.code === documentCode,
    );
  } else {
    const campaignFamilies = await enrollmentFamiliesForAccess(admin, access);

    const familyIds = (campaignFamilies ?? []).map((item: any) => item.id);
    if (familyIds.length > 0) {
      const { data: applications, error: applicationsError } = await admin
        .from("sekoly_enrollment_applications")
        .select("id,status,form_schema_snapshot")
        .eq("school_id", access.family.school_id)
        .in("family_id", familyIds)
        .not("status", "in", '("APPROVED","REJECTED","WITHDRAWN")')
        .order("created_at", { ascending: false })
        .limit(50);
      if (applicationsError) throw applicationsError;

      for (const item of applications ?? []) {
        const candidate = configuredDocuments(
          item.form_schema_snapshot,
          "FAMILY",
        ).find((document: any) => document.code === documentCode);
        if (candidate) {
          documentConfig = candidate;
          break;
        }
      }
    }
  }

  if (!documentConfig) {
    return jsonResponse(
      {
        error:
          "Cette pièce n’est pas demandée dans la version du formulaire correspondant à ce dossier.",
      },
      400,
    );
  }

  if (documentConfig.scope === "CHILD" && !application?.id) {
    return jsonResponse(
      { error: "Cette pièce doit être rattachée au dossier d’un enfant." },
      400,
    );
  }

  const targetApplication =
    documentConfig.scope === "CHILD" ? application : null;
  const documentType = documentTypeForCode(documentCode, access);
  if (!/^[A-Z0-9_]{2,80}$/.test(documentType)) {
    return jsonResponse({ error: "Type de document invalide." }, 400);
  }

  const objectId = crypto.randomUUID();
  const storagePath =
    access.family.school_id +
    "/" +
    (access.family.id ?? access.submissionFamilyId) +
    "/" +
    (targetApplication?.id || "family") +
    "/" +
    objectId +
    "_" +
    safeFilename(file.name);

  const { error: uploadError } = await admin.storage
    .from(ENROLLMENT_BUCKET)
    .upload(storagePath, new Uint8Array(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;

  let documentGuardianId: string | null = null;
  if (documentCode === "CIN_PRIMARY") {
    documentGuardianId =
      (access.links ?? []).find((item: any) => item.is_primary)?.guardian_id ??
      null;
  } else if (documentCode === "CIN_SECONDARY") {
    documentGuardianId =
      (access.links ?? []).find((item: any) => !item.is_primary)?.guardian_id ??
      null;
  }

  const { data: document, error: docError } = await admin
    .from("sekoly_enrollment_documents")
    .insert({
      school_id: access.family.school_id,
      family_id: access.family.id,
      enrollment_family_id: access.submissionFamilyId ?? null,
      application_id: targetApplication?.id ?? null,
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

  let targetApplicationIds: string[] = [];
  if (documentConfig.scope === "CHILD" && targetApplication?.id) {
    targetApplicationIds = [targetApplication.id];
  } else {
    const campaignFamilies = await enrollmentFamiliesForAccess(admin, access);

    const familyIds = (campaignFamilies ?? []).map((item: any) => item.id);
    if (familyIds.length > 0) {
      const { data: familyApplications, error: familyApplicationsError } =
        await admin
          .from("sekoly_enrollment_applications")
          .select("id,status")
          .eq("school_id", access.family.school_id)
          .in("family_id", familyIds)
          .not("status", "in", '("APPROVED","REJECTED","WITHDRAWN")');
      if (familyApplicationsError) throw familyApplicationsError;
      targetApplicationIds = (familyApplications ?? []).map(
        (item: any) => item.id,
      );
    }
  }

  if (targetApplicationIds.length > 0) {
    const { error: checklistError } = await admin
      .from("sekoly_enrollment_checklist_items")
      .update({
        status: "PROVIDED",
        document_id: document.id,
        note: "Document transmis par la famille.",
      })
      .in("application_id", targetApplicationIds)
      .eq("code", documentCode);
    if (checklistError) throw checklistError;
  }

  return jsonResponse(
    {
      ok: true,
      document,
      documentCode,
      scope: documentConfig.scope,
    },
    201,
  );
}

async function loadCampaign(admin: any, publicCode: string) {
  const { data: campaign, error } = await admin
    .from("sekoly_enrollment_campaigns")
    .select("id,school_id,school_year_id,name,status,allow_new_admission,allow_re_registration,instructions,opens_at,closes_at,form_schema,form_schema_version")
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
        .select("id,application_id,code,label,scope,required,status,document_id,note,sort_order")
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET") {
    console.log(
      "sekoly-public-enrollment GET",
      JSON.stringify({
        pathname: url.pathname,
        action: url.searchParams.get("action"),
        hasCode: Boolean(url.searchParams.get("code")),
        format: url.searchParams.get("format"),
        hasPortal: Boolean(url.searchParams.get("portal")),
      }),
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !secret) throw new Error("Configuration serveur incomplète.");

    const admin = createClient(supabaseUrl, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (
      url.searchParams.get("action") === "portal-bootstrap" &&
      req.method === "GET"
    ) {
      const portalToken = clean(url.searchParams.get("portal"), 160);
      if (!portalToken) {
        return jsonResponse({ error: "Accès famille manquant." }, 400);
      }

      const portal = await loadPortalData(admin, portalToken);
      if (!portal) {
        return jsonResponse({ error: "Accès famille invalide ou expiré." }, 404);
      }

      const primaryRelationship =
        (portal.links ?? []).find(
          (item: any) => item.guardian_id === portal.primaryGuardian?.id,
        )?.relationship ?? "GUARDIAN";

      return jsonResponse({
        school: portal.school,
        family: {
          id: portal.family.id,
          code: portal.family.family_code,
          displayName: portal.family.display_name,
        },
        primaryGuardian: portal.primaryGuardian
          ? {
              id: portal.primaryGuardian.id,
              lastName: portal.primaryGuardian.last_name,
              firstName: portal.primaryGuardian.first_name,
              phonePrimary: portal.primaryGuardian.phone_primary,
              email: portal.primaryGuardian.email,
              relationship: primaryRelationship,
            }
          : null,
        students: portal.students ?? [],
        applications: portal.applications ?? [],
        checklist: portal.checklist ?? [],
        documents: portal.documents ?? [],
        campaign: portal.campaign
          ? {
              id: portal.campaign.id,
              publicCode: portal.campaign.public_code,
              name: portal.campaign.name,
            }
          : null,
      });
    }

    if (
      url.searchParams.get("action") === "bootstrap" &&
      req.method === "GET"
    ) {
      const publicCode = clean(url.searchParams.get("code"), 64);
      if (!publicCode) {
        return jsonResponse({ error: "Code d'inscription manquant." }, 400);
      }

      const context = await loadCampaign(admin, publicCode);
      if (!context) {
        return jsonResponse({ error: "Campagne fermée ou lien invalide." }, 404);
      }

      const familyToken = clean(url.searchParams.get("family"), 160);
      const familyAccess = familyToken
        ? await loadPortalData(admin, familyToken)
        : null;
      const validFamilyAccess =
        familyAccess?.family?.school_id === context.campaign.school_id
          ? familyAccess
          : null;

      const primaryGuardian = validFamilyAccess?.primaryGuardian ?? null;
      const primaryRelationship = primaryGuardian
        ? validFamilyAccess.links.find(
            (link: any) => link.guardian_id === primaryGuardian.id,
          )?.relationship ?? "GUARDIAN"
        : "GUARDIAN";

      const secondaryGuardian = validFamilyAccess
        ? (validFamilyAccess.guardians ?? []).find(
            (item: any) => item.id !== primaryGuardian?.id,
          ) ?? null
        : null;
      const secondaryRelationship = secondaryGuardian
        ? validFamilyAccess.links.find(
            (link: any) => link.guardian_id === secondaryGuardian.id,
          )?.relationship ?? "OTHER"
        : "OTHER";

      return jsonResponse({
        school: context.school,
        year: context.year,
        classes: context.classes,
        campaign: context.campaign,
        family: validFamilyAccess
          ? {
              guardian: primaryGuardian
                ? {
                    lastName: primaryGuardian.last_name ?? "",
                    firstName: primaryGuardian.first_name ?? "",
                    phonePrimary: primaryGuardian.phone_primary ?? "",
                    phoneSecondary: primaryGuardian.phone_secondary ?? "",
                    email: primaryGuardian.email ?? "",
                    cinNumber: primaryGuardian.cin_number ?? "",
                    cinIssuedAt: primaryGuardian.cin_issued_at ?? "",
                    cinIssuePlace: primaryGuardian.cin_issue_place ?? "",
                    occupation: primaryGuardian.occupation ?? "",
                    address: primaryGuardian.address ?? "",
                    city: primaryGuardian.city ?? "",
                    relationship: primaryRelationship,
                  }
                : null,
              secondaryGuardian: secondaryGuardian
                ? {
                    lastName: secondaryGuardian.last_name ?? "",
                    firstName: secondaryGuardian.first_name ?? "",
                    phonePrimary: secondaryGuardian.phone_primary ?? "",
                    email: secondaryGuardian.email ?? "",
                    cinNumber: secondaryGuardian.cin_number ?? "",
                    cinIssuedAt: secondaryGuardian.cin_issued_at ?? "",
                    cinIssuePlace: secondaryGuardian.cin_issue_place ?? "",
                    occupation: secondaryGuardian.occupation ?? "",
                    relationship: secondaryRelationship,
                  }
                : null,
              students: (validFamilyAccess.students ?? []).map(
                (student: any) => ({
                  matricule: student.matricule,
                  lastName: student.last_name,
                  firstName: student.first_name,
                  birthDate: student.birth_date,
                }),
              ),
            }
          : null,
      });
    }

    if (url.searchParams.get("action") === "upload" && req.method === "POST") {
      return await uploadEnrollmentDocument(
        admin,
        req,
        clean(url.searchParams.get("family"), 160),
        clean(url.searchParams.get("submission"), 160),
      );
    }

    const portalToken = clean(url.searchParams.get("portal"), 160);
    if (portalToken && req.method === "GET") {
      return Response.redirect(
        familyFrontendUrl(supabaseUrl, { portal: portalToken }),
        302,
      );
    }

    const publicCode = clean(url.searchParams.get("code"), 64);
    if (!publicCode) return jsonResponse({ error: "Code d'inscription manquant." }, 400);

    // Browser navigation is always handled by the static frontend.
    // The frontend then calls action=bootstrap, which validates open/closed campaigns.
    if (req.method === "GET" && url.searchParams.get("format") !== "qr") {
      const familyToken = clean(url.searchParams.get("family"), 160);
      return Response.redirect(
        familyFrontendUrl(supabaseUrl, {
          code: publicCode,
          family: familyToken || null,
        }),
        302,
      );
    }

    const context = await loadCampaign(admin, publicCode);
    if (!context) {
      return jsonResponse({ error: "Campagne fermée ou lien invalide." }, 404);
    }

    if (req.method === "GET") {
      if (url.searchParams.get("format") === "qr") {
        const familyToken = clean(url.searchParams.get("family"), 160);
        const target = familyFrontendUrl(supabaseUrl, {
          code: publicCode,
          family: familyToken || null,
        });
        const svg = await QRCode.toString(target, {
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
            "X-Sekoly-QR-Target": target,
          },
        });
      }

      return jsonResponse({ error: "Format GET non pris en charge." }, 400);
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
    const formSchema =
      context.campaign.form_schema &&
      typeof context.campaign.form_schema === "object"
        ? context.campaign.form_schema
        : { schemaVersion: 1, fields: [], documents: [] };
    const formSchemaVersion = Math.max(
      1,
      Number(context.campaign.form_schema_version ?? 1),
    );
    const familyCustomAnswers = sanitizeCustomAnswers(
      formSchema,
      "FAMILY",
      body.customAnswers,
    );
    const guardianLastName = clean(guardian.lastName, 120);
    const guardianFirstName = clean(guardian.firstName, 120);
    const phonePrimary = clean(guardian.phonePrimary, 40);

    if (guardianLastName.length < 2 || phonePrimary.length < 6) {
      return jsonResponse({ error: "Nom et téléphone du responsable sont obligatoires." }, 400);
    }
    validateConfiguredRequiredFields(
      formSchema,
      "FAMILY",
      guardian,
      familyCustomAnswers,
    );
    validateConfiguredFieldValues(
      formSchema,
      "FAMILY",
      guardian,
      familyCustomAnswers,
    );
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
      const childCustomAnswers = sanitizeCustomAnswers(
        formSchema,
        "CHILD",
        child.customAnswers,
      );
      if (!allowedTypes.has(applicationType)) throw new Error("Type d'inscription non autorisé.");
      if (lastName.length < 1 || firstName.length < 1) throw new Error("Nom et prénoms de chaque enfant sont obligatoires.");
      const desiredClassId = clean(child.desiredClassId, 64);
      if (desiredClassId && !allowedClasses.has(desiredClassId)) throw new Error("Classe souhaitée invalide.");
      const existingMatricule = nullable(child.existingMatricule, 80);
      if (applicationType === "RE_REGISTRATION" && !existingMatricule) {
        throw new Error("Le matricule est obligatoire pour une réinscription.");
      }
      validateConfiguredRequiredFields(
        formSchema,
        "CHILD",
        child,
        childCustomAnswers,
      );
      validateConfiguredFieldValues(
        formSchema,
        "CHILD",
        child,
        childCustomAnswers,
      );
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
        form_schema_version: formSchemaVersion,
        form_schema_snapshot: formSchema,
        custom_answers: childCustomAnswers,
        submitted_payload: {
          child: {
            type: applicationType,
            existingMatricule,
            lastName: lastName.toUpperCase(),
            firstName,
            gender: ["M", "F"].includes(clean(child.gender, 1))
              ? clean(child.gender, 1)
              : null,
            birthDate: nullable(child.birthDate, 10),
            birthPlace: nullable(child.birthPlace, 180),
            nationality: nullable(child.nationality, 80) ?? "Malgache",
            desiredClassId: desiredClassId || null,
            previousSchool: nullable(child.previousSchool, 180),
            birthCertificateNumber: nullable(child.birthCertificateNumber, 100),
            birthCertificateDate: nullable(child.birthCertificateDate, 10),
            birthCertificatePlace: nullable(child.birthCertificatePlace, 180),
            bloodType: nullable(child.bloodType, 20),
            address: nullable(child.address, 250),
            neighborhood: nullable(child.neighborhood, 120),
            city: nullable(child.city, 120),
            medicalNotes: nullable(child.medicalNotes, 1000),
          },
          customAnswers: childCustomAnswers,
          submittedAt: new Date().toISOString(),
        },
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
      if (!tokenAccess || tokenAccess.family.school_id !== context.campaign.school_id) {
        return jsonResponse({ error: "Accès familial invalide ou expiré." }, 401);
      }
      persistent = await findOrCreatePersistentFamily(admin, context.campaign.school_id,
        guardian, tokenAccess.family.id, tokenAccess.primaryGuardian?.id);
    }
    // Anonymous submissions never look up or mutate a persistent family.
    const submissionToken = persistent ? null : randomPortalToken();
    const submissionHash = submissionToken ? await hashPortalToken(submissionToken) : null;

    const { data: family, error: familyError } = await admin
      .from("sekoly_enrollment_families")
      .insert({
        school_id: context.campaign.school_id,
        campaign_id: context.campaign.id,
        family_profile_id: persistent?.family.id ?? null,
        submission_token_hash: submissionHash,
        submission_token_expires_at: submissionHash ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null,
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
        form_schema_version: formSchemaVersion,
        form_schema_snapshot: formSchema,
        custom_answers: familyCustomAnswers,
        submitted_payload: guardianSubmissionSnapshot(
          guardian,
          familyCustomAnswers,
        ),
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

    const familyToken = persistent ? suppliedFamilyToken : null;
    const portalUrl = familyToken ? familyFrontendUrl(supabaseUrl, { portal: familyToken }) : null;

    return jsonResponse({
      ok: true,
      referenceCode: family.reference_code,
      familyCode: persistent?.family.family_code ?? null,
      submissionToken,
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
