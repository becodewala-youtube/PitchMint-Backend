export interface UpdateSlideDto {
  slideIndex: number;
  content: string;
}

export interface AddCommentDto {
  text: string;
  slideIndex: number;
  position?: { x: number; y: number };
}

export interface TalkingPointsRequestDto {
  slideIndex?: number;
}
