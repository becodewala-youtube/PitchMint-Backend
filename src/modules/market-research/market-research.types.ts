export interface MarketResearchRequestDto {
  ideaText: string;
  industry: string;
  targetRegion: string;
}

export interface MarketResearchResult {
  tam: {
    value: number;
    description: string;
    sources: string[];
  };
  sam: {
    value: number;
    description: string;
    methodology: string;
  };
  som: {
    value: number;
    description: string;
    timeline: string;
  };
  trends: Array<{
    keyword: string;
    interest: number;
    growth: string;
  }>;
  personas: Array<{
    name: string;
    demographics: any;
    psychographics: any;
    behaviors: any;
  }>;
  competitorActivity: Array<{
    name: string;
    fundingRounds: number;
    lastFunding: string;
    marketShare: string;
  }>;
}
