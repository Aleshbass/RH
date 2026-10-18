'use client';

/**
 * Custom Clerk sign-up: details → emailed code → session. Used by /sign-up and the partner
 * portal (/partners/sign-up, or /sign-up on partners.*).
 *
 * Bot protection: Clerk's Smart CAPTCHA renders into #clerk-captcha during signUp.create()
 * and only becomes visible when it needs the person to tick a box. It sits right above the
 * submit button so that challenge is never off-screen.
 */
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useSignUp } from "@clerk/nextjs";
import { useReducedMotion } from "framer-motion";
import { toSafeInternalPath } from "@/lib/auth/ssoRedirect";
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

type Step = "details" | "verify";
type FieldErrors = Partial<Record<FieldName, string>>;

const MISSING_FIELD_LABELS: Record<string, string> = {
  phone_number: "a phone number",
  username: "a username",
  first_name: "your first name",
  last_name: "your last name",
  legal_accepted: "acceptance of the terms",
  password: "a password",
};

export default function CustomSignUp({
  audience = "default",
  partnersHost = false,
}: {
  audience?: AuthAudience;
  partnersHost?: boolean;
}) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const routes = authRoutes(audience, partnersHost);
  const copy = AUTH_COPY[audience].signUp;
  const redirectTarget = toSafeInternalPath(
    searchParams?.get("redirect") || searchParams?.get("redirect_url"),
    routes.defaultRedirect.signUp,
  );

  const [step, setStep] = useState<Step>("details");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"create" | "verify" | "resend" | null>(null);
  const [slow, setSlow] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<AuthError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cooldown = useCooldown();
  const google = useGoogleAuth(redirectTarget, setError);

  // Already signed in (or just finished): go to the destination
  useEffect(() => {
    if (isSignedIn) router.replace(redirectTarget);
  }, [isSignedIn, router, redirectTarget]);

  // A CAPTCHA challenge makes create() wait for the person; say so instead of spinning silently
  useEffect(() => {
    if (pending !== "create") return;
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, [pending]);

  // Bring the challenge into view if it appears on a screen too short to show everything
  const captchaRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => {
        if (el.offsetHeight > 0) el.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      });
      observer.observe(el);
      return () => observer.disconnect();
    },
    [reduceMotion],
  );

  const goTo = (next: Step, dir: 1 | -1 = 1) => {
    setDirection(dir);
    setError(null);
    setFieldErrors({});
    setStep(next);
  };

  const busy = pending !== null || google.loading;
  const signInHref = authHref(routes.signIn, redirectTarget, routes.defaultRedirect.signUp);

  const clearFieldError = (field: FieldName) => {
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (error) setError(null);
  };

  /** Errors tied to a field show under it; the rest (and "email taken", which needs a link) above the button. */
  const fail = (err: unknown, fallback: string) => {
    const parsed = parseAuthError(err, fallback);
    if (parsed.code === "session_exists") {
      router.replace(redirectTarget);
      return;
    }
    if (parsed.field && parsed.code !== "form_identifier_exists") {
      setFieldErrors({ [parsed.field]: parsed.message });
      return;
    }
    setError(parsed);
  };

  const submitDetails = async (e: FormEvent) => {
    e.preventDefault();
    const found: FieldErrors = {};
    if (!firstName.trim()) found.firstName = "Enter your first name.";
    if (!lastName.trim()) found.lastName = "Enter your last name.";
    if (!EMAIL_PATTERN.test(email.trim())) found.email = "Enter a valid email address.";
    if (password.length < 8) found.password = "Use at least 8 characters.";
    setFieldErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`signup-${first}`)?.focus();
      return;
    }
    if (!isLoaded || !signUp) return;

    setSlow(false);
    setPending("create");
    try {
      // No client-side timeout: create() waits for the CAPTCHA, which may need a tick from the person.
      // Names also go in unsafeMetadata because first/last name may be switched off on the Clerk instance.
      await signUp.create({
        emailAddress: email.trim(),
        password,
        unsafeMetadata: { firstName: firstName.trim(), lastName: lastName.trim() },
      });
      try {
        await signUp.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      } catch {
        // Name fields disabled in Clerk (User & authentication → First and last name); kept in metadata
      }
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCode("");
      setNotice(null);
      cooldown.restart();
      goTo("verify");
    } catch (err) {
      fail(err, "We couldn't create your account. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const submitCode = async (e?: FormEvent, value = code) => {
    e?.preventDefault();
    if (value.length !== 6) {
      setFieldErrors({ code: "Enter the 6-digit code." });
      return;
    }
    if (!signUp) return;
    setPending("verify");
    setError(null);
    setFieldErrors({});
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: value });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive?.({ session: attempt.createdSessionId });
        router.replace(redirectTarget);
        return;
      }
      // Previously a silent dead end: the code was accepted but Clerk still wants more
      const missing = (attempt.missingFields ?? []).map((field) => MISSING_FIELD_LABELS[field] ?? field.replace(/_/g, " "));
      setError({
        message: missing.length
          ? `Your email is verified, but your account still needs ${missing.join(", ")}. Please contact support.`
          : "We couldn't finish creating your account. Please try again.",
      });
    } catch (err) {
      fail(err, "That code didn't work. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const resendCode = async () => {
    if (!signUp || cooldown.left > 0) return;
    setPending("resend");
    setError(null);
    setFieldErrors({});
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCode("");
      setNotice(`We've sent a new code to ${email.trim()}.`);
      cooldown.restart();
    } catch (err) {
      fail(err, "We couldn't send a new code. Please try again.");
    } finally {
      setPending(null);
    }
  };

  const formNotice = error && (
    <FormNotice
      action={
        error.code === "form_identifier_exists" ? (
          <Link href={signInHref} className="font-semibold text-rh-night underline underline-offset-4">
            Sign in instead
          </Link>
        ) : error.code === "verification_expired" || error.code === "verification_failed" ? (
          <TextAction onClick={resendCode} disabled={busy || cooldown.left > 0} className="text-[13px]">
            {cooldown.left > 0 ? `Send a new code in ${cooldown.left}s` : "Send a new code"}
          </TextAction>
        ) : undefined
      }
    >
      {error.message}
    </FormNotice>
  );

  if (isSignedIn) {
    return (
      <AuthShell audience={audience} partnersHost={partnersHost}>
        <p role="status" className="py-16 text-center text-sm text-rh-night/60">
          Setting up your account…
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell audience={audience} partnersHost={partnersHost}>
      <AuthSteps stepKey={step} direction={direction}>
        {step === "details" ? (
          <>
            <StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.subtitle} optionalSubtitle />
            <div className={SPACE.section}>
              <GoogleButton onClick={google.start} loading={google.loading} disabled={!google.ready || pending !== null} />
            </div>
            <div className={SPACE.divider}>
              <OrDivider />
            </div>
            <form onSubmit={submitDetails} noValidate className={cn("flex flex-col", SPACE.fields)}>
              <div className={cn("grid grid-cols-2", SPACE.fields)}>
                <AuthField
                  id="signup-firstName"
                  label="First name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    clearFieldError("firstName");
                  }}
                  error={fieldErrors.firstName}
                />
                <AuthField
                  id="signup-lastName"
                  label="Last name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    clearFieldError("lastName");
                  }}
                  error={fieldErrors.lastName}
                />
              </div>
              <AuthField
                id="signup-email"
                label="Email address"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearFieldError("email");
                }}
                error={fieldErrors.email}
              />
              <PasswordField
                id="signup-password"
                label="Password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearFieldError("password");
                }}
                error={fieldErrors.password}
              />
              {/* Clerk Smart CAPTCHA mount point: required for bot protection on custom sign-up flows */}
              <div id="clerk-captcha" ref={captchaRef} data-cl-theme="light" data-cl-size="flexible" />
              {formNotice}
              {slow && pending === "create" && (
                <p role="status" className="px-1 text-[13px] leading-5 text-rh-night/60">
                  Still working… If a security check appears above, complete it to continue.
                </p>
              )}
              <PrimaryButton loading={pending === "create"} disabled={busy || !isLoaded} className="mt-1">
                Create account
              </PrimaryButton>
              <p className="px-1 text-center text-[11.5px] leading-4 text-rh-night/50">
                By continuing you agree to our{" "}
                <Link href={`${routes.siteOrigin}/terms-and-conditions`} className="underline underline-offset-2 hover:text-rh-night">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href={`${routes.siteOrigin}/privacy-policy`} className="underline underline-offset-2 hover:text-rh-night">
                  Privacy policy
                </Link>
                .
              </p>
            </form>
            <p className={cn("text-center text-sm text-rh-night/65", SPACE.submit)}>
              Already have an account?{" "}
              <Link href={signInHref} className="font-semibold text-rh-teal underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <StepHeading
              eyebrow={copy.eyebrow}
              title="Check your email"
              subtitle={
                <>
                  Enter the 6-digit code we sent to <span className="font-semibold text-rh-night">{email.trim()}</span>.
                </>
              }
            />
            <form onSubmit={submitCode} noValidate className={cn("flex flex-col", SPACE.section, SPACE.fields)}>
              {notice && !error && <FormNotice tone="info">{notice}</FormNotice>}
              <CodeField
                id="signup-code"
                value={code}
                onChange={(value) => {
                  setCode(value);
                  clearFieldError("code");
                }}
                onComplete={(value) => void submitCode(undefined, value)}
                error={fieldErrors.code}
                disabled={pending === "verify"}
              />
              {formNotice}
              <PrimaryButton loading={pending === "verify"} disabled={busy}>
                Verify and continue
              </PrimaryButton>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1">
                <TextAction onClick={() => goTo("details", -1)} disabled={busy}>
                  Change details
                </TextAction>
                <TextAction onClick={resendCode} disabled={busy || cooldown.left > 0}>
                  {pending === "resend" ? "Sending…" : cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend code"}
                </TextAction>
              </div>
              <p className="px-1 text-[12px] leading-4 text-rh-night/50">Can&apos;t find it? Check your spam or promotions folder.</p>
            </form>
          </>
        )}
      </AuthSteps>
    </AuthShell>
  );
}
