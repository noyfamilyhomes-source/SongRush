const landingPage = document.getElementById("landingPage");
const songSearchPage = document.getElementById("songSearchPage");
const joinButton = document.getElementById("joinButton");
const songSearchInput = document.getElementById("songSearchInput");
const songList = document.getElementById("songList");
const requestModal = document.getElementById("requestModal");
const modalTitle = document.getElementById("modalTitle");
const modalArtist = document.getElementById("modalArtist");
const cancelRequestBtn = document.getElementById("cancelRequestBtn");
const successScreen = document.getElementById("successScreen");
const successTitle = document.getElementById("successTitle");
const backToListBtn = document.getElementById("backToListBtn");

let songs = [];
let selectedSong = null;

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
    button.className = "request-btn";
    button.textContent = "Request $2";
    button.addEventListener("click", () => {
      selectedSong = song;
      modalTitle.textContent = song.title;
      modalArtist.textContent = song.artist;
      requestModal.classList.remove("hidden");
    });

    row.appendChild(details);
    row.appendChild(button);
    songList.appendChild(row);
  });
}

joinButton.addEventListener("click", () => {
  landingPage.hidden = true;
  songSearchPage.hidden = false;
  songSearchInput.focus();
});

songSearchInput.addEventListener("input", (event) => {
  renderSongs(event.target.value);
});

function closeModal() {
  requestModal.classList.add("hidden");
}

function showSuccessScreen(song) {
  successTitle.textContent = song.title;
  requestModal.classList.add("hidden");
  songSearchPage.hidden = true;
  successScreen.classList.remove("hidden");
}

cancelRequestBtn.addEventListener("click", closeModal);
requestModal.addEventListener("click", (event) => {
  if (event.target === requestModal) {
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
  successScreen.classList.add("hidden");
  songSearchPage.hidden = false;
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

