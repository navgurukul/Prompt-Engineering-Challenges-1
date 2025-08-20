
import React, { useState, useEffect } from 'react';
import { Challenge, AnalysisResult } from '../types';
import Spinner from './Spinner';
import { getLocalImageAsBlobUrl } from '../services/ApiService';
import { speak, cancelSpeech } from '../services/ttsService';

interface ChallengeViewProps {
  challenge: Challenge;
  prompt: string;
  onPromptChange: (value: string) => void;
  onGenerate: () => void;
  isLoading: boolean;
  loadingMessage: string;
  generatedImage: string | null;
  analysisResult: AnalysisResult | null;
  error: string | null;
  onNextChallenge: () => void;
  isPassed: boolean;
  isNextChallengeAvailable: boolean;
  previousSimilarityScore: number;
  isMuted: boolean;
}

const HudFrame: React.FC<{ children: React.ReactNode; title: string }> = ({ children, title }) => (
    <div className="space-y-2">
        <h3 className="text-lg font-display font-bold text-center text-cyber-primary tracking-widest uppercase">{title}</h3>
        <div className="aspect-square bg-cyber-bg p-1 relative rounded-md">
            <div className="absolute inset-0 border-2 border-cyber-primary/30 rounded-md"></div>
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                {children}
            </div>
             {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyber-primary"></div>
            <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyber-primary"></div>
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyber-primary"></div>
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyber-primary"></div>
        </div>
    </div>
);


const ChallengeView: React.FC<ChallengeViewProps> = ({
  challenge,
  prompt,
  onPromptChange,
  onGenerate,
  isLoading,
  loadingMessage,
  generatedImage,
  analysisResult,
  error,
  onNextChallenge,
  isPassed,
  isNextChallengeAvailable,
  previousSimilarityScore,
  isMuted,
}) => {
  const [targetImageSrc, setTargetImageSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    
    // Cancel any previous speech when challenge changes
    cancelSpeech();

    const loadImage = async () => {
      setTargetImageSrc(null); // Show loading state
      const blobUrl = await getLocalImageAsBlobUrl(challenge.imageUrl);
      
      if (blobUrl.startsWith('blob:')) {
        objectUrl = blobUrl;
      }
      setTargetImageSrc(blobUrl);
    };

    loadImage();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      // Cancel speech when component unmounts
      cancelSpeech();
    };
  }, [challenge.imageUrl]);

  useEffect(() => {
    if (analysisResult && analysisResult.feedback?.length > 0 && !isMuted) {
      const feedbackText = analysisResult.feedback.join('. ');
      speak(feedbackText, 'en-IN');
    }
  }, [analysisResult, isMuted]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-display font-bold text-white tracking-wider">{`CHALLENGE ${challenge.id}: ${challenge.name}`}</h2>
        <p className="text-cyber-dim mt-1 font-sans">{challenge.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HudFrame title="TARGET">
             {targetImageSrc ? (
              <img src={targetImageSrc} alt="Target for the challenge" className="w-full h-full object-cover" />
            ) : (
              <Spinner />
            )}
        </HudFrame>
        <HudFrame title="GENERATION">
            {isLoading ? (
              <div className="text-center">
                <Spinner />
                <p className="mt-2 text-cyber-primary animate-flicker font-bold tracking-widest">{loadingMessage}</p>
              </div>
            ) : generatedImage ? (
              <img src={generatedImage} alt="AI generated image" className="w-full h-full object-cover" />
            ) : (
              <p className="text-cyber-dim">Awaiting image synthesis...</p>
            )}
        </HudFrame>
      </div>

      <div className="space-y-4">
        <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Enter prompt here..."
              className="w-full h-28 p-3 bg-cyber-surface/80 rounded-md border-2 border-cyber-secondary/50 focus:border-cyber-secondary focus:ring-2 focus:ring-cyber-secondary/50 focus:outline-none transition-all text-cyber-text placeholder:text-cyber-dim font-sans"
              disabled={isLoading}
            />
        </div>
        <button
          onClick={onGenerate}
          disabled={isLoading || !prompt}
          className="w-full py-3 px-6 bg-cyber-primary text-cyber-bg font-bold text-lg rounded-md transition-all duration-300 disabled:bg-cyber-dim disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 hover:shadow-lg hover:shadow-cyber-primary/50"
        >
          {isLoading ? 'Processing...' : 'GENERATE & ANALYZE'}
        </button>
        {error && <p className="text-red-400 text-center">{error}</p>}
      </div>

      {analysisResult && (
        <div className="bg-cyber-surface/70 p-6 rounded-lg border-2 border-cyber-primary/30 animate-slide-in-up space-y-6">
          <h3 className="text-2xl font-display font-bold text-white tracking-wider">ANALYSIS RESULT</h3>
          
          <div className="grid grid-cols-3 gap-4 text-center items-center py-4 bg-cyber-bg/50 rounded-md border border-cyber-dim/20">
            <div>
              <p className="text-sm text-cyber-dim uppercase tracking-wider">Previous Similarity</p>
              <p className="text-2xl font-bold font-display text-cyber-text">{previousSimilarityScore > 0 ? previousSimilarityScore : '--'}</p>
            </div>
            <div className="flex flex-col items-center">
              {analysisResult.similarityScore > previousSimilarityScore && previousSimilarityScore > 0 && (
                <div className="text-cyber-accent animate-fade-in">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
                  <p className="font-bold text-lg">STREAK +1</p>
                </div>
              )}
              {analysisResult.similarityScore < previousSimilarityScore && (
                <div className="text-red-500 animate-fade-in">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                  <p className="font-bold text-lg">STREAK -2</p>
                </div>
              )}
              {analysisResult.similarityScore === previousSimilarityScore && previousSimilarityScore > 0 && (
                <div className="text-cyber-dim animate-fade-in">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" /></svg>
                  <p className="font-bold text-lg">NO CHANGE</p>
                </div>
              )}
               {previousSimilarityScore === 0 && (
                <div className="text-cyber-dim animate-fade-in">
                   <p className="font-bold text-lg">First Try!</p>
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-cyber-accent uppercase tracking-wider">Current Similarity</p>
              <p className="text-2xl font-bold font-display text-cyber-primary">{analysisResult.similarityScore}</p>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-bold text-cyber-accent uppercase tracking-wider">Feedback Log</h4>
            <ol className="list-decimal list-inside text-cyber-text space-y-2 mt-2 font-sans">
              {analysisResult.feedback.map((item, index) => (
                <li key={index} className="border-b border-cyber-dim/20 pb-1">{item}</li>
              ))}
            </ol>
          </div>

          {isPassed && (
            <div className="pt-4 text-center border-t border-cyber-primary/30">
              <p className="text-4xl font-display font-bold text-cyber-accent drop-shadow-[0_0_10px_#00ff7f]">
                CHALLENGE PASSED
              </p>
              <p className="text-cyber-text font-bold text-lg mb-4">Mission parameters met. Well done, agent.</p>

              {isNextChallengeAvailable ? (
                <button
                  onClick={onNextChallenge}
                  className="mt-2 py-2 px-6 bg-cyber-accent text-cyber-bg font-bold rounded-md transition-transform transform hover:scale-105 animate-glow"
                >
                  NEXT MISSION &rarr;
                </button>
              ) : (
                 <p className="mt-2 text-yellow-300 font-semibold">ALL MISSIONS COMPLETED. COMMAND AWAITS YOUR REPORT.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChallengeView;
