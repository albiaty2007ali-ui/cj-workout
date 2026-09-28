import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test/renderWithProviders";
import Login from "./Login";

const postMock = vi.fn();
vi.mock("../lib/api", () => ({ api: { post: (...args: unknown[]) => postMock(...args) } }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => vi.fn() };
});

describe("Login page", () => {
  it("renders the email/password form", () => {
    renderWithProviders(<Login />);
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toBeInTheDocument();
    expect(screen.getByLabelText(/كلمة المرور/)).toBeInTheDocument();
  });

  it("shows the server's error message when login fails", async () => {
    postMock.mockResolvedValueOnce({ success: false, data: null, error: { code: "INVALID_CREDENTIALS", message: "بيانات خاطئة" } });
    renderWithProviders(<Login />);

    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), { target: { value: "wrongpass" } });
    fireEvent.click(screen.getByRole("button", { name: /دخول/ }));

    await waitFor(() => expect(screen.getByText("بيانات خاطئة")).toBeInTheDocument());
    expect(postMock).toHaveBeenCalledWith("/auth/login", { email: "a@b.com", password: "wrongpass" });
  });
});
