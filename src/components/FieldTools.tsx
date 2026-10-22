"use client";

import { useState } from "react";
import Link from "next/link";
import { insertTemplate, type MeetingTemplate, type TemplateKind } from "@/lib/templates";
import { VoiceButton, appendText } from "@/components/ui/VoiceButton";

/** Над текстовым полем: шаблоны (одним нажатием) и диктовка голосом. */
export function FieldTools({
  kind,
  templates,
  value,
  onChange,
}: {
  kind?: TemplateKind;
  templates?: MeetingTemplate[];
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = kind ? (templates ?? []).filter((t) => t.kind === kind) : [];

  return (
    <div className="mb-1.5 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {kind ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
              open ? "border-gold/60 text-gold" : "border-white/15 text-muted hover:border-gold/50 hover:text-navy"
            }`}
          >
            Шаблоны{list.length ? ` · ${list.length}` : ""}
          </button>
        ) : null}
        <VoiceButton onText={(t) => onChange(appendText(value, t))} />
      </div>
      {open ? (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-white/[0.03] p-2">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.body}
              onClick={() => {
                onChange(insertTemplate(value, t.body));
                setOpen(false);
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-navy transition hover:border-gold/50 hover:text-gold"
            >
              {t.title}
            </button>
          ))}
          <Link href="/admin/templates" className="px-2 py-1 text-xs text-muted underline-offset-2 hover:text-navy hover:underline">
            {list.length ? "Изменить шаблоны →" : "Шаблонов нет — добавить →"}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
