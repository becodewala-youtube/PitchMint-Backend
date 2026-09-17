import Investor from './investor.model';
import { InvestorCriteria } from './investor.types';
import { matchInvestors as aiMatchInvestors } from '../../shared/integrations/gemini/gemini.client';

export class InvestorService {
  async getInvestors(query: { type?: string; industry?: string }) {
    const mongoQuery: any = {};
    if (query.type) mongoQuery.type = query.type;
    if (query.industry) mongoQuery.industryFocus = { $in: [query.industry] };

    return Investor.find(mongoQuery).sort({ name: 1 });
  }

  async getInvestorById(id: string) {
    return Investor.findById(id);
  }

  async matchInvestors(criteria: InvestorCriteria) {
    return aiMatchInvestors(criteria);
  }
}

export const investorService = new InvestorService();
export default investorService;
