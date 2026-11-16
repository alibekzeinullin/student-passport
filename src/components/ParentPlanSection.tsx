"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadPlan, type PlanEntry } from "@/lib/program-plan";
import { ProgramPlanView } from "@/components/ProgramPlanView";

/** «План года» в кабинете родителя: что было и что будет дальше. */
export function ParentPlanSection({ className }: { className?: string }) {
  const [plan, setPlan] = useState<PlanEntry[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    loadPlan(createClient())
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch(() => {
        if (!cancelled) setPlan([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!plan || plan.length === 0) return null;

  return (
    <section aria-labelledby="plan-h">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">Менторская программа</p>
      <h3 id="plan-h" className="mt-1 text-2xl font-light text-navy">План года</h3>
      <p className="mb-4 mt-1 text-sm text-muted">Чем занимаемся каждый месяц и как поддержать дома. Текущий месяц выделен.</p>
      <ProgramPlanView plan={plan} className={className} />
    </section>
  );
}
