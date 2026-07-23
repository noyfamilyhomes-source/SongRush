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

  const signature =
    event.headers["stripe-signature"] ||
    event.headers["Stripe-Signature"];

  if (!signature) {
    return {
      statusCode: 400,
      body: "Missing Stripe signature",
    };
  }

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

  const checkoutSession = stripeEvent.data.object;
  const metadata = checkoutSession.metadata || {};

  const paymentType =
    metadata.paymentType || "song_request";

  const amount =
    typeof checkoutSession.amount_total === "number"
      ? checkoutSession.amount_total / 100
      : null;

  if (paymentType === "screen_message") {
    if (
      !metadata.sessionId ||
      !metadata.screenMessage ||
      !metadata.requestToken
    ) {
      console.error(
        "Missing required screen message metadata:",
        metadata
      );

      return {
        statusCode: 400,
        body: "Missing required screen message metadata",
      };
    }

    const { error } = await supabase
      .from("screen_messages")
      .insert({
        session_id: metadata.sessionId,
        customer_name: metadata.customerName || "",
        message: metadata.screenMessage,
        amount,
        status: "pending",
        request_token: metadata.requestToken,
      });

    if (error?.code === "23505") {
      console.log(
        "Duplicate screen message webhook ignored:",
        metadata.requestToken
      );

      return {
        statusCode: 200,
        body: "Screen message already inserted",
      };
    }

    if (error) {
      console.error(
        "Screen message insert failed:",
        error
      );

      return {
        statusCode: 500,
        body: "Screen message insert failed",
      };
    }

    return {
      statusCode: 200,
      body: "Paid screen message inserted",
    };
  }

  if (paymentType === "song_request") {
    if (
      !metadata.sessionId ||
      !metadata.songTitle ||
      !metadata.requestType ||
      !metadata.requestToken
    ) {
      console.error(
        "Missing required song request metadata:",
        metadata
      );

      return {
        statusCode: 400,
        body: "Missing required song request metadata",
      };
    }

    const { error } = await supabase.rpc(
      "insert_songrush_paid_request",
      {
        p_session_id: metadata.sessionId,
        p_song_title: metadata.songTitle,
        p_artist: metadata.artist || "",
        p_priority: metadata.requestType,
        p_requester_name:
          metadata.requesterName || "",
        p_request_token: metadata.requestToken,
        p_amount: amount,
      }
    );

    if (error?.code === "23505") {
      console.log(
        "Duplicate song request webhook ignored:",
        metadata.requestToken
      );

      return {
        statusCode: 200,
        body: "Paid song request already inserted",
      };
    }

    if (error) {
      console.error(
        "Song request insert failed:",
        error
      );

      return {
        statusCode: 500,
        body: "Song request insert failed",
      };
    }

    return {
      statusCode: 200,
      body: "Paid song request inserted",
    };
  }

  console.error(
    "Unsupported payment type:",
    paymentType
  );

  return {
    statusCode: 400,
    body: "Unsupported payment type",
  };
};