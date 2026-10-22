const SUPABASE_URL = "https://cjhnonzpofziwoyinihp.supabase.co";
const SUPABASE_KEY = "sb_publishable_8j6RjWcZ2Tig1q_mIYb5Yg_WbF_GIXA";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let data = JSON.parse(localStorage.getItem("manga") || "[]");
let mode = "inventory";
let user = null;
let pushTimer = null;

// Which series are open. Kept on this device only (a convenience, not part of your collection).
let openSeries = new Set();
try { openSeries = new Set(JSON.parse(localStorage.getItem("manga_open") || "[]")); } catch {}
function saveOpen() {
  try { localStorage.setItem("manga_open", JSON.stringify([...openSeries])); } catch {}
}
let shownTitles = []; // the series currently listed, for Expand all / Collapse all

// Older entries had no "owned" list: treat all their volumes as owned
data.forEach(s => { if (!s.owned) s.owned = s.read.map(() => true); });

/* ---------- Small helpers ---------- */

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(label, onClick, extra) {
  const b = el("button", "btn" + (extra ? " " + extra : ""), label);
  b.type = "button";
  b.onclick = onClick;
  return b;
}

function ranges(nums) {
  const out = [];
  let start = null, prev = null;
  nums.forEach(n => {
    if (start === null) { start = prev = n; }
    else if (n === prev + 1) { prev = n; }
    else {
      out.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = prev = n;
    }
  });
  if (start !== null) out.push(start === prev ? `${start}` : `${start}-${prev}`);
  return out.join(", ");
}

const EMPTY_TEXT = "No series yet. Open Account and tools, under the title, to add your first one.";

// One line about the whole collection, whatever the view or the search
function updateSummary() {
  const line = document.getElementById("summary");
  if (!data.length) { line.textContent = ""; return; }
  let total = 0, owned = 0, toRead = 0;
  data.forEach(s => {
    total += s.owned.length;
    s.owned.forEach((o, v) => { if (o) { owned++; if (!s.read[v]) toRead++; } });
  });
  line.textContent = `${data.length} series, ${owned} of ${total} volumes owned, ${toRead} to read`;
}

function updateToggleAll() {
  const b = document.getElementById("toggle-all");
  const allOpen = shownTitles.length > 0 && shownTitles.every(t => openSeries.has(t));
  b.textContent = allOpen ? "Collapse all" : "Expand all";
  b.disabled = shownTitles.length === 0;
}

document.getElementById("toggle-all").onclick = () => {
  const allOpen = shownTitles.every(t => openSeries.has(t));
  shownTitles.forEach(t => { if (allOpen) openSeries.delete(t); else openSeries.add(t); });
  saveOpen();
  render();
};

/* ---------- Saving ---------- */

function save() {
  localStorage.setItem("manga", JSON.stringify(data));
  localStorage.setItem("manga_updated", new Date().toISOString());
  render();
  pushSoon();
}

/* ---------- Rendering ---------- */

function render() {
  document.body.dataset.mode = mode;
  document.querySelectorAll(".modes button").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });

  updateSummary();
  if (mode === "missing") { renderMissing(); return; }

  const list = document.getElementById("list");
  const onlyUnread = document.getElementById("filter").checked;
  const query = document.getElementById("search").value.trim().toLowerCase();
  const field = mode === "inventory" ? "owned" : "read";
  list.replaceChildren();
  shownTitles = [];
  let ownedTotal = 0, unreadTotal = 0;

  [...data].sort((a, b) => a.title.localeCompare(b.title)).forEach(s => {
    const ownedCount = s.owned.filter(Boolean).length;
    const left = s.owned.filter((o, v) => o && !s.read[v]).length;
    ownedTotal += ownedCount;
    unreadTotal += left;
    if (mode === "reading" && onlyUnread && left === 0) return;
    if (query && !s.title.toLowerCase().includes(query)) return;

    shownTitles.push(s.title);
    const card = el("details", "series");
    card.open = openSeries.has(s.title);
    card.addEventListener("toggle", () => {
      if (card.open === openSeries.has(s.title)) return; // we just set it ourselves
      if (card.open) openSeries.add(s.title); else openSeries.delete(s.title);
      saveOpen();
      updateToggleAll();
    });

    // The bar shows owned volumes in Inventory, and read volumes among the owned ones in Reading
    const readOwned = s.owned.filter((o, v) => o && s.read[v]).length;
    const fraction = mode === "inventory"
      ? (s.owned.length ? ownedCount / s.owned.length : 0)
      : (ownedCount ? readOwned / ownedCount : 0);
    const fill = el("span", "fill");
    fill.style.width = `${Math.round(fraction * 100)}%`;
    const bar = el("span", "progress");
    bar.setAttribute("aria-hidden", "true");
    bar.append(fill);

    const head = el("summary", "series-summary");
    const top = el("div", "series-top");
    top.append(
      el("h2", "series-title", s.title),
      el("span", "series-count", mode === "inventory"
        ? `${ownedCount} of ${s.owned.length} owned`
        : `${left} unread`),
      el("span", "chev")
    );
    const main = el("div", "series-main");
    main.append(top, bar);
    head.append(coverFor(s), main);
    card.append(head);

    const grid = el("div", "volumes");
    s[field].forEach((val, v) => {
      if (mode === "reading" && !s.owned[v]) return; // only owned volumes can be read
      const tile = el("label", "tile" + (val ? " on" : ""));
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = val;
      box.setAttribute("aria-label", `${s.title}, volume ${v + 1}`);
      box.onchange = () => { s[field][v] = box.checked; save(); };
      tile.append(box, el("span", "", String(v + 1)));
      grid.append(tile);
    });
    card.append(grid);
    if (!grid.children.length) {
      grid.append(el("p", "muted", mode === "reading"
        ? "None of these volumes are on your shelf yet. Tick them in Inventory first."
        : "No volumes."));
    }

    const more = el("details", "more");
    more.append(el("summary", "", "Options"));
    const tools = el("div", "tools");
    tools.append(
      btn(`Mark ${field} up to…`, () => {
        const n = parseInt(prompt(`Mark as ${field} up to volume number:`));
        if (!n) return;
        for (let v = 0; v < Math.min(n, s[field].length); v++) s[field][v] = true;
        save();
      }),
      btn(`Clear all ${field}`, () => {
        if (confirm(`Clear all "${field}" marks for ${s.title}?`)) {
          s[field] = s[field].map(() => false);
          save();
        }
      }),
      btn("Add volumes…", () => {
        const n = parseInt(prompt(`How many volumes to add to ${s.title}?`, "1"));
        if (!n || n < 1) return;
        for (let k = 0; k < n; k++) { s.owned.push(false); s.read.push(false); }
        save();
      }),
      safeCover(s.cover)
        ? btn("Remove cover", () => { delete s.cover; s.noCover = true; save(); })
        : btn("Find cover", async () => {
            delete s.noCover;
            if (!(await autoCover(s))) alert("No cover found for this series.");
          }),
      btn("Delete series", () => {
        if (confirm(`Delete ${s.title}?`)) {
          data.splice(data.indexOf(s), 1);
          openSeries.delete(s.title);
          saveOpen();
          save();
        }
      }, "danger")
    );
    more.append(tools);
    card.append(more);

    list.append(card);
  });

  document.getElementById("total").textContent = mode === "inventory"
    ? `${ownedTotal} volumes on your shelf`
    : `${unreadTotal} owned volumes left to read`;

  if (!list.children.length) {
    list.append(el("p", "empty", data.length ? "No series match your search or filter." : EMPTY_TEXT));
  }
  updateToggleAll();
}

function renderMissing() {
  const list = document.getElementById("list");
  const query = document.getElementById("search").value.trim().toLowerCase();
  list.replaceChildren();
  let missingTotal = 0;

  [...data].sort((a, b) => a.title.localeCompare(b.title)).forEach(s => {
    const missing = [];
    s.owned.forEach((o, v) => { if (!o) missing.push(v + 1); });
    missingTotal += missing.length;
    if (!missing.length) return;
    if (query && !s.title.toLowerCase().includes(query)) return;

    const card = el("section", "series");
    const head = el("div", "series-head");
    head.append(
      el("h2", "series-title", s.title),
      el("span", "series-count", `${missing.length} missing`)
    );
    card.append(head, el("p", "ranges", `Volumes ${ranges(missing)}`));
    list.append(card);
  });

  document.getElementById("total").textContent = `${missingTotal} volumes missing from your series`;

  if (!list.children.length) {
    list.append(el("p", "empty", !data.length
      ? EMPTY_TEXT
      : missingTotal ? "No series match your search."
      : "Nothing missing. Every volume you listed is on your shelf."));
  }
}

/* ---------- Add series, backup, search, modes ---------- */

document.getElementById("add-form").onsubmit = e => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  const count = parseInt(document.getElementById("count").value);
  const added = { title, owned: Array(count).fill(false), read: Array(count).fill(false) };
  data.push(added);
  openSeries.add(title); // a new series opens, ready for ticking
  saveOpen();
  e.target.reset();
  save();
  autoCover(added);
};

document.getElementById("export").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "manga-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
};

document.getElementById("import").onclick = () => document.getElementById("import-file").click();

document.getElementById("import-file").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("bad format");
      if (confirm("This will replace your current collection. Continue?")) {
        data = imported;
        data.forEach(s => { if (!s.owned) s.owned = s.read.map(() => true); });
        save();
      }
    } catch {
      alert("This file is not a valid backup.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
};

document.getElementById("search").oninput = render;
document.getElementById("filter").onchange = render;
document.querySelectorAll(".modes button").forEach(b => {
  b.onclick = () => { mode = b.dataset.mode; render(); };
});

/* ---------- Login ---------- */

function showAuth() {
  document.getElementById("login-form").hidden = !!user;
  document.getElementById("logout").hidden = !user;
  document.getElementById("auth-status").textContent = user
    ? `Logged in as ${user.email}`
    : "Not logged in. Your data stays on this device only.";
}

document.getElementById("login-form").onsubmit = async e => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  document.getElementById("auth-status").textContent = error
    ? `Error: ${error.message}`
    : "Check your email and click the link.";
};

document.getElementById("logout").onclick = async () => { await db.auth.signOut(); };

/* ---------- Cloud sync ---------- */

function setSyncStatus(msg) {
  document.getElementById("sync-status").textContent = msg;
}

function pushSoon() {
  if (!user) return;
  clearTimeout(pushTimer);
  setSyncStatus("Saving…");
  pushTimer = setTimeout(push, 800);
}

async function push() {
  let stamp = localStorage.getItem("manga_updated");
  if (!stamp) {
    stamp = new Date().toISOString();
    localStorage.setItem("manga_updated", stamp);
  }
  const { error } = await db.from("collections").upsert({
    user_id: user.id,
    data,
    updated_at: stamp
  });
  setSyncStatus(error ? `Sync error: ${error.message}` : "Synced ✓");
}

async function pull() {
  setSyncStatus("Syncing…");
  const { data: row, error } = await db
    .from("collections")
    .select("data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) { setSyncStatus(`Sync error: ${error.message}`); return; }

  const localStamp = localStorage.getItem("manga_updated") || "1970-01-01T00:00:00.000Z";

  if (!row) { await push(); return; } // first time: upload this device's data

  const cloudTime = new Date(row.updated_at);
  const localTime = new Date(localStamp);

  if (data.length === 0 || cloudTime > localTime) {
    localStorage.setItem("manga_before_sync", JSON.stringify(data)); // safety copy
    data = row.data;
    data.forEach(s => { if (!s.owned) s.owned = s.read.map(() => true); });
    localStorage.setItem("manga", JSON.stringify(data));
    localStorage.setItem("manga_updated", row.updated_at);
    render();
    setSyncStatus("Synced ✓ (loaded from cloud)");
  } else if (cloudTime < localTime) {
    await push();
  } else {
    setSyncStatus("Synced ✓");
  }
}

db.auth.onAuthStateChange((event, session) => {
  user = session ? session.user : null;
  showAuth();
  if (!user) setSyncStatus("");
  if (user && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) setTimeout(pull, 0);
});

/* ---------- Barcode scanner (step 1: read and show the ISBN) ---------- */

// An ISBN-13 starts with 978 or 979 and ends with a check digit.
// Checking it ignores other barcodes and misreads, and scanning carries on.
function isValidIsbn13(code) {
  if (!/^97[89]\d{10}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

const scanner = document.getElementById("scanner");
const scanVideo = document.getElementById("scan-video");
let scanStream = null;
let scanLoop = null;
let scanSeq = 0;        // bumps on every new scan or close, so late lookups can be ignored
let currentIsbn = null;
let currentCover = null;

function setScanStatus(msg) {
  document.getElementById("scan-status").textContent = msg;
}

function stopScanner() {
  clearTimeout(scanLoop);
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
  scanVideo.srcObject = null;
}

async function startScanner() {
  scanSeq++;
  currentIsbn = null;
  currentCover = null;
  scanVideo.hidden = true;
  document.getElementById("scan-result").textContent = "";
  document.getElementById("scan-again").hidden = true;
  document.getElementById("scan-confirm").hidden = true;
  setScanStatus("Starting the camera…");

  if (!("BarcodeDetector" in window)) {
    setScanStatus("This browser can't read barcodes. Try Chrome on your Android phone.");
    return;
  }

  let detector;
  try {
    detector = new BarcodeDetector({ formats: ["ean_13"] });
  } catch {
    setScanStatus("This browser can't read this type of barcode.");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
  } catch {
    setScanStatus("Camera access is blocked. Allow the camera for this site in your browser settings, then try again.");
    return;
  }

  if (!scanner.open) { // the dialog was closed while waiting for the camera
    stream.getTracks().forEach(t => t.stop());
    return;
  }

  scanStream = stream;
  scanVideo.srcObject = stream;
  try {
    await scanVideo.play();
  } catch {
    return; // interrupted, for example because the dialog was closed
  }
  if (!scanStream) return;
  scanVideo.hidden = false;
  setScanStatus("Point the camera at the barcode on the back cover.");

  const tick = async () => {
    if (!scanStream) return;
    try {
      const codes = await detector.detect(scanVideo);
      const isbn = codes.map(c => c.rawValue).find(isValidIsbn13);
      if (isbn) { onScanned(isbn); return; }
    } catch {}
    scanLoop = setTimeout(tick, 250);
  };
  tick();
}

document.getElementById("scan-open").onclick = () => {
  document.getElementById("scan-saved").textContent = "";
  scanner.showModal();
  startScanner();
};
document.getElementById("scan-again").onclick = startScanner;
document.getElementById("scan-close").onclick = () => scanner.close();
scanner.addEventListener("close", () => { scanSeq++; stopScanner(); });

/* ---------- Barcode scanner, step 2: find the book and confirm ---------- */

// Lowercase, no accents, words separated by single spaces
function normalize(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// "One Piece - Tome 12", "Kingdom T.12" and "Berserk 41" all give the volume number
function guessVolume(text) {
  const t = normalize(text);
  let m = t.match(/\b(?:tome|volume|vol|t|n|no|numero)\s*0*(\d{1,3})\b/);
  if (!m) m = t.match(/\b0*(\d{1,3})$/);
  return m ? parseInt(m[1], 10) : null;
}

// The existing series whose name appears in the title (the longest name wins)
function guessSeries(text) {
  const t = " " + normalize(text) + " ";
  let best = null, bestLen = 0;
  data.forEach(s => {
    const n = normalize(s.title);
    if (n && t.includes(" " + n + " ") && n.length > bestLen) { best = s; bestLen = n.length; }
  });
  return best;
}

// For a series you don't have yet: the title without its volume part
function cleanSeriesName(title) {
  const cleaned = title
    .replace(/[\s,:\-–(]*\b(?:tome|vol(?:ume)?\.?|t\.?|n°?)\s*0*\d+\b.*$/i, "")
    .replace(/[\s,.:\-–]*\b0*\d{1,3}\s*$/, "")
    .trim();
  return cleaned || title.trim();
}

function findByIsbn(isbn) {
  for (const s of data) {
    if (s.isbns && s.isbns[isbn]) return { series: s, vol: s.isbns[isbn] };
  }
  return null;
}

const digits = s => String(s).replace(/\D/g, "");

async function fetchBody(url, kind, ms = 5000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (r.redirected) throw new Error("unexpected"); // we got some other page, not our answer
    return kind === "json" ? await r.json() : await r.text();
  } finally {
    clearTimeout(timer);
  }
}

// Short reason shown when a source gives nothing, so a failure is easy to understand
function describeError(err) {
  if (err && err.name === "AbortError") return "timed out";
  if (err && err.message === "unexpected") return "unexpected answer";
  const m = err && /^HTTP (\d+)/.exec(err.message || "");
  if (m) return `error ${m[1]}`;
  return "unreachable";
}

// Each source returns { title } or null. They are asked one after the other, and
// only when the previous one found nothing, so your ISBN goes to as few as possible.
const SOURCES = [
  {
    name: "Google Books",
    async run(isbn) {
      const j = await fetchBody(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=5`, "json");
      const items = (j.items || []).filter(it => it.volumeInfo && it.volumeInfo.title);
      const exact = items.find(it =>
        (it.volumeInfo.industryIdentifiers || []).some(i => digits(i.identifier) === isbn));
      const item = exact || items[0];
      if (!item) return null;
      const v = item.volumeInfo;
      return { title: v.subtitle ? `${v.title} ${v.subtitle}` : v.title, unverified: !exact,
               cover: exact ? safeCover(v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) : null };
    }
  },
  {
    // The French national library: complete for French editions
    name: "BnF",
    async run(isbn) {
      const q = encodeURIComponent(`bib.isbn all "${isbn}"`);
      const xml = await fetchBody(
        `https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&query=${q}&recordSchema=dublincore&maximumRecords=1`,
        "text");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) throw new Error("unexpected");
      const titles = doc.getElementsByTagNameNS("*", "title");
      if (!titles.length) return null; // no record for this ISBN
      const ids = [...doc.getElementsByTagNameNS("*", "identifier")].map(n => digits(n.textContent));
      if (!ids.some(d => d.includes(isbn))) throw new Error("unexpected"); // a record, but not for this ISBN
      // "Du mouvement de la Terre. 1 [Texte imprimé] / Uoto ; ..." becomes "Du mouvement de la Terre. 1"
      const title = titles[0].textContent.replace(/\s*\[[^\]]*\]/g, "").split(" / ")[0].trim();
      return title ? { title } : null;
    }
  },
  {
    name: "Open Library",
    async run(isbn) {
      const j = await fetchBody(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, "json");
      const v = j["ISBN:" + isbn];
      if (!v || !v.title) return null;
      return { title: v.subtitle ? `${v.title} ${v.subtitle}` : v.title,
               cover: safeCover(v.cover && (v.cover.medium || v.cover.large || v.cover.small)) };
    }
  }
];

/* ---------- Covers ---------- */

// Only covers from these hosts are ever shown, whatever a backup or the cloud copy says.
const COVER_HOSTS = ["books.google.com", "books.googleusercontent.com", "covers.openlibrary.org"];

function safeCover(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.replace(/^http:\/\//, "https://"));
    if (u.protocol !== "https:" || !COVER_HOSTS.includes(u.hostname)) return null;
    u.searchParams.delete("edge"); // Google's page-curl effect
    return u.href;
  } catch { return null; }
}

function colorFor(title) {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h} 45% 38%)`;
}

function coverFor(s) {
  const box = el("span", "cover");
  box.setAttribute("aria-hidden", "true");
  const fallback = () => {
    box.replaceChildren(document.createTextNode((s.title.trim()[0] || "?").toUpperCase()));
    box.style.background = colorFor(s.title);
  };
  const url = safeCover(s.cover);
  if (!url) { fallback(); return box; }
  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";
  img.onerror = fallback;
  img.onload = () => { if (img.naturalWidth < 10) fallback(); }; // some services answer with a 1px "no cover" image
  img.src = url;
  box.append(img);
  return box;
}

// Does this image address really hold a picture? (Open Library answers 404 with default=false)
function probeImage(url) {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ""; resolve(false); }, 5000);
    img.onload = () => { clearTimeout(timer); resolve(img.naturalWidth >= 10); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.referrerPolicy = "no-referrer";
    img.src = url;
  });
}

// A book title counts as "this series" when it is the series name, optionally followed by a volume marker
// ("Kingdom", "Kingdom 3", "Kingdom, Tome 12", "Kingdom Vol. 1"). Returns the volume number (0 if none) or null.
function volumeOf(bookTitle, seriesTitle) {
  const b = normalize(bookTitle), n = normalize(seriesTitle);
  if (!n || !(b === n || b.startsWith(n + " "))) return null;
  const rest = b.slice(n.length).trim();
  if (!rest) return 0;
  const m = /^(?:(?:tome|vol|volume|t|n|no|book|livre|part)\s*)?(\d{1,3})(?:\s|$)/.exec(rest);
  return m ? parseInt(m[1], 10) : null;
}

// Looks for a cover by series name: first Google Books, then Open Library.
// Only books whose title is the series name plus a volume number are accepted, and volume 1 is preferred.
async function findCoverByTitle(title) {
  const pick = cands => {
    const ok = cands.filter(c => c.url && c.vol !== null);
    ok.sort((a, b) => (a.vol === 1 ? 0 : a.vol === 0 ? 1 : 2) - (b.vol === 1 ? 0 : b.vol === 0 ? 1 : 2) || a.vol - b.vol);
    return ok.length ? ok[0].url : null;
  };
  try {
    const q = encodeURIComponent(`intitle:"${title}"`);
    const j = await fetchBody(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=20&printType=books`, "json");
    const url = pick((j.items || []).map(it => {
      const v = it.volumeInfo || {};
      return { vol: v.title ? volumeOf(v.title, title) : null,
               url: safeCover(v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) };
    }));
    if (url) return url;
  } catch { /* try the next one */ }
  try {
    const q = encodeURIComponent(title);
    const j = await fetchBody(`https://openlibrary.org/search.json?title=${q}&limit=20&fields=title,cover_i`, "json");
    const url = pick((j.docs || []).map(d => ({
      vol: d.title ? volumeOf(d.title, title) : null,
      url: Number.isInteger(d.cover_i) ? safeCover(`https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`) : null
    })));
    if (url) return url;
  } catch { /* nothing more to try */ }
  return null;
}

// Best cover for a series: its barcodes first (exact), then its name
async function findSeriesCover(s) {
  const isbns = Object.entries(s.isbns || {}).sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [isbn] of isbns) {
    const url = await findCover(isbn);
    if (url) return url;
  }
  return findCoverByTitle(s.title);
}

// Runs in the background for a new series; never overwrites a cover that appeared meanwhile
const coverSearches = new Set();
async function autoCover(s) {
  if (safeCover(s.cover) || s.noCover || coverSearches.has(s)) return false;
  coverSearches.add(s);
  try {
    const url = await findSeriesCover(s);
    if (url && data.includes(s) && !safeCover(s.cover) && !s.noCover) { s.cover = url; save(); return true; }
  } finally { coverSearches.delete(s); }
  return false;
}

// Looks for a cover by ISBN alone, for books whose title came from a source without pictures (BnF)
async function findCover(isbn) {
  try {
    const j = await fetchBody(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=5`, "json");
    const item = (j.items || []).find(it => (it.volumeInfo && it.volumeInfo.industryIdentifiers || [])
      .some(i => digits(i.identifier) === isbn));
    const url = item && safeCover(item.volumeInfo.imageLinks &&
      (item.volumeInfo.imageLinks.thumbnail || item.volumeInfo.imageLinks.smallThumbnail));
    if (url) return url;
  } catch { /* try the next one */ }
  const ol = `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
  return (await probeImage(ol)) ? ol : null;
}

// Returns { info: { title, source, unverified? } | null, trail: ["Google Books: no match", ...] }
async function lookupIsbn(isbn) {
  const trail = [];
  for (const src of SOURCES) {
    try {
      const hit = await src.run(isbn);
      if (hit) return { info: { ...hit, source: src.name }, trail };
      trail.push(`${src.name}: no match`);
    } catch (err) {
      trail.push(`${src.name}: ${describeError(err)}`);
    }
  }
  return { info: null, trail };
}

const seriesSelect = document.getElementById("scan-series");
const newNameInput = document.getElementById("scan-newname");
const volumeInput = document.getElementById("scan-volume");

function showConfirm({ series, newName, vol }) {
  seriesSelect.replaceChildren();
  const placeholder = new Option("Choose a series…", "");
  placeholder.disabled = true;
  seriesSelect.append(placeholder);
  [...data].sort((a, b) => a.title.localeCompare(b.title)).forEach(s => {
    const o = new Option(s.title, String(data.indexOf(s)));
    o.dataset.title = s.title;
    seriesSelect.append(o);
  });
  seriesSelect.append(new Option("New series…", "new"));

  if (series) seriesSelect.value = String(data.indexOf(series));
  else if (newName) seriesSelect.value = "new";
  else seriesSelect.value = "";
  newNameInput.value = newName || "";
  newNameInput.hidden = seriesSelect.value !== "new";
  volumeInput.value = vol ? String(vol) : "";
  document.getElementById("scan-confirm").hidden = false;
}

seriesSelect.onchange = () => {
  newNameInput.hidden = seriesSelect.value !== "new";
  if (!newNameInput.hidden) newNameInput.focus();
};

async function onScanned(isbn) {
  stopScanner();
  if (navigator.vibrate) navigator.vibrate(80);
  currentIsbn = isbn;
  currentCover = null;
  const seq = ++scanSeq;
  document.getElementById("scan-result").textContent = isbn;
  document.getElementById("scan-again").hidden = false;
  document.getElementById("scan-confirm").hidden = true;
  scanVideo.hidden = true;

  const known = findByIsbn(isbn);
  if (known) {
    const { series, vol } = known;
    if (series.owned[vol - 1]) {
      setScanStatus(`Already on your shelf: ${series.title}, volume ${vol}.`);
    } else {
      setScanStatus(`You scanned this one before: ${series.title}, volume ${vol}.`);
      showConfirm({ series, vol });
    }
    return;
  }

  setScanStatus("Looking it up…");
  const { info, trail } = await lookupIsbn(isbn);
  if (seq !== scanSeq || !scanner.open) return; // closed or scanned something else meanwhile

  if (!info) {
    setScanStatus(`Couldn't find this book online (${trail.join("; ")}). Choose the series and volume yourself.`);
    showConfirm({ series: null, newName: "", vol: null });
    return;
  }
  currentCover = info.cover || null;
  if (!currentCover) {
    setScanStatus("Looking for the cover…");
    currentCover = await findCover(isbn);
    if (seq !== scanSeq || !scanner.open) return;
  }
  const series = guessSeries(info.title);
  setScanStatus(`Found: ${info.title} (${info.source}${info.unverified ? ", not fully verified" : ""})`);
  showConfirm({
    series,
    newName: series ? "" : cleanSeriesName(info.title),
    vol: guessVolume(info.title)
  });
}

document.getElementById("scan-confirm").onsubmit = e => {
  e.preventDefault();
  if (!currentIsbn) return;

  const vol = parseInt(volumeInput.value, 10);
  let s;
  if (seriesSelect.value === "") {
    setScanStatus("Choose a series, or pick New series.");
    seriesSelect.focus();
    return;
  }
  if (!(vol >= 1 && vol <= 999)) {
    setScanStatus("Enter a volume number between 1 and 999.");
    volumeInput.focus();
    return;
  }
  if (seriesSelect.value === "new") {
    const name = newNameInput.value.trim();
    if (!name) {
      setScanStatus("Enter the series name.");
      newNameInput.focus();
      return;
    }
    s = data.find(x => normalize(x.title) === normalize(name));
    if (!s) { s = { title: name, owned: [], read: [], isbns: {} }; data.push(s); }
  } else {
    s = data[Number(seriesSelect.value)];
    if (!s || s.title !== seriesSelect.selectedOptions[0].dataset.title) {
      setScanStatus("Your collection changed while you were scanning. Scan the book again.");
      document.getElementById("scan-confirm").hidden = true;
      return;
    }
  }

  while (s.owned.length < vol) { s.owned.push(false); s.read.push(false); }
  s.owned[vol - 1] = true;
  data.forEach(x => { if (x.isbns) delete x.isbns[currentIsbn]; }); // an ISBN belongs to one volume only
  s.isbns = s.isbns || {};
  s.isbns[currentIsbn] = vol;
  if (currentCover && (!s.cover || vol === 1)) s.cover = currentCover; // volume 1 makes the best series picture
  openSeries.add(s.title); // the series you just scanned into stays open behind the scanner
  saveOpen();
  save();

  autoCover(s); // no cover from the barcode: try the series name
  document.getElementById("scan-saved").textContent = `Added: ${s.title}, volume ${vol}`;
  startScanner(); // ready for the next book
};

document.getElementById("find-covers").onclick = async () => {
  const status = document.getElementById("covers-status");
  const button = document.getElementById("find-covers");
  const todo = data.filter(s => !safeCover(s.cover) && !s.noCover);
  if (!todo.length) { status.textContent = "Every series already has a cover."; return; }
  button.disabled = true;
  let found = 0;
  for (const [i, s] of todo.entries()) {
    status.textContent = `Looking up covers… ${i + 1} of ${todo.length}`;
    const url = await findSeriesCover(s);
    if (url && data.includes(s) && !safeCover(s.cover)) { s.cover = url; found++; }
  }
  button.disabled = false;
  status.textContent = `Found ${found} of ${todo.length}. Use Options > Remove cover on any that looks wrong.`;
  if (found) save();
};

showAuth();
render();
