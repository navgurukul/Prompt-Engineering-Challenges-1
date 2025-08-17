
import React, { useState, useEffect, useCallback } from 'react';
import { Challenge, ChallengeStatus, AnalysisResult } from './types';
import { CHALLENGES, PASS_THRESHOLD } from './constants';
import ChallengeSelector from './components/ChallengeSelector';
import ChallengeView from './components/ChallengeView';
import { generateImage, analyzeImages } from './services/geminiService';

const App: React.FC = () => {
  const [challengeStatuses, setChallengeStatuses] = useState<ChallengeStatus[]>([]);
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedProgress = localStorage.getItem('prompt-challenge-progress');
      if (savedProgress) {
        const statuses = JSON.parse(savedProgress) as ChallengeStatus[];
        setChallengeStatuses(statuses);
        const lastCompleted = statuses.lastIndexOf(ChallengeStatus.COMPLETED);
        const nextChallenge = lastCompleted + 1;
        setCurrentChallengeIndex(nextChallenge < CHALLENGES.length ? nextChallenge : lastCompleted);
      } else {
        const initialStatuses = Array(CHALLENGES.length).fill(ChallengeStatus.LOCKED);
        initialStatuses[0] = ChallengeStatus.UNLOCKED;
        setChallengeStatuses(initialStatuses);
      }
    } catch (e) {
      console.error("Failed to parse progress from local storage", e);
      const initialStatuses = Array(CHALLENGES.length).fill(ChallengeStatus.LOCKED);
      initialStatuses[0] = ChallengeStatus.UNLOCKED;
      setChallengeStatuses(initialStatuses);
    }
  }, []);

  useEffect(() => {
    if(challengeStatuses.length > 0) {
      localStorage.setItem('prompt-challenge-progress', JSON.stringify(challengeStatuses));
    }
  }, [challengeStatuses]);
  
  const handleGenerateAndAnalyze = useCallback(async () => {
    if (!prompt) {
      setError("Prompt cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    setGeneratedImage(null);

    try {
      setLoadingMessage('Generating your masterpiece...');
      const imageB64 = await generateImage(prompt);
      setGeneratedImage(`data:image/jpeg;base64,${imageB64}`);
      
      setLoadingMessage('Analyzing visual similarity...');
      const currentChallenge = CHALLENGES[currentChallengeIndex];
      const result = await analyzeImages(currentChallenge, imageB64);
      setAnalysisResult(result);

      if (result.similarityScore >= PASS_THRESHOLD) {
        setChallengeStatuses(prev => {
          const newStatuses = [...prev];
          newStatuses[currentChallengeIndex] = ChallengeStatus.COMPLETED;
          if (currentChallengeIndex + 1 < CHALLENGES.length) {
            newStatuses[currentChallengeIndex + 1] = ChallengeStatus.UNLOCKED;
          }
          return newStatuses;
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [prompt, currentChallengeIndex]);

  const handleSelectChallenge = (index: number) => {
    if (challengeStatuses[index] !== ChallengeStatus.LOCKED) {
      setCurrentChallengeIndex(index);
      setPrompt('');
      setGeneratedImage(null);
      setAnalysisResult(null);
      setError(null);
    }
  };

  const handleNextChallenge = () => {
    const nextIndex = currentChallengeIndex + 1;
    if (nextIndex < CHALLENGES.length) {
      handleSelectChallenge(nextIndex);
    }
  };
  
  const currentChallenge = CHALLENGES[currentChallengeIndex];

  return (
    <div className="min-h-screen bg-gray-dark font-sans text-gray-light">
      <header className="py-4 px-8 bg-gray-medium/30 border-b border-gray-medium">
        <h1 className="text-3xl font-bold text-white tracking-wider">
          <span className="text-brand-primary">Prompt</span> Engineering Challenge
        </h1>
      </header>
      <main className="flex flex-col md:flex-row p-4 md:p-8 gap-8">
        <aside className="w-full md:w-1/4 lg:w-1/5">
          <ChallengeSelector
            challenges={CHALLENGES}
            statuses={challengeStatuses}
            currentChallengeId={currentChallenge.id}
            onSelectChallenge={handleSelectChallenge}
          />
        </aside>
        <div className="flex-1">
          {currentChallenge && (
            <ChallengeView
              challenge={currentChallenge}
              prompt={prompt}
              onPromptChange={setPrompt}
              onGenerate={handleGenerateAndAnalyze}
              isLoading={isLoading}
              loadingMessage={loadingMessage}
              generatedImage={generatedImage}
              analysisResult={analysisResult}
              error={error}
              onNextChallenge={handleNextChallenge}
              isPassed={!!analysisResult && analysisResult.similarityScore >= PASS_THRESHOLD}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
