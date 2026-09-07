import { createDefaultSkills } from "./default-skills";
import { createDefaultSprintTasks } from "./default-sprints";
import { createEmptyVisionMap } from "./vision-map";
import type { AuthAccount, AuthUser, StudentProfile } from "./types";

/** Демо-токены для входа родителя: /parent/[token] */
export const DEMO_PARENT_TOKENS: Record<string, string> = {
  "tok-alibek-parent-2026": "s1",
  "tok-madina-parent-2026": "s2",
};

export const DEMO_USERS: AuthUser[] = [
  {
    id: "u-student-1",
    name: "Алибек Нурланов",
    email: "student@today.edu",
    role: "student",
    studentId: "s1",
  },
  {
    id: "u-admin-1",
    name: "Анна Ментор",
    email: "admin@today.edu",
    role: "admin",
  },
];

export const DEMO_AUTH_ACCOUNTS: AuthAccount[] = [
  {
    id: "acc-student-1",
    fullName: "Алибек Нурланов",
    email: "student@today.edu",
    password: "Student123!",
    role: "student",
    studentId: "s1",
  },
  {
    id: "acc-admin-1",
    fullName: "Анна Ментор",
    email: "admin@today.edu",
    password: "Admin123!",
    role: "admin",
  },
];

const defaultSprints = (prefix: string) => createDefaultSprintTasks(prefix);

export const INITIAL_STUDENTS: StudentProfile[] = [
  {
    id: "s1",
    firstName: "Алибек",
    lastName: "Нурланов",
    className: "11A",
    school: "НИШ ФМН Алматы",
    educationSystem: "IB",
    email: "student@today.edu",
    parentAccessToken: "tok-alibek-parent-2026",
    mentorNote:
      "Сильный аналитический профиль, лидерский потенциал в образовательных проектах.",
    mentorSummary: {
      monthlyComment:
        "Август прошёл продуктивно: стабильная посещаемость, выход в финал по математике. Рекомендую усилить SAT Reading в сентябре.",
      nextMonthFocus:
        "SAT mock test, завершение draft personal statement, 1 публичное выступление.",
    },
    attendanceScore: 92,
    assignmentsScore: 88,
    gpa: {
      startMonthLabel: "Август 2026",
      start: 3.82,
      january2027: null,
      july2027: null,
    },
    testScores: {
      sat: 1380,
      ielts: 7.0,
      satTarget: 1500,
      ieltsTarget: 7.5,
      cambridgeTest: 18,
      cambridgeTestTarget: 22,
    },
    sprintTasks: defaultSprints("s1"),
    academicActivities: [
      {
        id: "o1",
        name: "Республиканская олимпиада по математике",
        type: "Олимпиада",
        status: "В процессе",
        result: "Выход в финал",
      },
      {
        id: "o2",
        name: "IMO Shortlist Training Camp",
        type: "Олимпиада",
        status: "В планах",
        result: "—",
      },
      {
        id: "o3",
        name: "Хакатон AI for Education",
        type: "Хакатон",
        status: "Завершено",
        result: "2 место",
      },
    ],
    projects: [
      {
        id: "p1",
        title: "EduMentor Platform",
        role: "Основатель / Product Lead",
        description:
          "Платформа менторства для старшеклассников: подбор менторов, трекинг целей и GPA.",
        status: "В работе",
        impactMetrics: "48 активных учеников, 12 менторов",
      },
      {
        id: "p2",
        title: "Climate Data Club",
        role: "Координатор исследования",
        description:
          "Командный исследовательский проект по качеству воздуха в Алматы.",
        status: "Завершён",
        impactMetrics: "1 доклад, 3 школы-партнёра",
      },
    ],
    books: [
      {
        id: "b1",
        title: "Atomic Habits",
        author: "James Clear",
        status: "Читаю",
      },
      {
        id: "b2",
        title: "Range",
        author: "David Epstein",
        status: "В планах",
      },
    ],
    skills: createDefaultSkills("s1"),
    growthZones: [
      {
        id: "gz1",
        text: "Регулярность SAT Reading и более глубокая проработка одного флагманского проекта.",
      },
    ],
    monthlyFocuses: [
      {
        id: "mf1",
        month: "Август 2026",
        title: "Академический старт",
        description:
          "Закрыть пробелы по GPA и собрать план олимпиад на семестр.",
      },
    ],
    monthlyProgressReviews: [
      {
        id: "mpr1",
        monthYear: "Август 2026",
        individualSessionsAttended: 2,
        groupSessionsAttended: 2,
        homeworkCompletion: 90,
        personalFocus: "Тайм-менеджмент и самодисциплина",
        personalProgressNotes:
          "Стабильнее планирует неделю, реже срывает дедлайны по домашним заданиям.",
        academicStatus: "GPA стабилен, нагрузка по IB manageable.",
        problemSubjectsProgress:
          "Math HL — усилил практику; English — нужно больше reading stamina.",
        academicSkills: "Эссе, исследовательские навыки",
        mainProjectProgress:
          "EduMentor Platform: собрал MVP онбординга и первую когорту пользователей.",
        parallelActivities: "Climate Data Club доклад, хакатон AI for Education",
        highlights: "Финал республиканской олимпиады; 2 место на хакатоне.",
        growthAreas: "SAT Reading regularity; глубина одного флагманского проекта.",
        mentorFeedback:
          "Сильный месяц. Держать фокус на качестве personal statement.",
        studentReflection:
          "Чувствую прогресс в организации времени, хочу больше уверенности в writing.",
      },
    ],
    visionMap: {
      academicYear: "2026–2027",
      yearlyFocus:
        "Стать сильнее в academics и собрать флагманский EdTech-проект к mid-year.",
      targetGpa: 4.0,
      examTargets: [
        {
          id: "exam1",
          name: "SAT",
          targetScore: "1500",
          deadline: "Март 2027",
        },
        {
          id: "exam2",
          name: "IELTS",
          targetScore: "7.5",
          deadline: "Январь 2027",
        },
      ],
      projects: [
        {
          id: "vp1",
          title: "EduMentor Platform",
          description: "Платформа менторства для старшеклассников.",
          stage: "In Progress",
          progress: 45,
          deliverable: "MVP + 50 пользователей",
        },
        {
          id: "vp2",
          title: "Climate Data Club",
          description: "Исследование качества воздуха в Алматы.",
          stage: "Testing",
          progress: 70,
          deliverable: "Доклад + презентация для школ",
        },
      ],
      softSkills: [
        {
          id: "vs1",
          name: "Публичные выступления",
          stage: "practicing",
          rating: 3,
        },
        {
          id: "vs2",
          name: "Тайм-менеджмент",
          stage: "practicing",
          rating: 4,
        },
        {
          id: "vs3",
          name: "Нетворкинг",
          stage: "starting",
          rating: 2,
        },
      ],
      extracurriculars: [
        {
          id: "ve1",
          goal: "Республиканская олимпиада по математике",
          plannedDate: "Осень 2026",
          status: "Active",
        },
        {
          id: "ve2",
          goal: "Хакатон AI for Education",
          plannedDate: "Август 2026",
          status: "Achieved",
        },
      ],
      quarters: [
        {
          id: "q1",
          label: "Q1 Review (Осень)",
          status: "In progress",
          notes: "Фокус на GPA и MVP EduMentor.",
        },
        {
          id: "q2",
          label: "Q2 Review (Зима)",
          status: "Not started",
          notes: "",
        },
        {
          id: "q3",
          label: "Q3 Review (Весна)",
          status: "Not started",
          notes: "",
        },
        {
          id: "q4",
          label: "Q4 Review (Лето / Финал)",
          status: "Not started",
          notes: "",
        },
      ],
    },
  },
  {
    id: "s2",
    firstName: "Мадина",
    lastName: "Серікқызы",
    className: "10B",
    school: "Haileybury Almaty",
    educationSystem: "A-Level",
    email: "madina@today.edu",
    parentAccessToken: "tok-madina-parent-2026",
    mentorNote:
      "Высокая академическая дисциплина, интерес к natural sciences.",
    mentorSummary: {
      monthlyComment:
        "Отличная динамика по BioLab Outreach. Нужно зафиксировать outcomes для college apps.",
      nextMonthFocus: "IELTS writing practice, Chemistry Challenge prep.",
    },
    attendanceScore: 96,
    assignmentsScore: 94,
    gpa: {
      startMonthLabel: "Сентябрь 2026",
      start: 3.91,
      january2027: null,
      july2027: null,
    },
    testScores: {
      sat: null,
      ielts: 6.5,
      satTarget: null,
      ieltsTarget: 7.5,
      cambridgeTest: 17,
      cambridgeTestTarget: 21,
    },
    sprintTasks: defaultSprints("s2"),
    academicActivities: [
      {
        id: "o4",
        name: "Cambridge Chemistry Challenge",
        type: "Конкурс",
        status: "Подана",
        result: "Ожидание результатов",
      },
    ],
    projects: [
      {
        id: "p3",
        title: "BioLab Outreach",
        role: "Volunteer Tutor",
        description:
          "Бесплатные занятия по биологии для учеников 8–9 классов.",
        status: "В работе",
        impactMetrics: "26 учеников, 8 недель программы",
      },
    ],
    books: [
      {
        id: "b3",
        title: "The Double Helix",
        author: "James Watson",
        status: "В планах",
      },
    ],
    skills: createDefaultSkills("s2"),
    growthZones: [
      {
        id: "gz2",
        text: "Документировать импакт tutoring-программы и усилить Academic Writing.",
      },
    ],
    monthlyFocuses: [
      {
        id: "mf2",
        month: "Сентябрь 2026",
        title: "IELTS и Chemistry",
        description: "IELTS writing practice и подготовка к Chemistry Challenge.",
      },
    ],
    monthlyProgressReviews: [],
    visionMap: createEmptyVisionMap(),
  },
  {
    id: "s3",
    firstName: "Данияр",
    lastName: "Ким",
    className: "11C",
    school: "Spectra School",
    educationSystem: "AP",
    email: "daniyar@today.edu",
    parentAccessToken: "tok-daniyar-parent-2026",
    mentorNote:
      "Сильный CS-трек. Нужно вернуть Campus Navigator из паузы.",
    mentorSummary: {
      monthlyComment:
        "Просадка по выполнению заданий в августе. Требуется план восстановления дисциплины.",
      nextMonthFocus: "Возобновить Campus Navigator, USACO Silver prep.",
    },
    attendanceScore: 85,
    assignmentsScore: 80,
    gpa: {
      startMonthLabel: "Июль 2026",
      start: 3.65,
      january2027: null,
      july2027: null,
    },
    testScores: {
      sat: 1320,
      ielts: null,
      satTarget: 1450,
      ieltsTarget: null,
      cambridgeTest: 14,
      cambridgeTestTarget: 20,
    },
    sprintTasks: defaultSprints("s3"),
    academicActivities: [
      {
        id: "o5",
        name: "USACO Bronze",
        type: "Олимпиада",
        status: "Завершено",
        result: "Promotion to Silver",
      },
    ],
    projects: [
      {
        id: "p4",
        title: "Campus Navigator App",
        role: "Full-stack Developer",
        description:
          "Мобильное приложение с картами кампуса и расписанием кружков.",
        status: "На паузе",
        impactMetrics: "Beta: 90 установок",
      },
    ],
    books: [
      {
        id: "b4",
        title: "Clean Code",
        author: "Robert C. Martin",
        status: "В планах",
      },
    ],
    skills: createDefaultSkills("s3"),
    growthZones: [
      {
        id: "gz3",
        text: "Вернуть Campus Navigator из паузы и восстановить дисциплину по заданиям.",
      },
    ],
    monthlyFocuses: [
      {
        id: "mf3",
        month: "Август 2026",
        title: "Восстановление дисциплины",
        description: "USACO Silver prep и еженедельный чек по спринту.",
      },
    ],
    monthlyProgressReviews: [],
    visionMap: createEmptyVisionMap(),
  },
];
