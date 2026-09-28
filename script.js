// Mobile Navigation
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  navToggle.textContent = open ? "✕" : "☰";
});
navLinks.querySelectorAll("a").forEach((l) =>
  l.addEventListener("click", () => {
    navLinks.classList.remove("open");
    navToggle.textContent = "☰";
  })
);

// Tabs Speisekarte
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".menu-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  });
});

// Reservierung (Demo, kein Backend)
document.getElementById("reservationForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target;
  const note = document.getElementById("formNote");
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.firstname || !data.lastname || !data.email) {
    note.textContent = "Bitte Vorname, Nachname und E-Mail ausfüllen.";
    note.className = "form-note error";
    return;
  }
  note.textContent = `Vielen Dank, ${data.firstname}! Ihre Anfrage ist eingegangen. Wir melden uns an ${data.email}.`;
  note.className = "form-note success";
  form.reset();
});

document.getElementById("year").textContent = new Date().getFullYear();
