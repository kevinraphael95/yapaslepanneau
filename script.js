"use strict";

/* ---------- Écrans ---------- */
const screens = {
  home: document.getElementById("screen-home"),
  quiz: document.getElementById("screen-quiz"),
  endQcm: document.getElementById("screen-end-qcm"),
  endInfinite: document.getElementById("screen-end-infinite"),
  quizText: document.getElementById("screen-quiz-text"),
  endInfiniteText: document.getElementById("screen-end-infinite-text"),
  quizFind: document.getElementById("screen-quiz-find"),
  endInfiniteFind: document.getElementById("screen-end-infinite-find"),
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

/* =====================================================================
 * MODE INFINI — TROUVE LE NOM (panneau affiché -> signification tapée)
 * ===================================================================== */

const ALL_MEANINGS = Array.from(new Set(SIGNS.map((s) => s.meaning)));

const textState = {
  streak: 0,
  qIndex: 0,
  locked: false,
  queue: [],
  current: null,
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

// Filet de sécurité générique pour scroller un bouton "suivant" dans la vue,
// réutilisable par les nouveaux modes sans toucher à revealNextButton().
function revealButtonGeneric(btn) {
  requestAnimationFrame(() => {
    btn.scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
  });
}

function startTextGame() {
  textState.streak = 0;
  textState.qIndex = 0;
  textState.locked = false;
  textState.queue = shuffle(SIGNS);
  showScreen("quizText");
  nextTextQuestion();
}

async function nextTextQuestion() {
  textState.locked = false;
  elText.btnNext.hidden = true;
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
        "Impossible de charger les images des panneaux pour le moment. Vérifie ta connexion et réessaie.";
      elText.image.hidden = true;
      return;
    }
    if (textState.queue.length === 0) {
      textState.queue = shuffle(SIGNS);
    }
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
  elText.image.src = imageUrl;
  elText.image.alt = "Panneau à identifier";
  elText.image.onload = () => {
    elText.loading.hidden = true;
    elText.image.hidden = false;
  };

  elText.input.focus();
}

elText.input.addEventListener("input", () => {
  const query = elText.input.value.trim().toLowerCase();
  if (query.length < 3) {
    elText.suggestions.hidden = true;
    elText.suggestions.innerHTML = "";
    return;
  }
  const matches = ALL_MEANINGS.filter((m) => m.toLowerCase().includes(query)).slice(0, 6);
  elText.suggestions.innerHTML = "";
  if (matches.length === 0) {
    elText.suggestions.hidden = true;
    return;
  }
  matches.forEach((m) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "text-suggestion-item";
    item.textContent = m;
    item.addEventListener("click", () => {
      elText.input.value = m;
      elText.suggestions.hidden = true;
      elText.suggestions.innerHTML = "";
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
  }
});

function submitTextAnswer(value) {
  if (textState.locked || !textState.current) return;
  textState.locked = true;
  elText.suggestions.hidden = true;
  elText.input.disabled = true;

  const normalized = value.trim().toLowerCase();
  const correct = normalized === textState.current.meaning.toLowerCase();

  elText.feedback.hidden = false;
  if (correct) {
    textState.streak += 1;
    elText.feedback.textContent = `Exact : ${textState.current.meaning}`;
    elText.feedback.className = "text-feedback is-correct";
    elText.score.textContent = `Série : ${textState.streak}`;
    elText.btnNext.hidden = false;
    revealButtonGeneric(elText.btnNext);
  } else {
    elText.feedback.textContent = `Raté. Réponse : ${textState.current.meaning}`;
    elText.feedback.className = "text-feedback is-wrong";
    setTimeout(endInfiniteText, 1100);
  }
}

function endInfiniteText() {
  const streak = textState.streak;
  document.getElementById("textEndScore").textContent =
    streak <= 1 ? `${streak} panneau identifié` : `${streak} panneaux identifiés`;

  const key = "panneaux-quiz-best-streak-text";
  let best = 0;
  try {
    best = Number(localStorage.getItem(key) || 0);
  } catch (err) {
    best = 0;
  }
  let comment;
  if (streak > best) {
    try {
      localStorage.setItem(key, String(streak));
    } catch (err) {
      /* stockage indisponible : on ignore silencieusement */
    }
    comment = "Nouveau record personnel !";
  } else {
    comment = `Ton record reste à ${best}.`;
  }
  document.getElementById("textEndComment").textContent = comment;
  showScreen("endInfiniteText");
}

elText.btnNext.addEventListener("click", () => nextTextQuestion());

document.getElementById("btnStartInfiniteText").addEventListener("click", () => startTextGame());
document.getElementById("btnRetryInfiniteText").addEventListener("click", () => startTextGame());
document.getElementById("btnHomeFromInfiniteText").addEventListener("click", () => showScreen("home"));

/* =====================================================================
 * MODE INFINI — TROUVE LE PANNEAU (signification affichée -> panneau
 * à retrouver parmi tous les panneaux, organisés dans l'ordre de SIGNS)
 * ===================================================================== */

const findState = {
  streak: 0,
  qIndex: 0,
  locked: false,
  pool: [],
  queue: [],
  current: null,
  gridBuilt: false,
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

// Construit une seule fois la grille avec l'image de chaque panneau
// (dans l'ordre où ils sont définis dans signs.js) ; les panneaux dont
// l'image est introuvable sur Wikimedia Commons sont simplement absents
// de la grille et ne pourront jamais être tirés comme question.
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
    cell.appendChild(img);
    cell.addEventListener("click", () => handleFindAnswer(cell, sign));
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
  showScreen("quizFind");
  elFind.prompt.textContent = "Chargement des panneaux…";
  await buildSignGrid();

  if (findState.pool.length === 0) {
    elFind.prompt.textContent =
      "Impossible de charger les panneaux pour le moment. Vérifie ta connexion et réessaie.";
    return;
  }

  findState.queue = shuffle(findState.pool);
  nextFindQuestion();
}

function nextFindQuestion() {
  findState.locked = false;
  elFind.btnNext.hidden = true;

  Array.from(elFind.grid.children).forEach((cell) => {
    cell.classList.remove("is-correct", "is-wrong", "is-muted");
    cell.disabled = false;
  });

  if (findState.queue.length === 0) {
    findState.queue = shuffle(findState.pool);
  }
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

  const correctCode = findState.current.code;
  Array.from(elFind.grid.children).forEach((c) => {
    c.disabled = true;
    if (c.dataset.code === correctCode) {
      c.classList.add("is-correct");
    } else if (c === cell) {
      c.classList.add("is-wrong");
    } else {
      c.classList.add("is-muted");
    }
  });

  if (sign.code === correctCode) {
    findState.streak += 1;
    elFind.score.textContent = `Série : ${findState.streak}`;
    elFind.btnNext.hidden = false;
    revealButtonGeneric(elFind.btnNext);
  } else {
    setTimeout(endInfiniteFind, 1100);
  }
}

function endInfiniteFind() {
  const streak = findState.streak;
  document.getElementById("findEndScore").textContent =
    streak <= 1 ? `${streak} panneau identifié` : `${streak} panneaux identifiés`;

  const key = "panneaux-quiz-best-streak-find";
  let best = 0;
  try {
    best = Number(localStorage.getItem(key) || 0);
  } catch (err) {
    best = 0;
  }
  let comment;
  if (streak > best) {
    try {
      localStorage.setItem(key, String(streak));
    } catch (err) {
      /* stockage indisponible : on ignore silencieusement */
    }
    comment = "Nouveau record personnel !";
  } else {
    comment = `Ton record reste à ${best}.`;
  }
  document.getElementById("findEndComment").textContent = comment;
  showScreen("endInfiniteFind");
}

elFind.btnNext.addEventListener("click", () => nextFindQuestion());

document.getElementById("btnStartInfiniteFind").addEventListener("click", () => startFindGame());
document.getElementById("btnRetryInfiniteFind").addEventListener("click", () => startFindGame());
document.getElementById("btnHomeFromInfiniteFind").addEventListener("click", () => showScreen("home"));
