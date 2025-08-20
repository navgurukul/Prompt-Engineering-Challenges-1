import React, { useState, useEffect } from 'react';
import { Challenge, AnalysisResult } from '../types';
import Spinner from './Spinner';
import { getLocalImageAsBlobUrl } from '../services/ApiService';

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
}

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
  isNextChallengeAvailable
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
        <div className="bg-gray-medium/50 p-6 rounded-lg border border-gray-medium animate-slide-in-up space-y-6">
          <h3 className="text-2xl font-bold text-white">Analysis Result</h3>
          
          <div>
            <h4 className="text-lg font-semibold text-brand-light">Feedback</h4>
            <ol className="list-decimal list-inside text-gray-light space-y-2 mt-2">
              {analysisResult.feedback.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          </div>

          {isPassed && (
            <div className="pt-4 text-center border-t border-gray-medium/50">
              <p className="text-green-400 font-bold text-lg">Congratulations! You passed this challenge!</p>
              {isNextChallengeAvailable ? (
                <button
                  onClick={onNextChallenge}
                  className="mt-2 py-2 px-6 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-transform transform hover:scale-105"
                >
                  Next Challenge &rarr;
                </button>
              ) : (
                 <p className="mt-2 text-yellow-300 font-semibold">You've completed all the challenges!</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ChallengeView;