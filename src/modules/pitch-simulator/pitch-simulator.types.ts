export interface SimulatePitchDto {
  pitch: string;
}

export interface EvaluateAnswerDto {
  questionId?: string;
  question?: string;
  answer: string;
  pitch?: string;
}
