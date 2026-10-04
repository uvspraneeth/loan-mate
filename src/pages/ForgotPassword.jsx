import { db } from '@/api/supabaseClient';

import React, { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, MailCheck, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await db.auth.resetPasswordRequest(email);
    } catch {
      // Always show success regardless (don't reveal whether an account exists)
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={sent ? MailCheck : Mail}
      title={sent ? "Check your email" : "Reset password"}
      subtitle={sent ? "Your reset link is on its way" : "We'll send you a link to reset it"}
      footer={
        <Link to="/login" className="inline-flex items-center min-h-10 text-primary font-medium hover:underline">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" aria-hidden="true" />Back to log in
        </Link>
      }
    >
      {sent ? (
        <div role="status" className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <MailCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm text-foreground">
            If an account exists for <span className="font-semibold break-all">{email}</span>, you'll receive a password reset link shortly.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            The link opens a page where you can choose a new password. Check your spam folder if it doesn't arrive in a few minutes.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 mt-6 font-medium"
            onClick={() => setSent(false)}
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
