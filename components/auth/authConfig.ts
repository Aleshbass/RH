/**
 * Copy, routes and Clerk error handling shared by the custom sign-in and sign-up flows.
 * The same forms serve the main site and the partner portal ("audience"); only the copy,
 * the default destination after auth and the links between pages change.
 */
import { publicAppUrl } from "@/lib/public-app-url";

export type AuthAudience = "default" | "partner" | "learn";

export type AuthRoutes = {
  signIn: string;
  signUp: string;
  /** Where the logo goes. */
  home: string;
  /** Prefix for main-site pages (legal, support). Empty unless served from partners.*. */
  siteOrigin: string;
  defaultRedirect: { signIn: string; signUp: string };
};

/**
 * On the partners.* subdomain the middleware rewrites every path except /sign-in, /sign-up
 * and /sso-callback to the portal, so partner auth uses those paths there and links to
 * main-site pages are absolute.
 */
/** `partnersHost`: the form is served on the audience's own subdomain (partners.*, or learn.* for Learn). */
export function authRoutes(audience: AuthAudience, partnersHost = false): AuthRoutes {
  // Rehabify Learn (learn.*): back to Learn after auth; a new account picks its learner tag at /welcome
  if (audience === "learn") {
    const prefix = partnersHost ? "" : "/learn";
    return {
      signIn: "/sign-in",
      signUp: "/sign-up",
      home: prefix || "/",
      siteOrigin: partnersHost ? publicAppUrl() : "",
      defaultRedirect: { signIn: prefix || "/", signUp: `${prefix}/welcome` },
    };
  }
  if (audience === "partner") {
    const siteOrigin = partnersHost ? publicAppUrl() : "";
    return {
      signIn: partnersHost ? "/sign-in" : "/partners/sign-in",
      signUp: partnersHost ? "/sign-up" : "/partners/sign-up",
      home: `${siteOrigin}/partners`,
      siteOrigin,
      defaultRedirect: { signIn: "/partners/portal", signUp: "/partners/portal" },
    };
  }
  return {
    signIn: "/sign-in",
    signUp: "/sign-up",
    home: "/",
    siteOrigin: "",
    defaultRedirect: { signIn: "/dashboard", signUp: "/role-selection" },
  };
}

/** `path`, carrying the redirect along only when it isn't the current page's default. */
export function authHref(path: string, redirect: string, defaultRedirect: string) {
  return redirect === defaultRedirect ? path : `${path}?redirect=${encodeURIComponent(redirect)}`;
}

type Heading = { eyebrow: string; title: string; subtitle: string };

export const AUTH_COPY: Record<
  AuthAudience,
  {
    signIn: Heading;
    signUp: Heading;
    panel: { badge: string; lead: string; highlight: string; body: string; points: string[] };
  }
> = {
  default: {
    signIn: {
      eyebrow: "Rehabify Health",
      title: "Welcome back",
      subtitle: "Sign in to pick up where you left off.",
    },
    signUp: {
      eyebrow: "Rehabify Health",
      title: "Create your account",
      subtitle: "Tell us who you are and we'll set up the right account.",
    },
    panel: {
      badge: "Physio Around Me by Rehabify",
      lead: "Physiotherapy that",
      highlight: "moves with you",
      body: "See licensed physiotherapists in clinic, at home or by video, and follow your recovery plan in one place.",
      points: ["Licensed physiotherapists near you", "Guided home exercise programmes", "Progress you and your physio can see"],
    },
  },
  learn: {
    signIn: {
      eyebrow: "Rehabify Learn",
      title: "Welcome back",
      subtitle: "Sign in to pick up your courses. Rehabify physios and clinics use their usual login.",
    },
    signUp: {
      eyebrow: "Rehabify Learn",
      title: "Join Rehabify Learn",
      subtitle: "A free account. One login for every course.",
    },
    panel: {
      badge: "Rehabify Learn",
      lead: "Become the physio patients",
      highlight: "ask for",
      body: "Learn with peers through clinical cases, video courses and live sessions. Earn certificates. For students, graduates and practising physios.",
      points: ["Clinical cases, video courses and live sessions", "Certificates anyone can check", "From student to Rehabify physio with one login"],
    },
  },
  partner: {
    signIn: {
      eyebrow: "Partner portal",
      title: "Welcome back",
      subtitle: "Sign in to manage referrals, care journeys and settlements.",
    },
    signUp: {
      eyebrow: "Partner portal",
      title: "Apply for partner access",
      subtitle: "Create your account, then tell us about your organisation.",
    },
    panel: {
      badge: "Rehabify Partner Network",
      lead: "Rehabilitation, built into your",
      highlight: "care network",
      body: "Refer members to verified physiotherapists, follow every recovery milestone and settle commissions automatically.",
      points: ["Direct clinical referrals", "Real-time care tracking and webhooks", "Automated settlements and statements"],
    },
  },
};

export type AuthField = "email" | "password" | "code" | "firstName" | "lastName";

export type AuthError = { message: string; code?: string; field?: AuthField };

type ClerkErrorLike = {
  code?: unknown;
  message?: unknown;
  errors?: { code?: string; message?: string; longMessage?: string; meta?: { paramName?: string } }[];
};

const PARAM_FIELDS: Record<string, AuthField> = {
  email_address: "email",
  identifier: "email",
  password: "password",
  code: "code",
  first_name: "firstName",
  last_name: "lastName",
};

const CAPTCHA_MESSAGE =
  "We couldn't complete the security check. Refresh the page and try again, or continue with Google. Ad blockers and some in-app browsers can block it.";

const FRIENDLY: Record<string, string> = {
  form_identifier_not_found: "We couldn't find an account with that email.",
  form_password_incorrect: "That password isn't right. Try again, or reset it.",
  form_password_pwned:
    "This password has appeared in a data breach, so it can't be used. Please choose a different one.",
  form_password_length_too_short: "Use at least 8 characters.",
  form_identifier_exists: "An account with this email already exists.",
  form_code_incorrect: "That code isn't right. Check the email and try again.",
  verification_expired: "That code has expired. Send a new one.",
  verification_failed: "Too many incorrect attempts. Send a new code.",
  too_many_requests: "Too many attempts. Please wait a minute and try again.",
  network_error: "We couldn't reach the server. Check your connection and try again.",
  captcha_invalid: CAPTCHA_MESSAGE,
  captcha_unavailable: CAPTCHA_MESSAGE,
  captcha_missing_token: CAPTCHA_MESSAGE,
  form_param_format_invalid: "Enter a valid email address.",
  strategy_for_user_invalid: "This account doesn't use a password. Continue with Google or ask for an email code.",
};

/** Clerk API and runtime errors as a readable message, the Clerk code and the field it belongs to. */
export function parseAuthError(err: unknown, fallback: string): AuthError {
  const e = (typeof err === "object" && err !== null ? err : {}) as ClerkErrorLike;
  const first = Array.isArray(e.errors) ? e.errors[0] : undefined;
  const code = first?.code ?? (typeof e.code === "string" ? e.code : undefined);
  const field = PARAM_FIELDS[first?.meta?.paramName ?? ""];
  const friendly = code ? FRIENDLY[code] : undefined;
  // Format errors on fields other than email keep Clerk's own wording
  const useFriendly = friendly && !(code === "form_param_format_invalid" && field !== "email");
  const message =
    (useFriendly ? friendly : undefined) ||
    first?.longMessage ||
    first?.message ||
    (typeof e.message === "string" && e.message && !e.message.includes("(code=") ? e.message : "") ||
    fallback;
  return { message, code, field };
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
