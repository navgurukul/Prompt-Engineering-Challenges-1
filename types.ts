
export enum ChallengeStatus {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED',
  COMPLETED = 'COMPLETED',
}

export interface Challenge {
  id: number;
  name: string;
  imageUrl: string;
  description: string;
}

export interface AnalysisResult {
  similarityScore: number;
  similarityScoreRemarks: string;
  // Breakdown of the similarity score
  subjectScore: number;
  compositionScore: number;
  colorScore: number;
  styleScore: number;
  // Score for prompt adherence
  promptScore: number;
  promptScoreRemarks: string;
  feedback: string;
}