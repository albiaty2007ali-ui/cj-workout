document.addEventListener("DOMContentLoaded", () => {
  // ---- Segmented controls عامة (AI style / privacy) — تحفظ بالسيرفر عبر fetch ----
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": window.CJ_CSRF_TOKEN },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  function wireSegmented(elId, endpoint, bodyKey, successMsg) {
    const el = document.getElementById(elId);
    if (!el) return;
    const current = el.dataset.current;
    el.querySelectorAll("button").forEach((btn) => {
      if (btn.dataset.value === current) btn.classList.add("active");
      btn.addEventListener("click", async () => {
        el.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const { ok, data } = await postJSON(endpoint, { [bodyKey]: btn.dataset.value });
        if (ok) {
          window.showToast(successMsg, "success");
        } else {
          window.showToast(data.error || "صار خطأ، حاول مرة ثانية.", "error");
        }
      });
    });
  }

  wireSegmented("ai-style-segmented", "/settings/ai-style", "style", "تم حفظ أسلوب الرد ✓");
  wireSegmented("privacy-segmented", "/settings/privacy", "visibility", "تم تحديث الخصوصية ✓");

  // ---- المظهر (localStorage فقط، مو بيانات مستخدم بالسيرفر) ----
  const themeEl = document.getElementById("theme-segmented");
  if (themeEl) {
    let saved;
    try { saved = localStorage.getItem("cj_theme"); } catch (e) { saved = null; }
    const currentTheme = saved === "dark" || saved === "light" ? saved : "system";
    themeEl.querySelectorAll("button").forEach((btn) => {
      if (btn.dataset.value === currentTheme) btn.classList.add("active");
      btn.addEventListener("click", () => {
        themeEl.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const value = btn.dataset.value;
        try {
          if (value === "system") {
            localStorage.removeItem("cj_theme");
            document.documentElement.removeAttribute("data-theme");
          } else {
            localStorage.setItem("cj_theme", value);
            document.documentElement.setAttribute("data-theme", value);
          }
        } catch (e) {}
        window.showToast("تم تحديث المظهر ✓", "success");
      });
    });
  }

  // ---- تغيير كلمة المرور ----
  document.getElementById("password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("password-error");
    errEl.textContent = "";
    const { ok, data } = await postJSON("/settings/password", {
      current_password: document.getElementById("current-password").value,
      new_password: document.getElementById("new-password").value,
      confirm_password: document.getElementById("confirm-password").value,
    });
    if (ok) {
      document.getElementById("password-form").reset();
      window.showToast("تم تغيير كلمة المرور ✓", "success");
    } else {
      errEl.textContent = data.error || "صار خطأ، حاول مرة ثانية.";
    }
  });

  // ---- الإشعارات (Web Push حقيقي) ----
  const pushMasterBtn = document.getElementById("push-master-toggle");
  const pushErrorEl = document.getElementById("push-error");
  const categoriesBox = document.getElementById("notification-categories");

  function setNotificationsUiEnabled(enabled) {
    if (!pushMasterBtn) return;
    pushMasterBtn.textContent = enabled ? "مفعّلة ✓" : "تفعيل";
    pushMasterBtn.classList.toggle("btn-moss", enabled);
    pushMasterBtn.classList.toggle("btn-outline-dark", !enabled);
    if (categoriesBox) {
      categoriesBox.style.opacity = enabled ? "1" : "0.5";
      categoriesBox.style.pointerEvents = enabled ? "auto" : "none";
    }
  }

  pushMasterBtn?.addEventListener("click", async () => {
    pushErrorEl.textContent = "";
    const turningOn = pushMasterBtn.textContent.trim() === "تفعيل";
    pushMasterBtn.disabled = true;

    if (turningOn) {
      const result = await cjEnablePushNotifications();
      if (!result.ok) {
        pushErrorEl.textContent = result.error || "ما قدرنا نفعّل الإشعارات.";
        pushMasterBtn.disabled = false;
        return;
      }
    } else {
      await cjDisablePushNotifications();
    }

    const { ok, data } = await postJSON("/settings/notifications", { enabled: turningOn });
    pushMasterBtn.disabled = false;
    if (!ok) {
      pushErrorEl.textContent = data.error || "صار خطأ، حاول مرة ثانية.";
      return;
    }
    setNotificationsUiEnabled(turningOn);
    window.showToast(turningOn ? "تم تفعيل الإشعارات ✓" : "تم تعطيل الإشعارات", "success");
  });

  document.getElementById("save-notification-settings")?.addEventListener("click", async () => {
    const body = {
      quiet_hours_start: document.getElementById("quiet-start").value,
      quiet_hours_end: document.getElementById("quiet-end").value,
      breakfast_time: document.getElementById("time-breakfast").value,
      lunch_time: document.getElementById("time-lunch").value,
      dinner_time: document.getElementById("time-dinner").value,
      daily_limit: parseInt(document.getElementById("daily-limit").value, 10),
    };
    document.querySelectorAll(".notif-category-checkbox").forEach((cb) => {
      body[cb.dataset.field] = cb.checked;
    });
    const { ok, data } = await postJSON("/settings/notifications", body);
    if (ok) {
      window.showToast("تم حفظ إعدادات الإشعارات ✓", "success");
    } else {
      window.showToast(data.error || "صار خطأ، حاول مرة ثانية.", "error");
    }
  });

  // ---- حذف الحساب ----
  const deleteBtn = document.getElementById("delete-account-btn");
  const deleteBox = document.getElementById("delete-confirm-box");
  deleteBtn?.addEventListener("click", () => (deleteBox.style.display = "block"));
  document.getElementById("cancel-delete-btn")?.addEventListener("click", () => (deleteBox.style.display = "none"));
  document.getElementById("confirm-delete-btn")?.addEventListener("click", async () => {
    const { ok, data } = await postJSON("/settings/delete-account", {
      password: document.getElementById("delete-password").value,
    });
    if (ok) {
      window.location.href = "/";
    } else {
      window.showToast(data.error || "صار خطأ، حاول مرة ثانية.", "error");
    }
  });
});
