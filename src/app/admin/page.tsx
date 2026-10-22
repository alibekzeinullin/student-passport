"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";
import { useStudents } from "@/context/StudentsContext";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Label, Select } from "@/components/ui/Field";
import { TableScroll } from "@/components/ui/TableScroll";
import { AttentionPanel } from "@/components/AttentionPanel";
import {
  buildMeetingsCsv,
  downloadTextFile,
  fetchMeetingsWithNotes,
  isMeetingsTableMissing,
  todayIso,
} from "@/lib/meetings";

const ALL = "all";

type SortKey = "name" | "class" | "school" | "gpa" | "sat";
type SortDir = "asc" | "desc";

function compareText(a: string, b: string) {
  return a.localeCompare(b, "ru", { sensitivity: "base", numeric: true });
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-muted hover:text-navy"
    >
      {label}
      <span className="text-[10px]" aria-hidden>
        {active ? (dir === "asc" ? "▲" : "▼") : "◇"}
      </span>
    </button>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { students, loading, deleteStudent, updateStudent } = useStudents();
  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<"active" | "paused" | "all">("active");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const activeStudents = useMemo(
    () => students.filter((s) => s.status !== "paused"),
    [students],
  );
  const pausedCount = students.length - activeStudents.length;

  const togglePause = async (id: string, name: string, paused: boolean) => {
    if (
      !paused &&
      !window.confirm(
        `Поставить «${name}» на паузу?\n\nУченик скроется из реестра, «Что требует внимания» и выбора учеников. Все данные сохранятся — вернуть можно в любой момент.`,
      )
    ) {
      return;
    }
    setError("");
    setTogglingId(id);
    try {
      await updateStudent(id, {
        status: paused ? "active" : "paused",
        pausedAt: paused ? null : new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      setError(
        message.includes("status")
          ? "Статус «на паузе» ещё не подключён: выполните supabase/migration-pause.sql в Supabase → SQL Editor."
          : "Не удалось изменить статус ученика.",
      );
    } finally {
      setTogglingId(null);
    }
  };
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExportMeetings = async () => {
    setError("");
    setExporting(true);
    try {
      const meetings = await fetchMeetingsWithNotes();
      if (meetings.length === 0) {
        setError("Встреч пока нет — выгружать нечего.");
        return;
      }
      const names = new Map(
        students.map((s) => [s.id, `${s.lastName} ${s.firstName}`.trim()]),
      );
      downloadTextFile(
        `встречи_все_ученики_${todayIso()}.csv`,
        buildMeetingsCsv(meetings, names),
      );
    } catch (err) {
      console.error(err);
      setError(
        isMeetingsTableMissing(err)
          ? "Журнал встреч ещё не подключён: выполните supabase/migration-meetings.sql в Supabase → SQL Editor."
          : "Не удалось выгрузить встречи. Попробуйте ещё раз.",
      );
    } finally {
      setExporting(false);
    }
  };

  const classes = useMemo(
    () => [...new Set(students.map((s) => s.className))].sort(compareText),
    [students],
  );

  const filtered = useMemo(() => {
    const list = students.filter(
      (s) =>
        (classFilter === ALL || s.className === classFilter) &&
        (statusFilter === "all" ||
          (statusFilter === "paused") === (s.status === "paused")),
    );

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "class":
          return (
            dir * compareText(a.className, b.className) ||
            dir *
              compareText(
                `${a.lastName} ${a.firstName}`,
                `${b.lastName} ${b.firstName}`,
              )
          );
        case "school":
          return (
            dir * compareText(a.school, b.school) ||
            dir *
              compareText(
                `${a.lastName} ${a.firstName}`,
                `${b.lastName} ${b.firstName}`,
              )
          );
        case "gpa": {
          const ag = a.gpa.start ?? -1;
          const bg = b.gpa.start ?? -1;
          return dir * (ag - bg);
        }
        case "sat": {
          const as = a.testScores.sat ?? -1;
          const bs = b.testScores.sat ?? -1;
          return dir * (as - bs);
        }
        case "name":
        default:
          return (
            dir *
            compareText(
              `${a.lastName} ${a.firstName}`,
              `${b.lastName} ${b.firstName}`,
            )
          );
      }
    });
  }, [students, classFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const handleDelete = async (id: string, name: string) => {
    if (user?.studentId && user.studentId === id) {
      setError(
        "Это профиль, привязанный к вашему админ-аккаунту. Сначала отвяжите его в SQL, иначе удаление снимет и ваш вход.",
      );
      return;
    }

    const ok = window.confirm(
      `Удалить профиль «${name}»?\n\nБудут удалены данные паспорта и аккаунт ученика. Это нельзя отменить.`,
    );
    if (!ok) return;

    setError("");
    setDeletingId(id);
    try {
      await deleteStudent(id);
    } catch (err) {
      console.error(err);
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "";
      if (message.toLowerCase().includes("admin")) {
        setError(
          "Нельзя удалить профиль, привязанный к админу. Сначала отвяжите student_id у своего профиля.",
        );
      } else {
        setError(
          "Не удалось удалить профиль. Выполните supabase/migration-delete-student.sql в SQL Editor и попробуйте снова.",
        );
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <RequireAuth role="admin">
      <div className="sp-rise mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              Реестр TODAY Scholars
            </p>
            <h2 className="mt-1 text-3xl font-light tracking-tight text-navy sm:text-4xl">Все ученики</h2>
            <p className="mt-1 text-sm text-muted">
              Фильтр по классу, сортировка по колонкам, удаление профилей.
              Админ-аккаунт при удалении учеников не затрагивается.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleExportMeetings()}
            disabled={exporting || students.length === 0}
            className="w-full shrink-0 sm:w-auto"
          >
            {exporting ? "Готовлю файл…" : "Выгрузить все встречи в Excel"}
          </Button>
        </div>

        {!loading && students.length > 0 ? (
          <AttentionPanel students={activeStudents} />
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-burgundy/30 bg-burgundy/5 px-4 py-3 text-sm text-burgundy">
            {error}
          </div>
        ) : null}

        <Card>
          <CardHeader
            title="Фильтры и сортировка"
            subtitle={`Показано ${filtered.length} из ${students.length}`}
            action={
              <div
                role="group"
                aria-label="Статус учеников"
                className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm"
              >
                {(
                  [
                    ["active", `Активные · ${activeStudents.length}`],
                    ["paused", `На паузе · ${pausedCount}`],
                    ["all", "Все"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={statusFilter === key}
                    onClick={() => setStatusFilter(key)}
                    className={`rounded-full px-3 py-1.5 transition ${
                      statusFilter === key
                        ? "bg-gold text-gold-ink"
                        : "text-muted hover:text-navy"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
          />
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
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
              <div>
                <Label>Сортировка</Label>
                <Select
                  value={`${sortKey}:${sortDir}`}
                  onChange={(e) => {
                    const [key, dir] = e.target.value.split(":") as [
                      SortKey,
                      SortDir,
                    ];
                    setSortKey(key);
                    setSortDir(dir);
                  }}
                >
                  <option value="name:asc">Имя А → Я</option>
                  <option value="name:desc">Имя Я → А</option>
                  <option value="class:asc">Класс А → Я</option>
                  <option value="class:desc">Класс Я → А</option>
                  <option value="school:asc">Школа А → Я</option>
                  <option value="school:desc">Школа Я → А</option>
                  <option value="gpa:desc">GPA по убыванию</option>
                  <option value="gpa:asc">GPA по возрастанию</option>
                  <option value="sat:desc">SAT по убыванию</option>
                  <option value="sat:asc">SAT по возрастанию</option>
                </Select>
              </div>
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
                {students.length === 0
                  ? "Пока нет учеников. Они появятся после регистрации."
                  : statusFilter === "paused"
                    ? "На паузе никого нет."
                    : "Под этот фильтр никто не подходит."}
              </p>
            ) : (
              <TableScroll>
                <table className="min-w-[44rem] w-full text-left text-sm">
                  <thead className="bg-light-gray/40 text-xs tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-3 sm:px-5">
                        <SortHeader
                          label="Ученик"
                          active={sortKey === "name"}
                          dir={sortDir}
                          onClick={() => toggleSort("name")}
                        />
                      </th>
                      <th className="px-3 py-3 sm:px-5">
                        <SortHeader
                          label="Класс"
                          active={sortKey === "class"}
                          dir={sortDir}
                          onClick={() => toggleSort("class")}
                        />
                      </th>
                      <th className="px-3 py-3 sm:px-5">
                        <SortHeader
                          label="Школа"
                          active={sortKey === "school"}
                          dir={sortDir}
                          onClick={() => toggleSort("school")}
                        />
                      </th>
                      <th className="px-3 py-3 sm:px-5">
                        <SortHeader
                          label="GPA"
                          active={sortKey === "gpa"}
                          dir={sortDir}
                          onClick={() => toggleSort("gpa")}
                        />
                      </th>
                      <th className="px-3 py-3 sm:px-5">
                        <SortHeader
                          label="SAT"
                          active={sortKey === "sat"}
                          dir={sortDir}
                          onClick={() => toggleSort("sat")}
                        />
                      </th>
                      <th className="px-3 py-3 sm:px-5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((student) => {
                      const fullName =
                        `${student.lastName} ${student.firstName}`.trim();
                      const isOwnLinked =
                        Boolean(user?.studentId) &&
                        user?.studentId === student.id;
                      return (
                        <tr
                          key={student.id}
                          className={`border-t border-light-gray hover:bg-gold/10 ${
                            student.status === "paused" ? "opacity-60" : ""
                          }`}
                        >
                          <td className="px-3 py-3 font-medium text-navy sm:px-5">
                            <span className="inline-flex items-center gap-3">
                              <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold/40 bg-gold/10 text-[11px] font-normal text-gold">
                                {student.avatarUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={student.avatarUrl} alt="" className="size-full object-cover" />
                                ) : (
                                  `${student.firstName[0] ?? ""}${student.lastName[0] ?? ""}`.toUpperCase()
                                )}
                              </span>
                              {fullName}
                            </span>
                            {student.status === "paused" ? (
                              <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-normal text-muted">
                                на паузе
                                {student.pausedAt
                                  ? ` с ${new Date(student.pausedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`
                                  : ""}
                              </span>
                            ) : null}
                            {isOwnLinked ? (
                              <span className="mt-1 block text-xs font-normal text-burgundy">
                                связан с вашим админ-аккаунтом
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-navy/80 sm:px-5">
                            {student.className}
                          </td>
                          <td className="px-3 py-3 text-navy/80 sm:px-5">
                            {student.school || "—"}
                          </td>
                          <td className="px-3 py-3 text-navy/80 sm:px-5">
                            {student.gpa.start?.toFixed(2) ?? "—"}
                          </td>
                          <td className="px-3 py-3 text-navy/80 sm:px-5">
                            {student.testScores.sat ?? "—"}
                          </td>
                          <td className="px-3 py-3 sm:px-5">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <Link
                                href={`/admin/students/${student.id}`}
                                className="text-sm font-medium text-burgundy underline-offset-2 hover:underline"
                              >
                                Открыть
                              </Link>
                              <Button
                                type="button"
                                variant="secondary"
                                className="!px-2.5 !py-1.5 text-xs"
                                disabled={togglingId === student.id}
                                onClick={() =>
                                  void togglePause(
                                    student.id,
                                    fullName,
                                    student.status === "paused",
                                  )
                                }
                              >
                                {student.status === "paused"
                                  ? "Вернуть"
                                  : "На паузу"}
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                className="!px-2.5 !py-1.5 text-xs"
                                disabled={
                                  deletingId === student.id || isOwnLinked
                                }
                                onClick={() =>
                                  void handleDelete(student.id, fullName)
                                }
                              >
                                {deletingId === student.id
                                  ? "Удаление…"
                                  : "Удалить"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
