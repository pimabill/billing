"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Turnstile, type TurnstileHandle } from "@/components/turnstile";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const captcha = useRef<TurnstileHandle>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/proxy/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...(captchaToken && { captchaToken }) }),
      });
      // The bot check failed: say so, rather than claim an email was sent.
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        if (/CAPTCHA/.test(body.code ?? "")) {
          toast.error(body.message || "Please complete the check that you are human.");
          captcha.current?.reset();
          return;
        }
      }

      // Always show success to prevent email enumeration
      setSubmitted(true);
      toast.success("Check your inbox for a reset link");
    } catch {
      // Still show success
      setSubmitted(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1 px-0">
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            {submitted
              ? "We've sent a reset link to your email"
              : "Enter your email to receive a password reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {submitted ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                If an account exists with <strong>{email}</strong>, you will
                receive a password reset link shortly.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSubmitted(false);
                  setEmail("");
                }}
              >
                Try another email
              </Button>
              <div className="text-sm text-muted-foreground">
                <a href="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </a>
              </div>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <Turnstile ref={captcha} onToken={setCaptchaToken} onReady={setCaptchaRequired} />

                <Button type="submit" className="w-full" disabled={isLoading || (captchaRequired && !captchaToken)}>
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                Remember your password?{" "}
                <a href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </a>
              </div>
            </>
          )}
        </CardContent>
    </Card>
  );
}
