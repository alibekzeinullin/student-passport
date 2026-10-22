import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { DeadlineCategory } from "@/lib/deadlines";

export interface Opportunity {
  id: string;
  section: string;
  name: string;
  shortName: string;
  description: string;
  kind: string;
  dueDate: string | null;
  approx: boolean;
  nextCycle: boolean;
  dateNote: string;
  location: string;
  stages: string;
  grades: string;
  price: string;
  topics: string;
  gives: string;
  how: string;
  status: string;
  url: string;
  tags: string[];
  tier: string;
  money: string;
  logoUrl: string | null;
}

export const SECTIONS: { id: string; title: string }[] = [
  { id: "kz", title: "Казахстан" },
  { id: "math", title: "Математика" },
  { id: "sci", title: "Физика, химия, биология" },
  { id: "cs", title: "Информатика и ИИ" },
  { id: "proj", title: "Проекты и стартапы" },
  { id: "hum", title: "Гуманитарные и эссе" },
  { id: "hack", title: "Хакатоны" },
  { id: "res", title: "Резерв" },
];

export const TIER_LABELS: Record<string, string> = {
  top: "топ для портфолио",
  strong: "сильная",
  base: "хорошее дополнение",
  res: "резерв",
};

export const TAG_LABELS: Record<string, string> = {
  free: "Бесплатно",
  online: "Онлайн",
  team: "Команды",
  grant: "Гранты",
  school: "Через школу",
};

/** К какому типу дедлайна относится возможность. */
export function categoryFor(o: Pick<Opportunity, "section" | "kind" | "tags" | "name">): DeadlineCategory {
  const text = `${o.kind} ${o.name}`.toLowerCase();
  if (o.section === "hack" || o.tags.includes("hack") || text.includes("хакатон") || text.includes("hackathon")) {
    return "hackathon";
  }
  if (o.tags.includes("olymp") || text.includes("олимпиад") || text.includes("olympiad")) return "olympiad";
  if (o.section === "proj" || o.section === "hum" || o.tags.includes("essay") || o.tags.includes("biz")) {
    return "contest";
  }
  return o.section === "res" ? "contest" : "olympiad";
}

interface DbOpportunity {
  id: string;
  section: string;
  name: string;
  short_name: string;
  description: string;
  kind: string;
  due_date: string | null;
  approx: boolean;
  next_cycle: boolean;
  date_note: string;
  location: string;
  stages: string;
  grades: string;
  price: string;
  topics: string;
  gives: string;
  how: string;
  status: string;
  url: string;
  tags: string[] | null;
  tier: string;
  money: string;
  logo_url?: string | null;
}

function mapOpportunity(row: DbOpportunity): Opportunity {
  return {
    id: row.id,
    section: row.section,
    name: row.name,
    shortName: row.short_name || row.name,
    description: row.description,
    kind: row.kind,
    dueDate: row.due_date,
    approx: row.approx,
    nextCycle: row.next_cycle,
    dateNote: row.date_note,
    location: row.location,
    stages: row.stages,
    grades: row.grades,
    price: row.price,
    topics: row.topics,
    gives: row.gives,
    how: row.how,
    status: row.status,
    url: row.url,
    tags: row.tags ?? [],
    tier: row.tier,
    money: row.money,
    logoUrl: row.logo_url ?? null,
  };
}

export async function fetchOpportunities(): Promise<Opportunity[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createClient();
  const { data, error } = await supabase.from("opportunities").select("*");
  if (error) throw error;
  return ((data as DbOpportunity[]) ?? [])
    .map(mapOpportunity)
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
}

/** Ментор: свой логотип возможности (ссылка на картинку; пусто — авто). */
export async function setOpportunityLogo(id: string, logoUrl: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("opportunities").update({ logo_url: logoUrl }).eq("id", id);
  if (error) throw error;
}
