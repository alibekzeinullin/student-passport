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
    "futureAcademicGoals": [
      {"id":"fac-1","text":"","status":"Planned"},
      {"id":"fac-2","text":"","status":"Planned"},
      {"id":"fac-3","text":"","status":"Planned"},
      {"id":"fac-4","text":"","status":"Planned"},
      {"id":"fac-5","text":"","status":"Planned"}
    ],
    "futureOtherGoals": [
      {"id":"fot-1","text":"","status":"Planned"},
      {"id":"fot-2","text":"","status":"Planned"},
      {"id":"fot-3","text":"","status":"Planned"},
      {"id":"fot-4","text":"","status":"Planned"},
      {"id":"fot-5","text":"","status":"Planned"}
    ]
  }'::jsonb;
