import { isSupabaseConfigured, supabase } from "./supabase.js";
function getRequestTypeDetails(optionValue) {
  const requestTypes = {
    standard: {
      label: "Standard Request",
      price: "$5",
      amount: 5,
    },
    replay: {
      label: "Play It Again",
      price: "$20",
      amount: 20,
    },
    jump: {
      label: "Jump the Queue",
      price: "$15",
      amount: 15,
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

localStorage.setItem("songrushRequestToken", requestToken);
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
  },

  songs: [],
  playedSongs: [],
  selectedSong: null,
  currentView: "landing",

  queue: [      id: 1,
      title: "Wonderwall",
      artist: "Oasis",
      type: "Standard Request",
      price: "$5",
    },
    {
      id: 2,
      title: "Horses",
      artist: "Daryl Braithwaite",
      type: "Play It Again",
      price: "$20",
    },
    {
      id: 3,
      title: "Sweet Child O' Mine",
      artist: "Guns N' Roses",
      type: "Jump the Queue",
      price: "$15",
    },
  ],

  liveQueue: {
    nowPlaying: {
      title: "Better Man",
      artist: "Pearl Jam",
    },

    upNext: [
      { title: "Horses", artist: "Daryl Braithwaite" },
      { title: "Wonderwall", artist: "Oasis" },
      { title: "Tennessee Whiskey", artist: "Chris Stapleton" },
      { title: "Fast Car", artist: "Tracy Chapman" },
      { title: "Sweet Child O' Mine", artist: "Guns N' Roses" },
    ],

requests: [],  },
};
function getRequestsStatusLabel() {
  return appState.session.requestsOpen ? "Requests Open" : "Requests Closed";
}

function renderSessionSummaries() {
  const statusLabel = getRequestsStatusLabel();
  const tableLabel = appState.session.tableNumber
    ? ` • ${appState.session.tableNumber}`
    : "";

  document.querySelectorAll("[data-session-summary]").forEach((element) => {
    element.innerHTML = `
      <div class="session-summary-top">
        <span class="status-pill ${appState.session.status.toLowerCase()}">${appState.session.status}</span>
        <span class="session-code">${appState.session.id}</span>
      </div>
      <div class="session-summary-body">
        <div class="session-show-name">${appState.session.showName}</div>
        <div class="session-performer">${appState.session.performerName}</div>
        <div class="session-venue">${appState.session.venueName}</div>
        <div class="session-meta">${statusLabel}${tableLabel}</div>
      </div>
    `;
  });
}

function renderDashboardSession() {
  dashboardSessionName.textContent = appState.session.showName;
  dashboardSessionCode.textContent = appState.session.id;
  dashboardVenue.textContent = appState.session.venueName;
  dashboardStartTime.textContent = appState.session.startTime;
  dashboardTable.textContent = appState.session.tableNumber || "—";
  dashboardStatusBadge.textContent = appState.session.status;
  toggleRequestsBtn.textContent = getRequestsStatusLabel();
toggleRequestsBtn.classList.toggle("closed", !appState.session.requestsOpen);
toggleRequestsBtn.classList.toggle("open", appState.session.requestsOpen);

allowRepeatsBtn.textContent = appState.session.allowRepeats
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


function showBackendWarning(show) {
  if (!backendWarning) {
    return;
  }

  backendWarning.classList.toggle("hidden", !show);
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
      mapSupabaseRequestToQueueItem,
    );

    showBackendWarning(false);
    renderQueue();
    renderLiveQueue();
  } catch (error) {
    console.error(
      "Unable to load Supabase requests",
      error,
    );

    showBackendWarning(true);
    renderQueue();
  }
}


async function loadNowPlayingFromSupabase() {
  const titleEl = document.getElementById("now-playing-title");
  const artistEl = document.getElementById("now-playing-artist");
  const finishBtn = document.getElementById("finishCurrentSongBtn");

  if (!titleEl || !artistEl || !finishBtn) {
    return;
  }

  if (!isSupabaseConfigured || !supabase || !appState.session) {
    titleEl.textContent = "Nothing currently playing";
    artistEl.textContent = "";
    finishBtn.hidden = true;
    return;
  }

  const { data, error } = await supabase
    .from("song_requests")
    .select("id, song_title, artist, status, created_at")
    .eq("session_id", appState.session.id)
    .eq("status", "playing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Unable to load now playing", error);
    return;
  }

  if (!data) {
    titleEl.textContent = "Nothing currently playing";
    artistEl.textContent = "";
    finishBtn.hidden = true;
    return;
  }

  titleEl.textContent = data.song_title;
  artistEl.textContent = data.artist || "";
  finishBtn.hidden = false;
}
async function loadPlayedTonightFromSupabase() {
  const playedTonightList = document.getElementById("playedTonightList");

  if (!playedTonightList) {
    return;
  }

  if (!isSupabaseConfigured || !supabase) {
    playedTonightList.innerHTML =
      '<p class="empty-state">No songs played tonight.</p>';
    return;
  }

  const { data, error } = await supabase
    .from("song_requests")
    .select("id, song_title, artist, priority, amount, status, created_at")
    .eq("session_id", appState.session.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

if (error) {
  console.error("Unable to load played songs", error);
  playedTonightList.innerHTML =
    '<p class="empty-state">Unable to load played songs.</p>';

  appState.playedSongs = [];

  return;
}

appState.playedSongs = (data || []).map((song) => ({
  title: song.song_title,
  artist: song.artist || "",
}));

  playedTonightList.innerHTML = "";
  if (!data || data.length === 0) {
    playedTonightList.innerHTML =
      '<p class="empty-state">No songs played tonight.</p>';
    return;
  }

  data.forEach((song) => {
    const playedItem = document.createElement("div");
    playedItem.className = "queue-item";

    const title = document.createElement("div");
    title.className = "queue-item-title";
    title.textContent = `${song.song_title} – ${song.artist || "Unknown Artist"}`;

    const meta = document.createElement("div");
    meta.className = "queue-item-meta";
    meta.textContent = song.priority || "Completed";

    playedItem.appendChild(title);
    playedItem.appendChild(meta);
    playedTonightList.appendChild(playedItem);
  });
}
function subscribeToQueueChanges() {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  if (queueSubscription) {
    supabase.removeChannel(queueSubscription);
  }

  queueSubscription = supabase
    .channel(`requests-${appState.session.id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "song_requests",
        filter: `session_id=eq.${appState.session.id}`,
      },
      async () => {
        await loadRequestsFromSupabase();
        await loadNowPlayingFromSupabase();
        await loadPlayedTonightFromSupabase();

        if (appState.currentView === "liveQueue") {
          await loadCustomerLiveQueueFromSupabase();
        }
      }
    )
    .subscribe();
}
async function saveRequestToSupabase(song, optionValue) {
  if (!isSupabaseConfigured || !supabase) {
    appState.queue.unshift({
      id: Date.now(),
      title: song.title,
      artist: song.artist,
      type: getRequestTypeDetails(optionValue).label,
      price: getRequestTypeDetails(optionValue).price,
      status: "pending",
    });

    renderQueue();
    return;
  }

  const requestDetails = getRequestTypeDetails(optionValue);

  const requestPayload = {
    session_id: appState.session.id,
    song_title: song.title,
    artist: song.artist,
    priority: requestDetails.label,
    amount: Number(String(requestDetails.price).replace("$", "")),
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
    console.error("Unable to save request to Supabase", error);

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
function renderSessionUi() {
  renderSessionSummaries();
  renderDashboardSession();
}

function showLandingPage() {
  appState.currentView = "landing";
  appState.selectedSong = null;
  landingPage.hidden = false;
  songSearchPage.hidden = true;
  dashboardPage.classList.add("hidden");
  liveQueuePage.classList.add("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");
  renderSessionUi();
}

function showSongList() {
  appState.currentView = "songSearch";
  landingPage.hidden = true;
  songSearchPage.hidden = false;
  dashboardPage.classList.add("hidden");
  liveQueuePage.classList.add("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");
  renderSessionUi();
  songSearchInput.focus();
}

function showDashboard() {
  appState.currentView = "dashboard";
  landingPage.hidden = true;
  songSearchPage.hidden = true;
  dashboardPage.classList.remove("hidden");
  liveQueuePage.classList.add("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");

  renderSessionUi();
  renderQueue();

  loadRequestsFromSupabase();
  loadNowPlayingFromSupabase();
  loadPlayedTonightFromSupabase();
  subscribeToQueueChanges();
}
function closeModal() {
  requestModal.classList.add("hidden");
  appState.selectedSong = null;
}

function getCurrentRequestTokens() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get("request_token");

  let savedTokens = [];

  try {
    savedTokens = JSON.parse(
      localStorage.getItem("songrushRequestTokens") || "[]"
    );
  } catch (error) {
    console.error("Unable to read saved request tokens", error);
    savedTokens = [];
  }

  const legacyToken = localStorage.getItem("songrushRequestToken");

  if (legacyToken) {
    savedTokens.push(legacyToken);
  }

  if (tokenFromUrl) {
    savedTokens.push(tokenFromUrl);
    localStorage.setItem("songrushRequestToken", tokenFromUrl);
  }

  const uniqueTokens = [...new Set(savedTokens.filter(Boolean))];

  localStorage.setItem(
    "songrushRequestTokens",
    JSON.stringify(uniqueTokens)
  );

  return uniqueTokens;
}
function getPendingRequestDetails() {
  const storedRequest = localStorage.getItem(
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
const requestTokens = getCurrentRequestTokens();
const pendingRequest = getPendingRequestDetails();

if (
    requestTokens.length === 0 ||
    !isSupabaseConfigured ||
    !supabase
) {
    return;
}
  const { data: customerRequest, error: customerError } =
    await supabase
      .from("song_requests")
      .select(
        "id, session_id, song_title, artist, priority, amount, status,queue_order, request_token, created_at"
      )
.in("request_token", requestTokens)
.order("created_at", { ascending: false });
  if (customerError) {
    console.error(
      "Unable to load customer request",
      customerError
    );

    return;
  }

if (!customerRequest || customerRequest.length === 0) {
    appState.liveQueue.requests = [];

    renderLiveQueue();
    return;
}

  const customerRequests = customerRequest;
  const latestRequest = customerRequests[0];
if (latestRequest.session_id !== appState.session.id) {
    appState.session.id = latestRequest.session_id;    renderSessionUi();
    subscribeToQueueChanges();
  }

const { data: pendingQueue, error: queueError } =
  await supabase
    .from("song_requests")
    .select(
      "id, song_title, artist, priority, amount, status, queue_order, created_at"
    )
    .eq("session_id", latestRequest.session_id)
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

  const { data: nowPlaying, error: nowPlayingError } =
    await supabase
      .from("song_requests")
      .select("id, song_title, artist, status, created_at")
      .eq("session_id", latestRequest.session_id)   
      .eq("status", "playing")
      .order("created_at", { ascending: false })
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

const mappedCustomerRequests = customerRequests.map((request) => {
  const queueIndex = queue.findIndex(
    (queueItem) => queueItem.id === request.id
  );

  return {
    id: request.id,
    title: request.song_title,
    artist: request.artist || "",
    status: request.status,
    position: queueIndex >= 0 ? queueIndex + 1 : null,
    estimatedWaitMinutes:
      queueIndex >= 0 ? (queueIndex + 1) * 4 : null,
  };
});

appState.liveQueue = {
  nowPlaying: nowPlaying
    ? {
        title: nowPlaying.song_title,
        artist: nowPlaying.artist || "",
      }
    : {
        title: "Nothing currently playing",
        artist: "",
      },

  upNext: queue.slice(0, 5).map((request) => ({
    title: request.song_title,
    artist: request.artist || "",
  })),

  requests: mappedCustomerRequests,
};

localStorage.removeItem("songrushPendingRequest");
renderLiveQueue();
}
function showLiveQueueScreen(song = null) {
  appState.currentView = "liveQueue";

  const pendingRequest = getPendingRequestDetails();

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
  landingPage.hidden = true;
  songSearchPage.hidden = true;
  dashboardPage.classList.add("hidden");
  liveQueuePage.classList.remove("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");

  renderSessionUi();
  renderLiveQueue();
  loadCustomerLiveQueueFromSupabase();
}

function showSuccessScreen(song) {
  showLiveQueueScreen(song);
}
function renderSongs(filter = "") {
  const query = filter.trim().toLowerCase();

  const visibleSongs = appState.songs.filter((song) => {
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
    const row = document.createElement("div");
    row.className = "song-item";

    const details = document.createElement("div");
    details.className = "song-details";

    const title = document.createElement("div");
    title.className = "song-title";
    title.textContent = song.title;

    const artist = document.createElement("div");
    artist.className = "song-artist";
    artist.textContent = song.artist;

    const genre = document.createElement("div");
    genre.className = "song-genre";
    genre.textContent = song.genre;

    details.appendChild(title);
    details.appendChild(artist);
    details.appendChild(genre);

    const hasBeenPlayed = appState.playedSongs.some(
      (playedSong) =>
        playedSong.title === song.title &&
        playedSong.artist === song.artist
    );

    if (hasBeenPlayed) {
      const playedLabel = document.createElement("div");
      playedLabel.className = "played-tonight-label";
      playedLabel.textContent = "✓ Played Tonight";

      details.appendChild(playedLabel);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "request-btn";

    if (!hasBeenPlayed) {
      button.textContent = "🎵 Request Song — $5";

      button.addEventListener("click", () => {
        showRequestModal(song);
      });
    } else if (appState.session.allowRepeats) {
      button.textContent = "🔁 Play It Again — $20";

      button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Opening Payment...";

        try {
          await startStripeCheckout(song, "replay");
        } catch (error) {
          console.error("Replay checkout failed", error);

          button.disabled = false;
          button.textContent = "🔁 Play It Again — $20";

          alert("Payment could not start. Please try again.");
        }
      });
    } else {
      button.textContent = "🚫 Repeats Disabled Tonight";
      button.disabled = true;
    }

    row.appendChild(details);
    row.appendChild(button);
    songList.appendChild(row);
  });
}
joinButton.addEventListener("click", showSongList);
dashboardButton.addEventListener("click", showDashboard);
backToLandingBtn.addEventListener("click", showLandingPage);
homeFromSearchBtn.addEventListener("click", showLandingPage);

const browseMoreSongsBtn = document.getElementById("browseMoreBtn");
const returnHomeBtn = document.getElementById("returnHomeBtn");
const allowRepeatsBtn = document.getElementById("allowRepeatsBtn");

if (browseMoreSongsBtn) {
  browseMoreSongsBtn.addEventListener("click", showSongList);
}

if (returnHomeBtn) {
  returnHomeBtn.addEventListener("click", showLandingPage);
}
songSearchInput.addEventListener("input", (event) => {
  renderSongs(event.target.value);
});

cancelRequestBtn.addEventListener("click", closeModal);

requestModal.addEventListener("click", (event) => {
  if (event.target === requestModal) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeModal();
  }
});

document.querySelectorAll(".modal-option").forEach((optionButton) => {
  optionButton.addEventListener("click", async () => {
    if (!appState.selectedSong) {
      return;
    }

    const optionValue = optionButton.dataset.option || "standard";

    try {
      await startStripeCheckout(appState.selectedSong, optionValue);
    } catch (error) {
      console.error("Stripe checkout failed", error);
      alert("Payment could not start. Please try again.");
    }
  });
});
async function moveQueueRequest(item, index, direction, clickedButton) {
  const targetIndex = index + direction;

  if (targetIndex < 0 || targetIndex >= appState.queue.length) {
    return;
  }

  const targetItem = appState.queue[targetIndex];

  if (!isSupabaseConfigured || !supabase) {
    [appState.queue[index], appState.queue[targetIndex]] = [
      appState.queue[targetIndex],
      appState.queue[index],
    ];

    renderQueue();
    return;
  }

  const itemQueueOrder = item.queueOrder;
  const targetQueueOrder = targetItem.queueOrder;

  if (
    itemQueueOrder === undefined ||
    itemQueueOrder === null ||
    targetQueueOrder === undefined ||
    targetQueueOrder === null
  ) {
    console.error("Unable to move queue request: queue_order is missing", {
      item,
      targetItem,
    });

    return;
  }

  clickedButton.disabled = true;
  clickedButton.textContent = "Moving...";

  const { error: itemUpdateError } = await supabase
    .from("song_requests")
    .update({ queue_order: targetQueueOrder })
    .eq("id", item.id)
    .eq("session_id", appState.session.id);

  if (itemUpdateError) {
    console.error("Unable to update moved request", itemUpdateError);
    await loadRequestsFromSupabase();
    return;
  }

  const { error: targetUpdateError } = await supabase
    .from("song_requests")
    .update({ queue_order: itemQueueOrder })
    .eq("id", targetItem.id)
    .eq("session_id", appState.session.id);

  if (targetUpdateError) {
    console.error(
      "Unable to update neighbouring request",
      targetUpdateError,
    );

    const { error: rollbackError } = await supabase
      .from("song_requests")
      .update({ queue_order: itemQueueOrder })
      .eq("id", item.id)
      .eq("session_id", appState.session.id);

    if (rollbackError) {
      console.error("Unable to roll back queue movement", rollbackError);
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

  appState.queue.forEach((item, index) => {
    const queueItem = document.createElement("div");
    queueItem.className = "queue-item";

    const title = document.createElement("div");
    title.className = "queue-item-title";
    title.textContent = `${item.title} – ${item.artist}`;

    const meta = document.createElement("div");
    meta.className = "queue-item-meta";
    meta.textContent = `${item.type} • ${item.price}`;

    const actions = document.createElement("div");

    const markPlayedBtn = document.createElement("button");
    markPlayedBtn.type = "button";
    markPlayedBtn.textContent = "▶ Play";

    markPlayedBtn.addEventListener("click", async () => {
      if (isSupabaseConfigured && supabase) {
        const { error: completeError } = await supabase
          .from("song_requests")
          .update({ status: "completed" })
          .eq("session_id", appState.session.id)
          .eq("status", "playing");

        if (completeError) {
          console.error(
            "Unable to complete current playing request",
            completeError,
          );
          return;
        }

        const { error: playError } = await supabase
          .from("song_requests")
          .update({ status: "playing" })
          .eq("id", item.id);

        if (playError) {
          console.error("Unable to mark request as playing", playError);
          return;
        }

        await loadNowPlayingFromSupabase();
        await loadRequestsFromSupabase();
        await loadPlayedTonightFromSupabase();
        return;
      }

      appState.queue = appState.queue.filter(
        (queueItemEntry) => queueItemEntry.id !== item.id,
      );

      renderQueue();
    });

    const moveUpBtn = document.createElement("button");
    moveUpBtn.type = "button";
    moveUpBtn.textContent = "Move Up";
    moveUpBtn.disabled = index === 0;

    moveUpBtn.addEventListener("click", async () => {
      await moveQueueRequest(item, index, -1, moveUpBtn);
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.type = "button";
    moveDownBtn.textContent = "Move Down";
    moveDownBtn.disabled = index === appState.queue.length - 1;

    moveDownBtn.addEventListener("click", async () => {
      await moveQueueRequest(item, index, 1, moveDownBtn);
    });

    actions.appendChild(markPlayedBtn);
    actions.appendChild(moveUpBtn);
    actions.appendChild(moveDownBtn);

    queueItem.appendChild(title);
    queueItem.appendChild(meta);
    queueItem.appendChild(actions);
    queueList.appendChild(queueItem);
  });
}

function renderLiveQueue() {
  const { liveQueue } = appState;

  nowPlayingTitle.textContent =
    liveQueue.nowPlaying?.title || "Nothing currently playing";

  nowPlayingArtist.textContent =
    liveQueue.nowPlaying?.artist || "";

  upNextList.innerHTML = "";

  if (!liveQueue.upNext || liveQueue.upNext.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "up-next-item";
    emptyItem.textContent =
      "No songs are waiting in the queue.";

    upNextList.appendChild(emptyItem);
  } else {
    liveQueue.upNext.forEach((item, index) => {
      const listItem = document.createElement("li");
      listItem.className = "up-next-item";

      const number = document.createElement("span");
      number.className = "up-next-number";
      number.textContent = index + 1;

      const details = document.createElement("div");
      details.className = "up-next-details";

      const title = document.createElement("div");
      title.className = "up-next-title";
      title.textContent = item.title;

      const artist = document.createElement("div");
      artist.className = "up-next-artist";
      artist.textContent = item.artist || "";

      details.appendChild(title);
      details.appendChild(artist);

      listItem.appendChild(number);
      listItem.appendChild(details);
      upNextList.appendChild(listItem);
    });
  }

  const myRequestsList =
    document.getElementById("myRequestsList");

  if (!myRequestsList) {
    return;
  }

  myRequestsList.innerHTML = "";

  const customerRequests = liveQueue.requests || [];

  if (customerRequests.length === 0) {
    myRequestsList.innerHTML =
      '<p class="empty-state">You have no requests yet.</p>';
    return;
  }

  customerRequests.forEach((request) => {
    const requestCard = document.createElement("div");
    requestCard.className = "request-highlight";

    const badge = document.createElement("div");
    badge.className = "music-badge";
    badge.textContent = "🎵";

    const details = document.createElement("div");
    details.className = "request-details";

    const title = document.createElement("h3");
    title.textContent = request.title;

    const artist = document.createElement("p");
    artist.className = "song-artist";
    artist.textContent = request.artist || "";

    const positionRow = document.createElement("p");
    positionRow.className = "request-stat";

    const positionLabel = document.createElement("span");
    positionLabel.className = "stat-label";
    positionLabel.textContent = "Queue Position";

    const positionValue = document.createElement("span");
    positionValue.className = "stat-value";

    const waitRow = document.createElement("p");
    waitRow.className = "request-stat";

    const waitLabel = document.createElement("span");
    waitLabel.className = "stat-label";
    waitLabel.textContent = "Estimated Wait";

    const waitValue = document.createElement("span");
    waitValue.className = "stat-value";

    if (request.status === "playing") {
      positionValue.textContent = "Now Playing";
      waitValue.textContent = "0 Minutes";
    } else if (request.status === "completed") {
      positionValue.textContent = "Played";
      waitValue.textContent = "Completed";
    } else if (
      request.status === "processing" ||
      request.position === null
    ) {
      positionValue.textContent = "Processing";
      waitValue.textContent = "Please wait...";
    } else {
      positionValue.textContent = `#${request.position}`;
      waitValue.textContent =
        `${request.estimatedWaitMinutes} Minutes`;
    }

    positionRow.appendChild(positionLabel);
    positionRow.appendChild(positionValue);

    waitRow.appendChild(waitLabel);
    waitRow.appendChild(waitValue);

    details.appendChild(title);

    if (request.artist) {
      details.appendChild(artist);
    }

    details.appendChild(positionRow);
    details.appendChild(waitRow);

    requestCard.appendChild(badge);
    requestCard.appendChild(details);

    myRequestsList.appendChild(requestCard);
  });
}

function startNewSession() {
  const newCode = `SR-${String(
    Math.floor(Math.random() * 9000) + 1000
  )}`;

  appState.session = {
    ...appState.session,
    id: newCode,
    requestsOpen: true,
    allowRepeats: true,
    status: "LIVE",
    startTime: new Date().toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }),
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

  loadRequestsFromSupabase();
  loadNowPlayingFromSupabase();
  loadPlayedTonightFromSupabase();
  subscribeToQueueChanges();
}
toggleRequestsBtn.addEventListener("click", () => {
  appState.session.requestsOpen = !appState.session.requestsOpen;
  renderSessionUi();
});

allowRepeatsBtn.addEventListener("click", () => {
  appState.session.allowRepeats = !appState.session.allowRepeats;

  renderSessionUi();

  if (appState.currentView === "songSearch") {
    renderSongs(songSearchInput.value);
  }
});

startNewSessionBtn.addEventListener("click", startNewSession);
const finishCurrentSongBtn = document.getElementById("finishCurrentSongBtn");

finishCurrentSongBtn.addEventListener("click", async () => {
  if (!isSupabaseConfigured || !supabase) {
    return;
  }

  finishCurrentSongBtn.disabled = true;
  finishCurrentSongBtn.textContent = "Finishing...";

  const { error } = await supabase
    .from("song_requests")
    .update({ status: "completed" })
    .eq("session_id", appState.session.id)
    .eq("status", "playing");

  if (error) {
    console.error("Unable to finish current song", error);
    finishCurrentSongBtn.disabled = false;
    finishCurrentSongBtn.textContent = "Finish Current Song";
    return;
  }

  await loadNowPlayingFromSupabase();
  await loadRequestsFromSupabase();
  await loadPlayedTonightFromSupabase();

  finishCurrentSongBtn.disabled = false;
  finishCurrentSongBtn.textContent = "Finish Current Song";
});
async function loadSongs() {
  try {
    const response = await fetch("songs.json");

    if (!response.ok) {
      throw new Error("Unable to load songs");
    }

    appState.songs = await response.json();
    renderSongs();
  } catch (error) {
    songList.innerHTML = '<p class="empty-state">No songs available.</p>';
  }
}

async function initialiseApp() {
  renderSessionUi();
  renderQueue();
  renderLiveQueue();

  await loadNowPlayingFromSupabase();
  await loadPlayedTonightFromSupabase();
  await loadSongs();
  await loadRequestsFromSupabase();

  subscribeToQueueChanges();

  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get("payment");
const savedRequestTokens = getCurrentRequestTokens();

if (
  paymentStatus === "success" ||
  savedRequestTokens.length > 0
) {
      showLiveQueueScreen();

    window.history.replaceState(
      {},
      document.title,
      window.location.pathname
    );
  }
}
initialiseApp();