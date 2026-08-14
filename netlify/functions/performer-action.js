import { createClient } from "@supabase/supabase-js";
import protectedAccess from "./protected-access.cjs";

const { verifyAccessToken } = protectedAccess;
const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const safeSession = (value) => /^SR-\d{4}$/.test(String(value || ""));

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const token = String(event.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyAccessToken({
    token,
    area: "dashboard",
    secret: process.env.SONGRUSH_AUTH_SECRET,
  })) return json(401, { error: "Performer access expired. Unlock the dashboard again." });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { error: "Secure database access is not configured." });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "Invalid request." }); }
  const sessionId = String(body.sessionId || "");
  if (!safeSession(sessionId)) return json(400, { error: "Invalid session." });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let result;

  if (body.action === "update_session") {
    const allowed = ["venue_name", "performer_name", "setlist", "requests_open", "allow_repeats"];
    const changes = Object.fromEntries(Object.entries(body.changes || {}).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(changes).length) return json(400, { error: "No valid changes." });
    changes.updated_at = new Date().toISOString();
    result = await db.from("songrush_sessions").update(changes).eq("session_id", sessionId).select().maybeSingle();
  } else if (body.action === "create_session") {
    result = await db.from("songrush_sessions").upsert({
      session_id: sessionId,
      allow_repeats: true,
      requests_open: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" }).select().maybeSingle();
  } else if (body.action === "swap_queue") {
    const firstId = Number(body.firstId);
    const secondId = Number(body.secondId);
    const firstOrder = Number(body.firstOrder);
    const secondOrder = Number(body.secondOrder);
    if (![firstId, secondId, firstOrder, secondOrder].every(Number.isFinite)) return json(400, { error: "Invalid queue change." });
    const first = await db.from("song_requests").update({ queue_order: secondOrder }).eq("id", firstId).eq("session_id", sessionId);
    if (first.error) result = first;
    else result = await db.from("song_requests").update({ queue_order: firstOrder }).eq("id", secondId).eq("session_id", sessionId);
  } else if (body.action === "play_request") {
    const requestId = Number(body.requestId);
    if (!Number.isFinite(requestId)) return json(400, { error: "Invalid request." });
    const complete = await db.from("song_requests").update({ status: "completed" }).eq("session_id", sessionId).eq("status", "playing");
    if (complete.error) result = complete;
    else result = await db.from("song_requests").update({ status: "playing" }).eq("id", requestId).eq("session_id", sessionId);
  } else if (body.action === "finish_playing") {
    result = await db.from("song_requests").update({ status: "completed" }).eq("session_id", sessionId).eq("status", "playing");
  } else if (body.action === "create_bar_rush") {
    const offerText = String(body.offerText || "").trim().slice(0, 120);
    const durationMinutes = Number(body.durationMinutes);
    if (!offerText || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 180) return json(400, { error: "Invalid Bar Rush." });
    result = await db.from("bar_rush_announcements").insert({
      session_id: sessionId,
      offer_text: offerText,
      duration_minutes: durationMinutes,
      status: "active",
      expires_at: new Date(Date.now() + durationMinutes * 60000).toISOString(),
    });
  } else {
    return json(400, { error: "Unsupported performer action." });
  }

  if (result.error) {
    console.error("Performer action failed", { action: body.action, code: result.error.code });
    return json(500, { error: "The performer change could not be saved." });
  }
  return json(200, { ok: true, data: result.data || null });
};
