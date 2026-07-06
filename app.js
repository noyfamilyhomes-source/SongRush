import { isSupabaseConfigured, supabase } from "./supabase.js";

const landingPage = document.getElementById("landingPage");
const songSearchPage = document.getElementById("songSearchPage");
const dashboardPage = document.getElementById("dashboardPage");
const liveQueuePage = document.getElementById("liveQueuePage");
const joinButton = document.getElementById("joinButton");
const dashboardButton = document.getElementById("dashboardButton");
const backToLandingBtn = document.getElementById("backToLandingBtn");
const songSearchInput = document.getElementById("songSearchInput");
const songList = document.getElementById("songList");
const requestModal = document.getElementById("requestModal");
const modalTitle = document.getElementById("modalTitle");
const modalArtist = document.getElementById("modalArtist");
const cancelRequestBtn = document.getElementById("cancelRequestBtn");
const successScreen = document.getElementById("successScreen");
const successTitle = document.getElementById("successTitle");
const backToListBtn = document.getElementById("backToListBtn");
const toggleRequestsBtn = document.getElementById("toggleRequestsBtn");
const queueList = document.getElementById("queueList");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingArtist = document.getElementById("nowPlayingArtist");
const upNextList = document.getElementById("upNextList");
const requestedSongTitle = document.getElementById("requestedSongTitle");
const queuePosition = document.getElementById("queuePosition");
const estimatedWait = document.getElementById("estimatedWait");
const browseMoreBtn = document.getElementById("browseMoreBtn");
const returnHomeBtn = document.getElementById("returnHomeBtn");
const homeFromSearchBtn = document.getElementById("homeFromSearchBtn");
const startNewSessionBtn = document.getElementById("startNewSessionBtn");
const dashboardSessionName = document.getElementById("dashboardSessionName");
const dashboardSessionCode = document.getElementById("dashboardSessionCode");
const dashboardVenue = document.getElementById("dashboardVenue");
const dashboardStartTime = document.getElementById("dashboardStartTime");
const dashboardTable = document.getElementById("dashboardTable");
const dashboardStatusBadge = document.getElementById("dashboardStatusBadge");
const backendWarning = document.getElementById("backendWarning");

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
    startTime: "7:30 PM"
  },
  songs: [],
  selectedSong: null,
  currentView: "landing",
  queue: [
    { id: 1, title: "Wonderwall", artist: "Oasis", type: "Standard", price: "$2" },
    { id: 2, title: "Horses", artist: "Daryl Braithwaite", type: "Priority", price: "$10" },
    { id: 3, title: "Sweet Child O' Mine", artist: "Guns N' Roses", type: "Jump Queue", price: "$15" }
  ],
  liveQueue: {
    nowPlaying: { title: "Better Man", artist: "Pearl Jam" },
    upNext: [
      { title: "Horses", artist: "Daryl Braithwaite" },
      { title: "Wonderwall", artist: "Oasis" },
      { title: "Tennessee Whiskey", artist: "Chris Stapleton" },
      { title: "Fast Car", artist: "Tracy Chapman" },
      { title: "Sweet Child O' Mine", artist: "Guns N' Roses" }
    ],
    request: { title: "Wonderwall", position: 7, estimatedWaitMinutes: 23 }
  }
};

function getRequestsStatusLabel() {
  return appState.session.requestsOpen ? "Requests Open" : "Requests Closed";
}

function renderSessionSummaries() {
  const statusLabel = getRequestsStatusLabel();
  const tableLabel = appState.session.tableNumber ? ` • ${appState.session.tableNumber}` : "";

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
    createdAt: request.created_at
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
      .select("id, session_id, song_id, song_title, artist, priority, amount, status, created_at")
      .eq("session_id", appState.session.id)
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    appState.queue = (data || []).map(mapSupabaseRequestToQueueItem);
    showBackendWarning(false);
    renderQueue();
    renderLiveQueue();
  } catch (error) {
    console.error("Unable to load Supabase requests", error);
    showBackendWarning(true);
    renderQueue();
  }
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
        filter: `session_id=eq.${appState.session.id}`
      },
      () => {
        loadRequestsFromSupabase();
      }
    )
    .subscribe();
}

function getRequestTypeDetails(optionValue) {
  switch (optionValue) {
    case "priority":
      return { label: "Priority", price: "$10" };
    case "jump":
      return { label: "Jump Queue", price: "$15" };
    default:
      return { label: "Standard", price: "$2" };
  }
}

async function saveRequestToSupabase(song, optionValue) {
  if (!isSupabaseConfigured || !supabase) {
    appState.queue.unshift({
      id: Date.now(),
      title: song.title,
      artist: song.artist,
      type: getRequestTypeDetails(optionValue).label,
      price: getRequestTypeDetails(optionValue).price,
      status: "pending"
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
    created_at: new Date().toISOString()
  };

  try {
    const { error } = await supabase.from("song_requests").insert([requestPayload]);
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
      status: "pending"
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
  subscribeToQueueChanges();
}

function showRequestModal(song) {
  appState.selectedSong = song;
  modalTitle.textContent = song.title;
  modalArtist.textContent = song.artist;
  requestModal.classList.remove("hidden");
}

function closeModal() {
  requestModal.classList.add("hidden");
  appState.selectedSong = null;
}

function showLiveQueueScreen(song) {
  if (!song) {
    return;
  }

  appState.currentView = "liveQueue";
  appState.liveQueue.request = {
    title: song.title,
    position: 7,
    estimatedWaitMinutes: 23
  };

  const alreadyQueued = appState.queue.some((entry) => entry.title === song.title && entry.artist === song.artist);
  if (!alreadyQueued) {
    appState.queue.unshift({ id: Date.now(), title: song.title, artist: song.artist, type: "Standard", price: "$2" });
  }

  landingPage.hidden = true;
  songSearchPage.hidden = true;
  dashboardPage.classList.add("hidden");
  liveQueuePage.classList.remove("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");
  renderSessionUi();
  renderLiveQueue();
}

function showSuccessScreen(song) {
  showLiveQueueScreen(song);
}

function renderSongs(filter = "") {
  const query = filter.trim().toLowerCase();
  const visibleSongs = appState.songs.filter((song) => {
    const haystack = `${song.title} ${song.artist} ${song.genre}`.toLowerCase();
    return haystack.includes(query);
  });

  songList.innerHTML = "";

  if (visibleSongs.length === 0) {
    songList.innerHTML = '<p class="empty-state">No songs match your search.</p>';
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

    const button = document.createElement("button");
    button.type = "button";
    button.className = "request-btn";
    button.textContent = "Request $2";
    button.addEventListener("click", () => {
      showRequestModal(song);
    });

    row.appendChild(details);
    row.appendChild(button);
    songList.appendChild(row);
  });
}

joinButton.addEventListener("click", showSongList);
dashboardButton.addEventListener("click", showDashboard);
backToLandingBtn.addEventListener("click", showLandingPage);
homeFromSearchBtn.addEventListener("click", showLandingPage);

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
    await saveRequestToSupabase(appState.selectedSong, optionValue);
    closeModal();
    showSuccessScreen(appState.selectedSong);
  });
});

backToListBtn.addEventListener("click", () => {
  showSongList();
});

browseMoreBtn.addEventListener("click", showSongList);
returnHomeBtn.addEventListener("click", showLandingPage);

function renderQueue() {
  queueList.innerHTML = "";

  if (appState.queue.length === 0) {
    queueList.innerHTML = '<p class="empty-state">No requests in the queue.</p>';
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
    actions.className = "queue-actions";

    const markPlayedBtn = document.createElement("button");
    markPlayedBtn.type = "button";
    markPlayedBtn.textContent = "Mark Played";
    markPlayedBtn.addEventListener("click", () => {
      appState.queue = appState.queue.filter((queueItemEntry) => queueItemEntry.id !== item.id);
      renderQueue();
    });

    const moveUpBtn = document.createElement("button");
    moveUpBtn.type = "button";
    moveUpBtn.textContent = "Move Up";
    moveUpBtn.disabled = index === 0;
    moveUpBtn.addEventListener("click", () => {
      if (index > 0) {
        [appState.queue[index - 1], appState.queue[index]] = [appState.queue[index], appState.queue[index - 1]];
        renderQueue();
      }
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.type = "button";
    moveDownBtn.textContent = "Move Down";
    moveDownBtn.disabled = index === appState.queue.length - 1;
    moveDownBtn.addEventListener("click", () => {
      if (index < appState.queue.length - 1) {
        [appState.queue[index], appState.queue[index + 1]] = [appState.queue[index + 1], appState.queue[index]];
        renderQueue();
      }
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

  nowPlayingTitle.textContent = liveQueue.nowPlaying.title;
  nowPlayingArtist.textContent = liveQueue.nowPlaying.artist;

  upNextList.innerHTML = "";
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
    artist.textContent = item.artist;

    details.appendChild(title);
    details.appendChild(artist);

    listItem.appendChild(number);
    listItem.appendChild(details);
    upNextList.appendChild(listItem);
  });

  requestedSongTitle.textContent = liveQueue.request.title;
  queuePosition.textContent = `#${liveQueue.request.position}`;
  estimatedWait.textContent = `${liveQueue.request.estimatedWaitMinutes} Minutes`;
}

function startNewSession() {
  const newCode = `SR-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  appState.session = {
    ...appState.session,
    id: newCode,
    requestsOpen: true,
    status: "LIVE",
    startTime: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  };

  appState.queue = [];
  appState.liveQueue = {
    nowPlaying: { title: "Better Man", artist: "Pearl Jam" },
    upNext: [
      { title: "Horses", artist: "Daryl Braithwaite" },
      { title: "Wonderwall", artist: "Oasis" },
      { title: "Tennessee Whiskey", artist: "Chris Stapleton" },
      { title: "Fast Car", artist: "Tracy Chapman" },
      { title: "Sweet Child O' Mine", artist: "Guns N' Roses" }
    ],
    request: { title: "Waiting for your first request", position: 1, estimatedWaitMinutes: 0 }
  };

  renderQueue();
  renderLiveQueue();
  renderSessionUi();
  loadRequestsFromSupabase();
  subscribeToQueueChanges();
}

toggleRequestsBtn.addEventListener("click", () => {
  appState.session.requestsOpen = !appState.session.requestsOpen;
  renderSessionUi();
});

startNewSessionBtn.addEventListener("click", startNewSession);

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

renderSessionUi();
renderQueue();
renderLiveQueue();
loadSongs();
loadRequestsFromSupabase();
subscribeToQueueChanges();

