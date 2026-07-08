"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export function RetryButton({ projectId, children }: { projectId: string; children: React.ReactNode }) { const router = useRouter(); const [loading, setLoading] = useState(false); async function retry() { setLoading(true); await fetch(`/api/projects/${projectId}/retry`, { method: "POST" }); setLoading(false); router.refresh(); } return <Button className="mt-3" variant="outline" size="sm" onClick={retry} disabled={loading}>{loading ? "Retrying..." : children}</Button>; }
