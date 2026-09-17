import { generateCompetitorAnalysis } from '../../shared/integrations/gemini/gemini.client';

export class CompetitorService {
  async analyze(ideaText: string) {
    return generateCompetitorAnalysis(ideaText);
  }
}

export const competitorService = new CompetitorService();
export default competitorService;
