'use client';

/**
 * Form pieces for the custom sign-in and sign-up flows: compact fields (label inside the
 * box, so a full sign-up form fits a small phone without scrolling), buttons, alerts and
 * the animated step container.
 */
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useSignIn } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { AlertCircle, ArrowRight, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { buildSsoRedirectUrls } from "@/lib/auth/ssoRedirect";
import { cn } from "@/lib/utils";
import { parseAuthError, type AuthError } from "./authConfig";

export const EASE = [0.22, 1, 0.36, 1] as const;

const displayFont = "font-[family-name:var(--font-cal)]";

// Vertical rhythm scales with the viewport height so the longest form (sign-up) still fits
// a ~550px-tall phone viewport without scrolling, and breathes on taller screens.
export const SPACE = {
  section: "mt-[clamp(12px,2.8dvh,24px)]",
  divider: "my-[clamp(10px,2dvh,16px)]",
  fields: "gap-[clamp(8px,1.4dvh,12px)]",
  submit: "mt-[clamp(12px,2.2dvh,20px)]",
  control: "h-[clamp(44px,6.4dvh,48px)]",
};

/** Google OAuth via Clerk's redirect flow; /sso-callback finishes it and returns to `redirectTarget`. */
export function useGoogleAuth(redirectTarget: string, onError: (error: AuthError) => void) {
  const { signIn, isLoaded } = useSignIn();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (!isLoaded || !signIn) return;
    setLoading(true);
    try {
      try {
        // Fallback for the callback page if the provider drops the query string
        localStorage.setItem("authRedirectUrl", redirectTarget);
      } catch {
        // Storage blocked (private mode): the callback URL still carries the target
      }
      const urls = buildSsoRedirectUrls(redirectTarget);
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: urls.redirectUrl,
        redirectUrlComplete: urls.redirectUrlComplete,
      });
    } catch (err) {
      onError(parseAuthError(err, "Google sign-in couldn't start. Please try again."));
      setLoading(false);
    }
  };

  return { start, loading, ready: isLoaded };
}

/** Seconds left before a code can be re-sent; `restart()` after each send. */
export function useCooldown(seconds = 30) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);
  return { left, restart: () => setLeft(seconds) };
}

/** Eyebrow, title and subtitle at the top of each step. `optionalSubtitle` drops a purely descriptive subtitle on very short screens. */
export function StepHeading({
  eyebrow,
  title,
  subtitle,
  optionalSubtitle = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  optionalSubtitle?: boolean;
}) {
  return (
    <div>
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rh-teal">{eyebrow}</p>}
      <h1 className="mt-1.5 text-[length:clamp(24px,4.4dvh,34px)] leading-[1.08] tracking-tight text-rh-night">{title}</h1>
      {subtitle && (
        <div
          className={cn(
            "mt-[clamp(4px,1dvh,8px)] text-[15px] leading-snug text-rh-night/65 [@media(max-height:600px)]:text-sm",
            optionalSubtitle && "[@media(max-height:600px)]:hidden"
          )}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  id: string;
  label: string;
  error?: string;
  trailing?: ReactNode;
  inputClassName?: string;
};

export function AuthField({ id, label, error, trailing, inputClassName, ...input }: FieldProps) {
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "relative rounded-2xl border bg-white transition focus-within:ring-4",
          error
            ? "border-rose-400 focus-within:border-rose-500 focus-within:ring-rose-500/10"
            : "border-rh-night/10 hover:border-rh-night/20 focus-within:border-rh-teal focus-within:ring-rh-teal/10"
        )}
      >
        <label
          htmlFor={id}
          className="block px-4 pt-[clamp(7px,1.3dvh,10px)] text-[11px] font-semibold uppercase leading-none tracking-[0.08em] text-rh-night/50"
        >
          {label}
        </label>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "block h-[clamp(28px,4.4dvh,32px)] w-full rounded-b-2xl bg-transparent px-4 pb-1 text-[15px] text-rh-night outline-none placeholder:text-rh-night/30 disabled:text-rh-night/50",
            trailing && "pr-12",
            inputClassName
          )}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={`${id}-error`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden px-1 pt-1 text-xs font-medium text-rose-600"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PasswordField(props: Omit<FieldProps, "type" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="flex h-9 w-9 items-center justify-center rounded-full text-rh-night/45 transition hover:bg-rh-night/[0.05] hover:text-rh-night focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/40"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

/** Six-digit code. Calls `onComplete` once the sixth digit is typed or pasted. */
export function CodeField({
  id,
  value,
  onChange,
  onComplete,
  error,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <AuthField
      id={id}
      label="Verification code"
      error={error}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, "").slice(0, 6);
        onChange(next);
        if (next.length === 6 && value.length < 6) onComplete?.(next);
      }}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      autoFocus
      placeholder="••••••"
      inputClassName={cn("h-[clamp(36px,5.6dvh,44px)] pb-1.5 text-[26px] tracking-[0.45em] placeholder:tracking-[0.45em]", displayFont)}
    />
  );
}

export function PrimaryButton({
  children,
  loading,
  disabled,
  className,
}: {
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "group inline-flex w-full items-center justify-center gap-2 rounded-full bg-rh-night px-6 text-[15px] font-semibold text-white transition hover:bg-rh-teal-deep active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rh-teal/25 disabled:cursor-not-allowed disabled:opacity-60",
        SPACE.control,
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
          {children}
          <ArrowRight className="h-4 w-4 text-rh-lime transition group-hover:translate-x-0.5" />
        </>
      )}
    </button>
  );
}

export function GoogleButton({ onClick, loading, disabled }: { onClick: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn("inline-flex w-full items-center justify-center gap-3 rounded-full border border-rh-night/12 bg-white px-6 text-[15px] font-semibold text-rh-night transition hover:border-rh-night/25 hover:shadow-soft active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rh-teal/15 disabled:cursor-not-allowed disabled:opacity-60", SPACE.control)}
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-rh-night/60" />
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      )}
      Continue with Google
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-medium text-rh-night/40" role="separator">
      <span className="h-px flex-1 bg-rh-night/10" />
      or with email
      <span className="h-px flex-1 bg-rh-night/10" />
    </div>
  );
}

/** Form-level message. `tone="error"` is announced to screen readers. */
export function FormNotice({
  tone = "error",
  children,
  action,
}: {
  tone?: "error" | "info";
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "error" ? AlertCircle : Info;
  return (
    <motion.div
      role={tone === "error" ? "alert" : "status"}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 ring-1 ring-inset",
        tone === "error" ? "bg-rh-blush text-rose-700 ring-rose-200" : "bg-rh-honeydew text-rh-night ring-rh-mint"
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone === "error" ? "text-rose-500" : "text-rh-teal")} />
      <div className="min-w-0">
        {children}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </motion.div>
  );
}

/** Small underlined text action (resend, change email, forgot password). */
export function TextAction({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded text-sm font-semibold text-rh-teal underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-teal/30 disabled:cursor-not-allowed disabled:text-rh-night/40 disabled:no-underline",
        className
      )}
    >
      {children}
    </button>
  );
}

const stepVariants: Variants = {
  enter: (dir: { direction: number; reduce: boolean }) => ({ opacity: 0, x: dir.reduce ? 0 : 28 * dir.direction }),
  center: { opacity: 1, x: 0 },
  exit: (dir: { direction: number; reduce: boolean }) => ({ opacity: 0, x: dir.reduce ? 0 : -28 * dir.direction }),
};

/** Slides between steps: forward moves left, back moves right. Fades only with reduced motion. */
export function AuthSteps({ stepKey, direction, children }: { stepKey: string; direction: 1 | -1; children: ReactNode }) {
  const reduce = Boolean(useReducedMotion());
  const custom = { direction, reduce };
  return (
    <AnimatePresence mode="wait" initial={false} custom={custom}>
      <motion.div
        key={stepKey}
        custom={custom}
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: reduce ? 0.12 : 0.28, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
