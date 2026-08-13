
const QRCode = require("qrcode");

function addSongRushLiveLogo(svg) {
  const viewBoxMatch = svg.match(
    /viewBox="0 0 ([\d.]+) ([\d.]+)"/
  );

  if (!viewBoxMatch) {
    return svg;
  }

  const width = Number(viewBoxMatch[1]);
  const height = Number(viewBoxMatch[2]);
  const badgeSize = Math.min(width, height) * 0.2;
  const badgeX = (width - badgeSize) / 2;
  const badgeY = (height - badgeSize) / 2;
  const centreX = width / 2;
  const brandY = height / 2 - badgeSize * 0.04;
  const liveY = height / 2 + badgeSize * 0.25;

  const logo = `
    <g id="songrush-live-logo" aria-label="SongRush Live logo">
      <rect
        x="${badgeX}"
        y="${badgeY}"
        width="${badgeSize}"
        height="${badgeSize}"
        rx="${badgeSize * 0.14}"
        fill="#ffffff"
      />
      <text
        x="${centreX}"
        y="${brandY}"
        fill="#6d28d9"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${badgeSize * 0.23}"
        font-weight="800"
        text-anchor="middle"
      >SongRush</text>
      <text
        x="${centreX}"
        y="${liveY}"
        fill="#111111"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${badgeSize * 0.16}"
        font-weight="700"
        letter-spacing="${badgeSize * 0.05}"
        text-anchor="middle"
      >LIVE</text>
    </g>`;

  return svg.replace("</svg>", `${logo}</svg>`);
}

exports.handler = async (event) => {
  try {
    const sessionId = event.queryStringParameters?.session;

    if (!sessionId) {
      return {
        statusCode: 400,
        body: "Missing session id",
      };
    }

const appUrl =
  
  "https://getsongrush.netlify.app";
    
    const qrUrl =
      `${appUrl}?session=${encodeURIComponent(sessionId)}`;

    const qrSvg = await QRCode.toString(qrUrl, {
      type: "svg",
      width: 1000,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    const brandedQrSvg = addSongRushLiveLogo(qrSvg);
    const safeSessionId = String(sessionId).replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    );

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition":
          `inline; filename="songrush-live-${safeSessionId}.svg"`,
        "Cache-Control": "public, max-age=300",
      },
      body: brandedQrSvg,
    };
  } catch (error) {
    console.error("QR generation failed:", error);

    return {
      statusCode: 500,
      body: "Unable to generate QR code",
    };
  }
};
