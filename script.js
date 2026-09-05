"use strict";

/* ---------- Écrans ---------- */
const screens = {
  home: document.getElementById("screen-home"),
  quiz: document.getElementById("screen-quiz"),
  endQcm: document.getElementById("screen-end-qcm"),
  endInfinite: document.getElementById("screen-end-infinite"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => (el.hidden = true));
  screens[name].hidden = false;
  window.scrollTo(0, 0);
}

/* ---------- Récupération des images (Wikimedia Commons API) ---------- */
const imageUrlCache = new Map();

async function fetchSignImageUrl(code) {
  if (imageUrlCache.has(code)) return imageUrlCache.get(code);
  const title = `File:France road sign ${code}.svg`;
  const endpoint =
    "https://commons.wikimedia.org/w/api.php?action=query&titles=" +
    encodeURIComponent(title) +
    "&prop=imageinfo&iiprop=url&format=json&origin=*";
  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    const pages = data.query && data.query.pages;
    const page = pages && Object.values(pages)[0];
    if (!page || "missing" in page || !page.imageinfo) {
      throw new Error("image introuvable pour " + code);
    }
    const url = page.imageinfo[0].url;
    imageUrlCache.set(code, url);
    return url;
  } catch (err) {
    imageUrlCache.set(code, null);
    return null;
  }
}

/* ---------- Utilitaires ---------- */
function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickDistractors(sign, count) {
  const sameCat = shuffle(SIGNS.filter((s) => s.cat === sign.cat && s.code !== sign.code));
  const otherCat = shuffle(SIGNS.filter((s) => s.cat !== sign.cat));
  return sameCat.concat(otherCat).slice(0, count);
}

// Retire les accents pour une recherche tolérante ("ceder" trouve "céder").
function normalizeText(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ALL_MEANINGS = Array.from(new Set(SIGNS.map((s) => s.meaning)));

// Cherche par correspondance : les résultats qui COMMENCENT par la saisie
// remontent avant ceux qui la contiennent juste quelque part.
function rankBySearch(items, query, getText) {
  const q = normalizeText(query);
  const starts = [];
  const contains = [];
  items.forEach((item) => {
    const t = normalizeText(getText(item));
    if (t.startsWith(q)) starts.push(item);
    else if (t.includes(q)) contains.push(item);
  });
  return starts.concat(contains).slice(0, 8);
}

/* ---------- État du jeu ---------- */
const BEST_STREAK_KEYS = {
  classic: "panneaux-quiz-best-streak", // clé historique, ne pas renommer (conserve les scores déjà enregistrés)
  searchMeaning: "panneaux-quiz-best-streak-search-meaning",
  searchSign: "panneaux-quiz-best-streak-search-sign",
};

const state = {
  mode: null, // "qcm" | "infinite"
  variant: "choice", // "choice" (4 propositions) | "search" (recherche libre)
  direction: "toMeaning", // "toMeaning" (panneau affiché, trouve le sens) | "toSign" (sens affiché, trouve le panneau)
  queue: [],
  score: 0,
  streak: 0,
  qIndex: 0,
  total: 20,
  locked: false,
  currentSign: null,
  currentImageUrl: null,
  searchRequestId: 0,
};

function streakKeyFor(variant, direction) {
  if (variant === "choice") return "classic";
  return direction === "toMeaning" ? "searchMeaning" : "searchSign";
}

function getBestStreak(key) {
  try {
    return Number(localStorage.getItem(BEST_STREAK_KEYS[key]) || 0);
  } catch (err) {
    return 0;
  }
}

function setBestStreak(key, value) {
  try {
    localStorage.setItem(BEST_STREAK_KEYS[key], String(value));
  } catch (err) {
    /* stockage indisponible (navigation privée…) : on ignore silencieusement */
  }
}

function updateBestStreakBadge() {
  const badge = document.getElementById("bestStreakBadge");
  const entries = [
    { key: "classic", wrap: "bestStreakClassicWrap", value: "bestStreakClassic" },
    { key: "searchMeaning", wrap: "bestStreakMeaningWrap", value: "bestStreakMeaning" },
    { key: "searchSign", wrap: "bestStreakSignWrap", value: "bestStreakSign" },
  ];
  let anyVisible = false;
  entries.forEach(({ key, wrap, value }) => {
    const best = getBestStreak(key);
    const wrapEl = document.getElementById(wrap);
    if (best > 0) {
      document.getElementById(value).textContent = best;
      wrapEl.hidden = false;
      anyVisible = true;
    } else {
      wrapEl.hidden = true;
    }
  });
  badge.hidden = !anyVisible;
}

/* ---------- Éléments DOM du quiz ---------- */
const el = {
  questionTitle: document.getElementById("questionTitle"),
  progressTrack: document.getElementById("progressTrack"),
  progressFill: document.getElementById("progressFill"),
  questionCounter: document.getElementById("questionCounter"),
  scoreCounter: document.getElementById("scoreCounter"),
  signFrame: document.getElementById("signFrame"),
  signLoading: document.getElementById("signLoading"),
  signImage: document.getElementById("signImage"),
  meaningCard: document.getElementById("meaningCard"),
  meaningText: document.getElementById("meaningText"),
  optionsList: document.getElementById("optionsList"),
  searchQuiz: document.getElementById("searchQuiz"),
  searchInput: document.getElementById("searchInput"),
  searchHint: document.getElementById("searchHint"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  btnGiveUp: document.getElementById("btnGiveUp"),
  revealAnswer: document.getElementById("revealAnswer"),
  btnNext: document.getElementById("btnNext"),
};

/* ---------- Lancement d'une partie ---------- */
function startGame(mode, variant, direction) {
  state.mode = mode;
  state.variant = variant;
  state.direction = direction;
  state.queue = shuffle(SIGNS);
  state.score = 0;
  state.streak = 0;
  state.qIndex = 0;
  state.total = mode === "qcm" ? 20 : Infinity;
  el.progressTrack.style.visibility = mode === "qcm" ? "visible" : "hidden";
  showScreen("quiz");
  nextQuestion();
}

/* ---------- Question suivante ---------- */
async function nextQuestion() {
  state.locked = false;
  el.btnNext.hidden = true;
  el.revealAnswer.hidden = true;
  el.revealAnswer.className = "reveal-answer";
  el.revealAnswer.innerHTML = "";

  if (state.mode === "qcm" && state.qIndex >= state.total) {
    return endQcm();
  }

  // Pioche un panneau dont l'image charge correctement ; sinon on en essaie un autre.
  // (Nécessaire dans tous les modes : même quand seul le texte est affiché
  // comme indice, il faut l'image du panneau pour la révélation finale.)
  let sign = null;
  let imageUrl = null;
  let attempts = 0;
  const maxAttempts = SIGNS.length * 2; // garde-fou anti-boucle infinie (ex : API indisponible)

  while (sign === null) {
    attempts += 1;
    if (attempts > maxAttempts) {
      el.optionsList.innerHTML = "";
      el.signLoading.hidden = false;
      el.signLoading.textContent =
        "Impossible de charger les images des panneaux pour le moment. Vérifie ta connexion et réessaie.";
      el.signImage.hidden = true;
      el.meaningCard.hidden = true;
      return;
    }
    if (state.queue.length === 0) {
      state.queue = shuffle(SIGNS);
    }
    const candidate = state.queue.shift();
    const url = await fetchSignImageUrl(candidate.code);
    if (url) {
      sign = candidate;
      imageUrl = url;
    }
    // si l'image manque, on ignore ce panneau et on retente avec le suivant
  }

  await renderQuestion(sign, imageUrl);
}

async function renderQuestion(sign, imageUrl) {
  state.qIndex += 1;
  state.currentSign = sign;
  state.currentImageUrl = imageUrl;

  // Compteur / progression
  if (state.mode === "qcm") {
    el.questionCounter.textContent = `Question ${state.qIndex} / ${state.total}`;
    el.scoreCounter.textContent = `Score : ${state.score}`;
    el.progressFill.style.width = `${((state.qIndex - 1) / state.total) * 100}%`;
  } else {
    el.questionCounter.textContent = `Panneau ${state.qIndex}`;
    el.scoreCounter.textContent = `Série : ${state.streak}`;
  }

  // Indice affiché : image du panneau (toMeaning) ou texte de la signification (toSign)
  if (state.direction === "toMeaning") {
    el.meaningCard.hidden = true;
    el.signFrame.hidden = false;
    el.signLoading.textContent = "chargement…";
    el.signImage.hidden = true;
    el.signLoading.hidden = false;
    el.signImage.src = imageUrl;
    el.signImage.alt = "Panneau à identifier";
    el.signImage.onload = () => {
      el.signLoading.hidden = true;
      el.signImage.hidden = false;
    };
  } else {
    el.signFrame.hidden = true;
    el.meaningCard.hidden = false;
    el.meaningText.textContent = sign.meaning;
  }

  if (state.variant === "choice") {
    el.questionTitle.textContent = "Que signifie ce panneau ?";
    el.optionsList.hidden = false;
    el.searchQuiz.hidden = true;
    renderChoiceOptions(sign);
  } else {
    el.questionTitle.textContent =
      state.direction === "toMeaning" ? "Que signifie ce panneau ?" : "Quel est ce panneau ?";
    el.optionsList.hidden = true;
    el.searchQuiz.hidden = false;
    resetSearchUi();
  }
}

/* ---------- Mode à choix multiples (QCM + Mode infini classique) ---------- */
function renderChoiceOptions(sign) {
  const distractors = pickDistractors(sign, 3);
  const options = shuffle([
    { text: sign.meaning, correct: true },
    ...distractors.map((d) => ({ text: d.meaning, correct: false })),
  ]);

  el.optionsList.innerHTML = "";
  const letters = ["A", "B", "C", "D"];
  options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${opt.text}</span>`;
    btn.addEventListener("click", () => handleChoiceAnswer(btn, opt, options));
    el.optionsList.appendChild(btn);
  });
}

function handleChoiceAnswer(button, chosen, allOptions) {
  if (state.locked) return;
  state.locked = true;

  const buttons = Array.from(el.optionsList.children);
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (allOptions[i].correct) {
      b.classList.add("is-correct");
    } else if (b === button) {
      b.classList.add("is-wrong");
    } else {
      b.classList.add("is-muted");
    }
  });

  resolveOutcome(chosen.correct);
}

/* ---------- Mode recherche libre (sans proposition) ---------- */
function resetSearchUi() {
  state.searchRequestId += 1; // annule toute requête d'images en cours pour la question précédente
  el.searchInput.value = "";
  el.searchInput.disabled = false;
  el.searchSuggestions.innerHTML = "";
  el.searchSuggestions.classList.toggle("search-suggestions--images", state.direction === "toSign");
  el.searchHint.textContent = "Tape au moins 2 lettres pour voir des suggestions.";
  el.btnGiveUp.disabled = false;
  el.searchInput.focus();
}

function handleSearchInput() {
  const query = el.searchInput.value.trim();
  if (query.length < 2) {
    el.searchSuggestions.innerHTML = "";
    el.searchHint.textContent = "Tape au moins 2 lettres pour voir des suggestions.";
    return;
  }

  if (state.direction === "toMeaning") {
    const matches = rankBySearch(ALL_MEANINGS, query, (m) => m);
    renderMeaningSuggestions(matches);
  } else {
    const matches = rankBySearch(SIGNS, query, (s) => s.meaning);
    renderSignSuggestions(matches);
  }
}

function renderMeaningSuggestions(matches) {
  el.searchHint.textContent = matches.length ? "" : "Aucune correspondance.";
  el.searchSuggestions.innerHTML = "";
  matches.forEach((meaning) => {
    const isCorrect = meaning === state.currentSign.meaning;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.correct = isCorrect ? "true" : "false";
    btn.textContent = meaning;
    btn.addEventListener("click", () => handleSearchAnswer(btn, isCorrect));
    el.searchSuggestions.appendChild(btn);
  });
}

async function renderSignSuggestions(matches) {
  const requestId = ++state.searchRequestId;
  el.searchSuggestions.innerHTML = '<p class="search-loading">Chargement des panneaux…</p>';

  const withImages = [];
  for (const s of matches) {
    const url = await fetchSignImageUrl(s.code);
    if (requestId !== state.searchRequestId) return; // une saisie plus récente a pris le relais
    if (url) withImages.push({ sign: s, imageUrl: url });
  }

  el.searchSuggestions.innerHTML = "";
  if (!withImages.length) {
    el.searchHint.textContent = "Aucune correspondance.";
    return;
  }
  el.searchHint.textContent = "";
  withImages.forEach(({ sign: s, imageUrl }) => {
    const isCorrect = s.code === state.currentSign.code;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn option-btn--image";
    btn.dataset.correct = isCorrect ? "true" : "false";
    btn.innerHTML = `<img src="${imageUrl}" alt="Proposition de panneau">`;
    btn.addEventListener("click", () => handleSearchAnswer(btn, isCorrect));
    el.searchSuggestions.appendChild(btn);
  });
}

function handleSearchAnswer(button, isCorrect) {
  if (state.locked) return;
  state.locked = true;
  state.searchRequestId += 1; // stoppe toute recherche d'images encore en vol

  el.searchInput.disabled = true;
  el.btnGiveUp.disabled = true;
  Array.from(el.searchSuggestions.children).forEach((b) => {
    if (b.tagName !== "BUTTON") return;
    b.disabled = true;
    if (b.dataset.correct === "true") b.classList.add("is-correct");
    else if (b === button) b.classList.add("is-wrong");
    else b.classList.add("is-muted");
  });

  showRevealAnswer(isCorrect);
  resolveOutcome(isCorrect);
}

function handleGiveUp() {
  if (state.locked) return;
  state.locked = true;
  state.searchRequestId += 1;

  el.searchInput.disabled = true;
  el.btnGiveUp.disabled = true;
  Array.from(el.searchSuggestions.children).forEach((b) => {
    if (b.tagName !== "BUTTON") return;
    b.disabled = true;
    if (b.dataset.correct === "true") b.classList.add("is-correct");
    else b.classList.add("is-muted");
  });

  showRevealAnswer(false);
  resolveOutcome(false);
}

function showRevealAnswer(isCorrect) {
  el.revealAnswer.hidden = false;
  el.revealAnswer.className = `reveal-answer ${isCorrect ? "is-correct" : "is-wrong"}`;
  if (state.direction === "toMeaning") {
    el.revealAnswer.innerHTML = `
      <div class="reveal-answer-text">
        <span>${isCorrect ? "Bonne réponse !" : "Ce n'était pas ça."}</span>
        <strong>${state.currentSign.meaning}</strong>
      </div>
    `;
  } else {
    el.revealAnswer.innerHTML = `
      <img src="${state.currentImageUrl}" alt="Panneau : ${state.currentSign.meaning}">
      <div class="reveal-answer-text">
        <span>${isCorrect ? "Bonne réponse !" : "Ce n'était pas ça."}</span>
        <strong>${state.currentSign.meaning}</strong>
      </div>
    `;
  }
}

/* ---------- Résolution commune (choix multiples + recherche libre) ---------- */
function resolveOutcome(isCorrect) {
  if (isCorrect) {
    state.score += 1;
    state.streak += 1;
    el.btnNext.textContent = state.mode === "qcm" ? "Suivant" : "Panneau suivant";
    el.btnNext.hidden = false;
    if (state.mode === "qcm") {
      el.scoreCounter.textContent = `Score : ${state.score}`;
    } else {
      el.scoreCounter.textContent = `Série : ${state.streak}`;
    }
    revealNextButton();
  } else if (state.mode === "qcm") {
    el.btnNext.textContent = "Suivant";
    el.btnNext.hidden = false;
    revealNextButton();
  } else {
    // mode infini : une erreur (ou un abandon) termine la partie
    setTimeout(endInfinite, state.variant === "search" ? 1400 : 900);
  }
}

// Filet de sécurité : même avec un layout resserré, une fenêtre très basse,
// un zoom élevé ou une barre d'outils/webcam qui déborde peuvent encore
// masquer le bouton. On le fait défiler dans la vue dès qu'il s'affiche.
function revealNextButton() {
  requestAnimationFrame(() => {
    el.btnNext.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  });
}

el.btnNext.addEventListener("click", () => {
  if (state.mode === "qcm" && state.qIndex >= state.total) {
    endQcm();
  } else {
    nextQuestion();
  }
});

el.searchInput.addEventListener("input", handleSearchInput);
el.btnGiveUp.addEventListener("click", handleGiveUp);

/* ---------- Fins de partie ---------- */
function endQcm() {
  const score = state.score;
  const total = state.total;
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

  const key = streakKeyFor(state.variant, state.direction);
  const best = getBestStreak(key);
  let comment;
  if (streak > best) {
    setBestStreak(key, streak);
    comment = "Nouveau record personnel !";
  } else {
    comment = `Ton record reste à ${best}.`;
  }
  document.getElementById("infiniteEndComment").textContent = comment;
  updateBestStreakBadge();
  showScreen("endInfinite");
}

/* ---------- Navigation ---------- */
document.getElementById("btnStartQcm").addEventListener("click", () => startGame("qcm", "choice", "toMeaning"));
document.getElementById("btnStartInfinite").addEventListener("click", () => startGame("infinite", "choice", "toMeaning"));
document.getElementById("btnStartSearchMeaning").addEventListener("click", () => startGame("infinite", "search", "toMeaning"));
document.getElementById("btnStartSearchSign").addEventListener("click", () => startGame("infinite", "search", "toSign"));

document.getElementById("btnRetryQcm").addEventListener("click", () => startGame("qcm", "choice", "toMeaning"));
document.getElementById("btnHomeFromQcm").addEventListener("click", () => showScreen("home"));

document.getElementById("btnRetryInfinite").addEventListener("click", () => startGame("infinite", state.variant, state.direction));
document.getElementById("btnHomeFromInfinite").addEventListener("click", () => showScreen("home"));

/* ---------- Init ---------- */
updateBestStreakBadge();
showScreen("home");
