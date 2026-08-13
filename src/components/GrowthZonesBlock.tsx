"use client";

import type { GrowthZone } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Field";

interface GrowthZonesBlockProps {
  zones: GrowthZone[];
  editable?: boolean;
  onChange?: (zones: GrowthZone[]) => void;
}

export function GrowthZonesBlock({
  zones,
  editable = false,
  onChange,
}: GrowthZonesBlockProps) {
  const updateZone = (id: string, text: string) => {
    if (!onChange) return;
    onChange(zones.map((zone) => (zone.id === id ? { ...zone, text } : zone)));
  };

  const addZone = () => {
    if (!onChange) return;
    onChange([
      ...zones,
      {
        id: `gz-${Date.now()}`,
        text: "",
      },
    ]);
  };

  const removeZone = (id: string) => {
    if (!onChange) return;
    onChange(zones.filter((zone) => zone.id !== id));
  };

  return (
    <Card>
      <CardHeader
        title="Зоны роста"
        subtitle="Что нужно улучшить — заполняет ментор"
        action={
          editable ? (
            <Button type="button" variant="secondary" onClick={addZone}>
              Добавить
            </Button>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        {zones.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Ментор пока не указал зоны роста
          </p>
        ) : (
          zones.map((zone, index) => (
            <div
              key={zone.id}
              className="rounded-md border border-light-gray bg-[#fafafa] p-4"
            >
              {editable && onChange ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Зона {index + 1}
                  </p>
                  <Textarea
                    className="min-h-24"
                    value={zone.text}
                    placeholder="Что нужно улучшить"
                    onChange={(e) => updateZone(zone.id, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => removeZone(zone.id)}
                  >
                    Удалить
                  </Button>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-navy/90">
                  {zone.text || "—"}
                </p>
              )}
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}
