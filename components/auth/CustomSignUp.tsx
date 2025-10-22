'use client';

import Image from 'next/image';
import { useSignUp, useSignIn, useAuth } from "@clerk/clerk-react";
import { motion, Variants } from "framer-motion";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";


export default function CustomSignUp() {
  const { signUp, setActive } = useSignUp();
  const { signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams?.get("redirect_url") || "/role-selection";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  
  const fadeIn: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        type: "spring" as const,
        stiffness: 100,
        damping: 15
      }
    }
  };

  // Safely extract an error message from Clerk/unknown error objects without using `any`
  const extractErrorMessage = (err: unknown, fallback: string) => {
    if (typeof err === 'object' && err !== null) {
      const obj = err as Record<string, unknown>;
      const maybeMessage = obj.message;
      if (typeof maybeMessage === 'string') return maybeMessage;

      const maybeErrors = obj.errors;
      if (Array.isArray(maybeErrors) && maybeErrors.length > 0) {
        const first = maybeErrors[0] as unknown;
        if (typeof first === 'object' && first !== null) {
          const msg = (first as Record<string, unknown>).message;
          if (typeof msg === 'string') return msg;
        }
      }
    }
    return fallback;
  };

  // Redirect if already signed in - honor redirect_url if present (using useEffect to avoid setState during render)
  useEffect(() => {
    if (isSignedIn) {
      router.push(redirectTarget || "/dashboard");
    }
  }, [isSignedIn, router, redirectTarget]);

  // Show loading state while redirecting
  if (isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF6E7]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#005b57] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !firstName || !lastName) return;
    
    setIsLoading(true);
    setError("");
    
    try {
      // Some Clerk configurations don't accept name fields at create() time
      // Pass only core fields first, then update names in a separate call.
      await signUp?.create({
        emailAddress: email,
        password,
      });

      // Best-effort update of profile names. If not allowed, ignore the error.
      try {
        await signUp?.update({ firstName, lastName });
      } catch {
        // ignore; not all instances allow updating these fields at this step
      }
      
      await signUp?.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "An error occurred"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    
    setIsLoading(true);
    setError("");
    
    try {
      const result = await signUp?.attemptEmailAddressVerification({ code });
      
      if (result?.status === "complete") {
        await setActive?.({ session: result.createdSessionId });
        router.push(redirectTarget);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Invalid verification code"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      // Use signIn flow for OAuth; Clerk will create or reuse accounts automatically
      await signIn?.authenticateWithRedirect({
        strategy: "oauth_google",
        // Use Clerk's recommended callback route
        redirectUrl: "/sso-callback",
        // Final destination after OAuth completes
        redirectUrlComplete: redirectTarget,
      });
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Google sign-up failed"));
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeIn}
      className="min-h-screen flex items-center justify-center bg-[#FAF6E7] px-4 sm:px-6 lg:px-8 py-6"
    >
      {/* Main container with split layout on desktop, centered modal on mobile */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Left side - Image container (hidden on mobile, shown on desktop) */}
        <div className="relative hidden lg:block">
          <Image
            src="/logos/images/Group 469272 (1).webp"
            alt="Rehabify Health - Sign up"
            fill
            className="object-cover"
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/20" aria-hidden="true" />
          {/* Logo overlay on image */}
          <div className="absolute top-8 left-8 right-8">
            <Image 
              src="/logos/favicon/apple-touch-icon.png" 
              alt="Rehabify Health" 
              width={48} 
              height={48} 
              className="bg-white/10 backdrop-blur-sm rounded-lg p-2"
            />
          </div>
          <div className="absolute bottom-8 left-8 right-8 text-white">
            <h2 className="text-3xl font-bold">Create Your Account</h2>
            <p className="mt-2 text-lg text-white/90">Your rehabilitation journey starts here</p>
          </div>
        </div>
        
        {/* Right side - Form container */}
        <motion.div 
          className="w-full flex flex-col items-center justify-center py-8 px-6 sm:px-10 lg:px-12 min-h-[500px] lg:min-h-0"
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="w-full max-w-sm mx-auto">
            {/* Breadcrumb Navigation */}
            <div className="mb-8">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/" className="flex items-center gap-2 text-[#005b57] hover:text-[#00443e]">
                        <Image 
                          src="/logos/favicon/apple-touch-icon.png" 
                          alt="Rehabify Health" 
                          width={20} 
                          height={20} 
                        />
                        Home
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{pendingVerification ? "Verify Email" : "Sign Up"}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {pendingVerification ? (
              /* Verification Form */
              <form onSubmit={handleVerificationSubmit} className="space-y-4">
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-[#002e2c] mb-1">
                    Verification code
                  </label>
                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter the 6-digit code"
                    className="h-12 w-full px-3 border border-gray-300 rounded-md focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 focus:outline-none text-center text-lg tracking-widest"
                    maxLength={6}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !code}
                  className="w-full h-12 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Verify Email"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingVerification(false)}
                  className="w-full text-sm text-[#005b57] hover:text-[#00443e] underline"
                >
                  ← Back to sign up
                </button>
              </form>
            ) : (
              <>
                {/* Clerk Smart CAPTCHA mount point (required for Smart CAPTCHA in custom flows). */}
                {/* If not present, Clerk falls back to Invisible CAPTCHA and logs a console error. */}
                <div id="clerk-captcha" className="mb-4" />

                {/* Google Sign Up Button */}
                <button
                  onClick={handleGoogleSignUp}
                  disabled={isLoading}
                  className="w-full h-12 mb-4 flex items-center justify-center gap-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">or</span>
                  </div>
                </div>

                {/* Sign Up Form */}
                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-[#002e2c] mb-1">
                        First name
                      </label>
                      <input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="h-12 w-full px-3 border border-gray-300 rounded-md focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-[#002e2c] mb-1">
                        Last name
                      </label>
                      <input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="h-12 w-full px-3 border border-gray-300 rounded-md focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-[#002e2c] mb-1">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="h-12 w-full px-3 border border-gray-300 rounded-md focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-[#002e2c] mb-1">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="h-12 w-full px-3 border border-gray-300 rounded-md focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 focus:outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !email || !password || !firstName || !lastName}
                    className="w-full h-12 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      "Create Account"
                    )}
                  </button>
                </form>
              </>
            )}

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-600">
                Already have an account?{" "}
                <Link href="/sign-in" className="text-[#005b57] hover:text-[#00443e] font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}