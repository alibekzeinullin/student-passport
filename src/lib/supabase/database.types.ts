export type DbRole = "student" | "admin";

export interface DbProfile {
  id: string;
  role: DbRole;
  full_name: string;
  student_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbStudent {
  id: string;
  first_name: string;
  last_name: string;
  class_name: string;
  school: string;
  education_system: string;
  email: string;
  avatar_url: string | null;
  parent_access_token: string;
  mentor_note: string;
  mentor_summary: {
    monthlyComment: string;
    nextMonthFocus: string;
  };
  attendance_score: number;
  assignments_score: number;
  gpa: {
    startMonthLabel: string;
    start: number | null;
    january2027: number | null;
    july2027: number | null;
  };
  test_scores: {
    sat: number | null;
    ielts: number | null;
    satTarget: number | null;
    ieltsTarget: number | null;
    cambridgeTest: number | null;
    cambridgeTestTarget: number | null;
  };
  sprint_tasks: unknown[];
  academic_activities: unknown[];
  projects: unknown[];
  books: unknown[];
  skills: unknown[];
  growth_zones: unknown[];
  monthly_focuses: unknown[];
  created_at: string;
  updated_at: string;
}
