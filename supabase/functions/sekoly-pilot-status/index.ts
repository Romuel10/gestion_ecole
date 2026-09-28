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

async function countRows(
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
    return Response.json(
      { error: "Méthode non autorisée." },
      { status: 405, headers: cors },
    );
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return Response.json(
        { error: "Authentification requise." },
        { status: 401, headers: cors },
      );
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishable = envKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_ANON_KEY",
    );
    const secret = envKey(
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const userClient = createClient(url, publishable, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        { error: "Session invalide." },
        { status: 401, headers: cors },
      );
    }

    const body = await req.json();
    const schoolId = String(body.schoolId ?? "").trim();
    if (!schoolId) {
      return Response.json(
        { error: "Établissement Cloud manquant." },
        { status: 400, headers: cors },
      );
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
    if (
      !caller ||
      caller.status !== "ACTIVE" ||
      !["SCHOOL_ADMIN", "DIRECTOR"].includes(caller.role)
    ) {
      return Response.json(
        { error: "Droits insuffisants." },
        { status: 403, headers: cors },
      );
    }

    const { data: school, error: schoolError } = await admin
      .from("sekoly_schools")
      .select("id,name")
      .eq("id", schoolId)
      .single();
    if (schoolError) throw schoolError;

    const [
      years,
      terms,
      subjects,
      classes,
      students,
      teachers,
      assignments,
      timetable,
    ] = await Promise.all([
      countRows(admin, "sekoly_school_years", schoolId),
      countRows(admin, "sekoly_terms", schoolId),
      countRows(admin, "sekoly_subjects", schoolId),
      countRows(admin, "sekoly_classes", schoolId),
      countRows(admin, "sekoly_students", schoolId),
      countRows(admin, "sekoly_teachers", schoolId),
      countRows(admin, "sekoly_teacher_assignments", schoolId),
      countRows(admin, "sekoly_timetable_slots", schoolId),
    ]);

    const { count: teachersWithAccess, error: teacherAccessError } = await admin
      .from("sekoly_teachers")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .not("user_id", "is", null);
    if (teacherAccessError) throw teacherAccessError;

    const { data: activeYear, error: activeYearError } = await admin
      .from("sekoly_school_years")
      .select("id,label,status")
      .eq("school_id", schoolId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();
    if (activeYearError) throw activeYearError;

    const counts = {
      years,
      terms,
      subjects,
      classes,
      students,
      teachers,
      teachersWithAccess: teachersWithAccess ?? 0,
      assignments,
      timetable,
    };

    const checks = {
      school: Boolean(school?.id),
      activeYear: Boolean(activeYear?.id),
      terms: terms > 0,
      subjects: subjects > 0,
      classes: classes > 0,
      students: students > 0,
      teachers: teachers > 0,
      assignments: assignments > 0,
      teacherAccess: (teachersWithAccess ?? 0) > 0,
    };

    const dataReady =
      checks.school &&
      checks.activeYear &&
      checks.terms &&
      checks.subjects &&
      checks.classes &&
      checks.students &&
      checks.teachers &&
      checks.assignments;

    const mobileReady = dataReady && checks.teacherAccess;
    const resendConfigured = Boolean(
      Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL"),
    );

    return Response.json(
      {
        school: { id: school.id, name: school.name },
        activeYear,
        counts,
        checks,
        dataReady,
        mobileReady,
        resendConfigured,
      },
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Erreur serveur.",
      },
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
});
