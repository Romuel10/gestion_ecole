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
    const name = String(body.name ?? "").trim();
    const slug = String(body.slug ?? "").trim().toLowerCase();
    if (name.length < 2 || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(slug)) {
      return Response.json({ error: "Nom ou identifiant d'établissement invalide." }, { status: 400, headers: cors });
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: school, error: schoolError } = await admin
      .from("sekoly_schools")
      .insert({
        name,
        slug,
        acronym: String(body.acronym ?? "").trim() || null,
        city: String(body.city ?? "").trim() || null,
        address: String(body.address ?? "").trim() || null,
        phone: String(body.phone ?? "").trim() || null,
        email: String(body.email ?? "").trim() || user.email || null,
        settings: { id_namespace_version: 2 },
      })
      .select("*")
      .single();

    if (schoolError) throw schoolError;

    const { error: memberError } = await admin
      .from("sekoly_memberships")
      .insert({
        school_id: school.id,
        user_id: user.id,
        role: "SCHOOL_ADMIN",
        status: "ACTIVE",
      });

    if (memberError) {
      await admin.from("sekoly_schools").delete().eq("id", school.id);
      throw memberError;
    }

    return Response.json({ school }, { status: 201, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Erreur serveur." },
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
