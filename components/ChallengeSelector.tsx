
import React from 'react';
import { Challenge, ChallengeStatus } from '../types';

interface ChallengeSelectorProps {
  challenges: Challenge[];
  statuses: ChallengeStatus[];
  currentChallengeId: number;
  onSelectChallenge: (index: number) => void;
}

const Icon = ({ status }: { status: ChallengeStatus }) => {
  switch (status) {
    case ChallengeStatus.COMPLETED:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case ChallengeStatus.UNLOCKED:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case ChallengeStatus.LOCKED:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
    default:
      return null;
  }
};

const ChallengeSelector: React.FC<ChallengeSelectorProps> = ({ challenges, statuses, currentChallengeId, onSelectChallenge }) => {
  return (
    <div className="bg-gray-medium/50 rounded-lg p-4 backdrop-blur-sm border border-gray-medium">
      <h2 className="text-xl font-semibold mb-4 text-white">Challenges</h2>
      <ul className="space-y-2">
        {challenges.map((challenge, index) => {
          const status = statuses[index] || ChallengeStatus.LOCKED;
          const isCurrent = challenge.id === currentChallengeId;
          const isLocked = status === ChallengeStatus.LOCKED;

          return (
            <li key={challenge.id}>
              <button
                onClick={() => onSelectChallenge(index)}
                disabled={isLocked}
                className={`w-full text-left flex items-center p-3 rounded-md transition-all duration-200 ${
                  isCurrent ? 'bg-brand-primary text-white shadow-lg' :
                  isLocked ? 'cursor-not-allowed text-gray-500' :
                  'hover:bg-gray-medium/70 text-gray-light'
                }`}
              >
                <Icon status={status} />
                <span className="ml-3 font-medium">{`Challenge ${challenge.id}: ${challenge.name}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ChallengeSelector;
   