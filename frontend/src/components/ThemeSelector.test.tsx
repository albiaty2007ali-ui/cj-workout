import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../test/renderWithProviders";
import ThemeSelector from "./ThemeSelector";

vi.mock("../lib/api", () => ({ api: { post: vi.fn(async () => ({ success: true, data: {}, error: null })) } }));

describe("ThemeSelector", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("premium user: clicking a premium swatch sets data-theme immediately (no lock modal)", () => {
    renderWithProviders(<ThemeSelector isPremium currentTheme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("ocean");
    expect(document.querySelector(".modal-overlay")).not.toBeInTheDocument();
  });

  it("non-premium user: clicking a premium swatch shows the lock modal and does NOT change the theme", () => {
    renderWithProviders(<ThemeSelector isPremium={false} currentTheme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "Ocean" }));

    expect(document.documentElement.getAttribute("data-theme")).not.toBe("ocean");
    expect(document.querySelector(".modal-overlay")).toBeInTheDocument();
  });

  it("free themes (light/dark) apply for every user regardless of premium status", () => {
    renderWithProviders(<ThemeSelector isPremium={false} currentTheme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "غامق" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
