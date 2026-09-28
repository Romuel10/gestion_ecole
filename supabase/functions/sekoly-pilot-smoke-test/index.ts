import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

type Check = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
};

async function exactCount(
  admin: ReturnType<typeof createClient>,
  table: string,
  schoolId: string,
) {
  const { count, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("school_id", schoolId);
  if (error) throw error;
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return Response.json({ error: "Méthode non autorisée." }, { status: 405, headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return Response.json({ error: "Authentification requise." }, { status: 401, headers: cors });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

    const userClient = createClient(url, publishable, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Session invalide." }, { status: 401, headers: cors });
    }

    const body = await req.json();
    const schoolId = String(body.schoolId ?? "").trim();
    if (!schoolId) {
      return Response.json({ error: "Établissement Cloud manquant." }, { status: 400, headers: cors });
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: caller, error: callerError } = await admin
      .from("sekoly_memberships")
      .select("role,status")
      .eq("school_id", schoolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (callerError) throw callerError;
    if (!caller || caller.status !== "ACTIVE" || !["SCHOOL_ADMIN", "DIRECTOR"].includes(caller.role)) {
      return Response.json({ error: "Droits insuffisants." }, { status: 403, headers: cors });
    }

    const [
      schoolResult,
      activeYearResult,
      unlockedTermsResult,
      teachersResult,
      assignmentsResult,
      students,
      enrollments,
      classes,
      subjects,
      timetable,
      attendanceSessions,
      assessments,
    ] = await Promise.all([
      admin.from("sekoly_schools").select("id,name,status").eq("id", schoolId).single(),
      admin.from("sekoly_school_years").select("id,label,status").eq("school_id", schoolId).eq("status", "ACTIVE").limit(1).maybeSingle(),
      admin.from("sekoly_terms").select("id,label").eq("school_id", schoolId).eq("is_locked", false),
      admin.from("sekoly_teachers").select("id,email,user_id,status").eq("school_id", schoolId),
      admin.from("sekoly_teacher_assignments").select("id,teacher_id,class_id,subject_id,active").eq("school_id", schoolId).eq("active", true),
      exactCount(admin, "sekoly_students", schoolId),
      exactCount(admin, "sekoly_enrollments", schoolId),
      exactCount(admin, "sekoly_classes", schoolId),
      exactCount(admin, "sekoly_subjects", schoolId),
      exactCount(admin, "sekoly_timetable_slots", schoolId),
      exactCount(admin, "sekoly_attendance_sessions", schoolId),
      exactCount(admin, "sekoly_assessments", schoolId),
    ]);

    if (schoolResult.error) throw schoolResult.error;
    if (activeYearResult.error) throw activeYearResult.error;
    if (unlockedTermsResult.error) throw unlockedTermsResult.error;
    if (teachersResult.error) throw teachersResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    const teachers = teachersResult.data ?? [];
    const assignments = assignmentsResult.data ?? [];
    const mobileTeacherIds = new Set(
      teachers.filter((teacher) => Boolean(teacher.user_id)).map((teacher) => teacher.id),
    );
    const mobileAssignments = assignments.filter((assignment) =>
      mobileTeacherIds.has(assignment.teacher_id)
    ).length;
    const teachersWithEmail = teachers.filter((teacher) => Boolean(teacher.email)).length;
    const teachersWithAccess = mobileTeacherIds.size;
    const unlockedTerms = unlockedTermsResult.data?.length ?? 0;
    const resendConfigured = Boolean(
      Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL"),
    );

    const checks: Check[] = [
      {
        key: "school_active",
        label: "Établissement Cloud actif",
        ok: schoolResult.data?.status === "ACTIVE",
        required: true,
        detail: schoolResult.data?.name ?? "Établissement introuvable",
      },
      {
        key: "active_year",
        label: "Année scolaire active",
        ok: Boolean(activeYearResult.data?.id),
        required: true,
        detail: activeYearResult.data?.label ?? "Aucune année active",
      },
      {
        key: "unlocked_term",
        label: "Période ouverte pour les notes",
        ok: unlockedTerms > 0,
        required: true,
        detail: unlockedTerms > 0 ? `${unlockedTerms} période(s) ouverte(s)` : "Toutes les périodes sont verrouillées ou absentes",
      },
      {
        key: "academic_structure",
        label: "Classes et matières synchronisées",
        ok: classes > 0 && subjects > 0,
        required: true,
        detail: `${classes} classe(s), ${subjects} matière(s)`,
      },
      {
        key: "students",
        label: "Élèves et inscriptions synchronisés",
        ok: students > 0 && enrollments > 0,
        required: true,
        detail: `${students} élève(s), ${enrollments} inscription(s)`,
      },
      {
        key: "teacher_email",
        label: "Adresse email enseignant",
        ok: teachersWithEmail > 0,
        required: true,
        detail: `${teachersWithEmail}/${teachers.length} enseignant(s) avec email`,
      },
      {
        key: "teacher_access",
        label: "Compte Sekoly Enseignant",
        ok: teachersWithAccess > 0,
        required: true,
        detail: `${teachersWithAccess} accès mobile actif(s)`,
      },
      {
        key: "mobile_assignment",
        label: "Affectation du compte mobile",
        ok: mobileAssignments > 0,
        required: true,
        detail: `${mobileAssignments} affectation(s) liée(s) à un enseignant mobile`,
      },
      {
        key: "timetable",
        label: "Emploi du temps mobile",
        ok: timetable > 0,
        required: false,
        detail: timetable > 0 ? `${timetable} cours planifié(s)` : "Aucun cours planifié — les classes restent accessibles par affectation",
      },
      {
        key: "resend",
        label: "Activation par email Resend",
        ok: resendConfigured,
        required: false,
        detail: resendConfigured ? "Secrets Resend présents" : "Optionnel pour le pilote avec mot de passe temporaire",
      },
    ];

    const blocking = checks.filter((check) => check.required && !check.ok);
    const ready = blocking.length === 0;

    return Response.json(
      {
        ready,
        checkedAt: new Date().toISOString(),
        school: schoolResult.data,
        activeYear: activeYearResult.data,
        checks,
        blocking: blocking.map((check) => check.key),
        stats: {
          teachers: teachers.length,
          teachersWithEmail,
          teachersWithAccess,
          assignments: assignments.length,
          mobileAssignments,
          students,
          enrollments,
          classes,
          subjects,
          unlockedTerms,
          timetable,
          attendanceSessions,
          assessments,
        },
      },
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur serveur." },
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});