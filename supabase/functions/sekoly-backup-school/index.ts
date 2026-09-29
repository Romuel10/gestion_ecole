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

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

async function fetchAll(
  admin: ReturnType<typeof createClient>,
  table: string,
  schoolId: string,
) {
  const rows: unknown[] = [];
  const pageSize = 1000;

  for (let from = 0; from < 100000; from += pageSize) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq("school_id", schoolId)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }

  return rows;
}

async function gzipJson(payload: unknown) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  return {
    bytes: new Uint8Array(compressed),
    uncompressedBytes: bytes.byteLength,
  };
}

const SCHOOL_TABLES = [
  "sekoly_school_years",
  "sekoly_terms",
  "sekoly_subjects",
  "sekoly_classes",
  "sekoly_students",
  "sekoly_enrollments",
  "sekoly_guardians",
  "sekoly_student_guardians",
  "sekoly_families",
  "sekoly_family_guardians",
  "sekoly_family_students",
  "sekoly_teachers",
  "sekoly_class_subjects",
  "sekoly_teacher_assignments",
  "sekoly_timetable_slots",
  "sekoly_attendance_sessions",
  "sekoly_attendance_entries",
  "sekoly_assessments",
  "sekoly_assessment_scores",
  "sekoly_enrollment_campaigns",
  "sekoly_enrollment_families",
  "sekoly_enrollment_applications",
  "sekoly_enrollment_documents",
  "sekoly_enrollment_checklist_items",
  "sekoly_enrollment_contacts",
  "sekoly_sync_events",
  "sekoly_audit_logs",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Méthode non autorisée." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return response({ error: "Authentification requise." }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const publishable = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !publishable || !secret) {
      return response({ error: "Configuration serveur incomplète." }, 503);
    }

    const userClient = createClient(url, publishable, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);
    if (userError || !user) return response({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => ({}));
    const schoolId = String(body.schoolId ?? "").trim();
    const mode = body.mode === "MANUAL" ? "MANUAL" : "AUTOMATIC";
    const action = String(body.action ?? "create");
    if (!schoolId) return response({ error: "Établissement Cloud manquant." }, 400);

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: membership, error: membershipError } = await admin
      .from("sekoly_memberships")
      .select("role,status")
      .eq("school_id", schoolId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      !["SCHOOL_ADMIN", "DIRECTOR"].includes(membership.role)
    ) {
      return response({ error: "Droits insuffisants pour les sauvegardes." }, 403);
    }

    if (action === "list") {
      const { data, error } = await admin
        .from("sekoly_school_backups")
        .select("id,backup_type,status,size_bytes,row_counts,created_at,expires_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return response({ backups: data ?? [] });
    }

    if (action === "status") {
      const [
        { data: limits, error: limitsError },
        { data: latestBackup, error: backupError },
        { count: students, error: studentError },
        { count: teachers, error: teacherError },
        { count: families, error: familyError },
        documents,
      ] = await Promise.all([
        admin
          .from("sekoly_school_limits")
          .select("*")
          .eq("school_id", schoolId)
          .single(),
        admin
          .from("sekoly_school_backups")
          .select("id,backup_type,status,size_bytes,row_counts,created_at,expires_at")
          .eq("school_id", schoolId)
          .eq("status", "READY")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("sekoly_students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId),
        admin
          .from("sekoly_teachers")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId),
        admin
          .from("sekoly_families")
          .select("id", { count: "exact", head: true })
          .eq("school_id", schoolId)
          .neq("status", "ARCHIVED"),
        fetchAll(admin, "sekoly_enrollment_documents", schoolId),
      ]);

      if (limitsError) throw limitsError;
      if (backupError) throw backupError;
      if (studentError) throw studentError;
      if (teacherError) throw teacherError;
      if (familyError) throw familyError;

      const documentBytes = documents.reduce(
        (sum, row: any) => sum + Number(row?.file_size ?? 0),
        0,
      );

      return response({
        limits,
        usage: {
          students: students ?? 0,
          teachers: teachers ?? 0,
          families: families ?? 0,
          documentBytes,
        },
        latestBackup,
      });
    }

    if (action === "signed_url") {
      const backupId = String(body.backupId ?? "").trim();
      if (!backupId) return response({ error: "Sauvegarde manquante." }, 400);

      const { data: backup, error } = await admin
        .from("sekoly_school_backups")
        .select("id,storage_path,status")
        .eq("school_id", schoolId)
        .eq("id", backupId)
        .single();
      if (error) throw error;
      if (backup.status !== "READY" || !backup.storage_path) {
        return response({ error: "Sauvegarde indisponible." }, 409);
      }

      const { data: signed, error: signedError } = await admin.storage
        .from("sekoly-school-backups")
        .createSignedUrl(backup.storage_path, 600);
      if (signedError) throw signedError;
      return response({ url: signed.signedUrl });
    }

    if (mode === "AUTOMATIC") {
      const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      const { data: recent, error: recentError } = await admin
        .from("sekoly_school_backups")
        .select("id,backup_type,status,size_bytes,row_counts,created_at,expires_at")
        .eq("school_id", schoolId)
        .eq("status", "READY")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentError) throw recentError;
      if (recent) return response({ created: false, backup: recent });
    }

    const [{ data: school, error: schoolError }, { data: limits, error: limitsError }] =
      await Promise.all([
        admin.from("sekoly_schools").select("*").eq("id", schoolId).single(),
        admin
          .from("sekoly_school_limits")
          .select("backup_retention_days")
          .eq("school_id", schoolId)
          .maybeSingle(),
      ]);
    if (schoolError) throw schoolError;
    if (limitsError) throw limitsError;

    const backupId = crypto.randomUUID();
    const retentionDays = Math.max(1, Number(limits?.backup_retention_days ?? 30));
    const expiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: creatingError } = await admin
      .from("sekoly_school_backups")
      .insert({
        id: backupId,
        school_id: schoolId,
        backup_type: mode,
        status: "CREATING",
        created_by: user.id,
        expires_at: expiresAt,
      });
    if (creatingError) throw creatingError;

    try {
      const tables: Record<string, unknown[]> = {};
      const rowCounts: Record<string, number> = {};

      for (const table of SCHOOL_TABLES) {
        const rows = await fetchAll(admin, table, schoolId);
        tables[table] = rows;
        rowCounts[table] = rows.length;
      }

      const payload = {
        format: "sekoly-school-backup-v1",
        generatedAt: new Date().toISOString(),
        school,
        tables,
      };
      const compressed = await gzipJson(payload);
      const now = new Date();
      const yyyy = String(now.getUTCFullYear());
      const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
      const path = `${schoolId}/${yyyy}/${mm}/${backupId}.json.gz`;

      const { error: uploadError } = await admin.storage
        .from("sekoly-school-backups")
        .upload(path, compressed.bytes, {
          contentType: "application/gzip",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: backup, error: readyError } = await admin
        .from("sekoly_school_backups")
        .update({
          status: "READY",
          storage_path: path,
          size_bytes: compressed.bytes.byteLength,
          row_counts: rowCounts,
        })
        .eq("id", backupId)
        .select("id,backup_type,status,size_bytes,row_counts,created_at,expires_at")
        .single();
      if (readyError) throw readyError;

      return response({
        created: true,
        backup,
        uncompressedBytes: compressed.uncompressedBytes,
      }, 201);
    } catch (error) {
      await admin
        .from("sekoly_school_backups")
        .update({
          status: "FAILED",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", backupId);
      throw error;
    }
  } catch (error) {
    return response(
      { error: error instanceof Error ? error.message : "Sauvegarde impossible." },
      400,
    );
  }
});
