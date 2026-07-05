const songs = [
  "Sweet Child O' Mine",
  "Better Man",
  "Wonderwall",
  "Horses",
  "Shimmer"
];

const landingPage = document.getElementById("landingPage");
const songSearchPage = document.getElementById("songSearchPage");
const joinButton = document.getElementById("joinButton");
const songSearchInput = document.getElementById("songSearchInput");
const songList = document.getElementById("songList");

function renderSongs(filter = "") {
  const query = filter.trim().toLowerCase();
  const visibleSongs = songs.filter((song) => song.toLowerCase().includes(query));

  songList.innerHTML = "";

  if (visibleSongs.length === 0) {
    songList.innerHTML = '<p class="empty-state">No songs match your search.</p>';
    return;
  }

  visibleSongs.forEach((song) => {
    const row = document.createElement("div");
    row.className = "song-item";

    const title = document.createElement("span");
    title.textContent = song;

    const button = document.createElement("button");
    button.className = "request-btn";
    button.textContent = "Request $2";
    button.addEventListener("click", () => {
      button.textContent = "Requested";
      button.classList.add("requested");
      button.disabled = true;
    });

    row.appendChild(title);
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

renderSongs();

