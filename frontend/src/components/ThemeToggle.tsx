import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";
const STORAGE_KEY = "cj_theme";

function readSaved(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(choice: ThemeChoice) {
  if (choice === "system") {
    document.documentElement.removeAttribute("data-theme");
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  } else {
    document.documentElement.setAttribute("data-theme", choice);
    try { localStorage.setItem(STORAGE_KEY, choice); } catch { /* ignore */ }
  }
}

const OPTIONS: Array<[ThemeChoice, string]> = [
  ["light", "فاتح"],
  ["dark", "غامق"],
  ["system", "تلقائي"],
];

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    setChoice(readSaved());
  }, []);

  function select(next: ThemeChoice) {
    setChoice(next);
    apply(next);
  }

  return (
    <div className="theme-segmented">
      {OPTIONS.map(([value, label]) => (
        <button type="button" key={value} className={choice === value ? "active" : ""} onClick={() => select(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}
