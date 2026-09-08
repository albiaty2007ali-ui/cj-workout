function cjEscapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

function cjDebounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function recipeCardHtml(r) {
  const img = r.image_url
    ? `<img class="recipe-card-img" src="${cjEscapeHtml(r.image_url)}" alt="${cjEscapeHtml(r.name)}" loading="lazy">`
    : `<div class="recipe-card-img-placeholder">${cjEscapeHtml(r.category_icon || "🍽️")}</div>`;

  const macros = [
    `${r.calories} kcal`,
    r.protein != null ? `بروتين ${r.protein}غ` : null,
    r.carbs != null ? `كارب ${r.carbs}غ` : null,
    r.fat != null ? `دهون ${r.fat}غ` : null,
  ].filter(Boolean).join(" · ");

  const timing = [
    r.prep_time_min ? `تحضير ${r.prep_time_min}د` : null,
    r.cook_time_min ? `طبخ ${r.cook_time_min}د` : null,
  ].filter(Boolean).join(" · ");

  let badge = "";
  if (r.fits_remaining === true) badge = `<p class="recipe-fits-badge">✅ يناسب سعراتك المتبقية</p>`;
  else if (r.fits_remaining === false) badge = `<p class="recipe-over-badge">⚠️ أعلى من سعراتك المتبقية</p>`;

  return `
    <a class="recipe-card" href="/recipes/${encodeURIComponent(r.slug)}">
      ${img}
      <div class="recipe-card-body">
        <p class="recipe-card-name">${cjEscapeHtml(r.name)}</p>
        <p class="recipe-card-cat">${cjEscapeHtml(r.category_icon || "")} ${cjEscapeHtml(r.category || "")}${timing ? " · " + cjEscapeHtml(timing) : ""}</p>
        <p class="recipe-card-macros">${cjEscapeHtml(macros)}</p>
        ${badge}
        <span class="btn btn-outline-dark recipe-card-btn">شوف الوصفة</span>
      </div>
    </a>`;
}

function skeletonHtml(count) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `<div class="recipe-skeleton"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line" style="width:60%;"></div></div>`;
  }
  return html;
}

function initRecipesIndex() {
  const grid = document.getElementById("recipe-grid");
  if (!grid) return;

  const searchInput = document.getElementById("recipe-search-input");
  const emptyState = document.getElementById("recipe-empty");
  const errorState = document.getElementById("recipe-error");
  const chips = document.querySelectorAll(".recipe-cat-chip");
  const fitsToggle = document.getElementById("recipe-fits-remaining-toggle");

  let activeCategory = "";
  let lastFetched = [];

  function applyFitsFilterAndRender() {
    const recipes = fitsToggle && fitsToggle.classList.contains("active")
      ? lastFetched.filter((r) => r.fits_remaining === true)
      : lastFetched;
    emptyState.hidden = recipes.length > 0;
    errorState.hidden = true;
    grid.innerHTML = recipes.map(recipeCardHtml).join("");
  }

  async function fetchAndRender() {
    grid.innerHTML = skeletonHtml(6);
    emptyState.hidden = true;
    errorState.hidden = true;
    try {
      const params = new URLSearchParams();
      if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
      if (activeCategory) params.set("category", activeCategory);
      const res = await fetch(`/recipes/api/search?${params.toString()}`);
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      lastFetched = data.recipes || [];
      applyFitsFilterAndRender();
    } catch (err) {
      grid.innerHTML = "";
      errorState.hidden = false;
    }
  }

  const debouncedFetch = cjDebounce(fetchAndRender, 300);

  // عرض أولي بدون أي طلب شبكة (بيانات مُحمّلة مع الصفحة)
  lastFetched = window.CJ_INITIAL_RECIPES || [];
  applyFitsFilterAndRender();

  searchInput.addEventListener("input", debouncedFetch);

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      activeCategory = chip.getAttribute("data-category") || "";
      fetchAndRender();
    });
  });

  fitsToggle?.addEventListener("click", () => {
    fitsToggle.classList.toggle("active");
    applyFitsFilterAndRender();
  });
}

async function cjPostJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": window.CJ_CSRF_TOKEN },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

function initRecipeDetail() {
  const startBtn = document.getElementById("start-cooking-btn");
  const tutorialMode = document.getElementById("recipe-tutorial-mode");
  const viewMode = document.getElementById("recipe-view-mode");
  const blockedMode = document.getElementById("recipe-blocked-mode");
  if (!tutorialMode) return;

  const slug = window.CJ_RECIPE_SLUG;
  const stepsDataEl = document.getElementById("recipe-steps-data");
  const steps = stepsDataEl ? JSON.parse(stepsDataEl.textContent || "[]") : [];
  const storageKey = `cj_recipe_step_${slug}`;

  const progressFill = document.getElementById("tutorial-progress-fill");
  const progressLabel = document.getElementById("tutorial-progress-label");
  const stepCard = document.getElementById("tutorial-step-card");
  const doneScreen = document.getElementById("tutorial-done");
  const nav = document.getElementById("tutorial-nav");
  const prevBtn = document.getElementById("tutorial-prev");
  const nextBtn = document.getElementById("tutorial-next");
  const eatenPrompt = document.getElementById("recipe-eaten-prompt");
  const eatenActions = document.getElementById("recipe-eaten-actions");
  const eatenResult = document.getElementById("recipe-eaten-result");
  const eatenBack = document.getElementById("recipe-eaten-back");
  let completeRequested = false;

  function getSavedStep() {
    try {
      const v = sessionStorage.getItem(storageKey);
      return v === null ? null : parseInt(v, 10);
    } catch (e) {
      return null;
    }
  }

  function saveStep(idx) {
    try {
      sessionStorage.setItem(storageKey, String(idx));
    } catch (e) {}
  }

  function clearSaved() {
    try {
      sessionStorage.removeItem(storageKey);
    } catch (e) {}
  }

  async function requestEatenPrompt() {
    if (completeRequested) return;
    completeRequested = true;
    eatenPrompt.textContent = "...";
    const { ok, data } = await cjPostJson(`/recipes/${encodeURIComponent(slug)}/complete`, {});
    eatenPrompt.textContent = ok && data.reply ? data.reply : "سويتها 😋 أكلتها لو بعدك؟";
  }

  function renderStep(idx) {
    if (idx >= steps.length) {
      progressFill.style.width = "100%";
      progressLabel.textContent = "خلصت الوصفة 🎉";
      stepCard.hidden = true;
      nav.hidden = true;
      doneScreen.hidden = false;
      eatenActions.hidden = false;
      eatenResult.style.display = "none";
      eatenBack.style.display = "none";
      clearSaved();
      requestEatenPrompt();
      return;
    }
    doneScreen.hidden = true;
    stepCard.hidden = false;
    nav.hidden = false;

    const step = steps[idx];
    progressFill.style.width = `${Math.round(((idx + 1) / steps.length) * 100)}%`;
    progressLabel.textContent = `الخطوة ${idx + 1} / ${steps.length}`;

    let html = `<p class="tutorial-step-number">الخطوة ${idx + 1}</p><p class="tutorial-step-text">${cjEscapeHtml(step.instruction)}</p>`;
    const extras = [];
    if (step.duration) extras.push(`⏱️ ${cjEscapeHtml(step.duration)}`);
    if (step.temperature) extras.push(`🌡️ ${cjEscapeHtml(step.temperature)}`);
    if (extras.length) html += `<p class="tutorial-step-extra">${extras.join(" · ")}</p>`;
    if (step.tip) html += `<p class="tutorial-step-extra">💡 ${cjEscapeHtml(step.tip)}</p>`;
    if (step.warning) html += `<p class="tutorial-step-extra">⚠️ ${cjEscapeHtml(step.warning)}</p>`;
    stepCard.innerHTML = html;

    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === steps.length - 1 ? "إنهاء الوصفة ✓" : "التالي →";
  }

  function showTutorial(startIdx) {
    viewMode.hidden = true;
    tutorialMode.hidden = false;
    renderStep(startIdx);
  }

  if (startBtn) {
    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true;
      const { data } = await cjPostJson(`/recipes/${encodeURIComponent(slug)}/start`, {});
      startBtn.disabled = false;
      if (!data.ok) {
        document.getElementById("blocked-message").textContent =
          data.message || "ما تقدر تبدأ هذي الوصفة هسه.";
        viewMode.hidden = true;
        blockedMode.hidden = false;
        return;
      }
      saveStep(0);
      showTutorial(0);
    });
  }

  eatenActions?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-answer]");
    if (!btn) return;
    eatenActions.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const { data } = await cjPostJson("/api/chat", { message: btn.dataset.answer });
    eatenActions.hidden = true;
    eatenResult.textContent = data.reply || "تمام.";
    eatenResult.style.display = "block";
    eatenBack.style.display = "inline-block";
  });

  prevBtn?.addEventListener("click", () => {
    const current = getSavedStep() || 0;
    const next = Math.max(0, current - 1);
    saveStep(next);
    renderStep(next);
  });

  nextBtn?.addEventListener("click", () => {
    const current = getSavedStep() || 0;
    const next = current + 1;
    saveStep(next);
    renderStep(next);
  });

  // استئناف تلقائي لو المستخدم بنص الـTutorial وأعاد تحميل الصفحة
  const saved = getSavedStep();
  if (saved !== null && steps.length > 0) {
    showTutorial(saved);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initRecipesIndex();
  initRecipeDetail();
});
