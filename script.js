/* ============================================================
   STATIONS: Hier deine Stream-URLs eintragen / austauschen.
   - TV und Radio laufen beide im selben <video>-Player.
   - HLS (.m3u8) wird über hls.js gespielt, Safari nutzt nativ.
   - Radio kann auch ein direkter MP3-Stream sein (kein .m3u8).
   ============================================================ */
const stations = [
  // ---- Live-TV (Platzhalter: frei testbare HLS-Demostreams) ----
  {
    id: "tv-1",
    name: "Demo TV 1",
    type: "tv", // "tv" oder "radio"
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    description: "Platzhalter – ersetze die URL durch deinen TV-Stream.",
  },
  {
    id: "tv-2",
    name: "Demo TV 2 (Tears of Steel)",
    type: "tv",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
    description: "Platzhalter – ersetze die URL durch deinen TV-Stream.",
  },

  // ---- Radio (Platzhalter) ----
  {
    id: "radio-1",
    name: "Demo Radio 1",
    type: "radio",
    url: "https://ice1.somafm.com/groovesalad-128-mp3",
    description: "Platzhalter – Direktstream (MP3), ersetze durch deinen Sender.",
  },
  {
    id: "radio-2",
    name: "Demo Radio 2",
    type: "radio",
    url: "https://ice1.somafm.com/deepspaceone-128-mp3",
    description: "Platzhalter – Direktstream (MP3), ersetze durch deinen Sender.",
  },
  {
    id: "radio-3",
    name: "Demo Radio HLS",
    type: "radio",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    description: "Beispiel für Radio als HLS (.m3u8) – nur Ton im Player.",
  },
];

/* ============ Player-Logik (ab hier nichts ändern nötig) ============ */

const video = document.getElementById("player");
const fallback = document.getElementById("fallback");
const fallbackTitle = document.getElementById("fallbackTitle");
const fallbackSub = document.getElementById("fallbackSub");
const liveBadge = document.getElementById("liveBadge");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const nowPlaying = document.getElementById("nowPlaying");
const nowPlayingDesc = document.getElementById("nowPlayingDesc");
const btnToggle = document.getElementById("btnToggle");
const btnMute = document.getElementById("btnMute");
const tvGrid = document.getElementById("tvGrid");
const radioGrid = document.getElementById("radioGrid");

let hls = null;
let current = null;
let currentFilter = "all";

function setStatus(state, text) {
  statusDot.className = "dot dot-" + state;
  statusText.textContent = text;
}

function showFallback(title, sub) {
  fallbackTitle.textContent = title;
  fallbackSub.textContent = sub;
  fallback.classList.remove("hidden");
  liveBadge.classList.add("hidden");
}

function hideFallback(isTv) {
  // Bei Radio zeigen wir das Cover weiter als "Audio-Bild", aber ohne Blockade:
  // Deshalb: bei TV ganz ausblenden, bei Radio als Hintergrund-Info lassen? –
  // Einfachste robuste Variante: bei laufendem Radio Overlay ausblenden und
  // stattdessen Poster-Text im Player-Bereich zeigen. Video bleibt schwarz mit Ton.
  fallback.classList.add("hidden");
  if (isTv) liveBadge.classList.remove("hidden");
  else liveBadge.classList.remove("hidden");
}

function destroyHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function isHlsUrl(url) {
  return url.toLowerCase().includes(".m3u8");
}

function playStation(station) {
  current = station;
  destroyHls();
  video.pause();
  video.removeAttribute("src");
  video.load();

  nowPlaying.textContent = `${station.type === "tv" ? "📺" : "📻"} ${station.name}`;
  nowPlayingDesc.textContent = station.description || "";
  btnToggle.disabled = false;
  btnToggle.textContent = "⏸ Pause";
  setStatus("loading", "Lädt …");
  showFallback(station.name, "Verbinde …");

  document.querySelectorAll(".card").forEach((c) =>
    c.classList.toggle("active", c.dataset.id === station.id)
  );

  const url = station.url;

  // 1) HLS + hls.js unterstützt (Chrome, Edge, Firefox, Android)
  if (isHlsUrl(url) && window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {
        btnToggle.textContent = "▶ Abspielen";
      });
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        setStatus("offline", "Offline");
        showFallback("Stream offline", "Dieser Sender ist aktuell nicht erreichbar.");
        btnToggle.textContent = "▶ Abspielen";
      }
    });
    return;
  }

  // 2) Safari / nativer HLS-Support oder direkte Audio-Datei (MP3 etc.)
  if (
    (isHlsUrl(url) && video.canPlayType("application/vnd.apple.mpegurl")) ||
    !isHlsUrl(url)
  ) {
    video.src = url;
    video.play().catch(() => {
      btnToggle.textContent = "▶ Abspielen";
    });
    return;
  }

  // 3) Kein HLS möglich
  setStatus("offline", "Offline");
  showFallback("Nicht unterstützt", "Dein Browser kann diesen Stream nicht abspielen.");
}

/* Video-Events → Statusanzeige */
video.addEventListener("playing", () => {
  setStatus("live", "Live");
  hideFallback(current && current.type === "tv");
  btnToggle.textContent = "⏸ Pause";
  if (current && current.type === "radio") {
    showFallbackRadio();
  }
});

video.addEventListener("waiting", () => setStatus("loading", "Lädt …"));

video.addEventListener("pause", () => {
  if (current) btnToggle.textContent = "▶ Abspielen";
});

video.addEventListener("error", () => {
  if (!current) return;
  setStatus("offline", "Offline");
  showFallback("Stream offline", "Dieser Sender ist aktuell nicht erreichbar.");
});

function showFallbackRadio() {
  // Radio hat kein Bild → Overlay als Cover-Ersatz einblenden,
  // aber Klicks durchlassen, damit die nativen Controls nutzbar bleiben.
  fallbackTitle.textContent = "📻 " + current.name;
  fallbackSub.textContent = "Audio läuft – Video bleibt dunkel.";
  fallback.classList.remove("hidden");
  fallback.style.pointerEvents = "none";
  liveBadge.classList.remove("hidden");
}

// Sobald wieder TV gewählt wird, Overlay wieder klickfest machen
const origHide = hideFallback;

/* Senderkarten rendern */
function cardEl(station) {
  const btn = document.createElement("button");
  btn.className = "card";
  btn.dataset.id = station.id;
  btn.innerHTML = `
    <div class="card-top">
      <span class="badge ${station.type}">${station.type === "tv" ? "📺 TV" : "📻 RADIO"}</span>
      <span class="card-play">▶</span>
    </div>
    <h4></h4>
    <p></p>
  `;
  btn.querySelector("h4").textContent = station.name;
  btn.querySelector("p").textContent = station.description || "";
  btn.addEventListener("click", () => {
    fallback.style.pointerEvents = "auto";
    playStation(station);
  });
  return btn;
}

function render(filter = "all") {
  tvGrid.innerHTML = "";
  radioGrid.innerHTML = "";
  stations
    .filter((s) => filter === "all" || s.type === filter)
    .forEach((s) => {
      const el = cardEl(s);
      if (current && current.id === s.id) el.classList.add("active");
      (s.type === "tv" ? tvGrid : radioGrid).appendChild(el);
    });

  document.querySelectorAll('h3.section-title').forEach((h) => {
    if (filter === "tv") h.style.display = h.textContent.includes("TV") ? "" : "none";
    else if (filter === "radio") h.style.display = h.textContent.includes("Radio") ? "" : "none";
    else h.style.display = "";
  });
  if (filter === "tv") radioGrid.innerHTML = "";
  if (filter === "radio") tvGrid.innerHTML = "";
}

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    currentFilter = chip.dataset.filter;
    render(currentFilter);
  });
});

/* Eigene Buttons */
btnToggle.addEventListener("click", () => {
  if (!current) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
});

btnMute.addEventListener("click", () => {
  video.muted = !video.muted;
  btnMute.textContent = video.muted ? "🔇 Stumm" : "🔊 Ton an/aus";
});

document.getElementById("year").textContent = new Date().getFullYear();

/* Init */
setStatus("idle", "Bereit");
showFallback("Wähle unten einen Sender", "TV oder Radio – der Stream startet im Player.");
render("all");
