"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { INITIAL_STUDENTS } from "@/lib/mock-data";
import { normalizeStudentProfile } from "@/lib/student-factory";
import {
  readStoredStudents,
  STORAGE_EVENTS,
  writeStoredStudents,
} from "@/lib/storage";
import type {
  AcademicActivity,
  Project,
  SprintTask,
  StudentProfile,
} from "@/lib/types";

function randomToken() {
  return `tok-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface StudentsContextValue {
  students: StudentProfile[];
  getStudent: (id: string) => StudentProfile | undefined;
  getStudentByToken: (token: string) => StudentProfile | undefined;
  updateStudent: (id: string, patch: Partial<StudentProfile>) => void;
  updateAcademicActivities: (
    studentId: string,
    academicActivities: AcademicActivity[],
  ) => void;
  updateProjects: (studentId: string, projects: Project[]) => void;
  updateSprintTasks: (studentId: string, sprintTasks: SprintTask[]) => void;
  regenerateParentToken: (studentId: string) => string;
}

const StudentsContext = createContext<StudentsContextValue | null>(null);

export function StudentsProvider({ children }: { children: ReactNode }) {
  const [students, setStudents] = useState<StudentProfile[]>(() => {
    const stored = readStoredStudents();
    if (stored && stored.length > 0) {
      return stored.map((item) => normalizeStudentProfile(item));
    }
    return INITIAL_STUDENTS.map((item) => normalizeStudentProfile(item));
  });

  useEffect(() => {
    writeStoredStudents(students);
  }, [students]);

  useEffect(() => {
    const sync = () => {
      const next = readStoredStudents();
      if (next) setStudents(next.map((item) => normalizeStudentProfile(item)));
    };
    window.addEventListener(STORAGE_EVENTS.studentsChanged, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(STORAGE_EVENTS.studentsChanged, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const getStudent = useCallback(
    (id: string) => students.find((s) => s.id === id),
    [students],
  );

  const getStudentByToken = useCallback(
    (token: string) => students.find((s) => s.parentAccessToken === token),
    [students],
  );

  const updateStudent = useCallback(
    (id: string, patch: Partial<StudentProfile>) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
    },
    [],
  );

  const updateAcademicActivities = useCallback(
    (studentId: string, academicActivities: AcademicActivity[]) => {
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, academicActivities } : s,
        ),
      );
    },
    [],
  );

  const updateProjects = useCallback(
    (studentId: string, projects: Project[]) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, projects } : s)),
      );
    },
    [],
  );

  const updateSprintTasks = useCallback(
    (studentId: string, sprintTasks: SprintTask[]) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, sprintTasks } : s)),
      );
    },
    [],
  );

  const regenerateParentToken = useCallback((studentId: string) => {
    const token = randomToken();
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId ? { ...s, parentAccessToken: token } : s,
      ),
    );
    return token;
  }, []);

  const value = useMemo(
    () => ({
      students,
      getStudent,
      getStudentByToken,
      updateStudent,
      updateAcademicActivities,
      updateProjects,
      updateSprintTasks,
      regenerateParentToken,
    }),
    [
      students,
      getStudent,
      getStudentByToken,
      updateStudent,
      updateAcademicActivities,
      updateProjects,
      updateSprintTasks,
      regenerateParentToken,
    ],
  );

  return (
    <StudentsContext.Provider value={value}>{children}</StudentsContext.Provider>
  );
}

export function useStudents() {
  const ctx = useContext(StudentsContext);
  if (!ctx) {
    throw new Error("useStudents must be used within StudentsProvider");
  }
  return ctx;
}
