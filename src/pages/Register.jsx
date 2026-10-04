import { db } from '@/api/supabaseClient';

import React, { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, UserRound, Mail, MailCheck, Lock, Loader2, Eye, EyeOff, AlertCircle, Check, X } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { markUnlocked } from "@/lib/deviceLock";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

// Lightweight strength estimate for the hint bar (not a security control).
function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= MIN_PASSWORD_LENGTH) score++;
  if (/[a-z]/i.test(pw) && /\d/.test(pw)) score++;
  if (pw.length >= 12 || /[^a-z0-9]/i.test(pw)) score++;
  return pw.length < MIN_PASSWORD_LENGTH ? Math.min(score, 1) : score;
}

const STRENGTH = [
  { label: "Too short", bar: "bg-red-500", text: "text-red-600" },
  { label: "Weak", bar: "bg-red-500", text: "text-red-600" },
  { label: "Good", bar: "bg-amber-500", text: "text-amber-600" },
  { label: "Strong", bar: "bg-emerald-600", text: "text-emerald-700" },
];

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);

  const returnTo = safeReturnTo();
  const loginHref = "/login" + (returnTo !== "/" ? "?returnTo=" + encodeURIComponent(returnTo) : "");

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const strength = passwordStrength(password);
  const strengthInfo = STRENGTH[longEnough ? strength : 0];
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!longEnough) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const result = await db.auth.register({ email, password, full_name: fullName });
      if (result?.session) {
        markUnlocked();
        window.location.href = returnTo;
      } else {
        setShowVerificationMessage(true);
      }
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  if (showVerificationMessage) {
    return (
      <AuthLayout
        icon={MailCheck}
        title="Check your email"
        subtitle="One last step to activate your account"
      >
        <div role="status" className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm text-foreground">
            We sent a confirmation link to{" "}
            <span className="font-semibold break-all">{email}</span>.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Open it to activate your account, then log in. Can't find it? Check your spam or promotions folder.
          </p>
        </div>
        <Button asChild className="w-full h-12 mt-6 font-medium">
          <Link to={loginHref}>Back to login</Link>
        </Button>
        <button
          type="button"
          onClick={() => setShowVerificationMessage(false)}
          className="mt-3 w-full min-h-10 text-sm text-primary font-medium hover:underline"
        >
          Use a different email
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to={loginHref} className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
        <div className="space-y-2">
          <Label htmlFor="full-name">Full name</Label>
          <div className="relative">
            <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="full-name"
              type="text"
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-12 h-12"
              minLength={MIN_PASSWORD_LENGTH}
              aria-describedby="password-hint"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              aria-pressed={showPassword}
              aria-controls="password confirm"
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          <div id="password-hint" className="space-y-1.5">
            {password && (
              <div className="flex items-center gap-2">
                <div className="grid flex-1 grid-cols-3 gap-1" aria-hidden="true">
                  {[1, 2, 3].map((level) => (
                    <span
                      key={level}
                      className={cn("h-1 rounded-full", longEnough && strength >= level ? strengthInfo.bar : !longEnough && level === 1 ? "bg-red-500" : "bg-muted")}
                    />
                  ))}
                </div>
                <span className={cn("text-xs font-medium", strengthInfo.text)}>{strengthInfo.label}</span>
              </div>
            )}
            <p className={cn("flex items-center gap-1.5 text-xs", longEnough ? "text-emerald-700" : "text-muted-foreground")}>
              {longEnough ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <span className="inline-block h-1 w-1 mx-1 rounded-full bg-current" aria-hidden="true" />}
              At least {MIN_PASSWORD_LENGTH} characters. Mixing letters, numbers and symbols makes it stronger.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={cn("pl-10 h-12", confirmTouched && !passwordsMatch && "border-destructive focus-visible:ring-destructive")}
              aria-invalid={confirmTouched && !passwordsMatch}
              aria-describedby={confirmTouched ? "confirm-hint" : undefined}
              required
            />
          </div>
          {confirmTouched && (
            <p
              id="confirm-hint"
              aria-live="polite"
              className={cn("flex items-center gap-1.5 text-xs", passwordsMatch ? "text-emerald-700" : "text-destructive")}
            >
              {passwordsMatch ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
              {passwordsMatch ? "Passwords match" : "Passwords don't match yet"}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
