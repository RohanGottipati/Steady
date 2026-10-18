export interface ProgressPoint {
  attemptId: string;
  completedAt: string;
  overallScore: number;
}
export interface SkillProgress {
  skillId: string;
  attempts: number;
  bestScore: number;
  avgScore: number;
  latestScore: number;
  latestAt: string;
  avgCategoryScores: {
    precision: number;
    control: number;
    technique: number;
    coordination: number;
    efficiencySafety: number;
  };
  trend: ProgressPoint[];
}
export interface ProgressOverview {
  progress: SkillProgress[];
  summary: {
    attempts: number;
    bestScore: number | null;
    avgScore: number | null;
  };
}
