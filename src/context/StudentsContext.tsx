"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  mapDbStudentToProfile,
  mapProfileToDbPatch,
} from "@/lib/supabase/mappers";
import type { DbStudent } from "@/lib/supabase/database.types";
import type {
  AcademicActivity,
  Project,
  SprintTask,
  StudentProfile,
} from "@/lib/types";

interface StudentsContextValue {
  students: StudentProfile[];
  loading: boolean;
  getStudent: (id: string) => StudentProfile | undefined;
  fetchStudentByToken: (token: string) => Promise<StudentProfile | null>;
  updateStudent: (id: string, patch: Partial<StudentProfile>) => Promise<void>;
  updateAcademicActivities: (
    studentId: string,
    academicActivities: AcademicActivity[],
  ) => Promise<void>;
  updateProjects: (studentId: string, projects: Project[]) => Promise<void>;
  updateSprintTasks: (
    studentId: string,
    sprintTasks: SprintTask[],
  ) => Promise<void>;
  regenerateParentToken: (studentId: string) => Promise<string>;
  refreshStudents: () => Promise<void>;
}

const StudentsContext = createContext<StudentsContextValue | null>(null);

export function StudentsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshStudents = useCallback(async () => {
    if (!isSupabaseConfigured() || !user) {
      setStudents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (user.role === "admin") {
        const { data, error } = await supabase
          .from("students")
          .select("*")
          .order("last_name", { ascending: true });

        if (error) throw error;
        setStudents(
          ((data as DbStudent[]) ?? []).map(mapDbStudentToProfile),
        );
      } else if (user.role === "student" && user.studentId) {
        const { data, error } = await supabase
          .from("students")
          .select("*")
          .eq("id", user.studentId)
          .maybeSingle();

        if (error) throw error;
        setStudents(data ? [mapDbStudentToProfile(data as DbStudent)] : []);
      } else {
        setStudents([]);
      }
    } catch (error) {
      console.error("Failed to load students", error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    void refreshStudents();
  }, [authLoading, refreshStudents]);

  const getStudent = useCallback(
    (id: string) => students.find((s) => s.id === id),
    [students],
  );

  const fetchStudentByToken = useCallback(async (token: string) => {
    if (!isSupabaseConfigured() || !token) return null;

    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_student_by_parent_token", {
      p_token: token,
    });

    if (error) {
      console.error(error);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const profile = mapDbStudentToProfile(row as DbStudent);
    setStudents((prev) => {
      const exists = prev.some((s) => s.id === profile.id);
      return exists
        ? prev.map((s) => (s.id === profile.id ? profile : s))
        : [...prev, profile];
    });
    return profile;
  }, []);

  const updateStudent = useCallback(
    async (id: string, patch: Partial<StudentProfile>) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );

      if (!isSupabaseConfigured()) return;

      const dbPatch = mapProfileToDbPatch(patch);
      if (Object.keys(dbPatch).length === 0) return;

      const supabase = createClient();
      const { error } = await supabase
        .from("students")
        .update(dbPatch)
        .eq("id", id);

      if (error) {
        console.error("Failed to update student", error);
        await refreshStudents();
        throw error;
      }
    },
    [refreshStudents],
  );

  const updateAcademicActivities = useCallback(
    async (studentId: string, academicActivities: AcademicActivity[]) => {
      await updateStudent(studentId, { academicActivities });
    },
    [updateStudent],
  );

  const updateProjects = useCallback(
    async (studentId: string, projects: Project[]) => {
      await updateStudent(studentId, { projects });
    },
    [updateStudent],
  );

  const updateSprintTasks = useCallback(
    async (studentId: string, sprintTasks: SprintTask[]) => {
      await updateStudent(studentId, { sprintTasks });
    },
    [updateStudent],
  );

  const regenerateParentToken = useCallback(
    async (studentId: string) => {
      if (!isSupabaseConfigured()) {
        throw new Error("Supabase не настроен");
      }

      const supabase = createClient();
      const { data, error } = await supabase.rpc("regenerate_parent_token", {
        p_student_id: studentId,
      });

      if (error || !data) {
        console.error(error);
        throw error ?? new Error("Не удалось обновить токен");
      }

      const token = String(data);
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId ? { ...s, parentAccessToken: token } : s,
        ),
      );
      return token;
    },
    [],
  );

  const value = useMemo(
    () => ({
      students,
      loading,
      getStudent,
      fetchStudentByToken,
      updateStudent,
      updateAcademicActivities,
      updateProjects,
      updateSprintTasks,
      regenerateParentToken,
      refreshStudents,
    }),
    [
      students,
      loading,
      getStudent,
      fetchStudentByToken,
      updateStudent,
      updateAcademicActivities,
      updateProjects,
      updateSprintTasks,
      regenerateParentToken,
      refreshStudents,
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
