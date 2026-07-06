import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const siteUrl =
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  "http://localhost:8888";

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: "Method not allowed",
      }),
    };
  }

  if (!stripeSecretKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Missing STRIPE_SECRET_KEY environment variable.",
      }),
    };
  }

  let payload;

  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Invalid JSON.",
      }),
    };
  }

  const {
    songTitle,
    artist,
    requestType,
    amountCents,
    sessionId,
    requesterName,
  } = payload;

  if (
    !songTitle ||
    !requestType ||
    !amountCents ||
    !sessionId
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required fields.",
      }),
    };
  }

  try {
    const stripe = new Stripe(stripeSecretKey);

    const checkoutSession =
      await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],

        line_items: [
          {
            price_data: {
              currency: "aud",
              unit_amount: amountCents,
              product_data: {
                name: `${requestType}: ${songTitle}`,
                description: artist
                  ? `Artist: ${artist}`
                  : "SongRush Request",
              },
            },
            quantity: 1,
          },
        ],

        success_url:
          `${siteUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${siteUrl}/?payment=cancelled`,

        metadata: {
          sessionId,
          songTitle,
          artist: artist || "",
          requestType,
          requesterName: requesterName || "",
        },
      });

    return {
      statusCode: 200,
      body: JSON.stringify({
        url: checkoutSession.url,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
      }),
    };
  }
};