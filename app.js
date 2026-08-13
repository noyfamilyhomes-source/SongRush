import { isSupabaseConfigured, supabase } from "./supabase.js";

const SHOUT_OUT_PRICE = 10;
const BEER_SHOUT_PRICE = 10;
const ACCESS_SESSION_KEY = "songrushProtectedAccess";
const ANDY_TUTORIAL_KEY = "songrushAndyTutorialSeen";
const ANDY_TUTORIAL_STEPS = [
  {
    title: "G'day, I'm Andy!",
    text: "I’ll show you how to request songs and join the fun tonight.",
  },
  {
    title: "Join tonight's show",
    text: "Tap Join Tonight's Show, then search the performer's setlist for a song you love.",
  },
  {
    title: "Choose how it plays",
    text: "Send a standard request for $10, jump the queue for $20, or ask to hear it again for $50.",
  },
  {
    title: "Make some noise!",
    text: "You can also send a crowd shout-out or shout the performer a beer. That's it — enjoy the show!",
  },
];
const OFFENSIVE_WORDS = [
  "fuck",
  "shit",
  "cunt",
  "bitch",
  "dick",
  "cock",
  "nigger",
  "faggot",
  "slut",
  "whore",
  "rape",
  "pedo",
];

function normaliseModerationText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7+]/g, "t");
}

function containsOffensiveLanguage(value) {
  const normalised = normaliseModerationText(value);
  const compact = normalised.replace(/[^a-z]/g, "");

  return OFFENSIVE_WORDS.some((word) => {
    const boundaryPattern = new RegExp(
      `(^|[^a-z])${word}([^a-z]|$)`,
      "i"
    );

    return (
      boundaryPattern.test(normalised) ||
      compact.includes(word)
    );
  });
}

async function startShoutOutCheckout(name, message) {
  const requestToken =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `songrush-shout-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

  const response = await fetch(
    "/.netlify/functions/create-checkout-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentType: "screen_message",
        amountCents: SHOUT_OUT_PRICE * 100,
        sessionId: appState.session.id,
        customerName: name,
        screenMessage: message,
        requestToken,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.url) {
    throw new Error(
      data.error || "Unable to start shout-out payment"
    );
  }

  window.location.href = data.url;
}

async function validateAccessPin(pin, area) {
  const response = await fetch(
    "/.netlify/functions/validate-access-pin",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pin, area }),
    }
  );

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "Performer access is temporarily unavailable. Please try again."
      );
    }
  }

  if (!response.ok || !data.authorised) {
    throw new Error(
      data.error ||
        "Performer access is temporarily unavailable. Please try again."
    );
  }

  return true;
}

async function startBeerShoutCheckout() {
  const requestToken =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `songrush-beer-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

  const response = await fetch(
    "/.netlify/functions/create-checkout-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentType: "performer_beer",
        amountCents: BEER_SHOUT_PRICE * 100,
        sessionId: appState.session.id,
        performerName: appState.session.performerName,
        requestToken,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.url) {
    throw new Error(
      data.error || "Unable to start beer payment"
    );
  }

  window.location.href = data.url;
}

function getRequestTypeDetails(optionValue) {
  const requestTypes = {
    standard: {
      label: "Add to Queue",
      price: "$10",
      amount: 10,
    },

    replay: {
      label: "Play It Again",
      price: "$50",
      amount: 50,
    },

    jump: {
      label: "Add to Front Queue",
      price: "$20",
      amount: 20,
    },

    outbid: {
      label: "Outbid Front Queue",
      price: "$30",
      amount: 30,
    },
  };

  return requestTypes[optionValue] || requestTypes.standard;
}

async function startStripeCheckout(song, optionValue) {
  const requestDetails = getRequestTypeDetails(optionValue);

  const requestToken =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `songrush-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;

  const existingRequestTokens = JSON.parse(
    localStorage.getItem("songrushRequestTokens") || "[]"
  );

  const updatedRequestTokens = [
    ...new Set([...existingRequestTokens, requestToken]),
  ];

  localStorage.setItem(
    "songrushRequestTokens",
    JSON.stringify(updatedRequestTokens)
  );

  localStorage.setItem(
    "songrushRequestToken",
    requestToken
  );

  localStorage.setItem(
    "songrushPendingRequest",
    JSON.stringify({
      title: song.title,
      artist: song.artist,
      requestType: requestDetails.label,
      requestToken,
      sessionId: appState.session.id,
    })
  );

  const response = await fetch(
    "/.netlify/functions/create-checkout-session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        songTitle: song.title,
        artist: song.artist,
        requestType: requestDetails.label,
        amountCents: requestDetails.amount * 100,
        sessionId: appState.session.id,
        requesterName: appState.session.tableNumber,
        requestToken,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.url) {
    localStorage.removeItem("songrushRequestToken");
    localStorage.removeItem("songrushPendingRequest");

    throw new Error(
      data.error || "Unable to start Stripe checkout"
    );
  }

  window.location.href = data.url;
}

let queueSubscription = null;
let sessionSettingsSubscription = null;
let screenMessageSubscription = null;
let screenMessageTimer = null;
let barRushSubscription = null;
let barRushPhaseTimer = null;
const SCREEN_MESSAGE_DISPLAY_MS = 60_000;
const BAR_RUSH_FULLSCREEN_MS = 30_000;
const SESSION_INACTIVITY_MS = 3 * 60 * 60 * 1000;

const appState = {
  session: {
    id: "SR-8274",
    performerName: "Andrew Noy",
    showName: "Andrew Noy Live",
    venueName: "Demo Venue",
    tableNumber: "Table 12",
    status: "LIVE",
    requestsOpen: true,
    allowRepeats: true,
    startTime: "7:30 PM",
    updatedAt: null,
    setlist: null,
  },

  songs: [],
  playedSongs: [],
  selectedSong: null,
  currentView: "landing",
  activeScreenMessage: null,

  queue: [
    {
      id: 1,
      title: "Wonderwall",
      artist: "Oasis",
      type: "Standard Request",
      price: "$10",
    },

    {
      id: 2,
      title: "Horses",
      artist: "Daryl Braithwaite",
      type: "Play It Again",
      price: "$50",
    },

    {
      id: 3,
      title: "Sweet Child O' Mine",
      artist: "Guns N' Roses",
      type: "Jump the Queue",
      price: "$20",
    },
  ],

  liveQueue: {
    nowPlaying: {
      title: "Better Man",
      artist: "Pearl Jam",
    },

    upNext: [
      {
        title: "Horses",
        artist: "Daryl Braithwaite",
      },

      {
        title: "Wonderwall",
        artist: "Oasis",
      },

      {
        title: "Tennessee Whiskey",
        artist: "Chris Stapleton",
      },

      {
        title: "Fast Car",
        artist: "Tracy Chapman",
      },

      {
        title: "Sweet Child O' Mine",
        artist: "Guns N' Roses",
      },
    ],

    requests: [],
  },
};

let andyTutorialStep = 0;

function renderAndyTutorialStep() {
  const step = ANDY_TUTORIAL_STEPS[andyTutorialStep];

  if (!step || !andyTutorial) {
    return;
  }

  andyTutorialTitle.textContent = step.title;
  andyTutorialText.textContent = step.text;
  andyStepCount.textContent = `${andyTutorialStep + 1} of ${ANDY_TUTORIAL_STEPS.length}`;
  andyBackBtn.hidden = andyTutorialStep === 0;
  andyNextBtn.textContent =
    andyTutorialStep === ANDY_TUTORIAL_STEPS.length - 1
      ? "Let's go!"
      : "Next";
}

function openAndyTutorial() {
  andyTutorialStep = 0;
  renderAndyTutorialStep();
  andyTutorial.classList.remove("hidden");
  document.body.classList.add("tutorial-open");
  andyNextBtn.focus();
}

function closeAndyTutorial() {
  localStorage.setItem(ANDY_TUTORIAL_KEY, "true");
  andyTutorial.classList.add("hidden");
  document.body.classList.remove("tutorial-open");
}

function getRequestsStatusLabel() {
  return appState.session.requestsOpen
    ? "Requests Open"
    : "Requests Closed";
}

function renderSessionSummaries() {
  const statusLabel = getRequestsStatusLabel();

  const tableLabel = appState.session.tableNumber
    ? ` • ${appState.session.tableNumber}`
    : "";

  document
    .querySelectorAll("[data-session-summary]")
    .forEach((element) => {
      element.innerHTML = `
        <div class="session-summary-top">
          <span class="status-pill ${appState.session.status.toLowerCase()}">
            ${appState.session.status}
          </span>

          <span class="session-code">
            ${appState.session.id}
          </span>
        </div>

        <div class="session-summary-body">
          <div class="session-show-name">
            ${appState.session.showName}
          </div>

          <div class="session-performer">
            ${appState.session.performerName}
          </div>

          <div class="session-venue">
            ${appState.session.venueName}
          </div>

          <div class="session-meta">
            ${statusLabel}${tableLabel}
          </div>
        </div>
      `;
    });
}

function renderDashboardSession() {
  dashboardSessionName.textContent =
    appState.session.showName;

  dashboardSessionCode.textContent =
    appState.session.id;

  dashboardVenue.textContent =
    appState.session.venueName;

  if (venueNameInput && document.activeElement !== venueNameInput) {
    venueNameInput.value = appState.session.venueName || "";
  }

  dashboardStartTime.textContent =
    appState.session.startTime;

  dashboardTable.textContent =
    appState.session.tableNumber || "—";

  dashboardStatusBadge.textContent =
    appState.session.status;

  toggleRequestsBtn.textContent =
    getRequestsStatusLabel();

  toggleRequestsBtn.classList.toggle(
    "closed",
    !appState.session.requestsOpen
  );

  toggleRequestsBtn.classList.toggle(
    "open",
    appState.session.requestsOpen
  );

  if (allowRepeatsBtn) {
    allowRepeatsBtn.textContent =
      appState.session.allowRepeats
        ? "Repeats Tonight: Allowed"
        : "Repeats Tonight: Disabled";

    allowRepeatsBtn.classList.toggle(
      "closed",
      !appState.session.allowRepeats
    );

    allowRepeatsBtn.classList.toggle(
      "open",
      appState.session.allowRepeats
    );
  }
}

function showBackendWarning(show) {
  if (!backendWarning) {
    return;
  }

  backendWarning.classList.toggle(
    "hidden",
    !show
  );
}

function mapSupabaseRequestToQueueItem(request) {
  return {
    id: request.id,
    title: request.song_title,
    artist: request.artist,
    type: request.priority,
    price: request.amount,
    status: request.status,
    queueOrder: request.queue_order,
    createdAt: request.created_at,
  };
}

async function loadRequestsFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    showBackendWarning(true);
    return;
  }

  try {
    const { data, error } = await supabase
      .from("song_requests")
      .select(
        "id, session_id, song_title, artist, priority, amount, status, queue_order, request_token, created_at"
      )
      .eq("session_id", appState.session.id)
      .eq("status", "pending")
      .order("queue_order", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      throw error;
    }

    appState.queue = (data || []).map(
      mapSupabaseRequestToQueueItem
    );

    showBackendWarning(false);
    renderQueue();
    renderLiveQueue();

    if (appState.currentView === "tvDisplay") {
      renderTvDisplay();
    }
  } catch (error) {
    console.error(
      "Unable to load Supabase requests",
      error
    );

    showBackendWarning(true);
    renderQueue();
  }
}

async function loadNowPlayingFromSupabase() {
  const titleEl = document.getElementById(
    "now-playing-title"
  );

  const artistEl = document.getElementById(
    "now-playing-artist"
  );

  const finishBtn = document.getElementById(
    "finishCurrentSongBtn"
  );

  if (
    !isSupabaseConfigured ||
    !supabase ||
    !appState.session
  ) {
    appState.liveQueue.nowPlaying = {
      title: "Nothing currently playing",
      artist: "",
    };

    if (titleEl) {
      titleEl.textContent =
        "Nothing currently playing";
    }

    if (artistEl) {
      artistEl.textContent = "";
    }

    if (finishBtn) {
      finishBtn.hidden = true;
    }

    return;
  }

  const { data, error } = await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist, status, created_at"
    )
    .eq(
      "session_id",
      appState.session.id
    )
    .eq("status", "playing")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "Unable to load now playing",
      error
    );

    return;
  }

  if (!data) {
    appState.liveQueue.nowPlaying = {
      title: "Nothing currently playing",
      artist: "",
    };

    if (titleEl) {
      titleEl.textContent =
        "Nothing currently playing";
    }

    if (artistEl) {
      artistEl.textContent = "";
    }

    if (finishBtn) {
      finishBtn.hidden = true;
    }
  } else {
    appState.liveQueue.nowPlaying = {
      title: data.song_title,
      artist: data.artist || "",
    };

    if (titleEl) {
      titleEl.textContent =
        data.song_title;
    }

    if (artistEl) {
      artistEl.textContent =
        data.artist || "";
    }

    if (finishBtn) {
      finishBtn.hidden = false;
    }
  }

  if (
    appState.currentView === "songSearch" &&
    appState.songs.length > 0
  ) {
    renderSongs(songSearchInput.value);
  }

  if (
    appState.currentView === "tvDisplay"
  ) {
    renderTvDisplay();
  }
}

async function loadPlayedTonightFromSupabase() {
const playedTonightList =
  document.getElementById("playedTonightList");

if (!isSupabaseConfigured || !supabase) {
  if (playedTonightList) {
    playedTonightList.innerHTML =
      '<p class="empty-state">No songs played tonight.</p>';
  }

  appState.playedSongs = [];
  return;
}
  const { data, error } = await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist, priority, amount, status, created_at"
    )
    .eq("session_id", appState.session.id)
    .eq("status", "completed")
    .order("created_at", {
      ascending: false,
    });

if (error) {
  console.error(
    "Unable to load played songs",
    error
  );

  if (playedTonightList) {
    playedTonightList.innerHTML =
      '<p class="empty-state">Unable to load played songs.</p>';
  }

  appState.playedSongs = [];

  return;
}

appState.playedSongs = (data || []).map((song) => ({
  title: song.song_title,
  artist: song.artist || "",
}));

if (
  appState.currentView === "songSearch" &&
  appState.songs.length > 0
) {
  renderSongs(songSearchInput.value);
}

if (!playedTonightList) {
  return;
}

playedTonightList.innerHTML = "";
  if (!data || data.length === 0) {
    playedTonightList.innerHTML =
      '<p class="empty-state">No songs played tonight.</p>';

    return;
  }

  data.forEach((song) => {
    const playedItem =
      document.createElement("div");

    playedItem.className = "queue-item";

    const title =
      document.createElement("div");

    title.className = "queue-item-title";

    title.textContent =
      `${song.song_title} – ${
        song.artist || "Unknown Artist"
      }`;

    const meta =
      document.createElement("div");

    meta.className = "queue-item-meta";

    meta.textContent =
      song.priority || "Completed";

    playedItem.appendChild(title);
    playedItem.appendChild(meta);

    playedTonightList.appendChild(
      playedItem
    );
  });
}

function subscribeToQueueChanges() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  if (queueSubscription) {
    supabase.removeChannel(
      queueSubscription
    );
  }

  queueSubscription = supabase
    .channel(
      `requests-${appState.session.id}`
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "song_requests",
        filter:
          `session_id=eq.${appState.session.id}`,
      },

      async () => {
        await loadRequestsFromSupabase();
        await loadNowPlayingFromSupabase();
        await loadPlayedTonightFromSupabase();

        if (
          appState.currentView === "liveQueue"
        ) {
          await loadCustomerLiveQueueFromSupabase();
        }

        if (
          appState.currentView === "tvDisplay"
        ) {
          await loadTvDisplayFromSupabase();
        }
      }
    )
    .subscribe();
}

function hideTvScreenMessage() {
  if (screenMessageTimer) {
    window.clearTimeout(screenMessageTimer);
    screenMessageTimer = null;
  }

  appState.activeScreenMessage = null;
  renderTvDisplay();
}

function showTvScreenMessage(screenMessage) {
  if (!screenMessage?.message) {
    return;
  }

  const createdAt = new Date(
    screenMessage.created_at || Date.now()
  ).getTime();

  const remaining = Math.min(
    SCREEN_MESSAGE_DISPLAY_MS,
    createdAt + SCREEN_MESSAGE_DISPLAY_MS - Date.now()
  );

  if (remaining <= 0) {
    return;
  }

  if (screenMessageTimer) {
    window.clearTimeout(screenMessageTimer);
  }

  appState.activeScreenMessage = screenMessage;
  renderTvDisplay();

  screenMessageTimer = window.setTimeout(
    hideTvScreenMessage,
    remaining
  );
}

async function loadLatestTvScreenMessage() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  const cutoff = new Date(
    Date.now() - SCREEN_MESSAGE_DISPLAY_MS
  ).toISOString();

  const { data, error } = await supabase
    .from("screen_messages")
    .select("id, session_id, customer_name, message, created_at")
    .eq("session_id", appState.session.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to load Crowd Shout-Out", error);
    return;
  }

  if (data) {
    showTvScreenMessage(data);
  }
}

function subscribeToScreenMessages() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  if (screenMessageSubscription) {
    supabase.removeChannel(screenMessageSubscription);
  }

  screenMessageSubscription = supabase
    .channel(`screen-messages-${appState.session.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "screen_messages",
        filter: `session_id=eq.${appState.session.id}`,
      },
      (payload) => {
        if (appState.currentView === "tvDisplay") {
          showTvScreenMessage(payload.new);
        }
      }
    )
    .subscribe();
}

function subscribeToSessionSettingsChanges() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  if (sessionSettingsSubscription) {
    supabase.removeChannel(
      sessionSettingsSubscription
    );
  }

  sessionSettingsSubscription = supabase
    .channel(
      `session-settings-${appState.session.id}`
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "songrush_sessions",
        filter:
          `session_id=eq.${appState.session.id}`,
      },

      async () => {
        await loadSessionSettingsFromSupabase();
      }
    )
    .subscribe();
}
async function saveRequestToSupabase(
  song,
  optionValue
) {
  if (!isSupabaseConfigured || !supabase) {
    appState.queue.unshift({
      id: Date.now(),
      title: song.title,
      artist: song.artist,
      type:
        getRequestTypeDetails(
          optionValue
        ).label,
      price:
        getRequestTypeDetails(
          optionValue
        ).price,
      status: "pending",
    });

    renderQueue();
    return;
  }

  const requestDetails =
    getRequestTypeDetails(optionValue);

  const requestPayload = {
    session_id: appState.session.id,
    song_title: song.title,
    artist: song.artist,
    priority: requestDetails.label,
    amount: Number(
      String(requestDetails.price).replace(
        "$",
        ""
      )
    ),
    status: "pending",
    created_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from("song_requests")
      .insert([requestPayload]);

    if (error) {
      throw error;
    }

    await loadRequestsFromSupabase();
  } catch (error) {
    console.error(
      "Unable to save request to Supabase",
      error
    );

    appState.queue.unshift({
      id: Date.now(),
      title: song.title,
      artist: song.artist,
      type: requestDetails.label,
      price: requestDetails.price,
      status: "pending",
    });

    renderQueue();
  }
}

async function loadSessionSettingsFromSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  const { data, error } = await supabase
    .from("songrush_sessions")
    .select(
      "allow_repeats, requests_open, setlist, venue_name"
    )
    .eq(
      "session_id",
      appState.session.id
    )
    .maybeSingle();

  console.log(
    "Session:",
    appState.session.id
  );

  console.log(
    "Settings row:",
    data,
    error
  );

  if (error) {
    console.error(
      "Unable to load session settings",
      error
    );

    return;
  }

  if (!data) {
    return;
  }

  appState.session.allowRepeats =
    data.allow_repeats;

  appState.session.requestsOpen =
    data.requests_open;

  if (typeof data.venue_name === "string") {
    appState.session.venueName = data.venue_name;
  }

  if (Array.isArray(data.setlist)) {
    appState.session.setlist = data.setlist;
    appState.songs = data.setlist;
    renderSetlistManager();
  }

  renderSessionUi();

  if (
    appState.currentView === "songSearch"
  ) {
    renderSongs(songSearchInput.value);
  }
}

function renderSessionUi() {
  renderSessionSummaries();
  renderDashboardSession();
}

function hideAllPages() {
  landingPage.hidden = true;
  songSearchPage.hidden = true;

  dashboardPage.classList.add(
    "hidden"
  );

  liveQueuePage.classList.add(
    "hidden"
  );

  tvDisplayPage.classList.add(
    "hidden"
  );

  successScreen.classList.add(
    "hidden"
  );

  requestModal.classList.add(
    "hidden"
  );
}

function showLandingPage() {
  appState.currentView = "landing";
  appState.selectedSong = null;

  hideAllPages();

  landingPage.hidden = false;

  renderSessionUi();
}

function showSongList() {
  appState.currentView = "songSearch";

  hideAllPages();

  songSearchPage.hidden = false;

  renderSessionUi();
  songSearchInput.focus();
}

async function showDashboard() {
  await refreshExpiredSession();

  appState.currentView = "dashboard";

  hideAllPages();

  dashboardPage.classList.remove(
    "hidden"
  );

  renderSessionUi();
  renderQueue();

  loadRequestsFromSupabase();
  loadNowPlayingFromSupabase();
  loadPlayedTonightFromSupabase();

  subscribeToQueueChanges();
  subscribeToSessionSettingsChanges();

}

async function refreshExpiredSession() {
  let lastActivity = appState.session.updatedAt
    ? new Date(appState.session.updatedAt).getTime()
    : Date.now();

  if (isSupabaseConfigured && supabase) {
    const { data: latestRequest } = await supabase
      .from("song_requests")
      .select("created_at")
      .eq("session_id", appState.session.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestRequestTime = latestRequest?.created_at
      ? new Date(latestRequest.created_at).getTime()
      : 0;

    if (Number.isFinite(latestRequestTime)) {
      lastActivity = Math.max(lastActivity, latestRequestTime);
    }
  }

  if (
    Number.isFinite(lastActivity) &&
    Date.now() - lastActivity >= SESSION_INACTIVITY_MS
  ) {
    await startNewSession();
  }
}

function showRequestModal(song) {
  if (
    !song ||
    !requestModal ||
    !modalTitle ||
    !modalArtist
  ) {
    console.error(
      "Unable to open request modal",
      {
        song,
        requestModal,
        modalTitle,
        modalArtist,
      }
    );

    return;
  }

  appState.selectedSong = song;

  modalTitle.textContent = song.title;
  modalArtist.textContent =
    song.artist || "";

  requestModal.classList.remove(
    "hidden"
  );
}

function closeModal() {
  requestModal.classList.add(
    "hidden"
  );

  appState.selectedSong = null;
}

function getCurrentRequestTokens() {
  const urlParams =
    new URLSearchParams(
      window.location.search
    );

  const tokenFromUrl =
    urlParams.get("request_token");

  let savedTokens = [];

  try {
    savedTokens = JSON.parse(
      localStorage.getItem(
        "songrushRequestTokens"
      ) || "[]"
    );
  } catch (error) {
    console.error(
      "Unable to read saved request tokens",
      error
    );

    savedTokens = [];
  }

  const legacyToken =
    localStorage.getItem(
      "songrushRequestToken"
    );

  if (legacyToken) {
    savedTokens.push(legacyToken);
  }

  if (tokenFromUrl) {
    savedTokens.push(tokenFromUrl);

    localStorage.setItem(
      "songrushRequestToken",
      tokenFromUrl
    );
  }

  const uniqueTokens = [
    ...new Set(
      savedTokens.filter(Boolean)
    ),
  ];

  localStorage.setItem(
    "songrushRequestTokens",
    JSON.stringify(uniqueTokens)
  );

  return uniqueTokens;
}

function getPendingRequestDetails() {
  const storedRequest =
    localStorage.getItem(
      "songrushPendingRequest"
    );

  if (!storedRequest) {
    return null;
  }

  try {
    return JSON.parse(storedRequest);
  } catch (error) {
    console.error(
      "Unable to read pending request details",
      error
    );

    return null;
  }
}

async function loadCustomerLiveQueueFromSupabase() {
  const requestTokens =
    getCurrentRequestTokens();

  const pendingRequest =
    getPendingRequestDetails();

  if (
    requestTokens.length === 0 ||
    !isSupabaseConfigured ||
    !supabase
  ) {
    return;
  }

  const {
    data: customerRequest,
    error: customerError,
  } = await supabase
    .from("song_requests")
    .select(
      "id, session_id, song_title, artist, priority, amount, status, queue_order, request_token, created_at"
    )
    .in(
      "request_token",
      requestTokens
    )
    .order("created_at", {
      ascending: false,
    });

  if (customerError) {
    console.error(
      "Unable to load customer request",
      customerError
    );

    return;
  }

  if (
    !customerRequest ||
    customerRequest.length === 0
  ) {
    appState.liveQueue.requests = [];

    renderLiveQueue();
    return;
  }

  const customerRequests =
    customerRequest;

  const latestRequest =
    customerRequests[0];

  if (
    latestRequest.session_id !==
    appState.session.id
  ) {
    appState.session.id =
      latestRequest.session_id;

    renderSessionUi();

    subscribeToQueueChanges();
    subscribeToSessionSettingsChanges();
  }

  const {
    data: pendingQueue,
    error: queueError,
  } = await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist, priority, amount, status, queue_order, created_at"
    )
    .eq(
      "session_id",
      latestRequest.session_id
    )
    .eq("status", "pending")
    .order("queue_order", {
      ascending: true,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: true,
    });

  if (queueError) {
    console.error(
      "Unable to load customer queue",
      queueError
    );

    return;
  }

  const {
    data: nowPlaying,
    error: nowPlayingError,
  } = await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist, status, created_at"
    )
    .eq(
      "session_id",
      latestRequest.session_id
    )
    .eq("status", "playing")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (nowPlayingError) {
    console.error(
      "Unable to load customer now playing",
      nowPlayingError
    );

    return;
  }

  const queue = pendingQueue || [];

  const mappedCustomerRequests =
    customerRequests.map(
      (request) => {
        const queueIndex =
          queue.findIndex(
            (queueItem) =>
              queueItem.id === request.id
          );

        return {
          id: request.id,
          title: request.song_title,
          artist: request.artist || "",
          status: request.status,

          position:
            queueIndex >= 0
              ? queueIndex + 1
              : null,

          estimatedWaitMinutes:
            queueIndex >= 0
              ? (queueIndex + 1) * 4
              : null,
        };
      }
    );

  appState.liveQueue = {
    nowPlaying: nowPlaying
      ? {
          title:
            nowPlaying.song_title,
          artist:
            nowPlaying.artist || "",
        }
      : {
          title:
            "Nothing currently playing",
          artist: "",
        },

    upNext: queue
      .slice(0, 5)
      .map((request) => ({
        title: request.song_title,
        artist:
          request.artist || "",
      })),

    requests:
      mappedCustomerRequests,
  };

  localStorage.removeItem(
    "songrushPendingRequest"
  );

  renderLiveQueue();
}

async function loadTvDisplayFromSupabase() {
  if (
    !isSupabaseConfigured ||
    !supabase
  ) {
    renderTvDisplay();
    return;
  }

  const {
    data: barRush,
    error: barRushError,
  } = await supabase
    .from("bar_rush_announcements")
    .select("*")
    .eq("session_id", appState.session.id)
    .eq("status", "active")
    .gt(
      "expires_at",
      new Date().toISOString()
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (barRushError) {
    console.error(
      "Unable to load Bar Rush",
      barRushError
    );
  }

  appState.barRush =
    barRush || null;

  scheduleBarRushPhaseChange();

  const {
    data: pendingQueue,
    error: queueError,
  } = await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist, queue_order, created_at"
    )
    .eq(
      "session_id",
      appState.session.id
    )
    .eq("status", "pending")
    .order("queue_order", {
      ascending: true,
      nullsFirst: false,
    })
    .order("created_at", {
      ascending: true,
    });

  if (queueError) {
    console.error(
      "Unable to load TV queue",
      queueError
    );

    return;
  }

  const {
    data: nowPlaying,
    error: nowPlayingError,
  } = await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist"
    )
    .eq(
      "session_id",
      appState.session.id
    )
    .eq("status", "playing")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (nowPlayingError) {
    console.error(
      "Unable to load TV now playing",
      nowPlayingError
    );

    return;
  }

  appState.liveQueue.nowPlaying =
    nowPlaying
      ? {
          title:
            nowPlaying.song_title,
          artist:
            nowPlaying.artist || "",
        }
      : {
          title:
            "Nothing currently playing",
          artist: "",
        };

  appState.liveQueue.upNext = (
    pendingQueue || []
  )
    .slice(0, 5)
    .map((request) => ({
      title: request.song_title,
      artist: request.artist || "",
    }));

  renderTvDisplay();
}

function scheduleBarRushPhaseChange() {
  if (barRushPhaseTimer) {
    window.clearTimeout(barRushPhaseTimer);
    barRushPhaseTimer = null;
  }

  if (!appState.barRush) {
    return;
  }

  const createdAt = new Date(
    appState.barRush.created_at || Date.now()
  ).getTime();

  const expiresAt = new Date(
    appState.barRush.expires_at
  ).getTime();

  const nextChange = Date.now() < createdAt + BAR_RUSH_FULLSCREEN_MS
    ? createdAt + BAR_RUSH_FULLSCREEN_MS
    : expiresAt;

  const delay = nextChange - Date.now();

  if (delay <= 0) {
    if (Date.now() >= expiresAt) {
      appState.barRush = null;
    }
    return;
  }

  barRushPhaseTimer = window.setTimeout(() => {
    if (
      appState.barRush &&
      Date.now() >= new Date(appState.barRush.expires_at).getTime()
    ) {
      appState.barRush = null;
    }

    renderTvDisplay();
    scheduleBarRushPhaseChange();
  }, delay);
}

function subscribeToBarRushChanges() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  if (barRushSubscription) {
    supabase.removeChannel(barRushSubscription);
  }

  barRushSubscription = supabase
    .channel(`bar-rush-${appState.session.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "bar_rush_announcements",
        filter: `session_id=eq.${appState.session.id}`,
      },
      async () => {
        if (appState.currentView === "tvDisplay") {
          await loadTvDisplayFromSupabase();
        }
      }
    )
    .subscribe();
}
function showLiveQueueScreen(
  song = null
) {
  appState.currentView = "liveQueue";

  const pendingRequest =
    getPendingRequestDetails();

  appState.liveQueue.requests = [
    {
      title:
        song?.title ||
        pendingRequest?.title ||
        "Finding your request...",

      artist:
        song?.artist ||
        pendingRequest?.artist ||
        "",

      position: null,
      estimatedWaitMinutes: null,
      status: "processing",
    },
  ];

  hideAllPages();

  liveQueuePage.classList.remove(
    "hidden"
  );

  renderSessionUi();
  renderLiveQueue();

  loadCustomerLiveQueueFromSupabase();
}

function showTvDisplay() {
  appState.currentView = "tvDisplay";

  hideAllPages();

  tvDisplayPage.classList.remove(
    "hidden"
  );

  renderTvDisplay();
  loadTvDisplayFromSupabase();
  loadLatestTvScreenMessage();

  subscribeToQueueChanges();
  subscribeToScreenMessages();
  subscribeToBarRushChanges();
}

function showSuccessScreen(song) {
  showLiveQueueScreen(song);
}

function renderSongs(filter = "") {
  const query =
    filter.trim().toLowerCase();

  const visibleSongs =
    appState.songs.filter((song) => {
      const haystack =
        `${song.title} ${song.artist} ${song.genre}`.toLowerCase();

      return haystack.includes(query);
    });

  songList.innerHTML = "";

  if (visibleSongs.length === 0) {
    songList.innerHTML =
      '<p class="empty-state">No songs match your search.</p>';

    return;
  }

  visibleSongs.forEach((song) => {
    const row =
      document.createElement("div");

    row.className = "song-item";

    const details =
      document.createElement("div");

    details.className =
      "song-details";

    const title =
      document.createElement("div");

    title.className = "song-title";
    title.textContent = song.title;

    const artist =
      document.createElement("div");

    artist.className = "song-artist";
    artist.textContent =
      song.artist;

    const genre =
      document.createElement("div");

    genre.className = "song-genre";
    genre.textContent =
      song.genre;

    details.appendChild(title);
    details.appendChild(artist);
    details.appendChild(genre);

    const normaliseSongText =
      (value) =>
        String(value || "")
          .trim()
          .toLowerCase();

const hasBeenPlayed =
  appState.playedSongs.some(
    (playedSong) =>
      normaliseSongText(playedSong.title) ===
        normaliseSongText(song.title) &&
      normaliseSongText(playedSong.artist) ===
        normaliseSongText(song.artist)
  ) ||
  appState.queue.some(
    (requestedSong) =>
      normaliseSongText(requestedSong.title) ===
        normaliseSongText(song.title) &&
      normaliseSongText(requestedSong.artist) ===
        normaliseSongText(song.artist)
  ) ||
  (
    normaliseSongText(appState.liveQueue.nowPlaying?.title) ===
      normaliseSongText(song.title) &&
    normaliseSongText(appState.liveQueue.nowPlaying?.artist) ===
      normaliseSongText(song.artist)
  );
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "request-btn";

    if (
      hasBeenPlayed &&
      !appState.session.allowRepeats
    ) {
      button.textContent =
        "🚫 Repeats Off";

      button.disabled = true;
    } else if (hasBeenPlayed) {
      button.textContent =
        "🔁 Play It Again — $50";

      button.addEventListener(
        "click",
        async () => {
          button.disabled = true;

          button.textContent =
            "Checking Repeats...";

          await loadSessionSettingsFromSupabase();

          if (
            !appState.session.allowRepeats
          ) {
            button.textContent =
              "🚫 Repeats Off";

            button.disabled = true;
            return;
          }

          button.classList.remove(
            "loading"
          );

          button.textContent =
            "Opening Payment...";

          try {
            await startStripeCheckout(
              song,
              "replay"
            );
          } catch (error) {
            console.error(
              "Replay checkout failed",
              error
            );

            button.disabled = false;

            button.textContent =
              "🔁 Play It Again — $50";

            alert(
              "Payment could not start. Please try again."
            );
          }
        }
      );
    } else {
      button.textContent =
        "🎵 Request Song — $10";

      button.addEventListener(
        "click",
        () => {
          showRequestModal(song);
        }
      );
    }

    row.appendChild(details);
    row.appendChild(button);

    songList.appendChild(row);
  });
}
const landingPage =
  document.getElementById("landingPage");

const songSearchPage =
  document.getElementById("songSearchPage");

const dashboardPage =
  document.getElementById("dashboardPage");

const liveQueuePage =
  document.getElementById("liveQueuePage");

const tvDisplayPage =
  document.getElementById("tvDisplayPage");

const tvDisplayButton =
  document.getElementById("tvDisplayButton");

const tvNowPlayingTitle =
  document.getElementById(
    "tvNowPlayingTitle"
  );

const tvNowPlayingArtist =
  document.getElementById(
    "tvNowPlayingArtist"
  );

const tvQueueList =
  document.getElementById("tvQueueList");

const tvQrCode =
  document.getElementById("tvQrCode");

const backFromTvDisplayBtn =
  document.getElementById(
    "backFromTvDisplayBtn"
  );

const successScreen =
  document.getElementById("successScreen");

const requestModal =
  document.getElementById("requestModal");

const modalTitle =
  document.getElementById("modalTitle");

const modalArtist =
  document.getElementById("modalArtist");

const joinButton =
  document.getElementById("joinButton");

const andyTutorial = document.getElementById("andyTutorial");
const andyTutorialTitle = document.getElementById("andyTutorialTitle");
const andyTutorialText = document.getElementById("andyTutorialText");
const andyStepCount = document.getElementById("andyStepCount");
const andyBackBtn = document.getElementById("andyBackBtn");
const andyNextBtn = document.getElementById("andyNextBtn");
const skipAndyTutorial = document.getElementById("skipAndyTutorial");
const andyHelpButtons = document.querySelectorAll(".andy-help-btn");

const shoutOutButton =
  document.getElementById("shoutOutButton");

const shoutBeerButton =
  document.getElementById("shoutBeerButton");

const shoutOutModal =
  document.getElementById("shoutOutModal");

const shoutOutName =
  document.getElementById("shoutOutName");

const shoutOutMessage =
  document.getElementById("shoutOutMessage");

const shoutOutError =
  document.getElementById("shoutOutError");

const shoutOutCount =
  document.getElementById("shoutOutCount");

const sendShoutOutBtn =
  document.getElementById("sendShoutOutBtn");

const cancelShoutOutBtn =
  document.getElementById("cancelShoutOutBtn");

const accessPinModal =
  document.getElementById("accessPinModal");

const accessPinTitle =
  document.getElementById("accessPinTitle");

const accessPinInput =
  document.getElementById("accessPinInput");

const accessPinError =
  document.getElementById("accessPinError");

const submitAccessPinBtn =
  document.getElementById("submitAccessPinBtn");

const cancelAccessPinBtn =
  document.getElementById("cancelAccessPinBtn");

let pendingProtectedArea = null;

const dashboardButton =
  document.getElementById(
    "dashboardButton"
  );

const backToLandingBtn =
  document.getElementById(
    "backToLandingBtn"
  );

const homeFromSearchBtn =
  document.getElementById(
    "homeFromSearchBtn"
  );

const browseMoreSongsBtn =
  document.getElementById("browseMoreBtn");

const returnHomeBtn =
  document.getElementById("returnHomeBtn");

const cancelRequestBtn =
  document.getElementById(
    "cancelRequestBtn"
  );

const songSearchInput =
  document.getElementById(
    "songSearchInput"
  );

const songList =
  document.getElementById("songList");

const queueList =
  document.getElementById("queueList");

const nowPlayingTitle =
  document.getElementById(
    "nowPlayingTitle"
  );

const nowPlayingArtist =
  document.getElementById(
    "nowPlayingArtist"
  );

const upNextList =
  document.getElementById("upNextList");

const backendWarning =
  document.getElementById(
    "backendWarning"
  );

const dashboardSessionName =
  document.getElementById(
    "dashboardSessionName"
  );

const dashboardSessionCode =
  document.getElementById(
    "dashboardSessionCode"
  );

const dashboardVenue =
  document.getElementById(
    "dashboardVenue"
  );

const venueNameForm = document.getElementById("venueNameForm");
const venueNameInput = document.getElementById("venueNameInput");
const saveVenueNameBtn = document.getElementById("saveVenueNameBtn");
const venueNameStatus = document.getElementById("venueNameStatus");

const dashboardStartTime =
  document.getElementById(
    "dashboardStartTime"
  );

const dashboardTable =
  document.getElementById(
    "dashboardTable"
  );

const dashboardStatusBadge =
  document.getElementById(
    "dashboardStatusBadge"
  );

const toggleRequestsBtn =
  document.getElementById(
    "toggleRequestsBtn"
  );

const startNewSessionBtn =
  document.getElementById(
    "startNewSessionBtn"
  );

const allowRepeatsBtn =
  document.getElementById(
    "allowRepeatsBtn"
  );

const barRushBtn =
  document.getElementById(
    "barRushBtn"
  );

const importSetlistBtn = document.getElementById("importSetlistBtn");
const setlistFileInput = document.getElementById("setlistFileInput");
const showAddSongBtn = document.getElementById("showAddSongBtn");
const removeSelectedSongsBtn = document.getElementById("removeSelectedSongsBtn");
const removeAllSetlistBtn = document.getElementById("removeAllSetlistBtn");
const addSingleSongForm = document.getElementById("addSingleSongForm");
const newSongTitle = document.getElementById("newSongTitle");
const newSongArtist = document.getElementById("newSongArtist");
const newSongGenre = document.getElementById("newSongGenre");
const saveSingleSongBtn = document.getElementById("saveSingleSongBtn");
const setlistManagerStatus = document.getElementById("setlistManagerStatus");
const setlistManagerList = document.getElementById("setlistManagerList");
const setlistSongCount = document.getElementById("setlistSongCount");

venueNameForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const venueName = venueNameInput.value.trim();

  if (!venueName) {
    venueNameStatus.textContent = "Enter a venue name.";
    venueNameInput.focus();
    return;
  }

  saveVenueNameBtn.disabled = true;
  saveVenueNameBtn.textContent = "Saving...";
  venueNameStatus.textContent = "";

  const { data, error } = await supabase
    .from("songrush_sessions")
    .update({ venue_name: venueName, updated_at: new Date().toISOString() })
    .eq("session_id", appState.session.id)
    .select("session_id, venue_name")
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to save venue name", error);
    venueNameStatus.textContent = "Venue name could not be saved.";
  } else {
    appState.session.venueName = data.venue_name;
    venueNameStatus.textContent = "Venue name saved.";
    renderSessionUi();
    renderTvDisplay();
  }

  saveVenueNameBtn.disabled = false;
  saveVenueNameBtn.textContent = "Save";
});

function cleanSetlistSong(song) {
  const title = String(song?.title || song?.song || "").trim().slice(0, 120);
  const artist = String(song?.artist || "").trim().slice(0, 120);
  const genre = String(song?.genre || "Unknown").trim().slice(0, 80) || "Unknown";

  return title ? { title, artist, genre } : null;
}

function deduplicateSetlist(songs) {
  const seen = new Set();

  return songs.map(cleanSetlistSong).filter((song) => {
    if (!song) return false;
    const key = `${song.title}|${song.artist}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function saveSetlist(songs, message) {
  const cleanedSongs = deduplicateSetlist(songs);

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("The live database is not connected.");
  }

  const { data, error } = await supabase
    .from("songrush_sessions")
    .update({
      setlist: cleanedSongs,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", appState.session.id)
    .select("session_id, setlist")
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("The active session could not be updated.");
  }

  const savedSongs = Array.isArray(data.setlist)
    ? data.setlist
    : cleanedSongs;

  appState.session.setlist = savedSongs;
  appState.songs = savedSongs;
  renderSongs(songSearchInput.value);
  renderSetlistManager();
  setlistManagerStatus.textContent = message;
}

function renderSetlistManager() {
  if (!setlistManagerList || !setlistSongCount) return;

  setlistManagerList.innerHTML = "";
  setlistSongCount.textContent = `${appState.songs.length} song${appState.songs.length === 1 ? "" : "s"}`;
  removeAllSetlistBtn.disabled = appState.songs.length === 0;
  removeSelectedSongsBtn.disabled = true;

  if (appState.songs.length === 0) {
    setlistManagerList.innerHTML = '<p class="empty-state">No songs in this setlist.</p>';
    return;
  }

  appState.songs.forEach((song, index) => {
    const row = document.createElement("label");
    row.className = "setlist-manager-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.songIndex = String(index);
    checkbox.addEventListener("change", () => {
      removeSelectedSongsBtn.disabled =
        setlistManagerList.querySelectorAll('input[type="checkbox"]:checked').length === 0;
    });

    const details = document.createElement("div");
    details.className = "setlist-manager-song";
    const title = document.createElement("strong");
    title.textContent = song.title;
    const meta = document.createElement("span");
    meta.textContent = [song.artist, song.genre].filter(Boolean).join(" · ");
    details.append(title, meta);
    row.append(checkbox, details);
    setlistManagerList.appendChild(row);
  });
}

function parseSetlistCsv(text) {
  return text.split(/\r?\n/).map((line) => {
    const [title = "", artist = "", genre = "Unknown"] = line
      .split(",")
      .map((value) => value.trim().replace(/^"|"$/g, ""));
    return { title, artist, genre };
  });
}

importSetlistBtn?.addEventListener("click", () => setlistFileInput.click());

setlistFileInput?.addEventListener("change", async () => {
  const file = setlistFileInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith(".json")
      ? JSON.parse(text)
      : parseSetlistCsv(text);
    const incomingSongs = Array.isArray(imported) ? imported : imported.songs;
    if (!Array.isArray(incomingSongs)) throw new Error("Invalid setlist file.");
    const merged = deduplicateSetlist([...appState.songs, ...incomingSongs]);
    const addedCount = merged.length - appState.songs.length;
    await saveSetlist(merged, `${addedCount} song${addedCount === 1 ? "" : "s"} added from ${file.name}.`);
  } catch (error) {
    console.error("Unable to import setlist", error);
    setlistManagerStatus.textContent = "Could not read that file. Use a SongRush JSON or CSV file.";
  } finally {
    setlistFileInput.value = "";
  }
});

showAddSongBtn?.addEventListener("click", () => {
  addSingleSongForm.classList.toggle("hidden");
  if (!addSingleSongForm.classList.contains("hidden")) newSongTitle.focus();
});

saveSingleSongBtn?.addEventListener("click", async () => {
  const song = cleanSetlistSong({
    title: newSongTitle.value,
    artist: newSongArtist.value,
    genre: newSongGenre.value,
  });
  if (!song) {
    setlistManagerStatus.textContent = "Enter a song title first.";
    return;
  }

  try {
    await saveSetlist([...appState.songs, song], `${song.title} added.`);
    newSongTitle.value = "";
    newSongArtist.value = "";
    newSongGenre.value = "";
    addSingleSongForm.classList.add("hidden");
  } catch (error) {
    console.error("Unable to add song", error);
    setlistManagerStatus.textContent = "The song could not be saved.";
  }
});

removeSelectedSongsBtn?.addEventListener("click", async () => {
  const selected = new Set(
    [...setlistManagerList.querySelectorAll('input[type="checkbox"]:checked')]
      .map((checkbox) => Number(checkbox.dataset.songIndex))
  );
  if (selected.size === 0) return;
  if (!window.confirm(`Remove ${selected.size} selected song${selected.size === 1 ? "" : "s"}?`)) return;

  removeSelectedSongsBtn.disabled = true;
  removeSelectedSongsBtn.textContent = "Removing...";

  try {
    await saveSetlist(
      appState.songs.filter((_, index) => !selected.has(index)),
      `${selected.size} song${selected.size === 1 ? "" : "s"} removed.`
    );
  } catch (error) {
    console.error("Unable to remove selected songs", error);
    setlistManagerStatus.textContent = "The selected songs could not be removed.";
  } finally {
    removeSelectedSongsBtn.textContent = "Remove Selected Songs";
    removeSelectedSongsBtn.disabled =
      setlistManagerList.querySelectorAll(
        'input[type="checkbox"]:checked'
      ).length === 0;
  }
});

removeAllSetlistBtn?.addEventListener("click", async () => {
  if (appState.songs.length === 0) return;
  if (!window.confirm(`Remove all ${appState.songs.length} songs from tonight's setlist?`)) return;

  removeAllSetlistBtn.disabled = true;
  removeAllSetlistBtn.textContent = "Removing...";

  try {
    await saveSetlist([], "All setlist songs removed.");
  } catch (error) {
    console.error("Unable to remove setlist", error);
    setlistManagerStatus.textContent = "The setlist could not be cleared.";
  } finally {
    removeAllSetlistBtn.textContent = "Remove All Setlist Songs";
    removeAllSetlistBtn.disabled = appState.songs.length === 0;
  }
});
joinButton.addEventListener(
  "click",
  showSongList
);

andyHelpButtons.forEach((button) => {
  button.addEventListener("click", openAndyTutorial);
});

andyBackBtn?.addEventListener("click", () => {
  andyTutorialStep = Math.max(0, andyTutorialStep - 1);
  renderAndyTutorialStep();
});

andyNextBtn?.addEventListener("click", () => {
  if (andyTutorialStep < ANDY_TUTORIAL_STEPS.length - 1) {
    andyTutorialStep += 1;
    renderAndyTutorialStep();
    return;
  }

  closeAndyTutorial();
});

skipAndyTutorial?.addEventListener("click", closeAndyTutorial);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !andyTutorial?.classList.contains("hidden")) {
    closeAndyTutorial();
  }
});

function closeShoutOutModal() {
  shoutOutModal?.classList.add("hidden");
  if (shoutOutError) shoutOutError.textContent = "";
}

shoutOutButton?.addEventListener("click", () => {
  shoutOutModal?.classList.remove("hidden");
  shoutOutMessage?.focus();
});

shoutBeerButton?.addEventListener("click", async () => {
  const originalText = shoutBeerButton.textContent;
  shoutBeerButton.disabled = true;
  shoutBeerButton.textContent = "Opening Payment...";

  try {
    await startBeerShoutCheckout();
  } catch (error) {
    console.error("Beer shout checkout failed", error);
    alert("Payment could not start. Please try again.");
    shoutBeerButton.disabled = false;
    shoutBeerButton.textContent = originalText;
  }
});

cancelShoutOutBtn?.addEventListener(
  "click",
  closeShoutOutModal
);

shoutOutModal?.addEventListener("click", (event) => {
  if (event.target === shoutOutModal) {
    closeShoutOutModal();
  }
});

shoutOutMessage?.addEventListener("input", () => {
  const message = shoutOutMessage.value;
  shoutOutCount.textContent = `${message.length} / 160`;
  shoutOutError.textContent = containsOffensiveLanguage(message)
    ? "Please rewrite this message without offensive language."
    : "";
});

sendShoutOutBtn?.addEventListener("click", async () => {
  const name = shoutOutName.value.trim();
  const message = shoutOutMessage.value.trim();

  if (!message) {
    shoutOutError.textContent = "Please enter a shout-out.";
    shoutOutMessage.focus();
    return;
  }

  if (containsOffensiveLanguage(message)) {
    shoutOutError.textContent =
      "Please rewrite this message without offensive language.";
    shoutOutMessage.focus();
    return;
  }

  sendShoutOutBtn.disabled = true;
  sendShoutOutBtn.textContent = "Opening Payment...";

  try {
    await startShoutOutCheckout(name, message);
  } catch (error) {
    console.error("Shout-out checkout failed", error);
    shoutOutError.textContent =
      "Payment could not start. Please try again.";
    sendShoutOutBtn.disabled = false;
    sendShoutOutBtn.textContent = "Check Message & Pay $10";
  }
});

function hasProtectedAccess(area) {
  try {
    const unlockedAreas = JSON.parse(
      sessionStorage.getItem(ACCESS_SESSION_KEY) || "[]"
    );

    return unlockedAreas.includes(area);
  } catch {
    return false;
  }
}

function rememberProtectedAccess(area) {
  let unlockedAreas = [];

  try {
    unlockedAreas = JSON.parse(
      sessionStorage.getItem(ACCESS_SESSION_KEY) || "[]"
    );
  } catch {
    unlockedAreas = [];
  }

  sessionStorage.setItem(
    ACCESS_SESSION_KEY,
    JSON.stringify([...new Set([...unlockedAreas, area])])
  );
}

function openProtectedArea(area) {
  if (area === "tv") {
    showTvDisplay();
  } else if (area === "dashboard") {
    showDashboard();
  }
}

function closeAccessPinModal() {
  accessPinModal?.classList.add("hidden");
  accessPinInput.value = "";
  accessPinError.textContent = "";
  pendingProtectedArea = null;
}

function requestProtectedAccess(area) {
  if (hasProtectedAccess(area)) {
    openProtectedArea(area);
    return;
  }

  pendingProtectedArea = area;
  accessPinTitle.textContent =
    area === "tv" ? "TV Display Access" : "Performer Access";
  accessPinModal.classList.remove("hidden");
  accessPinInput.focus();
}

tvDisplayButton?.addEventListener("click", () => {
  requestProtectedAccess("tv");
});

dashboardButton?.addEventListener("click", () => {
  requestProtectedAccess("dashboard");
});

cancelAccessPinBtn?.addEventListener(
  "click",
  closeAccessPinModal
);

accessPinModal?.addEventListener("click", (event) => {
  if (event.target === accessPinModal) {
    closeAccessPinModal();
  }
});

accessPinInput?.addEventListener("input", () => {
  accessPinInput.value = accessPinInput.value.replace(/\D/g, "");
  accessPinError.textContent = "";
});

accessPinInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitAccessPinBtn.click();
  }
});

submitAccessPinBtn?.addEventListener("click", async () => {
  const area = pendingProtectedArea;
  const pin = accessPinInput.value;

  if (!area || !/^\d{4,6}$/.test(pin)) {
    accessPinError.textContent = "Enter a valid 4–6 digit PIN.";
    return;
  }

  submitAccessPinBtn.disabled = true;
  submitAccessPinBtn.textContent = "Checking...";

  try {
    await validateAccessPin(pin, area);
    rememberProtectedAccess(area);
    closeAccessPinModal();
    openProtectedArea(area);
  } catch (error) {
    accessPinError.textContent = error.message;
    accessPinInput.value = "";
    accessPinInput.focus();
  } finally {
    submitAccessPinBtn.disabled = false;
    submitAccessPinBtn.textContent = "Unlock";
  }
});

backToLandingBtn.addEventListener(
  "click",
  showLandingPage
);

homeFromSearchBtn.addEventListener(
  "click",
  showLandingPage
);

if (browseMoreSongsBtn) {
  browseMoreSongsBtn.addEventListener(
    "click",
    showSongList
  );
}

if (returnHomeBtn) {
  returnHomeBtn.addEventListener(
    "click",
    showLandingPage
  );
}

if (backFromTvDisplayBtn) {
  backFromTvDisplayBtn.addEventListener(
    "click",
    showLandingPage
  );
}

songSearchInput.addEventListener(
  "input",
  (event) => {
    renderSongs(event.target.value);
  }
);

cancelRequestBtn.addEventListener(
  "click",
  closeModal
);

requestModal.addEventListener(
  "click",
  (event) => {
    if (event.target === requestModal) {
      closeModal();
    }
  }
);

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      closeModal();
      closeShoutOutModal();
      closeAccessPinModal();
    }
  }
);

document
  .querySelectorAll(".modal-option")
  .forEach((optionButton) => {
    optionButton.addEventListener(
      "click",
      async () => {
        if (!appState.selectedSong) {
          return;
        }

        const optionValue =
          optionButton.dataset.option ||
          "standard";

        try {
          await startStripeCheckout(
            appState.selectedSong,
            optionValue
          );
        } catch (error) {
          console.error(
            "Stripe checkout failed",
            error
          );

          alert(
            "Payment could not start. Please try again."
          );
        }
      }
    );
  });

async function moveQueueRequest(
  item,
  index,
  direction,
  clickedButton
) {
  const targetIndex =
    index + direction;

  if (
    targetIndex < 0 ||
    targetIndex >= appState.queue.length
  ) {
    return;
  }

  const targetItem =
    appState.queue[targetIndex];

  if (!isSupabaseConfigured || !supabase) {
    [
      appState.queue[index],
      appState.queue[targetIndex],
    ] = [
      appState.queue[targetIndex],
      appState.queue[index],
    ];

    renderQueue();
    return;
  }

  const itemQueueOrder =
    item.queueOrder;

  const targetQueueOrder =
    targetItem.queueOrder;

  if (
    itemQueueOrder === undefined ||
    itemQueueOrder === null ||
    targetQueueOrder === undefined ||
    targetQueueOrder === null
  ) {
    console.error(
      "Unable to move queue request: queue_order is missing",
      {
        item,
        targetItem,
      }
    );

    return;
  }

  clickedButton.disabled = true;

  clickedButton.textContent =
    "Moving...";

  const {
    error: itemUpdateError,
  } = await supabase
    .from("song_requests")
    .update({
      queue_order:
        targetQueueOrder,
    })
    .eq("id", item.id)
    .eq(
      "session_id",
      appState.session.id
    );

  if (itemUpdateError) {
    console.error(
      "Unable to update moved request",
      itemUpdateError
    );

    await loadRequestsFromSupabase();
    return;
  }

  const {
    error: targetUpdateError,
  } = await supabase
    .from("song_requests")
    .update({
      queue_order:
        itemQueueOrder,
    })
    .eq("id", targetItem.id)
    .eq(
      "session_id",
      appState.session.id
    );

  if (targetUpdateError) {
    console.error(
      "Unable to update neighbouring request",
      targetUpdateError
    );

    const {
      error: rollbackError,
    } = await supabase
      .from("song_requests")
      .update({
        queue_order:
          itemQueueOrder,
      })
      .eq("id", item.id)
      .eq(
        "session_id",
        appState.session.id
      );

    if (rollbackError) {
      console.error(
        "Unable to roll back queue movement",
        rollbackError
      );
    }

    await loadRequestsFromSupabase();
    return;
  }

  await loadRequestsFromSupabase();
}

function renderQueue() {
  queueList.innerHTML = "";

  if (appState.queue.length === 0) {
    queueList.innerHTML =
      '<p class="empty-state">No requests in the queue.</p>';

    return;
  }

  appState.queue.forEach(
    (item, index) => {
      const queueItem =
        document.createElement("div");

      queueItem.className =
        "queue-item";

      const title =
        document.createElement("div");

      title.className =
        "queue-item-title";

      title.textContent =
        `${item.title} – ${item.artist}`;

      const meta =
        document.createElement("div");

      meta.className =
        "queue-item-meta";

      meta.textContent =
        `${item.type} • ${item.price}`;

      const actions =
        document.createElement("div");

      const markPlayedBtn =
        document.createElement("button");

      markPlayedBtn.type = "button";
      markPlayedBtn.textContent =
        "▶ Play";

      markPlayedBtn.addEventListener(
        "click",
        async () => {
          if (
            isSupabaseConfigured &&
            supabase
          ) {
            const {
              error: completeError,
            } = await supabase
              .from("song_requests")
              .update({
                status: "completed",
              })
              .eq(
                "session_id",
                appState.session.id
              )
              .eq(
                "status",
                "playing"
              );

            if (completeError) {
              console.error(
                "Unable to complete current playing request",
                completeError
              );

              return;
            }

            const {
              error: playError,
            } = await supabase
              .from("song_requests")
              .update({
                status: "playing",
              })
              .eq("id", item.id);

            if (playError) {
              console.error(
                "Unable to mark request as playing",
                playError
              );

              return;
            }

            await loadNowPlayingFromSupabase();
            await loadRequestsFromSupabase();
            await loadPlayedTonightFromSupabase();

            return;
          }

          appState.queue =
            appState.queue.filter(
              (queueItemEntry) =>
                queueItemEntry.id !==
                item.id
            );

          renderQueue();
        }
      );

      const moveUpBtn =
        document.createElement("button");

      moveUpBtn.type = "button";
      moveUpBtn.textContent =
        "Move Up";

      moveUpBtn.disabled =
        index === 0;

      moveUpBtn.addEventListener(
        "click",
        async () => {
          await moveQueueRequest(
            item,
            index,
            -1,
            moveUpBtn
          );
        }
      );

      const moveDownBtn =
        document.createElement("button");

      moveDownBtn.type = "button";
      moveDownBtn.textContent =
        "Move Down";

      moveDownBtn.disabled =
        index ===
        appState.queue.length - 1;

      moveDownBtn.addEventListener(
        "click",
        async () => {
          await moveQueueRequest(
            item,
            index,
            1,
            moveDownBtn
          );
        }
      );

      actions.appendChild(
        markPlayedBtn
      );

      actions.appendChild(
        moveUpBtn
      );

      actions.appendChild(
        moveDownBtn
      );

      queueItem.appendChild(title);
      queueItem.appendChild(meta);
      queueItem.appendChild(actions);

      queueList.appendChild(
        queueItem
      );
    }
  );
}

function renderLiveQueue() {
  const { liveQueue } = appState;

  nowPlayingTitle.textContent =
    liveQueue.nowPlaying?.title ||
    "Nothing currently playing";

  nowPlayingArtist.textContent =
    liveQueue.nowPlaying?.artist ||
    "";

  upNextList.innerHTML = "";

  if (
    !liveQueue.upNext ||
    liveQueue.upNext.length === 0
  ) {
    const emptyItem =
      document.createElement("li");

    emptyItem.className =
      "up-next-item";

    emptyItem.textContent =
      "No songs are waiting in the queue.";

    upNextList.appendChild(
      emptyItem
    );
  } else {
    liveQueue.upNext.forEach(
      (item, index) => {
        const listItem =
          document.createElement("li");

        listItem.className =
          "up-next-item";

        const number =
          document.createElement(
            "span"
          );

        number.className =
          "up-next-number";

        number.textContent =
          index + 1;

        const details =
          document.createElement(
            "div"
          );

        details.className =
          "up-next-details";

        const title =
          document.createElement(
            "div"
          );

        title.className =
          "up-next-title";

        title.textContent =
          item.title;

        const artist =
          document.createElement(
            "div"
          );

        artist.className =
          "up-next-artist";

        artist.textContent =
          item.artist || "";

        details.appendChild(title);
        details.appendChild(artist);

        listItem.appendChild(number);
        listItem.appendChild(details);

        upNextList.appendChild(
          listItem
        );
      }
    );
  }

  const myRequestsList =
    document.getElementById(
      "myRequestsList"
    );

  if (!myRequestsList) {
    return;
  }

  myRequestsList.innerHTML = "";

  const customerRequests =
    liveQueue.requests || [];

  if (
    customerRequests.length === 0
  ) {
    myRequestsList.innerHTML =
      '<p class="empty-state">You have no requests yet.</p>';

    return;
  }

  customerRequests.forEach(
    (request) => {
      const requestCard =
        document.createElement(
          "div"
        );

      requestCard.className =
        "request-highlight";

      const badge =
        document.createElement(
          "div"
        );

      badge.className =
        "music-badge";

      badge.textContent = "🎵";

      const details =
        document.createElement(
          "div"
        );

      details.className =
        "request-details";

      const title =
        document.createElement("h3");

      title.textContent =
        request.title;

      const artist =
        document.createElement("p");

      artist.className =
        "song-artist";

      artist.textContent =
        request.artist || "";

      const positionRow =
        document.createElement("p");

      positionRow.className =
        "request-stat";

      const positionLabel =
        document.createElement(
          "span"
        );

      positionLabel.className =
        "stat-label";

      positionLabel.textContent =
        "Queue Position";

      const positionValue =
        document.createElement(
          "span"
        );

      positionValue.className =
        "stat-value";

      const waitRow =
        document.createElement("p");

      waitRow.className =
        "request-stat";

      const waitLabel =
        document.createElement(
          "span"
        );

      waitLabel.className =
        "stat-label";

      waitLabel.textContent =
        "Estimated Wait";

      const waitValue =
        document.createElement(
          "span"
        );

      waitValue.className =
        "stat-value";

      if (
        request.status === "playing"
      ) {
        positionValue.textContent =
          "Now Playing";

        waitValue.textContent =
          "0 Minutes";
      } else if (
        request.status === "completed"
      ) {
        positionValue.textContent =
          "Played";

        waitValue.textContent =
          "Completed";
      } else if (
        request.status ===
          "processing" ||
        request.position === null
      ) {
        positionValue.textContent =
          "Processing";

        waitValue.textContent =
          "Please wait...";
      } else {
        positionValue.textContent =
          `#${request.position}`;

        waitValue.textContent =
          `${request.estimatedWaitMinutes} Minutes`;
      }

      positionRow.appendChild(
        positionLabel
      );

      positionRow.appendChild(
        positionValue
      );

      waitRow.appendChild(
        waitLabel
      );

      waitRow.appendChild(
        waitValue
      );

      details.appendChild(title);

      if (request.artist) {
        details.appendChild(
          artist
        );
      }

      details.appendChild(
        positionRow
      );

      details.appendChild(
        waitRow
      );

      requestCard.appendChild(
        badge
      );

      requestCard.appendChild(
        details
      );

      myRequestsList.appendChild(
        requestCard
      );
    }
  );
}
function renderTvQrCode() {
  if (!tvQrCode) {
    return;
  }

  const sessionId =
    appState.session?.id;

  if (!sessionId) {
    tvQrCode.innerHTML =
      '<p class="empty-state">QR code unavailable.</p>';

    return;
  }

  const qrImageUrl =
    `/.netlify/functions/generate-qr?session=${encodeURIComponent(
      sessionId
    )}&v=3`;

  tvQrCode.innerHTML = "";

  const qrImage =
    document.createElement("img");

  qrImage.src = qrImageUrl;
  qrImage.alt =
    `Scan to join SongRush session ${sessionId}`;

  qrImage.width = 300;
  qrImage.height = 300;

  const instruction =
    document.createElement("p");

  instruction.textContent =
    "Scan to request a song or send a Crowd Shout-Out";

  const sessionLabel =
    document.createElement("p");

  sessionLabel.textContent =
    `Session: ${sessionId}`;

  tvQrCode.appendChild(qrImage);
  tvQrCode.appendChild(instruction);
  tvQrCode.appendChild(sessionLabel);
}

function renderTvDisplay() {  
  renderTvQrCode();

  const playingNextTitle =
    document.getElementById("tvPlayingNextTitle");

  const playingNextArtist =
    document.getElementById("tvPlayingNextArtist");

  const nextSong = appState.liveQueue.upNext?.[0];

  if (playingNextTitle) {
    playingNextTitle.textContent =
      nextSong?.title || "No song queued";
  }

  if (playingNextArtist) {
    playingNextArtist.textContent =
      nextSong?.artist || "";
  }

  if (
    !tvNowPlayingTitle ||
    !tvNowPlayingArtist ||
    !tvQueueList
  ) {
    return;
  }

  const normalDisplay =
    document.getElementById(
      "tvNormalDisplay"
    );

  const barRushPanel =
    document.getElementById(
      "tvBarRushPanel"
    );

  const barRushCorner =
    document.getElementById("tvBarRushCorner");

  const barRushCornerOffer =
    document.getElementById("tvBarRushCornerOffer");

  const shoutOutPanel =
    document.getElementById("tvShoutOutPanel");

  const shoutOutMessage =
    document.getElementById("tvShoutOutMessage");

  const shoutOutName =
    document.getElementById("tvShoutOutName");

  const offerEl =
    document.getElementById(
      "tvBarRushOffer"
    );

  const countdownEl =
    document.getElementById(
      "tvBarRushCountdown"
    );

  const barRushCreatedAt = appState.barRush
    ? new Date(appState.barRush.created_at || Date.now()).getTime()
    : 0;

  const barRushExpiresAt = appState.barRush
    ? new Date(appState.barRush.expires_at).getTime()
    : 0;

  const barRushIsActive = Boolean(
    appState.barRush && barRushExpiresAt > Date.now()
  );

  const barRushIsFullscreen = Boolean(
    barRushIsActive &&
    Date.now() < barRushCreatedAt + BAR_RUSH_FULLSCREEN_MS
  );

  if (
    barRushIsFullscreen &&
    normalDisplay &&
    barRushPanel
  ) {
    normalDisplay.classList.add(
      "hidden"
    );

    barRushPanel.classList.remove(
      "hidden"
    );

    shoutOutPanel?.classList.add("hidden");
    barRushCorner?.classList.add("hidden");

    if (offerEl) {
      offerEl.textContent =
        appState.barRush.offer_text;
    }

    if (countdownEl) {
      const expires =
        new Date(
          appState.barRush.expires_at
        );

      const minutes = Math.max(
        0,
        Math.ceil(
          (expires - new Date()) /
            60000
        )
      );

      countdownEl.textContent =
        `${minutes} minute${
          minutes === 1 ? "" : "s"
        } remaining`;
    }

    return;
  }

  if (
    appState.activeScreenMessage &&
    normalDisplay &&
    shoutOutPanel
  ) {
    normalDisplay.classList.add("hidden");
    barRushPanel?.classList.add("hidden");
    barRushCorner?.classList.add("hidden");
    shoutOutPanel.classList.remove("hidden");

    if (shoutOutMessage) {
      shoutOutMessage.textContent =
        appState.activeScreenMessage.message;
    }

    if (shoutOutName) {
      const customerName = String(
        appState.activeScreenMessage.customer_name || ""
      ).trim();

      shoutOutName.textContent = customerName
        ? `— ${customerName}`
        : "— From the crowd";
    }

    return;
  }

  if (normalDisplay) {
    normalDisplay.classList.remove(
      "hidden"
    );
  }

  if (barRushPanel) {
    barRushPanel.classList.add(
      "hidden"
    );
  }

  shoutOutPanel?.classList.add("hidden");

  if (barRushCorner) {
    barRushCorner.classList.toggle(
      "hidden",
      !barRushIsActive
    );
  }

  if (barRushCornerOffer && barRushIsActive) {
    barRushCornerOffer.textContent =
      appState.barRush.offer_text;
  }

  tvNowPlayingTitle.textContent =
    appState.liveQueue
      .nowPlaying?.title ||
    "Nothing currently playing";

  tvNowPlayingArtist.textContent =
    appState.liveQueue
      .nowPlaying?.artist ||
    "";

  tvQueueList.innerHTML = "";

  if (
    !appState.liveQueue.upNext ||
    appState.liveQueue.upNext.length === 0
  ) {
    const item =
      document.createElement("li");

    item.textContent =
      "No songs in queue";

    tvQueueList.appendChild(item);

    return;
  }

  appState.liveQueue.upNext.forEach(
    (song, index) => {
      const item =
        document.createElement("li");

      item.textContent =
        `${index + 1}. ${song.title} — ${song.artist}`;

      tvQueueList.appendChild(item);
    }
  );
}
async function startNewSession() {
  const newCode = `SR-${String(
    Math.floor(Math.random() * 9000) + 1000
  )}`;

  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from("songrush_sessions")
      .upsert(
        {
          session_id: newCode,
          allow_repeats: true,
          requests_open: true,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "session_id",
        }
      );

    if (error) {
      console.error(
        "Unable to create session settings",
        error
      );

      return false;
    }
  }

  appState.session = {
    ...appState.session,
    id: newCode,
    requestsOpen: true,
    allowRepeats: true,
    status: "LIVE",

    startTime: new Date().toLocaleTimeString(
      [],
      {
        hour: "numeric",
        minute: "2-digit",
      }
    ),
    updatedAt: new Date().toISOString(),
  };

  appState.queue = [];
  appState.playedSongs = [];

  appState.liveQueue = {
    nowPlaying: {
      title: "Nothing currently playing",
      artist: "",
    },

    upNext: [],
    requests: [],
  };

  renderQueue();
  renderLiveQueue();
  renderSessionUi();

  await loadSessionSettingsFromSupabase();
  await loadRequestsFromSupabase();
  await loadNowPlayingFromSupabase();
  await loadPlayedTonightFromSupabase();

  subscribeToQueueChanges();
  subscribeToSessionSettingsChanges();

  return true;
}

if (toggleRequestsBtn) {
  toggleRequestsBtn.addEventListener(
    "click",
    async () => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        return;
      }

      const newRequestsOpenValue =
        !appState.session.requestsOpen;

      toggleRequestsBtn.disabled = true;

      toggleRequestsBtn.textContent =
        "Saving...";

      const { data, error } =
        await supabase
          .from("songrush_sessions")
          .update({
            requests_open:
              newRequestsOpenValue,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "session_id",
            appState.session.id
          )
          .select(
            "session_id, requests_open"
          )
          .maybeSingle();

      if (error) {
        console.error(
          "Unable to update request setting",
          error
        );

        toggleRequestsBtn.disabled =
          false;

        renderSessionUi();
        return;
      }

      if (!data) {
        console.error(
          "Request setting was not saved because no matching session row was found",
          appState.session.id
        );

        toggleRequestsBtn.disabled =
          false;

        await loadSessionSettingsFromSupabase();
        return;
      }

      appState.session.requestsOpen =
        data.requests_open;

      renderSessionUi();

      if (
        appState.currentView ===
        "songSearch"
      ) {
        renderSongs(
          songSearchInput.value
        );
      }

      toggleRequestsBtn.disabled =
        false;
    }
  );
}

if (allowRepeatsBtn) {
  allowRepeatsBtn.addEventListener(
    "click",
    async () => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        return;
      }

      const newAllowRepeatsValue =
        !appState.session.allowRepeats;

      allowRepeatsBtn.disabled = true;

      allowRepeatsBtn.textContent =
        "Saving...";

      const { data, error } =
        await supabase
          .from("songrush_sessions")
          .update({
            allow_repeats:
              newAllowRepeatsValue,

            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "session_id",
            appState.session.id
          )
          .select(
            "session_id, allow_repeats"
          )
          .maybeSingle();

      if (error) {
        console.error(
          "Unable to update repeat setting",
          error
        );

        allowRepeatsBtn.disabled =
          false;

        renderSessionUi();
        return;
      }

      if (!data) {
        console.error(
          "Repeat setting was not saved because no matching session row was found",
          appState.session.id
        );

        allowRepeatsBtn.disabled =
          false;

        await loadSessionSettingsFromSupabase();
        return;
      }

      appState.session.allowRepeats =
        data.allow_repeats;

      renderSessionUi();

      if (
        appState.currentView ===
        "songSearch"
      ) {
        renderSongs(
          songSearchInput.value
        );
      }

      allowRepeatsBtn.disabled =
        false;
    }
  );
}
if (barRushBtn) {
  barRushBtn.addEventListener(
    "click",
    async () => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        alert(
          "Bar Rush cannot launch because Supabase is not connected."
        );

        return;
      }

      const offerText = prompt(
        "What is the Bar Rush offer?",
        "$5 HOUSE BEERS"
      );

      if (!offerText || !offerText.trim()) {
        return;
      }

      const durationInput = prompt(
        "How many minutes will Bar Rush run?",
        "10"
      );

      if (durationInput === null) {
        return;
      }

      const durationMinutes =
        Number.parseInt(
          durationInput,
          10
        );

      if (
        !Number.isInteger(
          durationMinutes
        ) ||
        durationMinutes < 1
      ) {
        alert(
          "Please enter a valid number of minutes."
        );

        return;
      }

      const expiresAt = new Date(
        Date.now() +
          durationMinutes *
            60 *
            1000
      ).toISOString();

      barRushBtn.disabled = true;

      barRushBtn.textContent =
        "Launching Bar Rush...";

      const { error } = await supabase
        .from(
          "bar_rush_announcements"
        )
        .insert([
          {
            session_id:
              appState.session.id,

            offer_text:
              offerText.trim(),

            duration_minutes:
              durationMinutes,

            status: "active",

            expires_at: expiresAt,
          },
        ]);

      if (error) {
        console.error(
          "Unable to launch Bar Rush",
          error
        );

        alert(
          "Bar Rush could not be launched."
        );

        barRushBtn.disabled = false;

        barRushBtn.textContent =
          "🍻 BAR RUSH";

        return;
      }

      alert(
        `🍻 BAR RUSH launched!\n\n${offerText.trim()}\n${durationMinutes} minutes`
      );

      barRushBtn.disabled = false;

      barRushBtn.textContent =
        "🍻 BAR RUSH";
    }
  );
}


if (startNewSessionBtn) {
  startNewSessionBtn.addEventListener(
    "click",
    startNewSession
  );
}

const finishCurrentSongBtn =
  document.getElementById(
    "finishCurrentSongBtn"
  );

if (finishCurrentSongBtn) {
  finishCurrentSongBtn.addEventListener(
    "click",
    async () => {
      if (
        !isSupabaseConfigured ||
        !supabase
      ) {
        return;
      }

      finishCurrentSongBtn.disabled =
        true;

      finishCurrentSongBtn.textContent =
        "Finishing...";

      const { error } = await supabase
        .from("song_requests")
        .update({
          status: "completed",
        })
        .eq(
          "session_id",
          appState.session.id
        )
        .eq("status", "playing");

      if (error) {
        console.error(
          "Unable to finish current song",
          error
        );

        finishCurrentSongBtn.disabled =
          false;

        finishCurrentSongBtn.textContent =
          "Finish Current Song";

        return;
      }

      await loadNowPlayingFromSupabase();
      await loadRequestsFromSupabase();
      await loadPlayedTonightFromSupabase();

      finishCurrentSongBtn.disabled =
        false;

      finishCurrentSongBtn.textContent =
        "Finish Current Song";
    }
  );
}

async function loadSongs() {
  try {
    if (Array.isArray(appState.session.setlist)) {
      appState.songs = appState.session.setlist;
      await loadPlayedTonightFromSupabase();
      renderSongs();
      renderSetlistManager();
      return;
    }

    const response = await fetch(
      "songs.json"
    );

    if (!response.ok) {
      throw new Error(
        "Unable to load songs"
      );
    }

    appState.songs =
      await response.json();

    await loadPlayedTonightFromSupabase();

    renderSongs();
    renderSetlistManager();
  } catch (error) {
    console.error(
      "Unable to load songs",
      error
    );

    songList.innerHTML =
      '<p class="empty-state">No songs available.</p>';
  }
}

async function loadActiveSessionFromSupabase() {
  if (
    !isSupabaseConfigured ||
    !supabase
  ) {
    console.log(
      "Supabase not configured"
    );

    return;
  }

  const { data, error } =
    await supabase
      .from("songrush_sessions")
      .select(
        "session_id, allow_repeats, requests_open, setlist, updated_at"
      )
      .order("updated_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  console.log(
    "Active session query:",
    {
      data,
      error,
    }
  );

  if (error) {
    console.error(
      "Unable to load active session",
      error
    );

    return;
  }

  if (!data) {
    console.warn(
      "No active session found."
    );

    return;
  }

  appState.session.id =
    data.session_id;

  appState.session.allowRepeats =
    data.allow_repeats;

  appState.session.requestsOpen =
    data.requests_open;

  appState.session.updatedAt = data.updated_at;

  appState.session.setlist = Array.isArray(data.setlist)
    ? data.setlist
    : null;

  console.log(
    "Loaded active session:",
    appState.session.id
  );

  renderSessionUi();
}
async function initialiseSongRush() {
  const urlParams =
    new URLSearchParams(
      window.location.search
    );

  const paymentStatus =
    urlParams.get("payment");

  if (
    paymentStatus !== "success" &&
    urlParams.get("view") !== "performer" &&
    !localStorage.getItem(ANDY_TUTORIAL_KEY)
  ) {
    window.setTimeout(openAndyTutorial, 450);
  }

  const sessionFromQr =
    urlParams.get("session");

  if (sessionFromQr) {
    appState.session.id = sessionFromQr;

    console.log(
      "Joined session from QR:",
      sessionFromQr
    );
  } else {
    await loadActiveSessionFromSupabase();
  }

await loadSessionSettingsFromSupabase();
await loadRequestsFromSupabase();
await loadNowPlayingFromSupabase();
await loadSongs();

  if (paymentStatus === "success") {
    const paymentType = urlParams.get("payment_type");

    if (paymentType === "performer_beer") {
      showLandingPage();
      alert("🍺 Thank you! You shouted the performer a beer.");
      return;
    }

    if (paymentType === "screen_message") {
      showLandingPage();
      alert("📣 Thank you! Your Crowd Shout-Out has been received.");
      return;
    }

    showLiveQueueScreen();

    subscribeToQueueChanges();
    subscribeToSessionSettingsChanges();

    return;
  }

  renderSessionUi();
  renderQueue();
  renderLiveQueue();

  subscribeToQueueChanges();
  subscribeToSessionSettingsChanges();
}

initialiseSongRush();

if (
  new URLSearchParams(window.location.search).get("view") ===
  "customer"
) {
  window.addEventListener("load", () => {
    window.setTimeout(showSongList, 700);
  });
}

if (
  new URLSearchParams(window.location.search).get("view") ===
  "performer"
) {
  window.addEventListener("load", () => {
    window.setTimeout(
      () => requestProtectedAccess("dashboard"),
      700
    );
  });
}
