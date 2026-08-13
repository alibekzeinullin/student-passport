"use client";

import type { MentorSummary } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label, Textarea } from "@/components/ui/Field";

interface MentorSummaryBlockProps {
  summary: MentorSummary;
  editable?: boolean;
  onChange?: (summary: MentorSummary) => void;
}

export function MentorSummaryBlock({
  summary,
  editable = false,
  onChange,
}: MentorSummaryBlockProps) {
  return (
    <Card className="border-gold/40">
      <CardHeader
        title="Mentor Summary"
        subtitle="Комментарий ментора за месяц и фокус на месяц"
      />
      <CardBody className="space-y-4">
        {editable && onChange ? (
          <>
            <div>
              <Label>Комментарий ментора за месяц</Label>
              <Textarea
                className="min-h-28"
                value={summary.monthlyComment}
                placeholder="Свободный комментарий без лимита на слова"
                onChange={(e) =>
                  onChange({ ...summary, monthlyComment: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Фокус на месяц</Label>
              <Textarea
                className="min-h-24"
                value={summary.nextMonthFocus}
                placeholder="Приоритеты и рекомендации на месяц"
                onChange={(e) =>
                  onChange({ ...summary, nextMonthFocus: e.target.value })
                }
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Комментарий за месяц
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy/90">
                {summary.monthlyComment?.trim()
                  ? summary.monthlyComment
                  : "Ментор пока не оставил комментарий."}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Фокус на месяц
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy/90">
                {summary.nextMonthFocus?.trim()
                  ? summary.nextMonthFocus
                  : "Фокус не задан."}
              </p>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
