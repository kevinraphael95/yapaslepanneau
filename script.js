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

/* ---------- État du jeu ---------- */
const BEST_STREAK_KEY = "panneaux-quiz-best-streak";

const state = {
  mode: null, // "qcm" | "infinite"
  queue: [],
  score: 0,
  streak: 0,
  qIndex: 0,
  total: 20,
  locked: false,
};

function getBestStreak() {
  try {
    return Number(localStorage.getItem(BEST_STREAK_KEY) || 0);
  } catch (err) {
    return 0;
  }
}

function setBestStreak(value) {
  try {
    localStorage.setItem(BEST_STREAK_KEY, String(value));
  } catch (err) {
    /* stockage indisponible (navigation privée…) : on ignore silencieusement */
  }
}

function updateBestStreakBadge() {
  const best = getBestStreak();
  const badge = document.getElementById("bestStreakBadge");
  if (best > 0) {
    document.getElementById("bestStreakValue").textContent = best;
    badge.hidden = false;
  }
}

/* ---------- Éléments DOM du quiz ---------- */
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

/* ---------- Lancement d'une partie ---------- */
function startGame(mode) {
  state.mode = mode;
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

  if (state.mode === "qcm" && state.qIndex >= state.total) {
    return endQcm();
  }

  // Pioche un panneau dont l'image charge correctement ; sinon on en essaie un autre.
  let sign = null;
  let imageUrl = null;
  let attempts = 0;
  const maxAttempts = SIGNS.length * 2; // garde-fou anti-boucle infinie (ex : API indisponible)

  while (sign === null) {
    attempts += 1;
    if (attempts > maxAttempts) {
      el.signLoading.hidden = false;
      el.signLoading.textContent =
        "Impossible de charger les images des panneaux pour le moment. Vérifie ta connexion et réessaie.";
      el.signImage.hidden = true;
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

  renderQuestion(sign, imageUrl);
}

function renderQuestion(sign, imageUrl) {
  state.qIndex += 1;

  // Compteur / progression
  if (state.mode === "qcm") {
    el.questionCounter.textContent = `Question ${state.qIndex} / ${state.total}`;
    el.scoreCounter.textContent = `Score : ${state.score}`;
    el.progressFill.style.width = `${((state.qIndex - 1) / state.total) * 100}%`;
  } else {
    el.questionCounter.textContent = `Panneau ${state.qIndex}`;
    el.scoreCounter.textContent = `Série : ${state.streak}`;
  }

  // Image
  el.signLoading.textContent = "chargement…";
  el.signImage.hidden = true;
  el.signLoading.hidden = false;
  el.signImage.src = imageUrl;
  el.signImage.alt = "Panneau à identifier";
  el.signImage.onload = () => {
    el.signLoading.hidden = true;
    el.signImage.hidden = false;
  };

  // Options
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
    if (allOptions[i].correct) {
      b.classList.add("is-correct");
    } else if (b === button) {
      b.classList.add("is-wrong");
    } else {
      b.classList.add("is-muted");
    }
  });

  if (chosen.correct) {
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
    // mode infini : une erreur termine la partie
    setTimeout(endInfinite, 900);
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

  const best = getBestStreak();
  let comment;
  if (streak > best) {
    setBestStreak(streak);
    comment = "Nouveau record personnel !";
  } else {
    comment = `Ton record reste à ${best}.`;
  }
  document.getElementById("infiniteEndComment").textContent = comment;
  updateBestStreakBadge();
  showScreen("endInfinite");
}

/* ---------- Navigation ---------- */
document.getElementById("btnStartQcm").addEventListener("click", () => startGame("qcm"));
document.getElementById("btnStartInfinite").addEventListener("click", () => startGame("infinite"));

document.getElementById("btnRetryQcm").addEventListener("click", () => startGame("qcm"));
document.getElementById("btnHomeFromQcm").addEventListener("click", () => showScreen("home"));

document.getElementById("btnRetryInfinite").addEventListener("click", () => startGame("infinite"));
document.getElementById("btnHomeFromInfinite").addEventListener("click", () => showScreen("home"));

/* ---------- Init ---------- */
updateBestStreakBadge();
showScreen("home");

/* =============================================================================
   AJOUT — 2 nouveaux modes infinis en recherche libre, sans proposition.
   Rien au-dessus de cette ligne n'a été modifié : tout ce qui suit est un
   sous-système à part entière (son propre état, ses propres éléments DOM,
   son propre écran de fin), qui n'appelle et ne touche aucune variable ou
   fonction du QCM / Mode infini existants, à l'exception d'appels en LECTURE
   à des utilitaires déjà partagés (SIGNS, shuffle, fetchSignImageUrl,
   imageUrlCache, showScreen) qui restent eux aussi inchangés.
   ============================================================================= */

// Retire les accents pour une recherche tolérante ("ceder" trouve "céder").
function normalizeSearchText(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const ALL_MEANINGS = Array.from(new Set(SIGNS.map((s) => s.meaning)));

// Les résultats qui COMMENCENT par la saisie remontent avant ceux qui la
// contiennent juste quelque part. Limité à 8 suggestions.
function rankBySearch(items, query, getText) {
  const q = normalizeSearchText(query);
  const starts = [];
  const contains = [];
  items.forEach((item) => {
    const t = normalizeSearchText(getText(item));
    if (t.startsWith(q)) starts.push(item);
    else if (t.includes(q)) contains.push(item);
  });
  return starts.concat(contains).slice(0, 8);
}

const BEST_STREAK_KEYS_SEARCH = {
  toMeaning: "panneaux-quiz-best-streak-search-meaning",
  toSign: "panneaux-quiz-best-streak-search-sign",
};

function getSearchBestStreak(direction) {
  try {
    return Number(localStorage.getItem(BEST_STREAK_KEYS_SEARCH[direction]) || 0);
  } catch (err) {
    return 0;
  }
}

function setSearchBestStreak(direction, value) {
  try {
    localStorage.setItem(BEST_STREAK_KEYS_SEARCH[direction], String(value));
  } catch (err) {
    /* stockage indisponible : on ignore silencieusement */
  }
}

function updateSearchBestStreakBadge() {
  const badge = document.getElementById("bestStreakSearchBadge");
  const bestMeaning = getSearchBestStreak("toMeaning");
  const bestSign = getSearchBestStreak("toSign");

  const meaningWrap = document.getElementById("bestStreakSearchMeaningWrap");
  const signWrap = document.getElementById("bestStreakSearchSignWrap");

  meaningWrap.hidden = bestMeaning <= 0;
  if (bestMeaning > 0) document.getElementById("bestStreakSearchMeaning").textContent = bestMeaning;

  signWrap.hidden = bestSign <= 0;
  if (bestSign > 0) document.getElementById("bestStreakSearchSign").textContent = bestSign;

  badge.hidden = bestMeaning <= 0 && bestSign <= 0;
}

// État entièrement séparé de "state" (qui reste réservé au QCM / Mode infini).
const searchState = {
  direction: null, // "toMeaning" | "toSign"
  queue: [],
  streak: 0,
  qIndex: 0,
  locked: false,
  currentSign: null,
  currentImageUrl: null,
  requestId: 0,
};

const elSearch = {
  questionTitle: document.querySelector("#screen-quiz .question-title"),
  signFrame: document.getElementById("signFrame"),
  meaningCard: document.getElementById("meaningCard"),
  meaningText: document.getElementById("meaningText"),
  optionsList: document.getElementById("optionsList"),
  searchQuiz: document.getElementById("searchQuiz"),
  searchInput: document.getElementById("searchInput"),
  searchHint: document.getElementById("searchHint"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  btnGiveUp: document.getElementById("btnGiveUp"),
  revealAnswer: document.getElementById("revealAnswer"),
  questionCounter: document.getElementById("questionCounter"),
  scoreCounter: document.getElementById("scoreCounter"),
  progressTrack: document.getElementById("progressTrack"),
  btnNext: document.getElementById("btnNextSearch"),
};

function startSearchGame(direction) {
  searchState.direction = direction;
  searchState.queue = shuffle(SIGNS);
  searchState.streak = 0;
  searchState.qIndex = 0;

  elSearch.progressTrack.style.visibility = "hidden";
  elSearch.optionsList.hidden = true;
  elSearch.searchQuiz.hidden = false;

  showScreen("quiz");
  nextSearchQuestion();
}

async function nextSearchQuestion() {
  searchState.locked = false;
  elSearch.btnNext.hidden = true;
  elSearch.revealAnswer.hidden = true;
  elSearch.revealAnswer.className = "reveal-answer";
  elSearch.revealAnswer.innerHTML = "";

  let sign = null;
  let imageUrl = null;
  let attempts = 0;
  const maxAttempts = SIGNS.length * 2;

  while (sign === null) {
    attempts += 1;
    if (attempts > maxAttempts) {
      elSearch.searchSuggestions.innerHTML = "";
      elSearch.searchHint.textContent =
        "Impossible de charger les images des panneaux pour le moment. Vérifie ta connexion et réessaie.";
      return;
    }
    if (searchState.queue.length === 0) {
      searchState.queue = shuffle(SIGNS);
    }
    const candidate = searchState.queue.shift();
    const url = await fetchSignImageUrl(candidate.code);
    if (url) {
      sign = candidate;
      imageUrl = url;
    }
  }

  renderSearchQuestion(sign, imageUrl);
}

function renderSearchQuestion(sign, imageUrl) {
  searchState.qIndex += 1;
  searchState.currentSign = sign;
  searchState.currentImageUrl = imageUrl;

  elSearch.questionCounter.textContent = `Panneau ${searchState.qIndex}`;
  elSearch.scoreCounter.textContent = `Série : ${searchState.streak}`;

  if (searchState.direction === "toMeaning") {
    elSearch.questionTitle.textContent = "Que signifie ce panneau ?";
    elSearch.meaningCard.hidden = true;
    elSearch.signFrame.hidden = false;

    const signLoadingEl = document.getElementById("signLoading");
    const signImageEl = document.getElementById("signImage");
    signLoadingEl.textContent = "chargement…";
    signImageEl.hidden = true;
    signLoadingEl.hidden = false;
    signImageEl.src = imageUrl;
    signImageEl.alt = "Panneau à identifier";
    signImageEl.onload = () => {
      signLoadingEl.hidden = true;
      signImageEl.hidden = false;
    };
  } else {
    elSearch.questionTitle.textContent = "Quel est ce panneau ?";
    elSearch.signFrame.hidden = true;
    elSearch.meaningCard.hidden = false;
    elSearch.meaningText.textContent = sign.meaning;
  }

  resetSearchInputUi();
}

function resetSearchInputUi() {
  searchState.requestId += 1; // annule toute requête d'images encore en vol pour la question précédente
  elSearch.searchInput.value = "";
  elSearch.searchInput.disabled = false;
  elSearch.searchSuggestions.innerHTML = "";
  elSearch.searchSuggestions.classList.toggle("search-suggestions--images", searchState.direction === "toSign");
  elSearch.searchHint.textContent = "Tape au moins 2 lettres pour voir des suggestions.";
  elSearch.btnGiveUp.disabled = false;
  elSearch.searchInput.focus();
}

function handleSearchInput() {
  const query = elSearch.searchInput.value.trim();
  if (query.length < 2) {
    elSearch.searchSuggestions.innerHTML = "";
    elSearch.searchHint.textContent = "Tape au moins 2 lettres pour voir des suggestions.";
    return;
  }

  if (searchState.direction === "toMeaning") {
    const matches = rankBySearch(ALL_MEANINGS, query, (m) => m);
    renderMeaningSuggestions(matches);
  } else {
    const matches = rankBySearch(SIGNS, query, (s) => s.meaning);
    renderSignSuggestions(matches);
  }
}

function renderMeaningSuggestions(matches) {
  elSearch.searchHint.textContent = matches.length ? "" : "Aucune correspondance.";
  elSearch.searchSuggestions.innerHTML = "";
  matches.forEach((meaning) => {
    const isCorrect = meaning === searchState.currentSign.meaning;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn";
    btn.dataset.correct = isCorrect ? "true" : "false";
    btn.textContent = meaning;
    btn.addEventListener("click", () => handleSearchAnswer(btn, isCorrect));
    elSearch.searchSuggestions.appendChild(btn);
  });
}

async function renderSignSuggestions(matches) {
  const requestId = ++searchState.requestId;
  elSearch.searchSuggestions.innerHTML = '<p class="search-loading">Chargement des panneaux…</p>';

  const withImages = [];
  for (const s of matches) {
    const url = await fetchSignImageUrl(s.code);
    if (requestId !== searchState.requestId) return; // une saisie plus récente a pris le relais
    if (url) withImages.push({ sign: s, imageUrl: url });
  }

  elSearch.searchSuggestions.innerHTML = "";
  if (!withImages.length) {
    elSearch.searchHint.textContent = "Aucune correspondance.";
    return;
  }
  elSearch.searchHint.textContent = "";
  withImages.forEach(({ sign: s, imageUrl }) => {
    const isCorrect = s.code === searchState.currentSign.code;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-btn option-btn--image";
    btn.dataset.correct = isCorrect ? "true" : "false";
    btn.innerHTML = `<img src="${imageUrl}" alt="Proposition de panneau">`;
    btn.addEventListener("click", () => handleSearchAnswer(btn, isCorrect));
    elSearch.searchSuggestions.appendChild(btn);
  });
}

function handleSearchAnswer(button, isCorrect) {
  if (searchState.locked) return;
  searchState.locked = true;
  searchState.requestId += 1;

  elSearch.searchInput.disabled = true;
  elSearch.btnGiveUp.disabled = true;
  Array.from(elSearch.searchSuggestions.children).forEach((b) => {
    if (b.tagName !== "BUTTON") return;
    b.disabled = true;
    if (b.dataset.correct === "true") b.classList.add("is-correct");
    else if (b === button) b.classList.add("is-wrong");
    else b.classList.add("is-muted");
  });

  showSearchRevealAnswer(isCorrect);
  resolveSearchOutcome(isCorrect);
}

function handleSearchGiveUp() {
  if (searchState.locked) return;
  searchState.locked = true;
  searchState.requestId += 1;

  elSearch.searchInput.disabled = true;
  elSearch.btnGiveUp.disabled = true;
  Array.from(elSearch.searchSuggestions.children).forEach((b) => {
    if (b.tagName !== "BUTTON") return;
    b.disabled = true;
    if (b.dataset.correct === "true") b.classList.add("is-correct");
    else b.classList.add("is-muted");
  });

  showSearchRevealAnswer(false);
  resolveSearchOutcome(false);
}

function showSearchRevealAnswer(isCorrect) {
  elSearch.revealAnswer.hidden = false;
  elSearch.revealAnswer.className = `reveal-answer ${isCorrect ? "is-correct" : "is-wrong"}`;
  if (searchState.direction === "toMeaning") {
    elSearch.revealAnswer.innerHTML = `
      <div class="reveal-answer-text">
        <span>${isCorrect ? "Bonne réponse !" : "Ce n'était pas ça."}</span>
        <strong>${searchState.currentSign.meaning}</strong>
      </div>
    `;
  } else {
    elSearch.revealAnswer.innerHTML = `
      <img src="${searchState.currentImageUrl}" alt="Panneau : ${searchState.currentSign.meaning}">
      <div class="reveal-answer-text">
        <span>${isCorrect ? "Bonne réponse !" : "Ce n'était pas ça."}</span>
        <strong>${searchState.currentSign.meaning}</strong>
      </div>
    `;
  }
}

function resolveSearchOutcome(isCorrect) {
  if (isCorrect) {
    searchState.streak += 1;
    elSearch.scoreCounter.textContent = `Série : ${searchState.streak}`;
    elSearch.btnNext.textContent = "Panneau suivant";
    elSearch.btnNext.hidden = false;
    revealSearchNextButton();
  } else {
    setTimeout(endSearchGame, 1400);
  }
}

function revealSearchNextButton() {
  requestAnimationFrame(() => {
    elSearch.btnNext.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  });
}

function endSearchGame() {
  const streak = searchState.streak;
  document.getElementById("searchEndScore").textContent =
    streak <= 1 ? `${streak} panneau identifié` : `${streak} panneaux identifiés`;

  const direction = searchState.direction;
  const best = getSearchBestStreak(direction);
  let comment;
  if (streak > best) {
    setSearchBestStreak(direction, streak);
    comment = "Nouveau record personnel !";
  } else {
    comment = `Ton record reste à ${best}.`;
  }
  document.getElementById("searchEndComment").textContent = comment;
  updateSearchBestStreakBadge();
  showOnlyScreenIncludingSearch("screen-end-search");
}

// Comme "showScreen", mais connaît en plus le nouvel écran de fin dédié à la
// recherche libre. Ne modifie ni "showScreen" ni l'objet "screens" d'origine.
function showOnlyScreenIncludingSearch(idToShow) {
  ["screen-home", "screen-quiz", "screen-end-qcm", "screen-end-infinite", "screen-end-search"].forEach((id) => {
    document.getElementById(id).hidden = id !== idToShow;
  });
  window.scrollTo(0, 0);
}

// Remet le bloc question dans son état "classique" (image + 4 propositions).
// Appelé en plus des écouteurs d'origine du QCM / Mode infini (ajout d'un
// second écouteur sur les mêmes boutons, sans toucher au premier), pour que
// tout redevienne normal si l'un des 2 nouveaux modes a été joué avant.
function resetToClassicLayout() {
  document.getElementById("signFrame").hidden = false;
  document.getElementById("meaningCard").hidden = true;
  document.getElementById("optionsList").hidden = false;
  document.getElementById("searchQuiz").hidden = true;
  document.querySelector("#screen-quiz .question-title").textContent = "Que signifie ce panneau ?";
}

document.getElementById("btnStartQcm").addEventListener("click", resetToClassicLayout);
document.getElementById("btnStartInfinite").addEventListener("click", resetToClassicLayout);
document.getElementById("btnRetryQcm").addEventListener("click", resetToClassicLayout);
document.getElementById("btnRetryInfinite").addEventListener("click", resetToClassicLayout);

document.getElementById("btnStartSearchMeaning").addEventListener("click", () => startSearchGame("toMeaning"));
document.getElementById("btnStartSearchSign").addEventListener("click", () => startSearchGame("toSign"));

document.getElementById("btnRetrySearch").addEventListener("click", () => startSearchGame(searchState.direction));
document.getElementById("btnHomeFromSearch").addEventListener("click", () => showOnlyScreenIncludingSearch("screen-home"));

elSearch.searchInput.addEventListener("input", handleSearchInput);
elSearch.btnGiveUp.addEventListener("click", handleSearchGiveUp);
elSearch.btnNext.addEventListener("click", nextSearchQuestion);

updateSearchBestStreakBadge();
