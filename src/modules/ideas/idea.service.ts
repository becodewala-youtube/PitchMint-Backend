import { Types } from 'mongoose';
import Idea from './idea.model';
import User from '../users/user.model';
import CreditTransaction from '../credits/credit.model';
import { validateIdea } from '../../shared/integrations/gemini/gemini.client';
import { logActivity } from '../../shared/utils/activity-logger';
import { IIdea } from './idea.types';

export class IdeaService {
  async submitAndValidateIdea(userId: Types.ObjectId | string, ideaText: string): Promise<{ idea: IIdea; userCredits: number }> {
    // Validate the idea with Gemini API
    const validationResults = await validateIdea(ideaText);

    // Create a new idea
    const idea = await Idea.create({
      userId,
      ideaText,
      marketDemandScore: validationResults.marketDemandScore,
      competitionScore: validationResults.competitionScore,
      monetizationFeasibilityScore: validationResults.monetizationFeasibilityScore,
      overallScore: validationResults.overallScore,
      analysis: validationResults.analysis
    });

    // Log activity
    await logActivity(
      userId,
      'idea_validation',
      `Idea Validation: ${ideaText.substring(0, 50)}...`,
      'Generated comprehensive startup idea analysis with market demand, competition, and monetization scores',
      {
        ideaText,
        scores: {
          marketDemand: validationResults.marketDemandScore,
          competition: validationResults.competitionScore,
          monetization: validationResults.monetizationFeasibilityScore,
          overall: validationResults.overallScore
        },
        analysis: validationResults.analysis
      },
      1,
      idea._id
    );

    // Add the idea to user's saved ideas
    await User.findByIdAndUpdate(
      userId,
      { $push: { savedIdeas: idea._id } }
    );

    // Deduct credits from database
    const user = await User.findById(userId);
    if (user && user.credits >= 1) {
      user.credits = Math.max(0, user.credits - 1);
      await user.save();

      // Record transaction
      await CreditTransaction.create({
        userId: user._id,
        type: 'usage',
        amount: -1,
        description: 'Used 1 credit for idea validation',
        relatedService: 'idea_validation'
      });
    }

    return {
      idea,
      userCredits: user ? user.credits : 0
    };
  }

  async getIdeaById(id: string): Promise<IIdea | null> {
    return Idea.findById(id);
  }

  async getSavedIdeasByUser(userId: Types.ObjectId | string): Promise<IIdea[]> {
    return Idea.find({ userId }).sort({ createdAt: -1 });
  }

  async deleteIdea(userId: Types.ObjectId | string, ideaId: string): Promise<boolean> {
    const idea = await Idea.findById(ideaId);
    if (!idea) return false;
    if (idea.userId.toString() !== userId.toString()) {
      throw new Error('Not authorized to delete this idea');
    }

    await User.findByIdAndUpdate(
      userId,
      { $pull: { savedIdeas: idea._id } }
    );

    await idea.deleteOne();
    return true;
  }
}

export const ideaService = new IdeaService();
export default ideaService;
