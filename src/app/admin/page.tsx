"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useStudents } from "@/context/StudentsContext";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label, Select } from "@/components/ui/Field";

const ALL = "all";

export default function AdminPage() {
  const { students } = useStudents();
  const [classFilter, setClassFilter] = useState<string>(ALL);

  const classes = useMemo(
    () => [...new Set(students.map((s) => s.className))].sort(),
    [students],
  );

  const filtered = useMemo(() => {
    return students.filter(
      (s) => classFilter === ALL || s.className === classFilter,
    );
  }, [students, classFilter]);

  return (
    <RequireAuth role="admin">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-burgundy">
            Реестр TODAY Scholars
          </p>
          <h2 className="text-2xl font-semibold text-navy">Все ученики</h2>
          <p className="mt-1 text-sm text-muted">
            Фильтрация по классам. Откройте профиль для редактирования.
          </p>
        </div>

        <Card>
          <CardHeader
            title="Фильтры"
            subtitle={`Показано ${filtered.length} из ${students.length}`}
          />
          <CardBody>
            <div className="max-w-sm">
              <Label>Класс</Label>
              <Select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
              >
                <option value={ALL}>Все классы</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Реестр учеников" />
          <CardBody className="overflow-x-auto p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-light-gray/40 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3 font-semibold">Ученик</th>
                  <th className="px-5 py-3 font-semibold">Класс</th>
                  <th className="px-5 py-3 font-semibold">GPA (старт)</th>
                  <th className="px-5 py-3 font-semibold">SAT</th>
                  <th className="px-5 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => (
                  <tr
                    key={student.id}
                    className="border-t border-light-gray hover:bg-gold/10"
                  >
                    <td className="px-5 py-3 font-medium text-navy">
                      {student.lastName} {student.firstName}
                    </td>
                    <td className="px-5 py-3 text-navy/80">
                      {student.className}
                    </td>
                    <td className="px-5 py-3 text-navy/80">
                      {student.gpa.start?.toFixed(2) ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-navy/80">
                      {student.testScores.sat ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/students/${student.id}`}
                        className="text-sm font-medium text-burgundy underline-offset-2 hover:underline"
                      >
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </RequireAuth>
  );
}
