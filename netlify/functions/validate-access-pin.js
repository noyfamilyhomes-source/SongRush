import crypto from "node:crypto";
import protectedAccess from "./protected-access.cjs";

const { createAccessToken } = protectedAccess;

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const configuredPin = String(
    process.env.SONGRUSH_ACCESS_PIN || ""
  ).trim();

  if (!/^\d{4,6}$/.test(configuredPin)) {
    console.error("SONGRUSH_ACCESS_PIN is not configured.");
    return jsonResponse(503, {
      error: "Performer access is not configured yet.",
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid request." });
  }

  const pin = String(payload.pin || "").trim();
  const area = String(payload.area || "").trim();

  if (!["tv", "dashboard"].includes(area) || !/^\d{4,6}$/.test(pin)) {
    return jsonResponse(400, { error: "Invalid access request." });
  }

  if (!safeEqual(pin, configuredPin)) {
    return jsonResponse(401, { error: "Incorrect access PIN." });
  }

  const signingSecret = String(
    process.env.SONGRUSH_AUTH_SECRET || ""
  ).trim();

  if (signingSecret.length < 32) {
    console.error("SONGRUSH_AUTH_SECRET is not configured securely.");
    return jsonResponse(503, {
      error: "Secure performer access is not configured yet.",
    });
  }

  return jsonResponse(200, {
    authorised: true,
    area,
    token: createAccessToken({ area, secret: signingSecret }),
    expiresIn: 10800,
  });
};
