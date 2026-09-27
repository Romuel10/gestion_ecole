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
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "";

    if (!resendKey || !from) {
      return Response.json(
        { error: "Resend n’est pas encore configuré pour Sekoly." },
        { status: 503, headers: cors },
      );
    }

    const userClient = createClient(url, publishable, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser(token);
    if (userError || !user) {
      return Response.json({ error: "Session invalide." }, { status: 401, headers: cors });
    }

    const body = await req.json();
    const schoolId = String(body.schoolId ?? "");
    const teacherId = String(body.teacherId ?? "").trim();
    if (!schoolId || !teacherId) {
      return Response.json({ error: "Paramètres incomplets." }, { status: 400, headers: cors });
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: caller } = await admin
      .from("sekoly_memberships")
      .select("role,status")
      .eq("school_id", schoolId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!caller || caller.status !== "ACTIVE" || !["SCHOOL_ADMIN", "DIRECTOR"].includes(caller.role)) {
      return Response.json({ error: "Droits insuffisants." }, { status: 403, headers: cors });
    }

    const { data: teacher, error: teacherError } = await admin
      .from("sekoly_teachers")
      .select("id,user_id,email,first_name,last_name")
      .eq("school_id", schoolId)
      .eq("id", teacherId)
      .single();
    if (teacherError) throw teacherError;
    if (!teacher.user_id || !teacher.email) {
      return Response.json(
        { error: "Créez d’abord l’accès mobile de cet enseignant." },
        { status: 409, headers: cors },
      );
    }

    const { data: school, error: schoolError } = await admin
      .from("sekoly_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    if (schoolError) throw schoolError;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: teacher.email,
      options: { redirectTo: "sekoly-teacher://auth/callback" },
    } as any);
    if (linkError) throw linkError;

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) throw new Error("Lien d’activation indisponible.");

    const teacherName = `${teacher.first_name} ${teacher.last_name}`.trim();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [teacher.email],
        subject: `Activez votre accès Sekoly Enseignant — ${school.name}`,
        text: [
          `Bonjour ${teacherName},`,
          "",
          `${school.name} vous a créé un accès à Sekoly Enseignant.`,
          "Ouvrez ce lien sur votre téléphone pour choisir votre mot de passe :",
          actionLink,
          "",
          "Sekoly Enseignant",
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Resend error", response.status, detail);
      throw new Error("L’email d’activation n’a pas pu être envoyé.");
    }

    return Response.json(
      { sent: true },
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur serveur." },
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
