import { generateMarketResearch } from '../../shared/integrations/gemini/gemini.client';

export class MarketResearchService {
  async analyze(ideaText: string, industry: string, targetRegion: string) {
    return generateMarketResearch(ideaText, industry, targetRegion);
  }
}

export const marketResearchService = new MarketResearchService();
export default marketResearchService;
