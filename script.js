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
  quiz: document.getElementById("screen-quiz"),
  endQcm: document.getElementById("screen-end-qcm"),
  endInfinite: document.getElementById("screen-end-infinite"),
  quizText: document.getElementById("screen-quiz-text"),
  endInfiniteText: document.getElementById("screen-end-infinite-text"),
  quizFind: document.getElementById("screen-quiz-find"),
  endInfiniteFind: document.getElementById("screen-end-infinite-find"),
  course: document.getElementById("screen-course"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => (el.hidden = true));
  screens[name].hidden = false;
  window.scrollTo(0, 0);
}

// Tous les boutons « Retour à l'accueil » du jeu, en un seul endroit.
// Aucun nettoyage d'état nécessaire : chaque mode réinitialise son propre
// state au prochain démarrage.
[
  "btnHomeFromQuiz",
  "btnHomeFromQuizText",
  "btnHomeFromQuizFind",
  "btnHomeFromQcm",
  "btnHomeFromInfinite",
  "btnHomeFromInfiniteText",
  "btnHomeFromInfiniteFind",
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
const IMAGE_CACHE_KEY = "panneaux-image-cache-v2";
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
    return SIGNS.every((s) => imageUrlCache.has(s.code));
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
    const data = await res.json();
    const query = data.query;
    if (!query || !query.pages) return;

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
  } catch (err) {
    /* erreur réseau : le code appelant retombera sur un autre panneau */
  }
}

async function preloadAllSignImages() {
  if (loadCachedImages()) return;

  imageUrlCache.clear();
  for (let i = 0; i < SIGNS.length; i += WIKI_BATCH_SIZE) {
    await fetchImageBatch(SIGNS.slice(i, i + WIKI_BATCH_SIZE));
  }

  // Tout code non résolu par l'API est marqué explicitement comme absent,
  // pour ne jamais être retenté en boucle à chaque question.
  SIGNS.forEach((s) => {
    if (!imageUrlCache.has(s.code)) imageUrlCache.set(s.code, null);
  });
  saveCachedImages();
}

// Lancé une seule fois ; tout le reste du jeu attend cette promesse.
const preloadPromise = preloadAllSignImages();

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

// Exclut les panneaux qui partagent la même signification que la bonne
// réponse : sans ça, le QCM peut afficher deux boutons identiques (ex.
// A15a1 et A15a2 « Passage d'animaux domestiques ») dont un seul est
// marqué correct.
function pickDistractors(sign, count) {
  const isUsable = (s) => s.code !== sign.code && s.meaning !== sign.meaning;
  const sameCat = shuffle(SIGNS.filter((s) => s.cat === sign.cat && isUsable(s)));
  const otherCat = shuffle(SIGNS.filter((s) => s.cat !== sign.cat && isUsable(s)));
  return sameCat.concat(otherCat).slice(0, count);
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Filet de sécurité : avec un layout resserré, une fenêtre très basse, un
// zoom élevé ou une barre d'outils/webcam qui déborde, le bouton « suivant »
// peut être hors de la vue quand il s'affiche.
function revealButton(btn) {
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
 * MODE QCM — 20 QUESTIONS ET MODE INFINI (panneau -> 4 propositions)
 * ============================================================ */

const state = {
  mode: null, // "qcm" | "infinite"
  queue: [],
  score: 0,
  streak: 0,
  qIndex: 0,
  total: 20,
  locked: false,
  forceEnd: false,
};

const el = {
  progressTrack: document.getElementById("progressTrack"),
  progressFill: document.getElementById("progressFill"),
  questionCounter: document.getElementById("questionCounter"),
  scoreCounter: document.getElementById("scoreCounter"),
  signFrame: document.getElementById("signFrame"),
  signLoading: document.getElementById("signLoading"),
  signImage: document.getElementById("signImage"),
  optionsList: document.getElementById("optionsList"),
  btnNext: document.getElementById("btnNext"),
};

function startGame(mode) {
  state.mode = mode;
  state.queue = shuffle(SIGNS);
  state.score = 0;
  state.streak = 0;
  state.qIndex = 0;
  state.total = mode === "qcm" ? 20 : Infinity;
  state.locked = false;
  state.forceEnd = false;
  el.progressTrack.style.visibility = mode === "qcm" ? "visible" : "hidden";
  showScreen("quiz");
  nextQuestion();
}

async function nextQuestion() {
  state.locked = false;
  state.forceEnd = false;
  el.btnNext.hidden = true;

  if (state.mode === "qcm" && state.qIndex >= state.total) {
    return endQcm();
  }

  // Pioche un panneau dont l'image est disponible ; sinon on essaie le suivant.
  let sign = null;
  let imageUrl = null;
  let attempts = 0;
  const maxAttempts = SIGNS.length * 2; // garde-fou si l'API est indisponible

  while (sign === null) {
    attempts += 1;
    if (attempts > maxAttempts) {
      el.signLoading.hidden = false;
      el.signLoading.textContent =
        "Impossible de charger les images des panneaux. Vérifie ta connexion et réessaie.";
      el.signImage.hidden = true;
      return;
    }
    if (state.queue.length === 0) state.queue = shuffle(SIGNS);
    const candidate = state.queue.shift();
    const url = await fetchSignImageUrl(candidate.code);
    if (url) {
      sign = candidate;
      imageUrl = url;
    }
  }

  renderQuestion(sign, imageUrl);
}

function renderQuestion(sign, imageUrl) {
  state.qIndex += 1;

  if (state.mode === "qcm") {
    el.questionCounter.textContent = `Question ${state.qIndex} / ${state.total}`;
    el.scoreCounter.textContent = `Score : ${state.score}`;
    el.progressFill.style.width = `${((state.qIndex - 1) / state.total) * 100}%`;
  } else {
    el.questionCounter.textContent = `Panneau ${state.qIndex}`;
    el.scoreCounter.textContent = `Série : ${state.streak}`;
  }

  el.signLoading.textContent = "chargement…";
  el.signImage.hidden = true;
  el.signLoading.hidden = false;
  el.signImage.alt = "Panneau à identifier";
  el.signImage.onload = () => {
    el.signLoading.hidden = true;
    el.signImage.hidden = false;
  };
  el.signImage.onerror = () => {
    el.signLoading.hidden = false;
    el.signLoading.textContent = "Image indisponible";
    el.signImage.hidden = true;
  };
  el.signImage.src = imageUrl;

  const distractors = pickDistractors(sign, 3);
  const options = shuffle([
    { text: sign.meaning, correct: true },
    ...distractors.map((d) => ({ text: d.meaning, correct: false })),
  ]);

  el.optionsList.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";

    const letterSpan = document.createElement("span");
    letterSpan.className = "option-letter";
    letterSpan.textContent = letters[i];
    letterSpan.setAttribute("aria-hidden", "true");

    const textSpan = document.createElement("span");
    textSpan.textContent = opt.text;

    btn.appendChild(letterSpan);
    btn.appendChild(textSpan);
    btn.addEventListener("click", () => handleAnswer(btn, opt, options));
    el.optionsList.appendChild(btn);
  });
}

function handleAnswer(button, chosen, allOptions) {
  if (state.locked) return;
  state.locked = true;

  const buttons = Array.from(el.optionsList.children);
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (allOptions[i].correct) b.classList.add("is-correct");
    else if (b === button) b.classList.add("is-wrong");
    else b.classList.add("is-muted");
  });

  if (chosen.correct) {
    state.score += 1;
    state.streak += 1;
    state.forceEnd = false;
    el.btnNext.textContent = state.mode === "qcm" ? "Suivant" : "Panneau suivant";
    el.btnNext.hidden = false;
    el.scoreCounter.textContent =
      state.mode === "qcm" ? `Score : ${state.score}` : `Série : ${state.streak}`;
    revealButton(el.btnNext);
  } else if (state.mode === "qcm") {
    state.forceEnd = false;
    el.btnNext.textContent = "Suivant";
    el.btnNext.hidden = false;
    revealButton(el.btnNext);
  } else {
    // Mode infini : une erreur termine la partie, mais on laisse d'abord
    // voir la bonne réponse en surbrillance avant l'écran de fin.
    state.forceEnd = true;
    el.btnNext.textContent = "Voir le résultat";
    el.btnNext.hidden = false;
    revealButton(el.btnNext);
  }
}

el.btnNext.addEventListener("click", () => {
  if (state.forceEnd) return endInfinite();
  if (state.mode === "qcm" && state.qIndex >= state.total) return endQcm();
  nextQuestion();
});

function endQcm() {
  const { score, total } = state;
  document.getElementById("qcmEndScore").textContent = `${score} / ${total}`;

  const pct = score / total;
  let comment;
  if (pct === 1) comment = "Sans faute. Tu connais tes panneaux sur le bout des doigts.";
  else if (pct >= 0.8) comment = "Très solide, encore quelques révisions et c'est parfait.";
  else if (pct >= 0.5) comment = "Pas mal, mais il reste des panneaux à revoir.";
  else comment = "Ça mérite une bonne session de révision, retente ta chance.";
  document.getElementById("qcmEndComment").textContent = comment;

  showScreen("endQcm");
}

function endInfinite() {
  const streak = state.streak;
  document.getElementById("infiniteEndScore").textContent =
    streak <= 1 ? `${streak} panneau identifié` : `${streak} panneaux identifiés`;
  document.getElementById("infiniteEndComment").textContent = commentForStreak(streak);
  showScreen("endInfinite");
}

document.getElementById("btnStartQcm").addEventListener("click", () => startGame("qcm"));
document.getElementById("btnStartInfinite").addEventListener("click", () => startGame("infinite"));
document.getElementById("btnRetryQcm").addEventListener("click", () => startGame("qcm"));
document.getElementById("btnRetryInfinite").addEventListener("click", () => startGame("infinite"));

/* ============================================================
 * MODE INFINI — TROUVE LE NOM (panneau -> signification tapée)
 * ============================================================ */

const ALL_MEANINGS = Array.from(new Set(SIGNS.map((s) => s.meaning)));

const textState = {
  streak: 0,
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

function startTextGame() {
  textState.streak = 0;
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
  elText.btnNext.textContent = "Panneau suivant";
  elText.feedback.hidden = true;
  elText.input.value = "";
  elText.input.disabled = false;
  elText.suggestions.hidden = true;
  elText.suggestions.innerHTML = "";

  let sign = null;
  let imageUrl = null;
  let attempts = 0;
  const maxAttempts = SIGNS.length * 2;

  while (sign === null) {
    attempts += 1;
    if (attempts > maxAttempts) {
      elText.loading.hidden = false;
      elText.loading.textContent =
        "Impossible de charger les images des panneaux. Vérifie ta connexion et réessaie.";
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
  elText.counter.textContent = `Panneau ${textState.qIndex}`;
  elText.score.textContent = `Série : ${textState.streak}`;

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

function closeTextSuggestions() {
  elText.suggestions.hidden = true;
  elText.suggestions.innerHTML = "";
}

elText.input.addEventListener("input", () => {
  const query = elText.input.value.trim().toLowerCase();
  if (query.length < 3) return closeTextSuggestions();

  const matches = ALL_MEANINGS.filter((m) => m.toLowerCase().includes(query)).slice(0, 6);
  closeTextSuggestions();
  if (matches.length === 0) return;

  matches.forEach((m) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "text-suggestion-item";
    item.textContent = m;
    item.addEventListener("click", () => {
      elText.input.value = m;
      closeTextSuggestions();
      submitTextAnswer(m);
    });
    elText.suggestions.appendChild(item);
  });
  elText.suggestions.hidden = false;
});

elText.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    submitTextAnswer(elText.input.value);
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
  textState.locked = true;
  closeTextSuggestions();
  elText.input.disabled = true;

  const normalized = value.trim().toLowerCase();
  const correct = normalized === textState.current.meaning.toLowerCase();

  elText.feedback.hidden = false;
  if (correct) {
    textState.streak += 1;
    textState.forceEnd = false;
    elText.feedback.textContent = `Exact : ${textState.current.meaning}`;
    elText.feedback.className = "text-feedback is-correct";
    elText.score.textContent = `Série : ${textState.streak}`;
    elText.btnNext.hidden = false;
    revealButton(elText.btnNext);
  } else {
    elText.feedback.textContent = `Raté. Réponse : ${textState.current.meaning}`;
    elText.feedback.className = "text-feedback is-wrong";
    textState.forceEnd = true;
    elText.btnNext.textContent = "Voir le résultat";
    elText.btnNext.hidden = false;
    revealButton(elText.btnNext);
  }
}

function endInfiniteText() {
  const streak = textState.streak;
  document.getElementById("textEndScore").textContent =
    streak <= 1 ? `${streak} panneau identifié` : `${streak} panneaux identifiés`;
  document.getElementById("textEndComment").textContent = commentForStreak(streak);
  showScreen("endInfiniteText");
}

elText.btnNext.addEventListener("click", () => {
  if (textState.forceEnd) return endInfiniteText();
  nextTextQuestion();
});

document.getElementById("btnStartInfiniteText").addEventListener("click", () => startTextGame());
document.getElementById("btnRetryInfiniteText").addEventListener("click", () => startTextGame());

/* ============================================================
 * MODE INFINI — TROUVE LE PANNEAU
 * (signification -> panneau à retrouver dans la grille complète)
 * ============================================================ */

const findState = {
  streak: 0,
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

/* ---------- Aperçu agrandi au survol d'une case ---------- */

const elSignPreview = {
  wrap: document.getElementById("signPreview"),
  img: document.getElementById("signPreviewImg"),
};

function positionSignPreview() {
  if (!elSignPreview.wrap) return;
  const previewRect = elSignPreview.wrap.getBoundingClientRect();
  const margin = 16;
  const mainRect = document.getElementById("app").getBoundingClientRect();

  // Position fixe, toujours la même, indépendante de la case survolée :
  // dans la marge à droite si possible, sinon à gauche, sinon centrée.
  const spaceRight = window.innerWidth - mainRect.right;
  const spaceLeft = mainRect.left;

  let left;
  if (spaceRight >= previewRect.width + margin * 2) {
    left = mainRect.right + margin;
  } else if (spaceLeft >= previewRect.width + margin * 2) {
    left = mainRect.left - previewRect.width - margin;
  } else {
    left = window.innerWidth / 2 - previewRect.width / 2;
  }
  left = Math.max(margin, Math.min(left, window.innerWidth - previewRect.width - margin));
  const top = Math.max(margin, window.innerHeight / 2 - previewRect.height / 2);

  elSignPreview.wrap.style.left = `${left}px`;
  elSignPreview.wrap.style.top = `${top}px`;
}

function showSignPreview(url) {
  if (!url || !elSignPreview.wrap || !elSignPreview.img) return;
  elSignPreview.img.src = url;
  elSignPreview.wrap.hidden = false;
  positionSignPreview();
}

function hideSignPreview() {
  if (!elSignPreview.wrap) return;
  elSignPreview.wrap.hidden = true;
}

window.addEventListener("resize", () => {
  if (elSignPreview.wrap && !elSignPreview.wrap.hidden) positionSignPreview();
});

// Le popup doit disparaître dès qu'on scrolle la grille (sa position fixe
// ne suivrait plus la case survolée).
elFind.grid.addEventListener("scroll", hideSignPreview);

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
      hideSignPreview();
      handleFindAnswer(cell, sign);
    });
    cell.addEventListener("contextmenu", (e) => e.preventDefault());
    cell.addEventListener("mouseenter", () => showSignPreview(url));
    cell.addEventListener("mouseleave", hideSignPreview);
    cell.addEventListener("focus", () => showSignPreview(url));
    cell.addEventListener("blur", hideSignPreview);

    elFind.grid.appendChild(cell);
    findState.pool.push(sign);
  });

  elFind.loading.hidden = true;
  elFind.grid.hidden = false;
  findState.gridBuilt = true;
}

async function startFindGame() {
  findState.streak = 0;
  findState.qIndex = 0;
  findState.locked = false;
  findState.forceEnd = false;
  showScreen("quizFind");
  elFind.prompt.textContent = "Chargement des panneaux…";
  await buildSignGrid();

  if (findState.pool.length === 0) {
    elFind.prompt.textContent =
      "Impossible de charger les panneaux. Vérifie ta connexion et réessaie.";
    return;
  }

  findState.queue = shuffle(findState.pool);
  nextFindQuestion();
}

function nextFindQuestion() {
  findState.locked = false;
  findState.forceEnd = false;
  hideSignPreview();
  elFind.btnNext.hidden = true;
  elFind.btnNext.textContent = "Panneau suivant";

  Array.from(elFind.grid.children).forEach((cell) => {
    cell.classList.remove("is-correct", "is-wrong", "is-muted");
    cell.disabled = false;
  });

  if (findState.queue.length === 0) findState.queue = shuffle(findState.pool);
  const sign = findState.queue.shift();
  findState.current = sign;
  findState.qIndex += 1;

  elFind.counter.textContent = `Panneau ${findState.qIndex}`;
  elFind.score.textContent = `Série : ${findState.streak}`;
  elFind.prompt.textContent = `Retrouve le panneau : ${sign.meaning}`;
}

function handleFindAnswer(cell, sign) {
  if (findState.locked) return;
  findState.locked = true;

  const correctMeaning = findState.current.meaning;
  const isCorrect = sign.meaning === correctMeaning;

  Array.from(elFind.grid.children).forEach((c) => {
    c.disabled = true;
    const cSign = findState.pool.find((s) => s.code === c.dataset.code);
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

  if (isCorrect) {
    findState.streak += 1;
    findState.forceEnd = false;
    elFind.score.textContent = `Série : ${findState.streak}`;
    elFind.btnNext.hidden = false;
    revealButton(elFind.btnNext);
  } else {
    findState.forceEnd = true;
    elFind.btnNext.textContent = "Voir le résultat";
    elFind.btnNext.hidden = false;
    revealButton(elFind.btnNext);
  }
}

function endInfiniteFind() {
  const streak = findState.streak;
  document.getElementById("findEndScore").textContent =
    streak <= 1 ? `${streak} panneau identifié` : `${streak} panneaux identifiés`;
  document.getElementById("findEndComment").textContent = commentForStreak(streak);
  showScreen("endInfiniteFind");
}

elFind.btnNext.addEventListener("click", () => {
  if (findState.forceEnd) return endInfiniteFind();
  nextFindQuestion();
});

document.getElementById("btnStartInfiniteFind").addEventListener("click", () => startFindGame());
document.getElementById("btnRetryInfiniteFind").addEventListener("click", () => startFindGame());

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
  elCourse.list.hidden = true;
  elCourse.empty.hidden = true;

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
  courseState.built = true;
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
  const query = courseState.query.trim().toLowerCase();

  const filtered = courseState.items.filter(({ sign }) => {
    if (courseState.activeCat !== "all" && sign.cat !== courseState.activeCat) return false;
    if (
      query &&
      !sign.meaning.toLowerCase().includes(query) &&
      !sign.code.toLowerCase().includes(query)
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
 * INIT
 * ============================================================ */

showScreen("home");
