import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import UserAuthForm from "./userAuthForm.page.jsx";
import { PASSWORD_ERROR } from "../common/validation";

const { post, toastError } = vi.hoisted(() => ({
  post: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("../common/api", () => ({
  default: { post: (...args) => post(...args) },
}));

vi.mock("react-hot-toast", () => ({
  default: {
    error: (...args) => toastError(...args),
    success: vi.fn(),
    loading: vi.fn(),
  },
}));

vi.mock("../App", async () => {
  const { createContext } = await import("react");
  return {
    UserContext: createContext({
      userAuth: { access_token: "" },
      setUserAuth: () => {},
    }),
  };
});

const renderSignup = () =>
  render(
    <MemoryRouter>
      <UserAuthForm type="sign-up" />
    </MemoryRouter>
  );

const fill = async (user, { fullname = "Jo Bloggs", email, password }) => {
  if (fullname) {
    await user.type(screen.getByPlaceholderText("Full name"), fullname);
  }
  await user.type(screen.getByPlaceholderText("Email"), email);
  await user.type(screen.getByPlaceholderText("Password"), password);
};

describe("sign-up form validation", () => {
  beforeEach(() => {
    post.mockResolvedValue({ data: { message: "OTP sent", email: "user!tag@example.com" } });
  });

  it("submits an RFC-valid email and a 64-code-point password", async () => {
    const user = userEvent.setup();
    renderSignup();
    await fill(user, {
      email: "user!tag@example.com",
      password: `Aa1${"x".repeat(60)}😀`,
    });
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(toastError).not.toHaveBeenCalled();
    const [route, formData] = post.mock.calls[0];
    expect(route).toBe("/signup");
    expect(formData.email).toBe("user!tag@example.com");
  });

  it("rejects an address without a domain dot before calling the API", async () => {
    const user = userEvent.setup();
    renderSignup();
    await fill(user, { email: "jo@gmail", password: "Aa1abcdef" });
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(toastError).toHaveBeenCalledWith("Email is invalid");
    expect(post).not.toHaveBeenCalled();
  });

  it("explains the 72-byte bcrypt limit", async () => {
    const user = userEvent.setup();
    renderSignup();
    await fill(user, {
      email: "jo@example.com",
      password: `Aa1${"é".repeat(34)}bb`, // 73 UTF-8 bytes
    });
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    expect(toastError).toHaveBeenCalledWith(PASSWORD_ERROR);
    expect(post).not.toHaveBeenCalled();
  });
});
