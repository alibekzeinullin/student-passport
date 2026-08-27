"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useStudents } from "@/context/StudentsContext";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label, Select } from "@/components/ui/Field";
import { TableScroll } from "@/components/ui/TableScroll";

const ALL = "all";

export default function AdminPage() {
  const { students, loading } = useStudents();
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
      <div className="mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
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
          <CardBody className="p-0">
            {loading ? (
              <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">
                Загрузка учеников…
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted sm:px-5">
                Пока нет учеников. Они появятся после регистрации.
              </p>
            ) : (
              <TableScroll>
              <table className="min-w-[36rem] w-full text-left text-sm">
                <thead className="bg-light-gray/40 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-3 font-semibold sm:px-5">Ученик</th>
                    <th className="px-3 py-3 font-semibold sm:px-5">Класс</th>
                    <th className="px-3 py-3 font-semibold sm:px-5">GPA (старт)</th>
                    <th className="px-3 py-3 font-semibold sm:px-5">SAT</th>
                    <th className="px-3 py-3 font-semibold sm:px-5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => (
                    <tr
                      key={student.id}
                      className="border-t border-light-gray hover:bg-gold/10"
                    >
                      <td className="px-3 py-3 font-medium text-navy sm:px-5">
                        {student.lastName} {student.firstName}
                      </td>
                      <td className="px-3 py-3 text-navy/80 sm:px-5">
                        {student.className}
                      </td>
                      <td className="px-3 py-3 text-navy/80 sm:px-5">
                        {student.gpa.start?.toFixed(2) ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-navy/80 sm:px-5">
                        {student.testScores.sat ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-right sm:px-5">
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
              </TableScroll>
            )}
          </CardBody>
        </Card>
      </div>
    </RequireAuth>
  );
}
