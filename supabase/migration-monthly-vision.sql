-- Добавить колонки Monthly Progress Review и Vision Map
-- Выполните в Supabase SQL Editor, если проект уже создан по старой schema.sql

alter table public.students
  add column if not exists monthly_progress_reviews jsonb not null default '[]'::jsonb;

alter table public.students
  add column if not exists vision_map jsonb not null default '{
    "academicYear": "",
    "yearlyFocus": "",
    "targetGpa": null,
    "examTargets": [],
    "projects": [],
    "softSkills": [],
    "extracurriculars": [],
    "quarters": [
      {"id":"q1","label":"Q1 Review (Осень)","status":"Not started","notes":""},
      {"id":"q2","label":"Q2 Review (Зима)","status":"Not started","notes":""},
      {"id":"q3","label":"Q3 Review (Весна)","status":"Not started","notes":""},
      {"id":"q4","label":"Q4 Review (Лето / Финал)","status":"Not started","notes":""}
    ]
  }'::jsonb;
