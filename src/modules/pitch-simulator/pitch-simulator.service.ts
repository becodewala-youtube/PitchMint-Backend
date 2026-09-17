import { simulateInvestorQA } from '../../shared/integrations/gemini/gemini.client';

export class PitchSimulatorService {
  async generateQuestions(pitch: string) {
    return simulateInvestorQA(pitch);
  }

  async evaluateAnswer(pitch: string, question: string, answer: string) {
    return simulateInvestorQA(pitch, question, answer);
  }
}

export const pitchSimulatorService = new PitchSimulatorService();
export default pitchSimulatorService;
