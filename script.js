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
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
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
  currentSign: null,
  currentImageUrl: null,
  history: [], // uniquement rempli en mode "qcm" : { imageUrl, correctText, chosenText, isCorrect }
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
  reviewGrid: document.getElementById("reviewGrid"),
  reviewModal: document.getElementById("reviewModal"),
  reviewModalBackdrop: document.getElementById("reviewModalBackdrop"),
  reviewModalClose: document.getElementById("reviewModalClose"),
  reviewModalImage: document.getElementById("reviewModalImage"),
  reviewModalStatus: document.getElementById("reviewModalStatus"),
  reviewModalCorrect: document.getElementById("reviewModalCorrect"),
  reviewModalWrongWrap: document.getElementById("reviewModalWrongWrap"),
  reviewModalWrong: document.getElementById("reviewModalWrong"),
};

/* ---------- Lancement d'une partie ---------- */
function startGame(mode) {
  state.mode = mode;
  state.queue = shuffle(SIGNS);
  state.score = 0;
  state.streak = 0;
  state.qIndex = 0;
  state.total = mode === "qcm" ? 20 : Infinity;
  state.history = [];
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

  if (state.mode === "qcm") {
    const correctOption = allOptions.find((o) => o.correct);
    state.history.push({
      imageUrl: state.currentImageUrl,
      correctText: correctOption.text,
      chosenText: chosen.text,
      isCorrect: chosen.correct,
    });
  }

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

// Le bouton "Suivant" apparaît sous les options : sur les petits écrans (ou
// avec la webcam d'un logiciel de capture par-dessus la page), il peut sortir
// du cadre visible. On le fait défiler dans la vue dès qu'il s'affiche.
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
  renderReviewGrid();
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

/* ---------- Grille de révision (fin de QCM) ---------- */
function renderReviewGrid() {
  el.reviewGrid.innerHTML = "";
  state.history.forEach((entry, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `review-item ${entry.isCorrect ? "review-item--correct" : "review-item--wrong"}`;
    item.innerHTML = `
      <span class="review-item-number">Q${index + 1}</span>
      <img src="${entry.imageUrl}" alt="Panneau question ${index + 1}, ${entry.isCorrect ? "réussie" : "ratée"}">
      <span class="review-item-badge" aria-hidden="true">${entry.isCorrect ? "✓" : "✗"}</span>
    `;
    item.addEventListener("click", () => openReviewModal(index));
    el.reviewGrid.appendChild(item);
  });
}

function openReviewModal(index) {
  const entry = state.history[index];
  if (!entry) return;

  el.reviewModalImage.src = entry.imageUrl;
  el.reviewModalStatus.textContent = entry.isCorrect
    ? `Question ${index + 1} — Bonne réponse`
    : `Question ${index + 1} — Réponse incorrecte`;
  el.reviewModalCorrect.textContent = entry.correctText;

  if (entry.isCorrect) {
    el.reviewModalWrongWrap.hidden = true;
  } else {
    el.reviewModalWrong.textContent = entry.chosenText;
    el.reviewModalWrongWrap.hidden = false;
  }

  el.reviewModal.hidden = false;
}

function closeReviewModal() {
  el.reviewModal.hidden = true;
}

el.reviewModalClose.addEventListener("click", closeReviewModal);
el.reviewModalBackdrop.addEventListener("click", closeReviewModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.reviewModal.hidden) closeReviewModal();
});

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
