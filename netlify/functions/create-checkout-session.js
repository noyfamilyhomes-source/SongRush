import Stripe from "stripe";
import paymentSecurity from "./payment-security.cjs";

const { expectedAmountFor, isSafeIdentifier } = paymentSecurity;

const siteUrl = String(
  process.env.URL || "https://crowdrush.com.au"
).replace(/\/$/, "");

const stripeSecretKey =
  process.env.STRIPE_SECRET_KEY;

const OFFENSIVE_WORDS = [
  "fuck", "shit", "cunt", "bitch", "dick", "cock",
  "nigger", "faggot", "slut", "whore", "rape", "pedo",
];

const containsOffensiveLanguage = (value) => {
  const normalised = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7+]/g, "t");
  const compact = normalised.replace(/[^a-z]/g, "");

  return OFFENSIVE_WORDS.some((word) =>
    new RegExp(`(^|[^a-z])${word}([^a-z]|$)`, "i").test(normalised) ||
    compact.includes(word)
  );
};

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
    !isSafeIdentifier(sessionId) ||
    !isSafeIdentifier(requestToken)
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
    if (amountCents !== expectedAmountFor(paymentType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid shout-out price.",
        }),
      };
    }

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

    if (containsOffensiveLanguage(screenMessage)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Please rewrite this message without offensive language.",
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
  } else if (paymentType === "performer_beer") {
    if (amountCents !== expectedAmountFor(paymentType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Invalid beer shout price.",
        }),
      };
    }

    const performerName = String(
      payload.performerName || "Performer"
    ).trim().slice(0, 80);

    productName = "Shout the Performer a Beer";
    productDescription = `A beer for ${performerName || "the performer"}`;

    metadata = {
      paymentType: "performer_beer",
      sessionId,
      performerName,
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

    const expectedAmount = expectedAmountFor(
      paymentType,
      requestType
    );

    const requesterName =
      String(
        payload.requesterName || ""
      ).trim();

    if (
      !songTitle ||
      !requestType ||
      amountCents !== expectedAmount
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error:
            "Missing or invalid song request fields.",
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
          client_reference_id: requestToken,
        }
        ,
        {
          idempotencyKey: requestToken,
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
          "Unable to start payment. Please try again.",
      }),
    };
  }
};
