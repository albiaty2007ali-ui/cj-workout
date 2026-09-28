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
});
