/* ============================================================================
   YAZEDD LIVE v3.0 — ÖFFENTLICH + ADMIN
   ----------------------------------------------------------------------------
   KONZEPT (genau wie gewünscht):
   - BESUCHER: brauchen KEIN Konto. TV & Radio laufen sofort und kostenlos.
   - NUR DU (Admin) loggst dich ein — über den kleinen "🔒 Admin"-Link im
     Footer. Dann erscheint der Admin-Bereich zur Sender-Verwaltung.
   ----------------------------------------------------------------------------
   FÜR DICH (Demo-Zugang, bis das Backend fertig ist):
     E-Mail:    admin@yazedd.live
     Passwort:  Yazedd#2026
     >>> Bitte ändere das Passwort unten im ADMIN-Block! <<<
   ----------------------------------------------------------------------------
   FÜR DEN BACKEND-ENTWICKLER:
   1) BACKEND.apiBase setzen, z. B. "https://api.yazedd-live.de".
      Leer = Demo-Modus (Admin lokal geprüft, Sender lokal gespeichert).
   2) Endpunkte (REST + JSON):
        POST {apiBase}/auth/admin-login  {email,password}
             -> {token, user:{name,email,role:"admin"}}   (role MUSS "admin" sein!)
        GET  {apiBase}/stations            (öffentlich, KEIN Token nötig)
             -> [{id,name,type:"tv"|"radio",url,genre,logo,color}]
        PUT  {apiBase}/stations            (nur Admin, Header: Bearer <token>)
             Body: komplette Senderliste -> {ok:true}
      CORS für die Webseiten-Domain freigeben!
   ============================================================================ */

const BACKEND = {
  apiBase: "", // z.B. "https://api.yazedd-live.de" — leer = Demo-Modus
  endpoints: { adminLogin: "/auth/admin-login", stations: "/stations" },
  tokenKey: "yazedd_admin_token",
  userKey: "yazedd_admin_user",
};

/* >>> HIER DEIN ADMIN-ZUGANG (Demo-Modus) — BITTE ÄNDERN! <<<
   Das Passwort kannst du auch direkt im Admin-Bereich ändern
   (wird dann in diesem Browser gespeichert). */
const ADMIN = {
  email: "admin@yazedd.live",
  password: "Yazedd#2026",
};
function adminPassword() {
  return localStorage.getItem("yazedd_admin_pw") || ADMIN.password;
}

/* ---------------- Sender-Standardliste (Platzhalter) ----------------------- */
const DEFAULT_STATIONS = [
  { id: "tv-1", name: "Yazedd TV Prime", type: "tv", genre: "News · HD", logo: "📺", color: "#e11d48",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", description: "Platzhalter — eigene .m3u8-URL eintragen." },
  { id: "tv-2", name: "Yazedd Cinema", type: "tv", genre: "Film · HD", logo: "🎬", color: "#7c3aed",
    url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8", description: "Platzhalter — eigene .m3u8-URL eintragen." },
  { id: "r-1", name: "Yazedd Radio Pop", type: "radio", genre: "Pop · 128kbps", logo: "🎧", color: "#0ea5e9",
    url: "https://ice1.somafm.com/groovesalad-128-mp3", description: "Direktstream (MP3) — eigene URL eintragen." },
  { id: "r-2", name: "Yazedd Radio Lounge", type: "radio", genre: "Lounge · 128kbps", logo: "🎶", color: "#22c55e",
    url: "https://ice1.somafm.com/deepspaceone-128-mp3", description: "Direktstream (MP3) — eigene URL eintragen." },
  { id: "r-3", name: "Yazedd News Audio", type: "radio", genre: "News · HLS", logo: "📰", color: "#f59e0b",
    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8", description: "Radio als HLS — nur Ton im Player." },
  { id: "v-1", name: "Yazedd Highlight-Clip", type: "video", genre: "Mediathek · MP4", logo: "🎬", color: "#a855f7",
    url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4", description: "Beispiel-Video — ersetze durch dein eigenes Video (MP4 oder .m3u8)." },
];
let stations = JSON.parse(JSON.stringify(DEFAULT_STATIONS));
let stationsSource = "Standard (eingebaut)";
let hasLocalEdits = false;

function loadLocalStations() {
  try {
    const raw = localStorage.getItem("yazedd_stations");
    if (raw) { const l = JSON.parse(raw); if (Array.isArray(l) && l.length) return l; }
  } catch { /* Standard nehmen */ }
  return null;
}
function persistStations() {
  if (!BACKEND.apiBase) localStorage.setItem("yazedd_stations", JSON.stringify(stations));
}

/* ---------------- Helpers / DOM ------------------------------------------ */
const $ = (id) => document.getElementById(id);
const video = $("playerEl"), fallback = $("fallback"), fallbackTitle = $("fallbackTitle"),
  fallbackSub = $("fallbackSub"), liveBadge = $("liveBadge"), statusDot = $("statusDot"),
  statusText = $("statusText"), nowPlaying = $("nowPlaying"), nowPlayingDesc = $("nowPlayingDesc"),
  btnToggle = $("btnToggle"), btnMute = $("btnMute"), vol = $("vol"), volLabel = $("volLabel"),
  btnFull = $("btnFull"), btnRetry = $("btnRetry"), quality = $("quality"), eq = $("eq");

let hls = null, current = null, filter = "all", query = "", lastUrl = null;
let favs = new Set(JSON.parse(localStorage.getItem("yazedd_favs") || "[]"));
const saveFavs = () => localStorage.setItem("yazedd_favs", JSON.stringify([...favs]));

function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind; t.textContent = msg;
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 3800);
}
function setStatus(s, txt) { statusDot.className = "dot dot-" + s; statusText.textContent = txt; }

/* Einheitliche Typ-Darstellung (TV / Radio / Video) */
function iconFor(s) { return s.type === "tv" ? "📺 " : s.type === "radio" ? "📻 " : "🎬 "; }
function badgeFor(s) { return s.type === "tv" ? "📺 TV" : s.type === "radio" ? "📻 RADIO" : "🎬 VIDEO"; }
function kindFor(s) { return s.type === "tv" ? "TV · " : s.type === "radio" ? "Radio · " : "Video · "; }

/* ---------------- ADMIN-AUTH (nur Betreiber, kein öffentliches Register) --- */
const getToken = () => localStorage.getItem(BACKEND.tokenKey);
const getUser = () => { try { return JSON.parse(localStorage.getItem(BACKEND.userKey)); } catch { return null; } };
const isAdmin = () => { const u = getUser(); return !!(u && u.role === "admin" && getToken()); };

function saveAdminSession(token, user) {
  localStorage.setItem(BACKEND.tokenKey, token);
  localStorage.setItem(BACKEND.userKey, JSON.stringify({ ...user, role: "admin" }));
  updateAuthUI();
}
function logout() {
  localStorage.removeItem(BACKEND.tokenKey);
  localStorage.removeItem(BACKEND.userKey);
  updateAuthUI();
  toast("Admin abgemeldet.");
}
function openAdmin() {
  $("authModal").classList.remove("hidden");
  $("authErr").textContent = "";
  $("backendHint").textContent = BACKEND.apiBase
    ? "Verbunden mit Backend: " + BACKEND.apiBase
    : "Demo-Modus — Zugang: " + ADMIN.email + " / (dein Passwort aus script.js)";
  setTimeout(() => $("authMail").focus(), 50);
}
function closeAdmin() { $("authModal").classList.add("hidden"); }
function updateAuthUI() {
  const admin = isAdmin();
  $("adminBadge").classList.toggle("hidden", !admin);
  $("adminPanel").classList.toggle("hidden", !admin);
  if (admin) {
    $("adminName").textContent = getUser().name || "Admin";
    renderAdminList();
    // Admin-Bereich direkt zeigen, damit du ihn sofort findest:
    setTimeout(() => $("adminPanel").scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  }
}
/* Direkt-Link: deine-Seite.de/#admin öffnet den Admin-Login */
function checkAdminHash() { if (location.hash === "#admin" && !isAdmin()) openAdmin(); }
window.addEventListener("hashchange", checkAdminHash);

$("adminLink").addEventListener("click", (e) => { e.preventDefault(); isAdmin() ? logout() : openAdmin(); });
$("authClose").addEventListener("click", closeAdmin);
$("authModal").addEventListener("click", (e) => { if (e.target === $("authModal")) closeAdmin(); });
$("btnLogout").addEventListener("click", logout);
// Geheimer Shortcut: 3x schnell "A" drücken öffnet ebenfalls den Admin-Login
let aCount = 0, aTimer = null;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAdmin();
  if (e.key.toLowerCase() === "a" && !e.metaKey && !e.ctrlKey && document.activeElement.tagName !== "INPUT") {
    aCount++; clearTimeout(aTimer); aTimer = setTimeout(() => (aCount = 0), 800);
    if (aCount >= 3) { aCount = 0; openAdmin(); }
  }
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("authMail").value.trim().toLowerCase(), pass = $("authPass").value;
  $("authErr").textContent = ""; $("authSubmit").disabled = true;
  try {
    if (BACKEND.apiBase) {
      // Echter Backend-Login — Backend MUSS role:"admin" liefern, sonst Ablehnung
      const res = await fetch(BACKEND.apiBase + BACKEND.endpoints.adminLogin, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Login fehlgeschlagen.");
      if (!data.token || !data.user || data.user.role !== "admin")
        throw new Error("Kein Admin-Zugriff für dieses Konto.");
      saveAdminSession(data.token, data.user);
    } else {
      // Demo-Prüfung gegen ADMIN-Block oben (inkl. geändertem Passwort)
      await new Promise((r) => setTimeout(r, 400));
      if (email !== ADMIN.email.toLowerCase() || pass !== adminPassword())
        throw new Error("Falsche Admin-Daten.");
      saveAdminSession("demo-admin." + Date.now(), { name: "Admin", email });
    }
    closeAdmin(); e.target.reset();
    toast("Willkommen, Admin! 🛡", "ok");
  } catch (err) { $("authErr").textContent = err.message; }
  $("authSubmit").disabled = false;
});

/* ---------------- ADMIN: Sender verwalten ---------------------------------- */
async function syncToBackend() {
  if (!BACKEND.apiBase) { persistStations(); return; }
  const res = await fetch(BACKEND.apiBase + BACKEND.endpoints.stations, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: JSON.stringify(stations),
  });
  if (!res.ok) throw new Error("Backend-Speichern fehlgeschlagen.");
}
$("stationForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("stationErr").textContent = "";
  const name = $("stName").value.trim(), url = $("stUrl").value.trim();
  if (!name || !url) { $("stationErr").textContent = "Bitte Name und Stream-URL ausfüllen."; return; }
  stations.push({ id: "s-" + Date.now(), name, type: $("stType").value,
    logo: $("stLogo").value.trim() || ($("stType").value === "tv" ? "📺" : $("stType").value === "radio" ? "📻" : "🎬"),
    color: $("stType").value === "tv" ? "#e11d48" : $("stType").value === "radio" ? "#0ea5e9" : "#a855f7",
    genre: $("stGenre").value.trim(), url, description: "" });
  try { await syncToBackend(); } catch (err) { $("stationErr").textContent = err.message; stations.pop(); return; }
  e.target.reset(); afterStationChange("Sender gespeichert. ✅");
});
function renderAdminList() {
  const box = $("adminList"); box.innerHTML = "";
  stations.forEach((s) => {
    const row = document.createElement("div");
    row.className = "admin-row";
    const label = document.createElement("span");
    label.className = "grow"; label.textContent = iconFor(s) + s.name;
    const play = document.createElement("button");
    play.textContent = "▶ Test";
    play.title = "Sender im Player testen";
    play.addEventListener("click", () => {
      playStation(s);
      $("player").scrollIntoView({ behavior: "smooth" });
    });
    const del = document.createElement("button");
    del.className = "danger"; del.textContent = "Löschen";
    del.addEventListener("click", async () => {
      if (!confirm("„" + s.name + "“ wirklich löschen?")) return;
      stations = stations.filter((x) => x.id !== s.id);
      try { await syncToBackend(); } catch (err) { toast(err.message, "err"); return; }
      afterStationChange("Sender gelöscht.");
    });
    row.append(label, play, del); box.appendChild(row);
  });
  updateControlStatus();
}
function afterStationChange(msg) {
  hasLocalEdits = true;
  render(); renderAdminList();
  if (msg) toast(msg + (!BACKEND.apiBase ? " Denke an Veröffentlichen ⬇." : ""), "ok");
}
function updateControlStatus() {
  const el = $("controlStatus");
  if (!el) return;
  const tv = stations.filter((s) => s.type === "tv").length;
  const ra = stations.filter((s) => s.type === "radio").length;
  const vi = stations.filter((s) => s.type === "video").length;
  el.innerHTML = "Quelle: <strong></strong> · <span></span> · <span></span>";
  el.querySelector("strong").textContent = stationsSource;
  el.querySelectorAll("span")[0].textContent = tv + " TV + " + ra + " Radio + " + vi + " Videos aktiv";
  el.querySelectorAll("span")[1].textContent = hasLocalEdits && !BACKEND.apiBase
    ? "⚠️ Du hast unveröffentlichte Änderungen — bitte stations.json hochladen."
    : "✅ Stand ist veröffentlicht.";
}
/* Export / Import: so kommt deine Kontrolle zu ALLEN Besuchern */
function downloadStations() {
  const blob = new Blob([JSON.stringify(stations, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stations.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("stations.json heruntergeladen — jetzt auf den Webspace hochladen.", "ok");
}
$("btnExport").addEventListener("click", downloadStations);
$("btnCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(stations, null, 2));
    toast("In Zwischenablage kopiert. ✅", "ok");
  } catch { toast("Kopieren nicht möglich — bitte Download nutzen.", "err"); }
});
$("btnTestAll").addEventListener("click", () => {
  if (stations.length) { playStation(stations[0]); $("player").scrollIntoView({ behavior: "smooth" }); }
});
$("pwForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("pwNew").value;
  if (v.length < 6) { toast("Mind. 6 Zeichen nötig.", "err"); return; }
  localStorage.setItem("yazedd_admin_pw", v);
  $("pwNew").value = "";
  toast("Admin-Passwort auf diesem Gerät geändert. ✅", "ok");
});
$("btnResetStations").addEventListener("click", async () => {
  if (!confirm("Wirklich alle Sender auf Standard zurücksetzen?")) return;
  stations = JSON.parse(JSON.stringify(DEFAULT_STATIONS));
  try { await syncToBackend(); } catch (err) { toast(err.message, "err"); return; }
  afterStationChange("Standardliste wiederhergestellt.");
});

/* Zentrale Senderquelle: stations.json gilt für ALLE Besucher.
   Admin-Änderungen (lokal) überschreiben sie nur auf deinem Gerät,
   bis du sie als stations.json hochlädst. */
async function loadCentralStations() {
  try {
    const res = await fetch("stations.json", { cache: "no-store" });
    if (!res.ok) throw new Error();
    const list = await res.json();
    if (Array.isArray(list) && list.length) {
      stations = list; stationsSource = "stations.json (zentral für alle)";
    }
  } catch { stationsSource = "Standard (stations.json fehlt?)"; }
  const local = loadLocalStations();
  if (local) { stations = local; hasLocalEdits = true; stationsSource += " + deine lokalen Änderungen"; }
}

/* Senderliste öffentlich vom Backend laden (ohne Token) */
async function loadStations() {
  if (!BACKEND.apiBase) return;
  try {
    const res = await fetch(BACKEND.apiBase + BACKEND.endpoints.stations);
    const list = await res.json();
    if (Array.isArray(list) && list.length) {
      stations = list.map((s) => ({ id: s.id, name: s.name, type: s.type, url: s.url,
        genre: s.genre || "", logo: s.logo || "📺", color: s.color || "#38bdf8", description: s.description || "" }));
    }
  } catch { toast("Backend-Sender nicht erreichbar — lokale Liste aktiv.", "err"); }
}

/* ---------------- PLAYER (öffentlich, kein Login nötig!) -------------------- */
const isHls = (u) => u.toLowerCase().includes(".m3u8");
function destroyHls() { if (hls) { hls.destroy(); hls = null; } }

function playStation(st) {
  current = st; lastUrl = st.url;
  destroyHls(); video.pause(); video.removeAttribute("src"); video.load();
  nowPlaying.textContent = iconFor(st) + st.name;
  nowPlayingDesc.textContent = (st.genre ? st.genre + " · " : "") + (st.description || (st.type === "video" ? "Video" : "Live"));
  btnToggle.disabled = false; btnToggle.textContent = "⏸ Pause";
  btnRetry.classList.add("hidden");
  setStatus("loading", "Lädt …");
  fallbackTitle.textContent = st.name; fallbackSub.textContent = "Verbinde …";
  fallback.classList.remove("hidden"); fallback.style.pointerEvents = "auto";
  liveBadge.classList.add("hidden"); eq.classList.add("hidden");
  document.querySelectorAll(".card,.queue-item").forEach((c) =>
    c.classList.toggle("active", c.dataset.id === st.id));

  if (isHls(st.url) && window.Hls && Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(st.url); hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { btnToggle.textContent = "▶ Abspielen"; }));
    hls.on(Hls.Events.LEVEL_SWITCHED, (e, d) => { quality.textContent = (d.level + 1) + " · AUTO"; });
    hls.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) { setStatus("offline", "Offline"); onStreamError(); } });
    return;
  }
  if ((isHls(st.url) && video.canPlayType("application/vnd.apple.mpegurl")) || !isHls(st.url)) {
    video.src = st.url;
    video.play().catch(() => { btnToggle.textContent = "▶ Abspielen"; });
    return;
  }
  setStatus("offline", "Offline"); onStreamError();
}
function onStreamError() {
  fallbackTitle.textContent = "Stream offline";
  fallbackSub.textContent = "Dieser Sender ist aktuell nicht erreichbar.";
  fallback.classList.remove("hidden"); btnRetry.classList.remove("hidden");
  liveBadge.classList.add("hidden"); eq.classList.add("hidden");
  btnToggle.textContent = "▶ Abspielen";
}
video.addEventListener("playing", () => {
  setStatus("live", "Live"); liveBadge.classList.remove("hidden");
  btnToggle.textContent = "⏸ Pause"; eq.classList.remove("hidden");
  if (current && current.type === "radio") {
    fallbackTitle.textContent = current.logo + "  " + current.name;
    fallbackSub.textContent = "Audio läuft live — viel Spaß beim Hören.";
    fallback.classList.remove("hidden"); fallback.style.pointerEvents = "none";
  } else fallback.classList.add("hidden");
});
video.addEventListener("waiting", () => setStatus("loading", "Lädt …"));
video.addEventListener("pause", () => { if (current) btnToggle.textContent = "▶ Abspielen"; });
video.addEventListener("error", () => { if (current) { setStatus("offline", "Offline"); onStreamError(); } });

btnToggle.addEventListener("click", () => {
  if (!current) { toast("Wähle zuerst einen Sender."); return; }
  if (video.paused) video.play().catch(() => {}); else video.pause();
});
btnMute.addEventListener("click", () => { video.muted = !video.muted; btnMute.textContent = video.muted ? "🔇" : "🔊"; });
vol.addEventListener("input", () => {
  video.volume = vol.value / 100; video.muted = false;
  volLabel.textContent = vol.value + "%"; btnMute.textContent = "🔊";
});
video.volume = 0.9;
btnFull.addEventListener("click", () => {
  const el = document.querySelector(".player-wrap");
  if (document.fullscreenElement) document.exitFullscreen();
  else el.requestFullscreen && el.requestFullscreen();
});
btnRetry.addEventListener("click", () => { if (current) playStation(current); });
$("btnBrowse").addEventListener("click", () => $("tv").scrollIntoView({ behavior: "smooth" }));

/* ---------------- LISTEN: Cards, Queue, Suche, Favoriten -------------------- */
function matches(s) {
  const f = filter === "all" || s.type === filter;
  const q = !query || (s.name + " " + (s.genre || "")).toLowerCase().includes(query);
  return f && q;
}
function toggleFav(id, ev) {
  ev.stopPropagation();
  if (favs.has(id)) { favs.delete(id); toast("Aus Favoriten entfernt."); }
  else { favs.add(id); toast("★ Zu Favoriten hinzugefügt.", "ok"); }
  saveFavs(); render();
}
function cardEl(s) {
  const b = document.createElement("button");
  b.className = "card" + (current && current.id === s.id ? " active" : "");
  b.dataset.id = s.id;
  b.innerHTML = `<button class="fav ${favs.has(s.id) ? "on" : ""}" title="Favorit">${favs.has(s.id) ? "★" : "☆"}</button>
    <div class="card-top"><span class="badge ${s.type}">${badgeFor(s)}</span></div>
    <div class="station"><div class="logo" style="background:${s.color}22;border:1px solid ${s.color}55">${s.logo}</div>
    <div><h4></h4><p class="genre muted"></p></div></div>
    <span class="card-play">▶ Jetzt abspielen — kostenlos</span>`;
  b.querySelector("h4").textContent = s.name;
  b.querySelector(".genre").textContent = s.genre || s.description || "";
  b.querySelector(".fav").addEventListener("click", (e) => toggleFav(s.id, e));
  b.addEventListener("click", () => playStation(s));
  return b;
}
function queueEl(s) {
  const b = document.createElement("button");
  b.className = "queue-item" + (current && current.id === s.id ? " active" : "");
  b.dataset.id = s.id;
  b.innerHTML = `<div class="q-logo" style="background:${s.color}22;border:1px solid ${s.color}55">${s.logo}</div>
    <div class="q-info"><strong></strong><small></small></div><span class="q-play">▶</span>`;
  b.querySelector("strong").textContent = s.name;
  b.querySelector("small").textContent = kindFor(s) + (s.genre || "");
  b.addEventListener("click", () => playStation(s));
  return b;
}
function render() {
  const tv = stations.filter((s) => s.type === "tv" && matches(s));
  const ra = stations.filter((s) => s.type === "radio" && matches(s));
  const vi = stations.filter((s) => (s.type === "video" || (!s.type && s.url && s.url.endsWith(".mp4"))) && matches(s));
  const fv = stations.filter((s) => favs.has(s.id) && matches(s));
  $("tvGrid").innerHTML = ""; tv.forEach((s) => $("tvGrid").appendChild(cardEl(s)));
  $("radioGrid").innerHTML = ""; ra.forEach((s) => $("radioGrid").appendChild(cardEl(s)));
  const vg = $("videoGrid"); if (vg) { vg.innerHTML = ""; vi.forEach((s) => vg.appendChild(cardEl(s))); }
  const vc = $("videoCount"); if (vc) vc.textContent = vi.length + " Videos";
  $("favGrid").innerHTML = ""; fv.forEach((s) => $("favGrid").appendChild(cardEl(s)));
  $("tvCount").textContent = tv.length + " Sender";
  $("radioCount").textContent = ra.length + " Sender";
  $("favCount").textContent = fv.length + "";
  $("favEmpty").style.display = fv.length ? "none" : "";
  const q = $("queueList"); q.innerHTML = "";
  stations.filter(matches).slice(0, 12).forEach((s) => q.appendChild(queueEl(s)));
  if (!stations.filter(matches).length) q.innerHTML = '<p class="muted small">Keine Sender gefunden.</p>';
}
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => {
  document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
  c.classList.add("active"); filter = c.dataset.filter; render();
}));
$("search").addEventListener("input", (e) => { query = e.target.value.toLowerCase().trim(); render(); });
$("navToggle").addEventListener("click", () => $("mobileNav").classList.toggle("hidden"));
document.querySelectorAll("#mobileNav a").forEach((a) =>
  a.addEventListener("click", () => $("mobileNav").classList.add("hidden")));

/* ---------------- Init ------------------------------------------------------ */
$("year").textContent = new Date().getFullYear();
(async function init() {
  updateAuthUI();
  setStatus("idle", "Bereit");
  if (BACKEND.apiBase) await loadStations();
  else await loadCentralStations();
  render(); updateControlStatus();
  checkAdminHash();
})();
