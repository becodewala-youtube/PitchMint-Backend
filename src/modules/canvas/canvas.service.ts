import Idea from '../ideas/idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { generateCanvas } from '../../shared/integrations/gemini/gemini.client';

export class CanvasService {
  async generate(ideaId: string, userId: string) {
    const idea = await Idea.findById(ideaId);
    if (!idea) throw new Error('Idea not found');
    if (idea.userId.toString() !== userId) throw new Error('Not authorized to access this idea');

    const canvasContent = await generateCanvas(idea.ideaText, idea.analysis);
    idea.canvasContent = canvasContent;
    await idea.save();

    const user = await User.findById(userId);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for canvas generation',
        relatedService: 'canvas'
      });
    }

    return { idea, userCredits: user ? user.credits : 0 };
  }
}

export const canvasService = new CanvasService();
export default canvasService;
