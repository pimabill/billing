"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthStore } from "@/lib/stores/auth";
import { toast } from "sonner";
import { brand } from "@/lib/brand";

export default function LoginPage() {
  const router = useRouter();
  const { login, completeMfa } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Two-step sign-in: set once the password is right, until the code is.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const next = await login(email, password);
      if (next) {
        setMfaToken(next.mfaToken);
        return;
      }
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (error) {
      toast.error("Invalid credentials");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setIsLoading(true);
    try {
      await completeMfa(mfaToken, code);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "That code is not right";
      toast.error(message);
      // The five minutes ran out: start again from the password.
      if (/took too long/.test(message)) {
        setMfaToken(null);
        setCode("");
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (mfaToken) {
    return (
      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1 px-0">
          <CardTitle className="text-2xl">Two-step sign-in</CardTitle>
          <CardDescription>
            {useRecovery ? "Enter one of the recovery codes you saved. Each works once." : "Enter the 6-digit code from your authenticator app."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <form onSubmit={handleCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">{useRecovery ? "Recovery code" : "Code"}</Label>
              <Input
                id="code"
                autoFocus
                autoComplete="one-time-code"
                inputMode={useRecovery ? "text" : "numeric"}
                placeholder={useRecovery ? "xxxx-xxxx" : "123456"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Verify
            </Button>
          </form>
          <div className="mt-6 flex justify-between text-sm">
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setUseRecovery(!useRecovery);
                setCode("");
              }}
            >
              {useRecovery ? "Use the app instead" : "Use a recovery code"}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => {
                setMfaToken(null);
                setCode("");
              }}
            >
              Back
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1 px-0">
          <CardTitle className="text-2xl">Welcome to {brand.name}</CardTitle>
          <CardDescription>Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a
                  href="/forgot-password"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Forgot password?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <Label
                htmlFor="remember"
                className="text-sm font-normal cursor-pointer"
              >
                Remember me
              </Label>
            </div>

            <Button type="submit" className="w-full" isLoading={isLoading}>
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <a href="/register" className="font-medium text-primary hover:underline">
              Sign up
            </a>
          </div>
        </CardContent>
    </Card>
  );
}
