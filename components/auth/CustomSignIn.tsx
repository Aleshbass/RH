'use client';

import Image from 'next/image';
import { useSignIn, useAuth } from "@clerk/clerk-react";
import { motion, Variants } from "framer-motion";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage } from "@/components/ui/breadcrumb";


export default function CustomSignIn() {
  const { signIn, setActive } = useSignIn();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams?.get("redirect_url") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isEmailStep, setIsEmailStep] = useState(true);
  
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

  // Redirect if already signed in
  if (isSignedIn) {
    router.push(redirectTarget);
    return null;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsLoading(true);
    setError("");
    
    try {
      const result = await signIn?.create({
        identifier: email,
      });
      
      if (result?.status === "needs_identifier") {
        setIsEmailStep(false);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "An error occurred"));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    
    setIsLoading(true);
    setError("");
    
    try {
      const result = await signIn?.attemptFirstFactor({
        strategy: "password",
        password,
      });
      
      if (result?.status === "complete") {
        if (setActive) {
          await setActive({ session: result.createdSessionId });
        }
        router.push(redirectTarget);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Invalid password"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError("");
    
    try {
      await signIn?.authenticateWithRedirect({
        strategy: "oauth_google",
        // Use Clerk's callback route we created to complete the OAuth flow
        // This prevents 404s when providers redirect back
        redirectUrl: "/sso-callback",
        // After Clerk completes, send user to the original destination
        redirectUrlComplete: redirectTarget,
      });
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Google sign-in failed"));
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
            src="/logos/images/Group 469272.webp"
            alt="Rehabify Health - Sign in"
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
            <h2 className="text-3xl font-bold">Welcome Back</h2>
            <p className="mt-2 text-lg text-white/90">Sign in to continue your rehabilitation journey</p>
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
                    <BreadcrumbPage>Sign In</BreadcrumbPage>
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

            {/* Clerk Smart CAPTCHA mount point (required for Smart CAPTCHA in custom flows). */}
            {/* If not present, Clerk falls back to Invisible CAPTCHA and logs a console error. */}
            <div id="clerk-captcha" className="mb-4" />

            {/* Google Sign In Button */}
            <button
              onClick={handleGoogleSignIn}
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

            {/* Email/Password Form */}
            {isEmailStep ? (
              <form onSubmit={handleEmailSubmit} className="space-y-4">
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
                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-12 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Continue →"
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[#002e2c] mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 w-full px-3 border border-gray-300 rounded-md focus:border-[#005b57] focus:ring-2 focus:ring-[#005b57]/20 focus:outline-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !password}
                  className="w-full h-12 bg-gradient-to-r from-[#002e2c] to-[#005b57] hover:opacity-90 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-[#005b57]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    "Sign In"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEmailStep(true)}
                  className="w-full text-sm text-[#005b57] hover:text-[#00443e] underline"
                >
                  ← Back to email
                </button>
              </form>
            )}

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-600">
                Don&apos;t have an account?{" "}
                <Link href="/sign-up" className="text-[#005b57] hover:text-[#00443e] font-medium">
                  Sign up
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};
