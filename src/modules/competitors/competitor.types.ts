export interface CompetitorSwot {
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  threats?: string[];
}

export interface Competitor {
  name?: string;
  description?: string;
  swot?: CompetitorSwot;
}

export interface CompetitorAnalysisResult {
  summary?: string;
  competitors?: Competitor[];
}
