
const QRCode = require("qrcode");

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

    const png = await QRCode.toBuffer(qrUrl, {
      type: "png",
      width: 500,
      margin: 2,
      errorCorrectionLevel: "H",
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
      isBase64Encoded: true,
      body: png.toString("base64"),
    };
  } catch (error) {
    console.error("QR generation failed:", error);

    return {
      statusCode: 500,
      body: "Unable to generate QR code",
    };
  }
};
