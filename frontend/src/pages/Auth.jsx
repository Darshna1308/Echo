import { useState } from "react";
import { saveAuth } from "../utils/auth";
import "./Auth.css";

const API_URL = "http://localhost:5000/api/auth";

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [status, setStatus] =
    useState("idle");

  const [message, setMessage] =
    useState("");

  const handleChange = (event) => {
    const { name, value } =
      event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatus("loading");
    setMessage("");

    try {
      const endpoint =
        mode === "login"
          ? "/login"
          : "/register";

      const body =
        mode === "login"
          ? {
              email: form.email,
              password: form.password,
            }
          : {
              name: form.name,
              email: form.email,
              password: form.password,
            };

      const response = await fetch(
        `${API_URL}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      if (
        !contentType.includes(
          "application/json"
        )
      ) {
        throw new Error(
          `Server returned ${response.status} instead of JSON.`
        );
      }

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ||
            "Authentication failed."
        );
      }

      saveAuth(
        data.token,
        data.user
      );

      setStatus("success");
      setMessage(
        mode === "login"
          ? "Welcome back to Echo."
          : "Your Echo account is ready."
      );

      if (
        typeof onLogin === "function"
      ) {
        onLogin(data.user);
      }
    } catch (error) {
      console.error(
        "Authentication error:",
        error
      );

      setStatus("error");
      setMessage(
        error.message ||
          "Something went wrong."
      );
    }
  };

  const switchMode = () => {
    setMode(
      mode === "login"
        ? "register"
        : "login"
    );

    setMessage("");
    setStatus("idle");
  };

  return (
    <main className="auth-page">

      <div
        className="auth-sand"
        aria-hidden="true"
      />

      <div
        className="auth-wave"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </div>

      <section className="auth-card">

        <div className="auth-heading">

          <p className="auth-kicker">
            Your little corner of Echo
          </p>

          <h1>
            {mode === "login"
              ? "Welcome back."
              : "Begin your archive."}
          </h1>

          <p>
            {mode === "login"
              ? "Your memories have been waiting."
              : "Give the moments you love a place to stay."}
          </p>

        </div>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >

          {mode === "register" && (
            <div className="auth-field">

              <label htmlFor="name">
                Your name
              </label>

              <input
                id="name"
                name="name"
                type="text"
                placeholder="Darshna"
                value={form.name}
                onChange={handleChange}
                autoComplete="name"
                required
              />

            </div>
          )}

          <div className="auth-field">

            <label htmlFor="email">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
              required
            />

          </div>

          <div className="auth-field">

            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={handleChange}
              autoComplete={
                mode === "login"
                  ? "current-password"
                  : "new-password"
              }
              minLength={6}
              required
            />

          </div>

          {message && (
            <p
              className={`auth-message auth-message-${status}`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={
              status === "loading"
            }
          >
            {status === "loading"
              ? "Opening Echo..."
              : mode === "login"
                ? "Enter Echo"
                : "Create my Echo"}
          </button>

        </form>

        <div className="auth-switch">

          <span>
            {mode === "login"
              ? "New to Echo?"
              : "Already have an account?"}
          </span>

          <button
            type="button"
            onClick={switchMode}
          >
            {mode === "login"
              ? "Create an account"
              : "Log in"}
          </button>

        </div>

        <p className="auth-privacy">
          Your memories belong to you.
        </p>

      </section>

    </main>
  );
}

export default Auth;