"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { LockKeyhole, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setLoading(true);
    const form = new FormData(event.currentTarget); const email = String(form.get("email")); const password = String(form.get("password"));
    if (mode === "register") { const response = await fetch("/api/auth/register", { method: "POST", body: form }); if (!response.ok) { const body = (await response.json()) as { error?: string }; setError(body.error ?? "Registration failed"); setLoading(false); return; } }
    const result = await signIn("credentials", { email, password, redirect: false }); setLoading(false);
    if (result?.error) { setError("Email or password is incorrect"); return; }
    router.push(searchParams.get("callbackUrl") ?? "/dashboard"); router.refresh();
  }
  return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_#d4f7f0,_transparent_32%),linear-gradient(135deg,_#f8fafc,_#eef2f7)] px-4 py-10"><Card className="w-full max-w-md"><CardHeader><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">{mode === "login" ? <LockKeyhole size={22} /> : <UserPlus size={22} />}</div><CardTitle>{mode === "login" ? "Sign in" : "Create your account"}</CardTitle><p className="text-sm text-muted-foreground">{mode === "login" ? "Continue to your PDF projects." : "Start managing private PDF extraction projects."}</p></CardHeader><CardContent><form className="space-y-4" onSubmit={onSubmit}>{mode === "register" ? <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" /></div> : null}<div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div><div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required autoComplete={mode === "login" ? "current-password" : "new-password"} /></div>{error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}<Button className="w-full" disabled={loading}>{loading ? "Working..." : mode === "login" ? "Sign in" : "Register"}</Button></form><p className="mt-5 text-center text-sm text-muted-foreground">{mode === "login" ? "Need an account?" : "Already registered?"} <Link className="font-medium text-primary hover:underline" href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create one" : "Sign in"}</Link></p></CardContent></Card></main>;
}
