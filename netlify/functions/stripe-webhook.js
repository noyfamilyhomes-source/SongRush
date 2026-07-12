const Stripe = require("stripe");
const { createClient } = require("@supabase/supabase-js");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed",
    };
  }

  const signature = event.headers["stripe-signature"];

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error(
      "Webhook signature verification failed:",
      error.message
    );

    return {
      statusCode: 400,
      body: `Webhook Error: ${error.message}`,
    };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    return {
      statusCode: 200,
      body: "Event ignored",
    };
  }

  const session = stripeEvent.data.object;
  const metadata = session.metadata || {};

  if (
    !metadata.sessionId ||
    !metadata.songTitle ||
    !metadata.requestType ||
    !metadata.requestToken
  ) {
    console.error("Missing required Stripe metadata", metadata);

    return {
      statusCode: 400,
      body: "Missing required Stripe metadata",
    };
  }

  const requestPayload = {
    session_id: metadata.sessionId,
    song_title: metadata.songTitle,
    artist: metadata.artist || "",
    priority: metadata.requestType,
    requester_name: metadata.requesterName || "",
    request_token: metadata.requestToken,
    amount:
      typeof session.amount_total === "number"
        ? session.amount_total / 100
        : null,
    status: "pending",
  };

  const { error } = await supabase
    .from("song_requests")
    .insert([requestPayload]);

  if (error?.code === "23505") {
    console.log(
      "Duplicate Stripe webhook ignored:",
      metadata.requestToken
    );

    return {
      statusCode: 200,
      body: "Paid request already inserted",
    };
  }

  if (error) {
    console.error("Supabase insert failed:", error);

    return {
      statusCode: 500,
      body: "Supabase insert failed",
    };
  }

  return {
    statusCode: 200,
    body: "Paid request inserted",
  };
};