import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/renderWithProviders";
import Sidebar from "./Sidebar";

vi.mock("../lib/api", () => ({ api: { post: vi.fn() } }));

describe("Sidebar active-route highlighting", () => {
  it("marks the link matching the current route as active, and no other", () => {
    renderWithProviders(<Sidebar userName="Test" isAdmin={false} />, { route: "/recipes" });
    expect(screen.getByRole("link", { name: /وصفات/ })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /غذائي/ })).not.toHaveClass("active");
  });

  it("auto-expands the nav group containing the active route", () => {
    renderWithProviders(<Sidebar userName="Test" isAdmin={false} />, { route: "/progress/weight" });
    // لو المجموعة ما انفتحت تلقائيًا، الرابط نفسه ما يكون بالـDOM إطلاقًا (مخفي وراء toggle).
    expect(screen.getByRole("link", { name: /الوزن/ })).toBeInTheDocument();
  });

  it("hides the admin link for non-admin users", () => {
    renderWithProviders(<Sidebar userName="Test" isAdmin={false} />, { route: "/chat" });
    expect(screen.queryByRole("link", { name: /لوحة/ })).not.toBeInTheDocument();
  });

  it("shows the admin link for admins", () => {
    renderWithProviders(<Sidebar userName="Test" isAdmin={true} />, { route: "/chat" });
    expect(screen.getByRole("link", { name: /لوحة/ })).toBeInTheDocument();
  });

  it("shows a feature-discovery dot on an unseen route", () => {
    renderWithProviders(<Sidebar userName="Test" isAdmin={false} seenFeatures={{}} />, { route: "/daily" });
    expect(screen.getByRole("link", { name: /غذائي/ }).querySelector(".feature-dot")).not.toBeNull();
  });

  it("hides the dot once the route's feature is marked seen at the current version", () => {
    renderWithProviders(
      <Sidebar userName="Test" isAdmin={false} seenFeatures={{ feature_intro_daily_food: 1 }} />, { route: "/daily" },
    );
    expect(screen.getByRole("link", { name: /غذائي/ }).querySelector(".feature-dot")).toBeNull();
  });

  it("shows a dot on the assistant trigger button when unseen", () => {
    renderWithProviders(
      <Sidebar userName="Test" isAdmin={false} seenFeatures={{}} onOpenAssistant={vi.fn()} />, { route: "/chat" },
    );
    expect(screen.getByRole("button", { name: /مساعد/ }).querySelector(".feature-dot")).not.toBeNull();
  });

  it("hides the assistant dot once seen", () => {
    renderWithProviders(
      <Sidebar userName="Test" isAdmin={false} seenFeatures={{ feature_intro_cj_assistant: 1 }} onOpenAssistant={vi.fn()} />, { route: "/chat" },
    );
    expect(screen.getByRole("button", { name: /مساعد/ }).querySelector(".feature-dot")).toBeNull();
  });

  it("renders no dots at all when seenFeatures is not provided (backward-compatible default)", () => {
    renderWithProviders(<Sidebar userName="Test" isAdmin={false} />, { route: "/daily" });
    expect(document.querySelector(".feature-dot")).toBeNull();
  });
});
