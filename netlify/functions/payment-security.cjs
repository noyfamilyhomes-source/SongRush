const PAYMENT_AMOUNTS_CENTS = Object.freeze({
  screen_message: 1000,
  performer_beer: 1000,
  "Add to Queue": 1000,
  "Add to Front Queue": 2000,
  "Outbid Front Queue": 3000,
  "Play It Again": 5000,
});

const expectedAmountFor = (paymentType, requestType = "") => {
  if (paymentType === "song_request") {
    return PAYMENT_AMOUNTS_CENTS[requestType] || null;
  }

  return PAYMENT_AMOUNTS_CENTS[paymentType] || null;
};

const isSafeIdentifier = (value) =>
  /^[A-Za-z0-9_-]{3,100}$/.test(String(value || ""));

const isVerifiedPaidCheckout = (checkoutSession, metadata) => {
  const expectedAmount = expectedAmountFor(
    metadata.paymentType || "song_request",
    metadata.requestType
  );

  return Boolean(
    expectedAmount &&
      checkoutSession.payment_status === "paid" &&
      checkoutSession.currency === "aud" &&
      checkoutSession.amount_total === expectedAmount
  );
};

module.exports = {
  PAYMENT_AMOUNTS_CENTS,
  expectedAmountFor,
  isSafeIdentifier,
  isVerifiedPaidCheckout,
};
