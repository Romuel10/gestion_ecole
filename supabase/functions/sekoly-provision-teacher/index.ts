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

function temporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let body = "";
  for (const value of bytes) body += alphabet[value % alphabet.length];
  return `Sk1!${body}`;
}

async function sendActivationEmail(args: {
  email: string;
  teacherName: string;
  schoolName: string;
  actionLink: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "";

  if (!apiKey || !from) {
    return { sent: false, reason: "RESEND_NOT_CONFIGURED" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.email],
      subject: `Activez votre accès Sekoly Enseignant — ${args.schoolName}`,
      text: [
        `Bonjour ${args.teacherName},`,
        "",
        `${args.schoolName} vous a créé un accès à Sekoly Enseignant.`,
        "Ouvrez le lien suivant sur votre téléphone pour choisir votre mot de passe :",
        args.actionLink,
        "",
        "Sekoly Enseignant",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: "RESEND_SEND_FAILED" };
  }

  const result = await response.json().catch(() => ({}));
  return { sent: true, id: result?.id ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return Response.json(
      { error: "Méthode non autorisée." },
      { status: 405, headers: cors },
    );
  }

  let createdUserId: string | null = null;

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
    const secret = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

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
    const schoolId = String(body.schoolId ?? "");
    const teacherId = String(body.teacherId ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();

    if (!schoolId || !teacherId || !email || !firstName || !lastName) {
      return Response.json(
        { error: "Informations enseignant incomplètes." },
        { status: 400, headers: cors },
      );
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
      return Response.json(
        { error: "Droits insuffisants." },
        { status: 403, headers: cors },
      );
    }

    const { data: school, error: schoolError } = await admin
      .from("sekoly_schools")
      .select("name")
      .eq("id", schoolId)
      .single();
    if (schoolError) throw schoolError;

    const { data: teacher, error: teacherError } = await admin
      .from("sekoly_teachers")
      .select("id,user_id")
      .eq("id", teacherId)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (teacherError) throw teacherError;
    if (!teacher) {
      return Response.json(
        { error: "Enseignant introuvable dans cet établissement." },
        { status: 404, headers: cors },
      );
    }
    if (teacher.user_id) {
      return Response.json(
        { error: "Cet enseignant possède déjà un compte mobile." },
        { status: 409, headers: cors },
      );
    }

    const password = temporaryPassword();
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          school_id: schoolId,
          sekoly_invited: true,
          password_change_required: true,
        },
      });

    if (createError) {
      const message =
        createError.message?.toLowerCase().includes("already")
          ? "Un compte existe déjà avec cette adresse email."
          : createError.message;
      return Response.json({ error: message }, { status: 409, headers: cors });
    }
    if (!created.user) throw new Error("Utilisateur non créé.");

    createdUserId = created.user.id;

    const { error: membershipError } = await admin
      .from("sekoly_memberships")
      .upsert(
        {
          school_id: schoolId,
          user_id: createdUserId,
          role: "TEACHER",
          status: "ACTIVE",
        },
        { onConflict: "school_id,user_id" },
      );
    if (membershipError) throw membershipError;

    const { data: updatedTeacher, error: updateError } = await admin
      .from("sekoly_teachers")
      .update({
        user_id: createdUserId,
        first_name: firstName,
        last_name: lastName,
        phone: String(body.phone ?? "").trim() || null,
        email,
        status: "ACTIVE",
      })
      .eq("id", teacherId)
      .eq("school_id", schoolId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    let emailDelivery = { sent: false, reason: "RESEND_NOT_CONFIGURED" } as {
      sent: boolean;
      reason?: string;
      id?: string | null;
    };

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: "sekoly-teacher://auth/callback",
      },
    } as any);

    const actionLink = linkData?.properties?.action_link;
    if (actionLink) {
      emailDelivery = await sendActivationEmail({
        email,
        teacherName: `${firstName} ${lastName}`,
        schoolName: school.name,
        actionLink,
      });
    }

    return Response.json(
      {
        teacher: updatedTeacher,
        userId: createdUserId,
        temporaryPassword: password,
        emailDelivery,
      },
      {
        status: 201,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur serveur.",
      },
      {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  }
});
