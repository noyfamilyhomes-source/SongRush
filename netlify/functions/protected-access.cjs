const crypto = require("node:crypto");

const encode = (value) => Buffer.from(value).toString("base64url");
const sign = (value, secret) =>
  crypto.createHmac("sha256", secret).update(value).digest("base64url");

const createAccessToken = ({ area, secret, ttlSeconds = 10800 }) => {
  const payload = encode(JSON.stringify({
    area,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: crypto.randomBytes(16).toString("hex"),
  }));
  return `${payload}.${sign(payload, secret)}`;
};

const verifyAccessToken = ({ token, area, secret }) => {
  if (!token || !secret || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = sign(payload, secret);
  const left = Buffer.from(signature || "");
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return false;
  }
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    return decoded.area === area && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

module.exports = { createAccessToken, verifyAccessToken };
