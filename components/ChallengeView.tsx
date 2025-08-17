
import React, { useState, useEffect } from 'react';
import { Challenge, AnalysisResult } from '../types';
import Spinner from './Spinner';
import { getLocalImageAsBlobUrl } from '../services/geminiService';

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
}

const ScoreBar: React.FC<{ score: number }> = ({ score }) => {
    const width = `${score}%`;
    const colorClass = score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

    return (
        <div className="w-full bg-gray-medium rounded-full h-4 my-2">
            <div
                className={`h-4 rounded-full transition-all duration-500 ease-out ${colorClass}`}
                style={{ width }}
            ></div>
        </div>
    );
};

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
  isPassed
}) => {
  const [targetImageSrc, setTargetImageSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    
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
    };
  }, [challenge.imageUrl]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-bold text-white">{`Challenge ${challenge.id}: ${challenge.name}`}</h2>
        <p className="text-gray-light mt-1">{challenge.description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-center">Target Image</h3>
          <div className="aspect-square bg-gray-medium rounded-lg overflow-hidden border-2 border-brand-secondary flex items-center justify-center">
            {targetImageSrc ? (
              <img src={targetImageSrc} alt="Target for the challenge" className="w-full h-full object-cover" />
            ) : (
              <Spinner />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-center">Your Generation</h3>
          <div className="aspect-square bg-gray-medium rounded-lg flex items-center justify-center border-2 border-gray-medium overflow-hidden">
            {isLoading ? (
              <div className="text-center">
                <Spinner />
                <p className="mt-2 text-brand-light animate-pulse-fast">{loadingMessage}</p>
              </div>
            ) : generatedImage ? (
              <img src={generatedImage} alt="AI generated image" className="w-full h-full object-cover" />
            ) : (
              <p className="text-gray-light">Your generated image will appear here.</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Describe the image you want to generate..."
          className="w-full h-28 p-3 bg-gray-medium/70 rounded-lg border-2 border-gray-medium focus:border-brand-primary focus:ring-brand-primary focus:outline-none transition-colors"
          disabled={isLoading}
        />
        <button
          onClick={onGenerate}
          disabled={isLoading}
          className="w-full py-3 px-6 bg-brand-primary hover:bg-brand-secondary text-white font-bold rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed transform hover:scale-105 active:scale-100"
        >
          {isLoading ? 'Processing...' : 'Generate & Analyze'}
        </button>
        {error && <p className="text-red-400 text-center">{error}</p>}
      </div>

      {analysisResult && (
        <div className="bg-gray-medium/50 p-6 rounded-lg border border-gray-medium animate-slide-in-up">
          <h3 className="text-2xl font-semibold mb-2">Analysis Result</h3>
          <div className="flex items-center space-x-4 mb-2">
            <p className="font-bold text-3xl">{analysisResult.similarityScore}<span className="text-xl text-gray-light">/100</span></p>
            <div className="flex-1">
                <ScoreBar score={analysisResult.similarityScore} />
            </div>
          </div>
          <p className="text-gray-light leading-relaxed">{analysisResult.feedback}</p>
          {isPassed && (
            <div className="mt-4 text-center">
              <p className="text-green-400 font-bold text-lg">Congratulations! You passed this challenge!</p>
              {challenge.id < 6 && (
                <button
                  onClick={onNextChallenge}
                  className="mt-2 py-2 px-6 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-transform transform hover:scale-105"
                >
                  Next Challenge &rarr;
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChallengeView;
