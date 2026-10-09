import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../lib/auth";
import { Button, Field } from "../components/ui";
import { Wordmark } from "../components/Brand";
import HaveliStage from "../components/HaveliStage";
import "./Welcome.css";

const EMPTY = { name: "", email: "", password: "" };

function clientValidate(mode, form) {
  const errors = {};
  if (mode === "register" && form.name.trim().length < 2) errors.name = "Your name needs at least 2 characters.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = "Please enter a valid email address.";
  if (mode === "register" && form.password.length < 8) errors.password = "Your password needs at least 8 characters.";
  if (mode === "login" && !form.password) errors.password = "Please enter your password.";
  return errors;
}

export default function Welcome() {
  const { login, register, notice, setNotice } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const update = (event) => {
    const { name, value } = event.target;
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const switchMode = (next) => {
    setMode(next);
    setErrors({});
    setMessage("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = clientValidate(mode, form);
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      if (mode === "login") await login(form.email.trim(), form.password);
      else await register(form.name.trim(), form.email.trim(), form.password);
      setNotice("");
      const next = params.get("next");
      navigate(next && next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true });
    } catch (error) {
      const fieldErrors = error.fieldErrors?.() || {};
      setErrors(fieldErrors);
      setMessage(Object.keys(fieldErrors).length ? "" : error.message);
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <HaveliStage>
        <div className="welcome-intro">
          <Wordmark />
          <h1 className="welcome-title">A home for the memories you don't want to lose.</h1>
          <p className="welcome-lede">
            Echo keeps the photographs, voices, people and places behind your moments — privately, in one archive that grows more
            meaningful with time.
          </p>
        </div>
      </HaveliStage>

      <section className="welcome-panel" aria-labelledby="auth-heading">
        <div className="welcome-panel-inner">
          <div className="auth-tabs" role="tablist" aria-label="Account">
            <button type="button" role="tab" aria-selected={mode === "login"} className="auth-tab" onClick={() => switchMode("login")}>
              Log in
            </button>
            <button type="button" role="tab" aria-selected={mode === "register"} className="auth-tab" onClick={() => switchMode("register")}>
              Create account
            </button>
          </div>

          <h2 id="auth-heading" className="auth-heading">
            {mode === "login" ? "Welcome back." : "Begin your archive."}
          </h2>
          <p className="auth-sub">
            {mode === "login" ? "Your memories are where you left them." : "It takes a minute. Your archive is private to you."}
          </p>

          {notice && (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          )}

          <form className="auth-form" onSubmit={submit} noValidate>
            {mode === "register" && (
              <Field
                label="Your name"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={update}
                error={errors.name}
                maxLength={80}
                required
              />
            )}
            <Field
              label="Email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={update}
              error={errors.email}
              required
            />
            <div className="auth-password">
              <Field
                label="Password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password}
                onChange={update}
                error={errors.password}
                hint={mode === "register" ? "At least 8 characters." : undefined}
                maxLength={128}
                required
              />
              <button
                type="button"
                className="auth-reveal"
                onClick={() => setShowPassword((s) => !s)}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {message && (
              <p className="auth-error" role="alert">
                {message}
              </p>
            )}

            <Button type="submit" size="large" busy={busy} className="auth-submit">
              {mode === "login" ? "Open my archive" : "Create my archive"}
            </Button>
          </form>

          <p className="auth-privacy">
            Your memories are visible only to you. Photos and recordings are served only to your signed-in account.
          </p>
        </div>
      </section>
    </div>
  );
}
