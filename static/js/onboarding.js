document.addEventListener("DOMContentLoaded", () => {
  const steps = Array.from(document.querySelectorAll(".ob-step"));
  const indicator = document.getElementById("step-indicator");
  const backBtn = document.getElementById("ob-back");
  const nextBtn = document.getElementById("ob-next");
  const submitBtn = document.getElementById("ob-submit");
  let current = 0;

  function show(index) {
    steps.forEach((s, i) => (s.hidden = i !== index));
    indicator.textContent = `${index + 1} / ${steps.length}`;
    backBtn.style.display = index === 0 ? "none" : "inline-block";
    const isLast = index === steps.length - 1;
    nextBtn.style.display = isLast ? "none" : "inline-block";
    submitBtn.style.display = isLast ? "inline-block" : "none";
  }

  function currentStepValid() {
    const step = steps[current];
    const inputs = step.querySelectorAll("input[required]");
    if (inputs.length === 0) return true;
    if (inputs[0].type === "radio") {
      return Array.from(inputs).some((r) => r.checked) ||
        Array.from(step.querySelectorAll('input[type="radio"]')).some((r) => r.checked);
    }
    return inputs[0].value.trim() !== "";
  }

  nextBtn.addEventListener("click", () => {
    if (!currentStepValid()) {
      steps[current].querySelector("input")?.focus();
      return;
    }
    if (current < steps.length - 1) {
      current += 1;
      show(current);
    }
  });

  backBtn.addEventListener("click", () => {
    if (current > 0) {
      current -= 1;
      show(current);
    }
  });

  show(current);
});
