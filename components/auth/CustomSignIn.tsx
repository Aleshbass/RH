'use client';

/**
 * Custom Clerk sign-in: email → password, with an emailed code as the fallback (accounts
 * without a password, "email me a code", new-device checks) and a forgot-password reset.
 * Used by /sign-in and the partner portal (/partners/sign-in, or /sign-in on partners.*).
 */
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { toSafeInternalPath } from "@/lib/auth/ssoRedirect";
import {
  afterSignUpPathFor,
  parseIntent,
  PRIMARY_INTENTS,
  rememberIntent,
  SIGNUP_INTENTS,
  signUpHrefFor,
} from "@/lib/auth/signupIntent";
import { DASHBOARD_LINK_REQUEST_URL } from "@/lib/joyWhatsApp";
import { cn } from "@/lib/utils";
import { AuthShell } from "./AuthShell";
import {
  AuthField,
  AuthSteps,
  CodeField,
  FormNotice,
  GoogleButton,
  OrDivider,
  PasswordField,
  PrimaryButton,
  SPACE,
  StepHeading,
  TextAction,
  useCooldown,
  useGoogleAuth,
} from "./AuthControls";
import {
  AUTH_COPY,
  authHref,
  authRoutes,
  EMAIL_PATTERN,
  parseAuthError,
  type AuthAudience,
  type AuthError,
  type AuthField as FieldName,
} from "./authConfig";

/** Logs a rejected sign-in for the admin audit log. Fire-and-forget: never blocks signing in. */
function reportFailedSignIn(err: unknown, identifier: string) {
  const code = (err as { errors?: { code?: string }[] })?.errors?.[0]?.code;
  if (!code) return;
  fetch("/api/security/failed-sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, identifier }),
    keepalive: true,
  }).catch(() => undefined);
}

type SignInAttempt = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;
type Step = "identifier" | "password" | "code" | "reset";
/** Which Clerk factor the code step verifies. */
type CodeMode = "email_first" | "email_second" | "totp";

/** The email address id behind a factor, or undefined when the factor isn't offered. */
function factorEmailId(factors: readonly { strategy: string }[] | null | undefined, strategy: string) {
  const factor = factors?.find((f) => f.strategy === strategy) as { emailAddressId?: string } | undefined;
  return factor ? factor.emailAddressId ?? "" : undefined;
}

export default function CustomSignIn({
  audience = "default",
  partnersHost = false,
}: {
  audience?: AuthAudience;
  partnersHost?: boolean;
}) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routes = authRoutes(audience, partnersHost);
  const copy = AUTH_COPY[audience].signIn;
  // Came from a "Join as…" button (?as=): a new Google account finishes in that onboarding,
  // and an existing account still ends up on its dashboard (role-selection forwards it)
  const intent = audience === "partner" ? null : parseIntent(searchParams?.get("as"));
  const redirectTarget = toSafeInternalPath(
    searchParams?.get("redirect") || searchParams?.get("redirect_url"),
    intent ? afterSignUpPathFor(intent) : routes.defaultRedirect.signIn,
  );

  const [step, setStep] = useState<Step>("identifier");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeMode, setCodeMode] = useState<CodeMode>("email_first");
  const [codeEmailId, setCodeEmailId] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<AuthError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cooldown = useCooldown();
  const google = useGoogleAuth(redirectTarget, setError);

  // Already signed in (or just finished): go to the destination
  useEffect(() => {
    if (isSignedIn) router.replace(redirectTarget);
  }, [isSignedIn, router, redirectTarget]);

  const goTo = (next: Step, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setError(null);
    setStep(next);
  };

  const fieldError = (field: FieldName) => (error?.field === field ? error.message : undefined);
  const busy = pending !== null || google.loading;
  const signUpHref =
    intent && redirectTarget === afterSignUpPathFor(intent)
      ? signUpHrefFor(intent)
      : authHref(routes.signUp, redirectTarget, routes.defaultRedirect.signIn);

  const fail = (err: unknown, fallback: string) => {
    const parsed = parseAuthError(err, fallback);
    if (parsed.code === "session_exists") {
      router.replace(redirectTarget);
      return;
    }
    setError(parsed);
  };

  /** Completes the attempt, or moves to the step Clerk still needs. */
  const proceed = async (attempt: SignInAttempt) => {
    if (attempt.status === "complete" && attempt.createdSessionId) {
      await setActive?.({ session: attempt.createdSessionId });
      router.replace(redirectTarget);
      return;
    }
    if (attempt.status === "needs_second_factor") {
      // Without MFA this is Clerk's new-device check (Client Trust): an emailed code
      const emailId = factorEmailId(attempt.supportedSecondFactors, "email_code");
      if (emailId !== undefined) {
        await attempt.prepareSecondFactor({ strategy: "email_code", ...(emailId ? { emailAddressId: emailId } : {}) });
        setCodeMode("email_second");
        setCodeEmailId(emailId);
        setCode("");
        setNotice("For your security, confirm it's you on this device with the code we've emailed you.");
        cooldown.restart();
        goTo("code");
        return;
      }
      if (factorEmailId(attempt.supportedSecondFactors, "totp") !== undefined) {
        setCodeMode("totp");
        setCode("");
        setNotice(null);
        goTo("code");
        return;
      }
      setError({ message: "This account needs a verification method we can't offer here. Please contact support." });
      return;
    }
    setError({ message: "We couldn't finish signing you in. Please try again." });
  };

  const sendEmailCode = async (attempt: SignInAttempt, emailId: string) => {
    await attempt.prepareFirstFactor({ strategy: "email_code", emailAddressId: emailId });
    setCodeMode("email_first");
    setCodeEmailId(emailId);
    setCode("");
    cooldown.restart();
    goTo("code");
  };

  const submitIdentifier = async (e: FormEvent) => {
    e.preventDefault();
    const identifier = email.trim();
    if (!EMAIL_PATTERN.test(identifier)) {
      setError({ message: "Enter a valid email address.", field: "email" });
      return;
    }
    if (!isLoaded || !signIn) return;
    setPending("identifier");
    setError(null);
    setNotice(null);
    try {
      const attempt = await signIn.create({ identifier });
      if (attempt.status === "needs_first_factor") {
        const factors = attempt.supportedFirstFactors;
        if (factors?.some((f) => f.strategy === "password")) {
          setPassword("");
          goTo("password");
          return;
        }
        const emailId = factorEmailId(factors, "email_code");
        if (emailId) {
          setNotice("This account doesn't have a password, so we've emailed you a sign-in code.");
          await sendEmailCode(attempt, emailId);
          return;
        }
        setError({ message: "This account signs in with Google. Use “Continue with Google” above." });
        return;
      }
      await proceed(attempt);
    } catch (err) {
      reportFailedSignIn(err, identifier);
      fail(err, "We couldn't check that email. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError({ message: "Enter your password.", field: "password" });
      return;
    }
    if (!signIn) return;
    setPending("password");
    setError(null);
    try {
      await proceed(await signIn.attemptFirstFactor({ strategy: "password", password }));
    } catch (err) {
      reportFailedSignIn(err, email.trim());
      fail(err, "Incorrect password. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const emailMeACode = async () => {
    const emailId = factorEmailId(signIn?.supportedFirstFactors, "email_code");
    if (!signIn || !emailId) return;
    setPending("email-code");
    setError(null);
    setNotice(null);
    try {
      await sendEmailCode(signIn, emailId);
    } catch (err) {
      fail(err, "We couldn't send a code. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const submitCode = async (e?: FormEvent, value = code) => {
    e?.preventDefault();
    if (value.length !== 6) {
      setError({ message: "Enter the 6-digit code.", field: "code" });
      return;
    }
    if (!signIn) return;
    setPending("code");
    setError(null);
    try {
      const attempt =
        codeMode === "email_first"
          ? await signIn.attemptFirstFactor({ strategy: "email_code", code: value })
          : codeMode === "totp"
            ? await signIn.attemptSecondFactor({ strategy: "totp", code: value })
            : await signIn.attemptSecondFactor({ strategy: "email_code", code: value });
      await proceed(attempt);
    } catch (err) {
      reportFailedSignIn(err, email.trim());
      fail(err, "That code didn't work. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const resendCode = async () => {
    if (!signIn || cooldown.left > 0) return;
    setPending("resend");
    setError(null);
    try {
      if (codeMode === "email_first") {
        await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: codeEmailId });
      } else {
        await signIn.prepareSecondFactor({ strategy: "email_code", ...(codeEmailId ? { emailAddressId: codeEmailId } : {}) });
      }
      setCode("");
      setNotice(`We've sent a new code to ${email.trim()}.`);
      cooldown.restart();
    } catch (err) {
      fail(err, "We couldn't send a new code. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const startReset = async () => {
    if (!signIn) return;
    setPending("reset-start");
    setError(null);
    setNotice(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      setCode("");
      setNewPassword("");
      cooldown.restart();
      goTo("reset");
    } catch (err) {
      fail(err, "We couldn't send a reset code. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const resendReset = async () => {
    if (!signIn || cooldown.left > 0) return;
    setPending("resend");
    setError(null);
    try {
      await signIn.create({ strategy: "reset_password_email_code", identifier: email.trim() });
      setCode("");
      setNotice(`We've sent a new code to ${email.trim()}.`);
      cooldown.restart();
    } catch (err) {
      fail(err, "We couldn't send a new code. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError({ message: "Enter the 6-digit code from the email.", field: "code" });
      return;
    }
    if (newPassword.length < 8) {
      setError({ message: "Use at least 8 characters.", field: "password" });
      return;
    }
    if (!signIn) return;
    setPending("reset");
    setError(null);
    try {
      let attempt = await signIn.attemptFirstFactor({ strategy: "reset_password_email_code", code, password: newPassword });
      if (attempt.status === "needs_new_password") {
        attempt = await attempt.resetPassword({ password: newPassword, signOutOfOtherSessions: true });
      }
      await proceed(attempt);
    } catch (err) {
      reportFailedSignIn(err, email.trim());
      fail(err, "We couldn't reset your password. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const backToEmail = () => {
    setPassword("");
    setCode("");
    setNotice(null);
    goTo("identifier", -1);
  };

  const emailChip = (
    <span className="mt-1 inline-flex max-w-full items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-rh-night ring-1 ring-inset ring-rh-night/10">
      <span className="truncate">{email.trim()}</span>
      <button
        type="button"
        onClick={backToEmail}
        className="shrink-0 rounded font-semibold text-rh-teal underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/30"
      >
        Change
      </button>
    </span>
  );

  const formNotice = error && !error.field && (
    <FormNotice
      action={
        error.code === "form_identifier_not_found" ? (
          <Link href={signUpHref} className="font-semibold text-rh-night underline underline-offset-4">
            Create an account instead
          </Link>
        ) : error.code === "form_password_pwned" ? (
          <TextAction onClick={startReset} disabled={busy} className="text-[13px]">
            Reset your password
          </TextAction>
        ) : undefined
      }
    >
      {error.message}
    </FormNotice>
  );
  const infoNotice = notice && !formNotice && <FormNotice tone="info">{notice}</FormNotice>;

  if (isSignedIn) {
    return (
      <AuthShell audience={audience} partnersHost={partnersHost}>
        <p role="status" className="py-16 text-center text-sm text-rh-night/60">
          Signing you in…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell audience={audience} partnersHost={partnersHost}>
      <AuthSteps stepKey={step} direction={direction}>
        {step === "identifier" && (
          <>
            <StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} optionalSubtitle />
            <div className={SPACE.section}>
              <GoogleButton onClick={google.start} loading={google.loading} disabled={!google.ready || pending !== null} />
            </div>
            <div className={SPACE.divider}>
              <OrDivider />
            </div>
            <form onSubmit={submitIdentifier} noValidate className={cn("flex flex-col", SPACE.fields)}>
              <AuthField
                id="signin-email"
                label="Email address"
                type="email"
                inputMode="email"
                autoComplete="username email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                error={fieldError("email")}
              />
              {formNotice}
              <PrimaryButton loading={pending === "identifier"} disabled={busy || !isLoaded} className="mt-1">
                Continue
              </PrimaryButton>
            </form>
            {audience === "partner" || signUpHref !== routes.signUp ? (
              <p className={cn("text-center text-sm text-rh-night/65", SPACE.section)}>
                {audience === "partner" ? "New partner? " : "New to Rehabify? "}
                <Link href={signUpHref} className="font-semibold text-rh-teal underline-offset-4 hover:underline">
                  {audience === "partner" ? "Apply for access" : "Create an account"}
                </Link>
              </p>
            ) : (
              // No page-specific destination: ask who they are, so sign-up opens the right onboarding
              <div className={cn("space-y-1.5 text-center text-sm text-rh-night/65", SPACE.section)}>
                <p>
                  New to Rehabify? Join as a{" "}
                  {PRIMARY_INTENTS.map((intent, index) => (
                    <span key={intent}>
                      {index > 0 && (index === PRIMARY_INTENTS.length - 1 ? " or " : ", ")}
                      <Link
                        href={signUpHrefFor(intent)}
                        onClick={() => rememberIntent(intent)}
                        className="font-semibold text-rh-teal underline-offset-4 hover:underline"
                      >
                        {SIGNUP_INTENTS[intent].chip.toLowerCase()}
                      </Link>
                    </span>
                  ))}
                </p>
                <p className="text-[13px]">
                  Booked with Joy on WhatsApp?{" "}
                  <a
                    href={DASHBOARD_LINK_REQUEST_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-rh-teal underline-offset-4 hover:underline"
                  >
                    Get a sign-in link
                  </a>
                </p>
              </div>
            )}
          </>
        )}

        {step === "password" && (
          <>
            <StepHeading eyebrow={copy.eyebrow} title="Enter your password" subtitle={emailChip} />
            <form onSubmit={submitPassword} noValidate className={cn("flex flex-col", SPACE.section, SPACE.fields)}>
              {/* Lets password managers pair the saved password with the email */}
              <input type="email" name="username" autoComplete="username" value={email.trim()} readOnly hidden />
              <PasswordField
                id="signin-password"
                label="Password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                error={fieldError("password")}
              />
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
                <TextAction onClick={startReset} disabled={busy}>
                  {pending === "reset-start" ? "Sending…" : "Forgot password?"}
                </TextAction>
                {factorEmailId(signIn?.supportedFirstFactors, "email_code") && (
                  <TextAction onClick={emailMeACode} disabled={busy}>
                    {pending === "email-code" ? "Sending…" : "Email me a code instead"}
                  </TextAction>
                )}
              </div>
              {formNotice}
              <PrimaryButton loading={pending === "password"} disabled={busy}>
                Sign in
              </PrimaryButton>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <StepHeading
              eyebrow={copy.eyebrow}
              title={codeMode === "totp" ? "Two-step verification" : "Check your email"}
              subtitle={
                codeMode === "totp" ? (
                  "Enter the 6-digit code from your authenticator app."
                ) : (
                  <>
                    We sent a 6-digit code to <span className="font-semibold text-rh-night">{email.trim()}</span>.
                  </>
                )
              }
            />
            <form onSubmit={submitCode} noValidate className={cn("flex flex-col", SPACE.section, SPACE.fields)}>
              {infoNotice}
              <CodeField
                id="signin-code"
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (error) setError(null);
                }}
                onComplete={(value) => void submitCode(undefined, value)}
                error={fieldError("code")}
                disabled={pending === "code"}
              />
              {formNotice}
              <PrimaryButton loading={pending === "code"} disabled={busy}>
                Verify and sign in
              </PrimaryButton>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
                <TextAction onClick={backToEmail} disabled={busy}>
                  Use a different email
                </TextAction>
                {codeMode !== "totp" && (
                  <TextAction onClick={resendCode} disabled={busy || cooldown.left > 0}>
                    {pending === "resend" ? "Sending…" : cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend code"}
                  </TextAction>
                )}
              </div>
            </form>
          </>
        )}

        {step === "reset" && (
          <>
            <StepHeading
              eyebrow={copy.eyebrow}
              title="Reset your password"
              subtitle={
                <>
                  Enter the code we sent to <span className="font-semibold text-rh-night">{email.trim()}</span> and choose a
                  new password.
                </>
              }
            />
            <form onSubmit={submitReset} noValidate className={cn("flex flex-col", SPACE.section, SPACE.fields)}>
              {infoNotice}
              <CodeField
                id="reset-code"
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (error) setError(null);
                }}
                onComplete={() => document.getElementById("reset-password")?.focus()}
                error={fieldError("code")}
              />
              <input type="email" name="username" autoComplete="username" value={email.trim()} readOnly hidden />
              <PasswordField
                id="reset-password"
                label="New password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                autoFocus={false}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (error) setError(null);
                }}
                error={fieldError("password")}
              />
              {formNotice}
              <PrimaryButton loading={pending === "reset"} disabled={busy}>
                Reset and sign in
              </PrimaryButton>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
                <TextAction
                  onClick={() => {
                    setCode("");
                    setNotice(null);
                    goTo("password", -1);
                  }}
                  disabled={busy}
                >
                  Back to sign in
                </TextAction>
                <TextAction onClick={resendReset} disabled={busy || cooldown.left > 0}>
                  {pending === "resend" ? "Sending…" : cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend code"}
                </TextAction>
              </div>
            </form>
          </>
        )}
      </AuthSteps>
    </AuthShell>
  );
}
