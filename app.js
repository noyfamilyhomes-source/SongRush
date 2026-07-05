const landingPage = document.getElementById("landingPage");
const songSearchPage = document.getElementById("songSearchPage");
const dashboardPage = document.getElementById("dashboardPage");
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

let songs = [];
let selectedSong = null;
let requestsOpen = true;
let queueItems = [
  { id: 1, title: "Wonderwall", artist: "Oasis", type: "Standard", price: "$2" },
  { id: 2, title: "Horses", artist: "Daryl Braithwaite", type: "Priority", price: "$10" },
  { id: 3, title: "Sweet Child O' Mine", artist: "Guns N' Roses", type: "Jump Queue", price: "$15" }
];

function showLandingPage() {
  landingPage.hidden = false;
  songSearchPage.hidden = true;
  dashboardPage.classList.add("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");
}

function showSongList() {
  landingPage.hidden = true;
  songSearchPage.hidden = false;
  dashboardPage.classList.add("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");
  songSearchInput.focus();
}

function showDashboard() {
  landingPage.hidden = true;
  songSearchPage.hidden = true;
  dashboardPage.classList.remove("hidden");
  successScreen.classList.add("hidden");
  requestModal.classList.add("hidden");
  renderQueue();
}

function showRequestModal(song) {
  selectedSong = song;
  modalTitle.textContent = song.title;
  modalArtist.textContent = song.artist;
  requestModal.classList.remove("hidden");
}

function closeModal() {
  requestModal.classList.add("hidden");
  selectedSong = null;
}

function showSuccessScreen(song) {
  if (!song) {
    return;
  }

  successTitle.textContent = song.title;
  requestModal.classList.add("hidden");
  songSearchPage.hidden = true;
  successScreen.classList.remove("hidden");
}

function renderSongs(filter = "") {
  const query = filter.trim().toLowerCase();
  const visibleSongs = songs.filter((song) => {
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
  optionButton.addEventListener("click", () => {
    if (selectedSong) {
      showSuccessScreen(selectedSong);
    }
  });
});

backToListBtn.addEventListener("click", () => {
  showSongList();
});

function renderQueue() {
  queueList.innerHTML = "";

  if (queueItems.length === 0) {
    queueList.innerHTML = '<p class="empty-state">No requests in the queue.</p>';
    return;
  }

  queueItems.forEach((item, index) => {
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
      queueItems = queueItems.filter((queueItemEntry) => queueItemEntry.id !== item.id);
      renderQueue();
    });

    const moveUpBtn = document.createElement("button");
    moveUpBtn.type = "button";
    moveUpBtn.textContent = "Move Up";
    moveUpBtn.disabled = index === 0;
    moveUpBtn.addEventListener("click", () => {
      if (index > 0) {
        [queueItems[index - 1], queueItems[index]] = [queueItems[index], queueItems[index - 1]];
        renderQueue();
      }
    });

    const moveDownBtn = document.createElement("button");
    moveDownBtn.type = "button";
    moveDownBtn.textContent = "Move Down";
    moveDownBtn.disabled = index === queueItems.length - 1;
    moveDownBtn.addEventListener("click", () => {
      if (index < queueItems.length - 1) {
        [queueItems[index], queueItems[index + 1]] = [queueItems[index + 1], queueItems[index]];
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

toggleRequestsBtn.addEventListener("click", () => {
  requestsOpen = !requestsOpen;
  toggleRequestsBtn.textContent = requestsOpen ? "Requests Open" : "Requests Closed";
  toggleRequestsBtn.classList.toggle("closed", !requestsOpen);
});

async function loadSongs() {
  try {
    const response = await fetch("songs.json");
    if (!response.ok) {
      throw new Error("Unable to load songs");
    }

    songs = await response.json();
    renderSongs();
  } catch (error) {
    songList.innerHTML = '<p class="empty-state">No songs available.</p>';
  }
}

loadSongs();

