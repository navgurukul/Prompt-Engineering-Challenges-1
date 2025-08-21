
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
  feedback: string[];
}

export interface ChallengeProgress {
  status: ChallengeStatus;
  streak: number;
  previousSimilarityScore: number;
}