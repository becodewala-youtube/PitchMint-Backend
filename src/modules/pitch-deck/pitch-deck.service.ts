import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { generatePitchDeck, generateTalkingPoints } from '../../shared/integrations/gemini/gemini.client';

export class PitchDeckService {
  async generateDeck(ideaId: string, userId: string) {
    const idea = await Idea.findById(ideaId);
    if (!idea) throw new Error('Idea not found');
    if (idea.userId.toString() !== userId) throw new Error('Not authorized to access this idea');

    const pitchDeckContent = await generatePitchDeck(idea.ideaText, idea.analysis);
    idea.pitchDeckContent = pitchDeckContent;
    await idea.save();

    const user = await User.findById(userId);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for pitch deck generation',
        relatedService: 'pitch_deck'
      });
    }

    return { idea, userCredits: user ? user.credits : 0 };
  }
}

export const pitchDeckService = new PitchDeckService();
export default pitchDeckService;
