import Stripe from "stripe";

const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY;

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
        error:
          "Missing STRIPE_SECRET_KEY environment variable.",
      }),
    };
  }

  let payload;

  try {
    payload = JSON.parse(
      event.body || "{}"
    );
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Invalid JSON.",
      }),
    };
  }

  const paymentType =
    payload.paymentType ||
    "song_request";

  const amountCents =
    Number(payload.amountCents);

  const sessionId =
    String(
      payload.sessionId || ""
    ).trim();

  const requestToken =
    String(
      payload.requestToken || ""
    ).trim();

  if (
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    !sessionId ||
    !requestToken
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "Missing or invalid required fields.",
      }),
    };
  }

  let productName;
  let productDescription;
  let metadata;

  if (paymentType === "screen_message") {
    const customerName =
      String(
        payload.customerName || ""
      )
        .trim()
        .slice(0, 60);

    const screenMessage =
      String(
        payload.screenMessage || ""
      )
        .trim()
        .slice(0, 160);

    if (!screenMessage) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "A screen message is required.",
        }),
      };
    }

    productName =
      "SongRush Crowd Shout-Out";

    productDescription =
      screenMessage;

    metadata = {
      paymentType:
        "screen_message",
      sessionId,
      customerName,
      screenMessage,
      requestToken,
    };
  } else if (
    paymentType === "song_request"
  ) {
    const songTitle =
      String(
        payload.songTitle || ""
      ).trim();

    const artist =
      String(
        payload.artist || ""
      ).trim();

    const requestType =
      String(
        payload.requestType || ""
      ).trim();

    const requesterName =
      String(
        payload.requesterName || ""
      ).trim();

    if (
      !songTitle ||
      !requestType
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing required song request fields.",
        }),
      };
    }

    productName =
      `${requestType}: ${songTitle}`;

    productDescription =
      artist
        ? `Artist: ${artist}`
        : "SongRush Request";

    metadata = {
      paymentType:
        "song_request",
      sessionId,
      songTitle,
      artist,
      requestType,
      requesterName,
      requestToken,
    };
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error:
          "Unsupported payment type.",
      }),
    };
  }

  try {
    const stripe =
      new Stripe(
        stripeSecretKey
      );

    const checkoutSession =
      await stripe.checkout.sessions.create(
        {
          mode: "payment",

          payment_method_types: [
            "card",
          ],

          line_items: [
            {
              price_data: {
                currency: "aud",
                unit_amount:
                  amountCents,

                product_data: {
                  name: productName,
                  description:
                    productDescription,
                },
              },

              quantity: 1,
            },
          ],

          success_url:
            `${siteUrl}/?payment=success` +
            `&payment_type=${encodeURIComponent(
              paymentType
            )}` +
            `&session_id={CHECKOUT_SESSION_ID}` +
            `&request_token=${encodeURIComponent(
              requestToken
            )}`,

          cancel_url:
            `${siteUrl}/?payment=cancelled` +
            `&payment_type=${encodeURIComponent(
              paymentType
            )}`,

          metadata,
        }
      );

    return {
      statusCode: 200,
      body: JSON.stringify({
        url:
          checkoutSession.url,
      }),
    };
  } catch (error) {
    console.error(
      "Unable to create Stripe Checkout session:",
      error
    );

    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          error.message,
      }),
    };
  }
};