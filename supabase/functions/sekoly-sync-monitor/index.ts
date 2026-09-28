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

    const client = createClient(url, publishable, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Session invalide." }, { status: 401, headers: cors });
    }

    const body = await req.json();
    const schoolId = String(body.schoolId ?? "").trim();
    if (!schoolId) {
      return Response.json({ error: "Établissement Cloud manquant." }, { status: 400, headers: cors });
    }

    const { data: membership, error: membershipError } = await client
      .from("sekoly_memberships")
      .select("role,status")
      .eq("school_id", schoolId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;

    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      !["SCHOOL_ADMIN", "DIRECTOR", "SUPERVISOR"].includes(membership.role)
    ) {
      return Response.json({ error: "Droits insuffisants." }, { status: 403, headers: cors });
    }

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [eventsResult, auditResult, teachersResult, errorCountResult] = await Promise.all([
      client
        .from("sekoly_sync_events")
        .select("id,teacher_id,device_id,platform,event_type,status,queue_count,error_message,metadata,occurred_at")
        .eq("school_id", schoolId)
        .gte("occurred_at", since30)
        .order("occurred_at", { ascending: false })
        .limit(500),
      client
        .from("sekoly_audit_logs")
        .select("id,user_id,action,entity_type,entity_id,metadata,created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(150),
      client
        .from("sekoly_teachers")
        .select("id,user_id,first_name,last_name,email,status")
        .eq("school_id", schoolId),
      client
        .from("sekoly_sync_events")
        .select("*", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "ERROR")
        .gte("occurred_at", since24),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (auditResult.error) throw auditResult.error;
    if (teachersResult.error) throw teachersResult.error;
    if (errorCountResult.error) throw errorCountResult.error;

    const teachers = teachersResult.data ?? [];
    const teacherById = new Map(
      teachers.map((teacher) => [
        teacher.id,
        {
          id: teacher.id,
          name: `${teacher.last_name} ${teacher.first_name}`.trim(),
          email: teacher.email,
          status: teacher.status,
        },
      ]),
    );
    const teacherByUserId = new Map(
      teachers
        .filter((teacher) => teacher.user_id)
        .map((teacher) => [
          teacher.user_id,
          `${teacher.last_name} ${teacher.first_name}`.trim(),
        ]),
    );

    const events = (eventsResult.data ?? []).map((event) => ({
      ...event,
      teacher: event.teacher_id ? teacherById.get(event.teacher_id) ?? null : null,
    }));

    const latestByDevice = new Map<string, any>();
    for (const event of events) {
      if (!latestByDevice.has(event.device_id)) latestByDevice.set(event.device_id, event);
    }

    const devices = Array.from(latestByDevice.values()).map((event) => {
      const ageMinutes = Math.max(
        0,
        Math.floor((Date.now() - new Date(event.occurred_at).getTime()) / 60000),
      );
      const health =
        event.status === "ERROR"
          ? "ERROR"
          : ageMinutes > 7 * 24 * 60
          ? "STALE"
          : event.queue_count > 0
          ? "PENDING"
          : "OK";

      return {
        deviceId: event.device_id,
        platform: event.platform,
        teacher: event.teacher,
        lastEventType: event.event_type,
        lastStatus: event.status,
        queueCount: event.queue_count,
        lastError: event.error_message,
        lastSeenAt: event.occurred_at,
        health,
      };
    });

    const audit = (auditResult.data ?? []).map((entry) => ({
      ...entry,
      actor:
        (entry.user_id ? teacherByUserId.get(entry.user_id) : null) ??
        (entry.user_id ? "Administration" : "Système"),
    }));

    const active24h = devices.filter(
      (device) => new Date(device.lastSeenAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000,
    ).length;

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        summary: {
          devices: devices.length,
          active24h,
          pendingDevices: devices.filter((device) => device.queueCount > 0).length,
          unhealthyDevices: devices.filter(
            (device) => device.health === "ERROR" || device.health === "STALE",
          ).length,
          errors24h: errorCountResult.count ?? 0,
          recentEvents: events.length,
          auditEntries: audit.length,
        },
        devices,
        events: events.slice(0, 100),
        audit: audit.slice(0, 100),
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