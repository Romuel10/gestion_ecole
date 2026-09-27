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
    if (!token) return Response.json({ error: "Authentification requise." }, { status: 401, headers: cors });

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
    const schoolId = String(body.schoolId ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    if (!schoolId || !email || !firstName || !lastName) {
      return Response.json({ error: "Informations enseignant incomplètes." }, { status: 400, headers: cors });
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerMembership } = await admin
      .from("sekoly_memberships")
      .select("role,status")
      .eq("school_id", schoolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      !callerMembership ||
      callerMembership.status !== "ACTIVE" ||
      !["SCHOOL_ADMIN", "DIRECTOR"].includes(callerMembership.role)
    ) {
      return Response.json({ error: "Droits insuffisants." }, { status: 403, headers: cors });
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName, sekoly_invited: true },
    });
    if (inviteError) throw inviteError;
    if (!invited.user) throw new Error("Utilisateur non créé.");

    const invitedUserId = invited.user.id;

    const { error: membershipError } = await admin
      .from("sekoly_memberships")
      .upsert({
        school_id: schoolId,
        user_id: invitedUserId,
        role: "TEACHER",
        status: "ACTIVE",
      }, { onConflict: "school_id,user_id" });
    if (membershipError) throw membershipError;

    const { data: teacher, error: teacherError } = await admin
      .from("sekoly_teachers")
      .upsert({
        school_id: schoolId,
        user_id: invitedUserId,
        matricule: String(body.matricule ?? "").trim() || null,
        first_name: firstName,
        last_name: lastName,
        phone: String(body.phone ?? "").trim() || null,
        email,
        status: "ACTIVE",
      }, { onConflict: "school_id,user_id" })
      .select("*")
      .single();

    if (teacherError) throw teacherError;

    return Response.json({ teacher, invitedUserId }, {
      status: 201,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur serveur." },
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
