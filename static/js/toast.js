// يحوّل رسائل Flask flash إلى Toast بدل alert() العادي، ويوفّر showToast() عامة
// تقدر أي صفحة تستدعيها بعد نجاح/فشل طلب AJAX بدون Reload كامل.
function _fadeAndRemoveToast(toast, delay = 4500) {
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, delay);
}

window.showToast = function (message, category = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${category}`;
  toast.textContent = message;
  container.appendChild(toast);
  _fadeAndRemoveToast(toast);
};

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toasts = container.querySelectorAll(".toast");
  toasts.forEach((toast) => _fadeAndRemoveToast(toast));
});
