document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("edit-profile-toggle");
  const cancelBtn = document.getElementById("cancel-edit-btn");
  const editForm = document.getElementById("profile-edit-form");

  function closeEdit() {
    editForm?.classList.remove("open");
  }

  toggleBtn?.addEventListener("click", () => editForm.classList.toggle("open"));
  cancelBtn?.addEventListener("click", closeEdit);

  editForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));

    const payload = {
      name: document.getElementById("edit-name").value,
      username: document.getElementById("edit-username").value,
      bio: document.getElementById("edit-bio").value,
    };

    try {
      const res = await fetch("/profile/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": window.CJ_CSRF_TOKEN },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.errors) {
          Object.entries(data.errors).forEach(([field, msg]) => {
            const el = document.getElementById(`err-${field}`);
            if (el) el.textContent = msg;
          });
        } else {
          window.showToast(data.error || "صار خطأ، حاول مرة ثانية.", "error");
        }
        return;
      }

      document.querySelector(".profile-name").textContent = data.name;
      let usernameEl = document.querySelector(".profile-username");
      if (data.username) {
        if (!usernameEl) {
          usernameEl = document.createElement("p");
          usernameEl.className = "profile-username";
          document.querySelector(".profile-name").insertAdjacentElement("afterend", usernameEl);
        }
        usernameEl.textContent = `@${data.username}`;
      } else if (usernameEl) {
        usernameEl.remove();
      }
      let bioEl = document.querySelector(".profile-bio");
      if (data.bio) {
        if (!bioEl) {
          bioEl = document.createElement("p");
          bioEl.className = "profile-bio";
          document.querySelector(".profile-header > div").appendChild(bioEl);
        }
        bioEl.textContent = data.bio;
      } else if (bioEl) {
        bioEl.remove();
      }

      closeEdit();
      window.showToast("تم تحديث ملفك الشخصي ✓", "success");
    } catch (err) {
      window.showToast("صار خطأ بالاتصال، حاول مرة ثانية.", "error");
    }
  });

  const photoInput = document.getElementById("photo-input");
  const changePhotoBtn = document.getElementById("change-photo-btn");
  const removePhotoBtn = document.getElementById("remove-photo-btn");

  changePhotoBtn?.addEventListener("click", () => photoInput.click());

  photoInput?.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch("/profile/photo", {
        method: "POST",
        headers: { "X-CSRFToken": window.CJ_CSRF_TOKEN },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        window.showToast(data.error || "صار خطأ برفع الصورة.", "error");
        return;
      }
      let avatarEl = document.querySelector(".avatar, .avatar-placeholder");
      const img = document.createElement("img");
      img.className = "avatar";
      img.src = data.photo_url + "?t=" + Date.now();
      img.alt = "photo";
      avatarEl.replaceWith(img);
      window.showToast("تم تحديث الصورة ✓", "success");
    } catch (err) {
      window.showToast("صار خطأ بالاتصال، حاول مرة ثانية.", "error");
    }
  });

  removePhotoBtn?.addEventListener("click", async () => {
    try {
      const res = await fetch("/profile/photo/remove", {
        method: "POST",
        headers: { "X-CSRFToken": window.CJ_CSRF_TOKEN },
      });
      if (!res.ok) {
        window.showToast("صار خطأ، حاول مرة ثانية.", "error");
        return;
      }
      const avatarEl = document.querySelector(".avatar, .avatar-placeholder");
      const name = document.querySelector(".profile-name").textContent.trim();
      const placeholder = document.createElement("div");
      placeholder.className = "avatar-placeholder";
      placeholder.textContent = name.charAt(0) || "?";
      avatarEl.replaceWith(placeholder);
      removePhotoBtn.remove();
      window.showToast("تم حذف الصورة", "info");
    } catch (err) {
      window.showToast("صار خطأ بالاتصال، حاول مرة ثانية.", "error");
    }
  });
});
