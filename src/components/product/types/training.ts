export interface Skill {
  id: string;
  title: string;
  description: string;
  status: "available" | "coming-soon";
  level: string;
  minutes: number;
  category: string;
  source: string;
  segments: { id: string; title: string }[];
}
