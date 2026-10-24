"use strict";

/* ============================================================
 * THÈME CLAIR / SOMBRE
 *
 * Un seul <svg> dont on remplace le contenu : jamais deux symboles
 * affichés en même temps. L'application initiale du thème est faite
 * par un <script> inline dans le <head> (avant le premier paint) ;
 * ici on ne fait que synchroniser l'icône et les attributs ARIA.
 * ============================================================ */

const THEME_KEY = "panneaux-theme";

const SUN_ICON =
  '<circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<g stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>' +
  '<line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/>' +
  '<line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>' +
  '<line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></g>';

const MOON_ICON = '<path fill="currentColor" d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>';

const THEME_COLOR = { light: "#ffffff", dark: "#1c1c1e" };

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (err) {
    return null;
  }
}

function setStoredTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (err) {
    /* navigation privée / stockage plein : on ignore */
  }
}

function getSystemTheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch (err) {
    return "light";
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;

  const toggle = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  if (toggle && icon) {
    toggle.setAttribute("aria-pressed", String(theme === "dark"));
    icon.innerHTML = theme === "dark" ? MOON_ICON : SUN_ICON;
  }

  // Barre d'adresse du navigateur (Safari iOS, Chrome Android).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme] || THEME_COLOR.light);
}

document.getElementById("themeToggle").addEventListener("click", (event) => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  setStoredTheme(next);
  applyTheme(next);
  // Retire le focus après activation : sinon le bouton le garde et un
  // Espace ultérieur (même destiné à faire défiler la page) le rebascule.
  event.currentTarget.blur();
});

// Le script inline du <head> a déjà posé data-theme pour éviter le FOUC.
// Ici on refait le calcul complet (icône + ARIA + theme-color).
applyTheme(getStoredTheme() || getSystemTheme());

/* ============================================================
 * ÉCRANS
 * ============================================================ */

const screens = {
  home: document.getElementById("screen-home"),
  quizFind: document.getElementById("screen-quiz-find"),
  endFind: document.getElementById("screen-end-find"),
  quizText: document.getElementById("screen-quiz-text"),
  endText: document.getElementById("screen-end-text"),
  course: document.getElementById("screen-course"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => (el.hidden = true));
  screens[name].hidden = false;
  // Le mode « trouve le panneau » utilise plus de largeur pour des panneaux plus grands.
  document.body.classList.toggle("wide-find", name === "quizFind");
  window.scrollTo(0, 0);
}

// Tous les boutons « Retour à l'accueil » du jeu, en un seul endroit.
// Aucun nettoyage d'état nécessaire : chaque mode réinitialise son propre
// state au prochain démarrage.
[
  "btnHomeFromQuizFind",
  "btnHomeFromQuizText",
  "btnHomeFromEndFind",
  "btnHomeFromEndText",
  "btnHomeFromCourse",
].forEach((id) => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener("click", () => showScreen("home"));
});

/* ============================================================
 * IMAGES DES PANNEAUX (Wikimedia Commons API)
 *
 * Une requête par panneau = 200+ requêtes simultanées = rate limit 429
 * (qui se manifeste comme une erreur CORS trompeuse dans la console).
 * On précharge tout en lots de 50 titres, et on met le résultat en cache
 * 30 jours dans localStorage avec une signature de signs.js pour
 * invalider automatiquement quand la base change.
 * ============================================================ */

const imageUrlCache = new Map();
const WIKI_BATCH_SIZE = 50;
const IMAGE_CACHE_KEY = "panneaux-image-cache-v3";
const IMAGE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function computeSignsSignature() {
  return SIGNS.map((s) => `${s.code}:${s.file || ""}`).join("|");
}

function loadCachedImages() {
  try {
    const raw = localStorage.getItem(IMAGE_CACHE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.timestamp !== "number" || !parsed.data) return false;
    if (Date.now() - parsed.timestamp > IMAGE_CACHE_TTL_MS) return false;
    if (parsed.signature !== computeSignsSignature()) return false;

    Object.entries(parsed.data).forEach(([code, url]) => imageUrlCache.set(code, url));
    // Un cache sans aucune URL a été produit par un échec réseau : on l'ignore.
    return SIGNS.every((s) => imageUrlCache.has(s.code)) && SIGNS.some((s) => imageUrlCache.get(s.code));
  } catch (err) {
    return false;
  }
}

function saveCachedImages() {
  try {
    const data = {};
    imageUrlCache.forEach((url, code) => {
      data[code] = url;
    });
    localStorage.removeItem("panneaux-image-cache-v2");
    localStorage.setItem(
      IMAGE_CACHE_KEY,
      JSON.stringify({ timestamp: Date.now(), signature: computeSignsSignature(), data })
    );
  } catch (err) {
    /* stockage plein ou indisponible : on ignore, ça retentera */
  }
}

async function fetchImageBatch(signsBatch) {
  const titles = signsBatch.map((s) => `File:${s.file || "France road sign " + s.code + ".svg"}`);
  const endpoint =
    "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(titles.join("|")) +
    "&prop=imageinfo&iiprop=url&format=json&origin=*";

  try {
    const res = await fetch(endpoint);
    if (!res.ok) return false;
    const data = await res.json();
    const query = data.query;
    if (!query || !query.pages) return false;

    // L'API peut renvoyer un titre canonique différent de celui envoyé
    // (underscores → espaces, première lettre capitalisée). Le mapping
    // from→to est exposé dans query.normalized ; on l'inverse pour
    // retrouver le titre d'origine à partir du titre de la page.
    const normalizedToOriginal = new Map();
    if (Array.isArray(query.normalized)) {
      query.normalized.forEach((n) => normalizedToOriginal.set(n.to, n.from));
    }

    Object.values(query.pages).forEach((page) => {
      if (typeof page.title !== "string") return;
      const originalTitle = normalizedToOriginal.get(page.title) || page.title;

      const sign = signsBatch.find((s) => {
        const expected = `File:${s.file || "France road sign " + s.code + ".svg"}`;
        return originalTitle.replace(/_/g, " ") === expected.replace(/_/g, " ");
      });
      if (!sign) return;

      if ("missing" in page || !page.imageinfo || !page.imageinfo[0]) {
        imageUrlCache.set(sign.code, null);
      } else {
        imageUrlCache.set(sign.code, page.imageinfo[0].url);
      }
    });
    return true;
  } catch (err) {
    // Erreur réseau : signalée à l'appelant pour ne pas mettre un résultat partiel en cache.
    return false;
  }
}

// false si au moins un lot a échoué : on retentera au prochain lancement d'un mode.
let preloadOk = true;

async function preloadAllSignImages() {
  if (loadCachedImages()) {
    preloadOk = true;
    return;
  }

  imageUrlCache.clear();
  let allOk = true;
  for (let i = 0; i < SIGNS.length; i += WIKI_BATCH_SIZE) {
    const ok = await fetchImageBatch(SIGNS.slice(i, i + WIKI_BATCH_SIZE));
    allOk = allOk && ok;
  }

  // Tout code non résolu par l'API est marqué comme absent pour la session,
  // mais on ne persiste JAMAIS un résultat issu d'un échec réseau.
  SIGNS.forEach((s) => {
    if (!imageUrlCache.has(s.code)) imageUrlCache.set(s.code, null);
  });
  preloadOk = allOk;
  if (allOk) saveCachedImages();
}

// Lancé au chargement ; tout le reste du jeu attend cette promesse.
let preloadPromise = preloadAllSignImages();

// À appeler au début de chaque mode : si le chargement a échoué, on réessaie.
async function ensureImages() {
  await preloadPromise;
  if (!preloadOk) {
    preloadPromise = preloadAllSignImages();
    await preloadPromise;
  }
}

async function fetchSignImageUrl(code) {
  if (imageUrlCache.has(code)) return imageUrlCache.get(code);
  await preloadPromise;
  return imageUrlCache.get(code) || null;
}

/* ============================================================
 * UTILITAIRES
 * ============================================================ */

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Normalise pour comparer : sans accents, apostrophes typographiques ramenées
// à « ' », minuscules, espaces simplifiés.
function norm(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Affiche le bouton « suivant » à l'écran et lui donne le focus : Entrée (ou
// Espace) suffit alors pour enchaîner. Le scroll sert de filet de sécurité
// avec un layout resserré, une fenêtre très basse ou un zoom élevé.
function revealButton(btn) {
  btn.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    btn.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  });
}

// Message de fin pour un mode infini, en fonction de la longueur de la série.
function commentForStreak(streak) {
  if (streak === 0) return "Raté dès la première question. Ça arrive !";
  if (streak < 5) return "Petite série. Retente, tu vas plus loin.";
  if (streak < 10) return "Pas mal, tu progresses.";
  if (streak < 20) return "Belle série !";
  return "Impressionnant, tu maîtrises.";
}

/* ============================================================
 * LOGIQUE COMMUNE AUX DEUX MODES DE JEU
 *
 * Chaque mode existe en deux variantes :
 *   "short"    : 10 panneaux, score sur 10, une erreur ne stoppe pas la partie ;
 *   "infinite" : on enchaîne jusqu'à la première erreur (record sauvegardé).
 * ============================================================ */

const SHORT_TOTAL = 10;
const RECORD_KEYS = { find: "panneaux-record-find", text: "panneaux-record-text" };

function getRecord(key) {
  try {
    return parseInt(localStorage.getItem(key), 10) || 0;
  } catch (err) {
    return 0;
  }
}

function setRecord(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (err) {
    /* stockage indisponible : on ignore */
  }
}

function headerLabels(st) {
  return st.mode === "short"
    ? { counter: `Panneau ${st.qIndex} / ${SHORT_TOTAL}`, score: `Score : ${st.score}` }
    : { counter: `Panneau ${st.qIndex}`, score: `Série : ${st.score}` };
}

// Enregistre la réponse et décide si la partie s'arrête juste après.
function applyAnswer(st, correct) {
  if (correct) st.score += 1;
  const lastOfShort = st.mode === "short" && st.qIndex >= SHORT_TOTAL;
  st.forceEnd = lastOfShort || (st.mode === "infinite" && !correct);
}

function commentForScore(pct) {
  if (pct === 1) return "Sans faute. Tu connais tes panneaux sur le bout des doigts.";
  if (pct >= 0.8) return "Très solide, encore quelques révisions et c'est parfait.";
  if (pct >= 0.5) return "Pas mal, mais il reste des panneaux à revoir.";
  return "Ça mérite une bonne session de révision, retente ta chance.";
}

function fillEndScreen(st, ids, recordKey) {
  const title = document.getElementById(ids.title);
  const score = document.getElementById(ids.score);
  const comment = document.getElementById(ids.comment);

  if (st.mode === "short") {
    title.textContent = "Résultat";
    score.textContent = `${st.score} / ${SHORT_TOTAL}`;
    comment.textContent = commentForScore(st.score / SHORT_TOTAL);
    return;
  }

  const best = getRecord(recordKey);
  const isRecord = st.score > best;
  if (isRecord) setRecord(recordKey, st.score);

  let suffix = "";
  if (isRecord) suffix = " Nouveau record !";
  else if (best > 0) suffix = ` Record : ${best}.`;

  title.textContent = "Série terminée";
  score.textContent =
    st.score <= 1 ? `${st.score} panneau identifié` : `${st.score} panneaux identifiés`;
  comment.textContent = commentForStreak(st.score) + suffix;
}

/* ============================================================
 * MODE « TROUVE LE PANNEAU » (signification -> panneau dans la grille)
 * ============================================================ */

const SIGN_BY_CODE = new Map(SIGNS.map((s) => [s.code, s]));

const findState = {
  mode: "short",
  score: 0,
  qIndex: 0,
  locked: false,
  pool: [],
  queue: [],
  current: null,
  gridBuilt: false,
  forceEnd: false,
};

const elFind = {
  wrap: document.getElementById("findGridWrap"),
  loading: document.getElementById("findGridLoading"),
  grid: document.getElementById("signGrid"),
  prompt: document.getElementById("findPrompt"),
  counter: document.getElementById("findQuestionCounter"),
  score: document.getElementById("findScoreCounter"),
  btnNext: document.getElementById("btnFindNext"),
};

// Construit la grille une seule fois, dans l'ordre de SIGNS. Les panneaux
// sans image disponible sont simplement absents et ne seront jamais tirés.
async function buildSignGrid() {
  if (findState.gridBuilt) return;
  elFind.loading.hidden = false;
  elFind.grid.hidden = true;
  elFind.grid.innerHTML = "";
  findState.pool = [];

  const urls = await Promise.all(SIGNS.map((s) => fetchSignImageUrl(s.code)));

  SIGNS.forEach((sign, i) => {
    const url = urls[i];
    if (!url) return;

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "sign-grid-item";
    cell.dataset.code = sign.code;

    const img = document.createElement("img");
    img.src = url;
    img.alt = sign.code;
    img.loading = "lazy";
    img.draggable = false;
    cell.appendChild(img);

    cell.addEventListener("click", () => {
      handleFindAnswer(cell, sign);
    });
    cell.addEventListener("contextmenu", (e) => e.preventDefault());

    elFind.grid.appendChild(cell);
    findState.pool.push(sign);
  });

  elFind.loading.hidden = true;
  elFind.grid.hidden = false;
  // Une grille vide ou construite sur un chargement partiel sera reconstruite
  // au prochain lancement du mode.
  findState.gridBuilt = findState.pool.length > 0 && preloadOk;
}

async function startFindGame(mode) {
  findState.mode = mode;
  findState.score = 0;
  findState.qIndex = 0;
  findState.locked = false;
  findState.forceEnd = false;
  elFind.btnNext.hidden = true;
  showScreen("quizFind");
  elFind.prompt.textContent = "Chargement des panneaux…";
  await ensureImages();
  await buildSignGrid();

  if (findState.pool.length === 0) {
    elFind.prompt.textContent =
      "Impossible de charger les panneaux. Vérifie ta connexion, puis reviens à l'accueil et relance le mode.";
    return;
  }

  findState.queue = shuffle(findState.pool);
  nextFindQuestion();
}

function nextFindQuestion() {
  findState.locked = false;
  findState.forceEnd = false;
  elFind.btnNext.hidden = true;

  Array.from(elFind.grid.children).forEach((cell) => {
    cell.classList.remove("is-correct", "is-wrong", "is-muted");
    cell.disabled = false;
  });

  if (findState.queue.length === 0) findState.queue = shuffle(findState.pool);
  const sign = findState.queue.shift();
  findState.current = sign;
  findState.qIndex += 1;

  const labels = headerLabels(findState);
  elFind.counter.textContent = labels.counter;
  elFind.score.textContent = labels.score;
  elFind.prompt.textContent = `Retrouve le panneau : ${sign.meaning}`;
}

function handleFindAnswer(cell, sign) {
  if (findState.locked) return;
  findState.locked = true;

  const correctMeaning = findState.current.meaning;
  const isCorrect = sign.meaning === correctMeaning;

  Array.from(elFind.grid.children).forEach((c) => {
    c.disabled = true;
    const cSign = SIGN_BY_CODE.get(c.dataset.code);
    if (cSign && cSign.meaning === correctMeaning) {
      // Tout panneau partageant la même signification (ex. vache/mouton
      // pour « Passage d'animaux domestiques ») compte comme bonne réponse.
      c.classList.add("is-correct");
    } else if (c === cell) {
      c.classList.add("is-wrong");
    } else {
      c.classList.add("is-muted");
    }
  });

  applyAnswer(findState, isCorrect);
  elFind.score.textContent = headerLabels(findState).score;
  elFind.btnNext.textContent = findState.forceEnd ? "Voir le résultat" : "Panneau suivant";
  elFind.btnNext.hidden = false;
  revealButton(elFind.btnNext);
}

function endFind() {
  fillEndScreen(
    findState,
    { title: "findEndTitle", score: "findEndScore", comment: "findEndComment" },
    RECORD_KEYS.find
  );
  showScreen("endFind");
}

elFind.btnNext.addEventListener("click", () => {
  if (findState.forceEnd) return endFind();
  nextFindQuestion();
});

document.getElementById("btnStartFindShort").addEventListener("click", () => startFindGame("short"));
document.getElementById("btnStartFindInfinite").addEventListener("click", () => startFindGame("infinite"));
document.getElementById("btnRetryFind").addEventListener("click", () => startFindGame(findState.mode));

/* ============================================================
 * MODE « TROUVE LE NOM » (panneau -> signification tapée)
 * ============================================================ */

const ALL_MEANINGS = Array.from(new Set(SIGNS.map((s) => s.meaning)));
const NORM_MEANINGS = ALL_MEANINGS.map((m) => ({ text: m, key: norm(m) }));

// Les suffixes « (danger) », « (indication) », « (temporaire) » ne servent qu'à
// distinguer deux panneaux de même nom : on accepte la réponse sans eux.
const TAG_SUFFIX = /\s*\((danger|indication|temporaire)\)\s*$/;

const textState = {
  mode: "short",
  score: 0,
  qIndex: 0,
  locked: false,
  queue: [],
  current: null,
  forceEnd: false,
};

const elText = {
  frame: document.getElementById("textSignFrame"),
  loading: document.getElementById("textSignLoading"),
  image: document.getElementById("textSignImage"),
  counter: document.getElementById("textQuestionCounter"),
  score: document.getElementById("textScoreCounter"),
  input: document.getElementById("textAnswerInput"),
  suggestions: document.getElementById("textSuggestions"),
  feedback: document.getElementById("textFeedback"),
  btnNext: document.getElementById("btnTextNext"),
};

function startTextGame(mode) {
  textState.mode = mode;
  textState.score = 0;
  textState.qIndex = 0;
  textState.locked = false;
  textState.forceEnd = false;
  textState.queue = shuffle(SIGNS);
  showScreen("quizText");
  nextTextQuestion();
}

async function nextTextQuestion() {
  textState.locked = false;
  textState.forceEnd = false;
  elText.btnNext.hidden = true;
  elText.feedback.hidden = true;
  elText.input.value = "";
  elText.input.disabled = false;
  closeTextSuggestions();

  await ensureImages();

  let sign = null;
  let imageUrl = null;
  let attempts = 0;
  const maxAttempts = SIGNS.length * 2;

  while (sign === null) {
    attempts += 1;
    if (attempts > maxAttempts) {
      elText.loading.hidden = false;
      elText.loading.textContent =
        "Impossible de charger les images des panneaux. Vérifie ta connexion, puis reviens à l'accueil et relance le mode.";
      elText.image.hidden = true;
      return;
    }
    if (textState.queue.length === 0) textState.queue = shuffle(SIGNS);
    const candidate = textState.queue.shift();
    const url = await fetchSignImageUrl(candidate.code);
    if (url) {
      sign = candidate;
      imageUrl = url;
    }
  }

  textState.current = sign;
  textState.qIndex += 1;
  const labels = headerLabels(textState);
  elText.counter.textContent = labels.counter;
  elText.score.textContent = labels.score;

  elText.loading.textContent = "chargement…";
  elText.image.hidden = true;
  elText.loading.hidden = false;
  elText.image.alt = "Panneau à identifier";
  elText.image.onload = () => {
    elText.loading.hidden = true;
    elText.image.hidden = false;
  };
  elText.image.onerror = () => {
    elText.loading.hidden = false;
    elText.loading.textContent = "Image indisponible";
    elText.image.hidden = true;
  };
  elText.image.src = imageUrl;

  elText.input.focus();
}

// Navigation clavier dans les suggestions : le focus reste dans le champ,
// l'élément en surbrillance est annoncé via aria-activedescendant.
let textActive = -1;

elText.input.setAttribute("role", "combobox");
elText.input.setAttribute("aria-autocomplete", "list");
elText.input.setAttribute("aria-controls", "textSuggestions");
elText.input.setAttribute("aria-expanded", "false");

function setTextActive(index) {
  const items = Array.from(elText.suggestions.children);
  items.forEach((item, i) => {
    const on = i === index;
    item.classList.toggle("is-active", on);
    item.setAttribute("aria-selected", String(on));
  });
  textActive = index;
  if (index >= 0 && items[index]) {
    elText.input.setAttribute("aria-activedescendant", items[index].id);
    items[index].scrollIntoView({ block: "nearest" });
  } else {
    elText.input.removeAttribute("aria-activedescendant");
  }
}

function closeTextSuggestions() {
  elText.suggestions.hidden = true;
  elText.suggestions.innerHTML = "";
  textActive = -1;
  elText.input.setAttribute("aria-expanded", "false");
  elText.input.removeAttribute("aria-activedescendant");
}

elText.input.addEventListener("input", () => {
  const query = norm(elText.input.value);
  if (query.length < 3) return closeTextSuggestions();

  const matches = NORM_MEANINGS.filter((m) => m.key.includes(query))
    .slice(0, 6)
    .map((m) => m.text);
  closeTextSuggestions();
  if (matches.length === 0) return;

  matches.forEach((m, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "text-suggestion-item";
    item.id = `textSuggestion${i}`;
    item.tabIndex = -1; // le focus reste dans le champ
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.textContent = m;
    item.addEventListener("click", () => {
      elText.input.value = m;
      closeTextSuggestions();
      submitTextAnswer(m);
    });
    elText.suggestions.appendChild(item);
  });
  elText.suggestions.hidden = false;
  elText.input.setAttribute("aria-expanded", "true");
});

elText.input.addEventListener("keydown", (e) => {
  const items = elText.suggestions.children;
  const isOpen = !elText.suggestions.hidden && items.length > 0;

  if (e.key === "ArrowDown" && isOpen) {
    e.preventDefault();
    setTextActive((textActive + 1) % items.length);
  } else if (e.key === "ArrowUp" && isOpen) {
    e.preventDefault();
    setTextActive(textActive <= 0 ? items.length - 1 : textActive - 1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    // Une suggestion en surbrillance est choisie ; sinon on valide le texte tapé.
    if (isOpen && textActive >= 0) {
      const chosen = items[textActive].textContent;
      elText.input.value = chosen;
      closeTextSuggestions();
      submitTextAnswer(chosen);
    } else {
      submitTextAnswer(elText.input.value);
    }
  } else if (e.key === "Escape") {
    closeTextSuggestions();
  }
});

// Ferme le menu de suggestions quand on clique en dehors de la zone de
// saisie (l'input + le menu sont dans le même wrapper .text-answer).
document.addEventListener("click", (e) => {
  if (elText.suggestions.hidden) return;
  if (!e.target.closest(".text-answer")) closeTextSuggestions();
});

function submitTextAnswer(value) {
  if (textState.locked || !textState.current) return;
  if (!norm(value)) return; // un champ vide ne doit pas coûter une série
  textState.locked = true;
  closeTextSuggestions();
  elText.input.disabled = true;

  const meaning = textState.current.meaning;
  const answer = norm(value);
  const correct = answer === norm(meaning) || answer === norm(meaning.replace(TAG_SUFFIX, ""));

  applyAnswer(textState, correct);

  elText.feedback.hidden = false;
  elText.feedback.textContent = correct ? `Exact : ${meaning}` : `Raté. Réponse : ${meaning}`;
  elText.feedback.className = "text-feedback " + (correct ? "is-correct" : "is-wrong");
  elText.score.textContent = headerLabels(textState).score;
  elText.btnNext.textContent = textState.forceEnd ? "Voir le résultat" : "Panneau suivant";
  elText.btnNext.hidden = false;
  revealButton(elText.btnNext);
}

function endText() {
  fillEndScreen(
    textState,
    { title: "textEndTitle", score: "textEndScore", comment: "textEndComment" },
    RECORD_KEYS.text
  );
  showScreen("endText");
}

elText.btnNext.addEventListener("click", () => {
  if (textState.forceEnd) return endText();
  nextTextQuestion();
});

document.getElementById("btnStartTextShort").addEventListener("click", () => startTextGame("short"));
document.getElementById("btnStartTextInfinite").addEventListener("click", () => startTextGame("infinite"));
document.getElementById("btnRetryText").addEventListener("click", () => startTextGame(textState.mode));

/* ============================================================
 * COURS — TOUS LES PANNEAUX (consultation libre, par catégorie)
 * ============================================================ */

const CAT_ORDER = [
  "danger",
  "priorite",
  "interdiction",
  "obligation",
  "fin",
  "zone",
  "indication",
  "service",
  "temporaire",
];

const CAT_LABELS = {
  danger: "Danger",
  priorite: "Intersections et priorité",
  interdiction: "Interdiction",
  obligation: "Obligation",
  fin: "Fin d'interdiction ou d'obligation",
  zone: "Prescription zonale",
  indication: "Indication",
  service: "Service",
  temporaire: "Signalisation temporaire (chantiers, accidents)",
};

const courseState = {
  built: false,
  items: [], // { sign, url }
  activeCat: "all",
  query: "",
};

const elCourse = {
  loading: document.getElementById("courseLoading"),
  list: document.getElementById("courseList"),
  empty: document.getElementById("courseEmpty"),
  search: document.getElementById("courseSearch"),
  filters: document.getElementById("courseFilters"),
  count: document.getElementById("courseCount"),
};

async function buildCourseView() {
  if (courseState.built) return;
  elCourse.loading.hidden = false;
  elCourse.loading.textContent = "Chargement des panneaux…";
  elCourse.list.hidden = true;
  elCourse.empty.hidden = true;

  await ensureImages();
  const urls = await Promise.all(SIGNS.map((s) => fetchSignImageUrl(s.code)));
  courseState.items = [];
  SIGNS.forEach((sign, i) => {
    if (urls[i]) courseState.items.push({ sign, url: urls[i] });
  });

  elCourse.count.textContent = courseState.items.length;

  if (courseState.items.length === 0) {
    elCourse.loading.textContent =
      "Impossible de charger les panneaux. Vérifie ta connexion et réessaie.";
    return;
  }

  buildCourseFilters();
  renderCourseList();

  elCourse.loading.hidden = true;
  elCourse.list.hidden = false;
  courseState.built = preloadOk;
}

function buildCourseFilters() {
  const presentCats = CAT_ORDER.filter((cat) => courseState.items.some((it) => it.sign.cat === cat));
  elCourse.filters.innerHTML = "";

  function makeChip(value, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-chip" + (courseState.activeCat === value ? " is-active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      courseState.activeCat = value;
      Array.from(elCourse.filters.children).forEach((c) => c.classList.remove("is-active"));
      btn.classList.add("is-active");
      renderCourseList();
    });
    elCourse.filters.appendChild(btn);
  }

  makeChip("all", "Tous");
  presentCats.forEach((cat) => makeChip(cat, CAT_LABELS[cat] || cat));
}

function renderCourseList() {
  const query = norm(courseState.query);

  const filtered = courseState.items.filter(({ sign }) => {
    if (courseState.activeCat !== "all" && sign.cat !== courseState.activeCat) return false;
    if (
      query &&
      !norm(sign.meaning).includes(query) &&
      !norm(sign.code).includes(query)
    ) {
      return false;
    }
    return true;
  });

  elCourse.list.innerHTML = "";

  if (filtered.length === 0) {
    elCourse.empty.hidden = false;
    elCourse.list.hidden = true;
    return;
  }
  elCourse.empty.hidden = true;
  elCourse.list.hidden = false;

  const groups = new Map();
  filtered.forEach((item) => {
    const cat = item.sign.cat;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(item);
  });

  CAT_ORDER.filter((cat) => groups.has(cat)).forEach((cat) => {
    const section = document.createElement("div");
    section.className = "course-group";

    const title = document.createElement("h3");
    title.className = "course-group-title";
    title.textContent = `${CAT_LABELS[cat] || cat} (${groups.get(cat).length})`;
    section.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "course-grid";
    groups.get(cat).forEach(({ sign, url }) => {
      const cell = document.createElement("div");
      cell.className = "course-item";

      const img = document.createElement("img");
      img.src = url;
      img.alt = sign.meaning;
      img.loading = "lazy";
      img.draggable = false;

      const meaning = document.createElement("span");
      meaning.className = "course-item-meaning";
      meaning.textContent = sign.meaning;

      const code = document.createElement("span");
      code.className = "course-item-code";
      code.textContent = sign.code;

      cell.appendChild(img);
      cell.appendChild(meaning);
      cell.appendChild(code);
      grid.appendChild(cell);
    });

    section.appendChild(grid);
    elCourse.list.appendChild(section);
  });
}

const renderCourseListDebounced = debounce(renderCourseList, 150);

elCourse.search.addEventListener("input", () => {
  courseState.query = elCourse.search.value;
  renderCourseListDebounced();
});

document.getElementById("btnStartCourse").addEventListener("click", async () => {
  showScreen("course");
  await buildCourseView();
});

/* ============================================================
 * EASTER EGG — Konami code (↑ ↑ ↓ ↓ ← → ← →)
 * Ouvre une fenêtre avec une vidéo YouTube lancée automatiquement.
 * ============================================================ */

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight"];
const EGG_VIDEO_URL = "https://www.youtube-nocookie.com/embed/-i_TnZw9dYU?autoplay=1&rel=0";

const elEgg = {
  modal: document.getElementById("eggModal"),
  video: document.getElementById("eggVideo"),
  close: document.getElementById("eggClose"),
};
let konamiPos = 0;
let eggPreviousFocus = null;

function openEgg() {
  eggPreviousFocus = document.activeElement;
  const frame = document.createElement("iframe");
  frame.src = EGG_VIDEO_URL;
  frame.title = "Vidéo surprise";
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  elEgg.video.innerHTML = "";
  elEgg.video.appendChild(frame);
  elEgg.modal.hidden = false;
  elEgg.close.focus();
}

function closeEgg() {
  elEgg.modal.hidden = true;
  elEgg.video.innerHTML = ""; // détruit l'iframe : la vidéo s'arrête
  if (eggPreviousFocus && eggPreviousFocus.focus) eggPreviousFocus.focus();
}

elEgg.close.addEventListener("click", closeEgg);
elEgg.modal.addEventListener("click", (e) => {
  if (e.target === elEgg.modal) closeEgg(); // clic sur le fond
});

document.addEventListener("keydown", (e) => {
  if (!elEgg.modal.hidden) {
    if (e.key === "Escape") closeEgg();
    return;
  }

  // Easter egg limité à l'écran d'accueil
  if (screens.home.hidden) {
    konamiPos = 0;
    return;
  }

  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === KONAMI[konamiPos]) {
    konamiPos += 1;
    if (konamiPos === KONAMI.length) {
      konamiPos = 0;
      openEgg();
    }
  } else {
    konamiPos = key === KONAMI[0] ? 1 : 0;
  }
});

/* ============================================================
 * INIT
 * ============================================================ */

showScreen("home");
