document.addEventListener("DOMContentLoaded", () => {
  const chatWindow = document.getElementById("chat-window");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");

  function appendBubble(text, who) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${who}`;
    bubble.style.whiteSpace = "pre-line";
    bubble.textContent = text;
    chatWindow.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return bubble;
  }

  function appendPremiumLock(text) {
    const wrap = document.createElement("div");
    wrap.className = "chat-bubble bot premium-lock";
    wrap.style.whiteSpace = "pre-line";
    wrap.textContent = text;
    const btn = document.createElement("a");
    btn.href = window.CJ_SUBSCRIBE_URL;
    btn.className = "btn btn-gold";
    btn.style.marginTop = "14px";
    btn.style.display = "inline-block";
    btn.textContent = "كمل رحلتك 💚 — الاشتراك الشهري";
    wrap.appendChild(document.createElement("br"));
    wrap.appendChild(btn);
    chatWindow.appendChild(wrap);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function updateCards(data) {
    if (data.target_calories != null) document.getElementById("cc-target").textContent = data.target_calories + " kcal";
    if (data.today_calories != null) document.getElementById("cc-eaten").textContent = data.today_calories + " kcal";
    if (data.remaining != null) document.getElementById("cc-remaining").textContent = Math.max(0, data.remaining) + " kcal";
    if (data.free_meals_remaining != null) {
      const el = document.getElementById("cc-free");
      if (el && !el.textContent.includes("نشط")) el.textContent = data.free_meals_remaining + " / 6";
    }
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    appendBubble(text, "user");
    input.value = "";
    sendBtn.disabled = true;

    const typing = appendBubble("جاري التحليل...", "bot typing");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": window.CJ_CSRF_TOKEN,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      typing.remove();

      if (!res.ok) {
        appendBubble(data.error || "صار خطأ، حاول مرة ثانية.", "bot error");
        return;
      }

      if (data.premium_required) {
        appendPremiumLock(data.reply);
        return;
      }

      appendBubble(data.reply, "bot");
      updateCards(data);
    } catch (err) {
      typing.remove();
      appendBubble("صار خطأ بالاتصال، تأكد من الإنترنت وحاول مرة ثانية.", "bot error");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendMessage(input.value);
  });

  document.querySelectorAll(".qp-btn, .sidebar-item[data-prompt]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-prompt");
      input.value = prompt;
      input.focus();
    });
  });

  // ==================== Sidebar Drawer — حالة مركزية واحدة ====================
  // sidebarOpen هو المصدر الوحيد للحقيقة؛ كل نقطة تفعيل (☰/✕/Overlay/خارج القائمة/Swipe/ESC)
  // تمرّ حصرًا عبر setSidebarOpen حتى ما تتوزع الحالة بأكثر من مكان (Section 8/30 بالطلب).
  const sidebar = document.getElementById("app-sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const sidebarToggleBtn = document.getElementById("sidebar-toggle");
  const sidebarCloseBtn = document.getElementById("sidebar-close");

  let sidebarOpen = window.innerWidth > 860; // نفس الافتراضي القديم: مفتوحة بالـDesktop، مقفولة بالموبايل

  function setSidebarOpen(open) {
    sidebarOpen = open;
    document.body.classList.toggle("sidebar-open", open);
    if (sidebarOverlay) sidebarOverlay.hidden = !open;
    sidebarToggleBtn?.setAttribute("aria-expanded", String(open));
  }
  setSidebarOpen(sidebarOpen);

  sidebarToggleBtn?.addEventListener("click", () => setSidebarOpen(!sidebarOpen));
  sidebarCloseBtn?.addEventListener("click", () => setSidebarOpen(false));
  sidebarOverlay?.addEventListener("click", () => setSidebarOpen(false));

  // الضغط خارج القائمة (يشمل عمليًا "الجهة المقابلة" المطلوبة بالطلب) يغلقها
  document.addEventListener("click", (e) => {
    if (!sidebarOpen || !sidebar) return;
    if (sidebar.contains(e.target) || e.target === sidebarToggleBtn || sidebarToggleBtn?.contains(e.target)) return;
    setSidebarOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidebarOpen) setSidebarOpen(false);
  });

  // Swipe لليمين داخل القائمة (نفس جهة ارتكازها بواجهة RTL) يغلقها — أفقي غالب فقط، بعتبة
  // معقولة، حتى ما يتصادم مع Scroll العمودي الطبيعي داخل عناصر القائمة
  let touchStartX = 0, touchStartY = 0, touchTracking = false;
  sidebar?.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchTracking = true;
  }, { passive: true });
  sidebar?.addEventListener("touchmove", (e) => {
    if (!touchTracking) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy) && dx > 60) {
      setSidebarOpen(false);
      touchTracking = false;
    }
  }, { passive: true });
  sidebar?.addEventListener("touchend", () => { touchTracking = false; });

  // ==================== لوحات/نوافذ فرعية داخل الصفحة ====================
  function toggleExclusive(id, others, triggerBtn) {
    const panel = document.getElementById(id);
    if (!panel) return;
    const willShow = panel.hidden;
    others.forEach((o) => {
      const el = document.getElementById(o);
      if (el) el.hidden = true;
    });
    panel.hidden = !willShow;
    triggerBtn?.classList.toggle("sidebar-item-active", willShow);
  }
  const progressToggleBtn = document.getElementById("progress-toggle");
  progressToggleBtn?.addEventListener("click", () =>
    toggleExclusive("progress-panel", [], progressToggleBtn)
  );

  const consultToggleBtn = document.getElementById("consult-toggle");
  const consultOverlay = document.getElementById("consult-modal-overlay");
  consultToggleBtn?.addEventListener("click", () => {
    if (consultOverlay) consultOverlay.hidden = false;
    consultToggleBtn.classList.add("sidebar-item-active");
  });
  function closeConsultModal() {
    if (consultOverlay) consultOverlay.hidden = true;
    consultToggleBtn?.classList.remove("sidebar-item-active");
  }
  document.getElementById("consult-modal-close")?.addEventListener("click", closeConsultModal);
  consultOverlay?.addEventListener("click", (e) => {
    if (e.target === consultOverlay) closeConsultModal();
  });
});
