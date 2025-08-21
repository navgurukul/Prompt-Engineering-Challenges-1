
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AuthForm from './components/AuthForm';
import { login, signup, logout, getCurrentUser, User } from './services/authService';
import { Challenge, ChallengeStatus, AnalysisResult, ChallengeProgress } from './types';
import { CHALLENGES, PASS_THRESHOLD } from './constants';
import ChallengeSelector from './components/ChallengeSelector';
import ChallengeView from './components/ChallengeView';
import { generateImage, analyzeImages, initializeAi, ImageService } from './services/ApiService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSave: (apiKey: string) => void;
  onClose: () => void;
  isClosable: boolean;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSave, onClose, isClosable }) => {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setApiKey('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSave = () => {
    if (apiKey.trim()) {
      onSave(apiKey.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-cyber-bg/90 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={isClosable ? onClose : undefined}>
      <div className="bg-cyber-surface border-2 border-cyber-primary/50 rounded-lg shadow-lg shadow-cyber-primary/20 p-8 w-full max-w-md space-y-6 transform animate-slide-in-up relative" onClick={e => e.stopPropagation()}>
        {isClosable && (
          <button onClick={onClose} className="absolute top-4 right-4 text-cyber-dim hover:text-cyber-primary transition-colors" aria-label="Close modal">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
        <h2 className="text-3xl font-display font-bold text-cyber-primary text-center tracking-widest">{isClosable ? 'UPDATE API KEY' : 'ACCESS TERMINAL'}</h2>
        <p className="text-sm text-cyber-dim text-center font-sans">
          A valid Google Gemini API key from a paid project is required for image synthesis protocol. Your key is stored locally.
        </p>
        <div>
          <label htmlFor="apiKey" className="block text-sm font-bold text-cyber-accent mb-2 uppercase tracking-wider">
            Gemini Access Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter **paid** Gemini API key..."
            className="w-full p-3 bg-cyber-bg rounded-md border-2 border-cyber-secondary/50 focus:border-cyber-secondary focus:ring-2 focus:ring-cyber-secondary/50 focus:outline-none transition-all text-cyber-text"
            required
          />
        </div>
        <button
          onClick={handleSave}
          disabled={!apiKey.trim()}
          className="w-full py-3 px-6 bg-cyber-primary text-cyber-bg font-bold rounded-md transition-all duration-300 disabled:bg-cyber-dim disabled:cursor-not-allowed transform hover:scale-105 active:scale-100 hover:shadow-lg hover:shadow-cyber-primary/50"
        >
          {isClosable ? 'SAVE' : 'AUTHORIZE'}
        </button>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [challengeProgress, setChallengeProgress] = useState<Record<number, ChallengeProgress>>({});
  const [currentChallengeIndex, setCurrentChallengeIndex] = useState<number>(0);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ImageService>('gemini');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [user, setUser] = useState<User | null>(getCurrentUser());
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isHidingAuth, setIsHidingAuth] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streakUpAudioRef = useRef<HTMLAudioElement>(null);
  const streakDownAudioRef = useRef<HTMLAudioElement>(null);
  const [streakChange, setStreakChange] = useState<'increase' | 'decrease' | 'none'>('none');
  const [promptCache, setPromptCache] = useState<Record<string, { imageB64: string; analysisResult: AnalysisResult }>>({});

  const PROGRESS_STORAGE_KEY = 'prompt-challenge-progress-v2';

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini-api-key');
    if (savedKey) {
      initializeAi(savedKey);
      setIsInitialized(true);
    } else if (process.env.API_KEY) {
      initializeAi(process.env.API_KEY);
      setIsInitialized(true);
    } else {
      setIsModalOpen(true);
    }

    try {
      const savedProgress = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (savedProgress) {
        const progress = JSON.parse(savedProgress) as Record<number, ChallengeProgress>;
        setChallengeProgress(progress);
        const statuses = Object.values(progress).map(p => p.status);
        const lastCompleted = statuses.lastIndexOf(ChallengeStatus.COMPLETED);
        const nextChallenge = lastCompleted + 1;
        setCurrentChallengeIndex(nextChallenge < CHALLENGES.length ? nextChallenge : lastCompleted > -1 ? lastCompleted : 0);
      } else {
        const initialProgress: Record<number, ChallengeProgress> = {};
        CHALLENGES.forEach((challenge, index) => {
          initialProgress[challenge.id] = {
            status: index === 0 ? ChallengeStatus.UNLOCKED : ChallengeStatus.LOCKED,
            streak: 0,
            previousSimilarityScore: 0,
          };
        });
        setChallengeProgress(initialProgress);
      }
    } catch (e) {
      console.error("Failed to parse progress from local storage", e);
      const initialProgress: Record<number, ChallengeProgress> = {};
      CHALLENGES.forEach((challenge, index) => {
        initialProgress[challenge.id] = {
          status: index === 0 ? ChallengeStatus.UNLOCKED : ChallengeStatus.LOCKED,
          streak: 0,
          previousSimilarityScore: 0,
        };
      });
      setChallengeProgress(initialProgress);
    }
  }, []);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (user && audioElement) {
      audioElement.volume = 0.3;
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn("Audio autoplay was prevented:", error);
        });
      }
    } else if (!user && audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
  }, [user]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    if (streakUpAudioRef.current) {
      streakUpAudioRef.current.muted = isMuted;
    }
    if (streakDownAudioRef.current) {
      streakDownAudioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  useEffect(() => {
    if (streakChange === 'increase') {
      streakUpAudioRef.current?.play().catch(console.warn);
    } else if (streakChange === 'decrease') {
      streakDownAudioRef.current?.play().catch(console.warn);
    }
    if (streakChange !== 'none') {
      const timer = setTimeout(() => setStreakChange('none'), 1000);
      return () => clearTimeout(timer);
    }
  }, [streakChange]);


  const handleAuthSuccess = (loggedInUser: User) => {
    setIsHidingAuth(true);
    setTimeout(() => {
      setUser(loggedInUser);
      setIsHidingAuth(false);
    }, 1000);
  };

  const handleLogin = async (email: string, password: string) => {
    const loggedInUser = await login(email, password);
    handleAuthSuccess(loggedInUser);
  };

  const handleSignup = async (email: string, password: string) => {
    const signedUpUser = await signup(email, password);
    handleAuthSuccess(signedUpUser);
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  useEffect(() => {
    if (Object.keys(challengeProgress).length > 0) {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(challengeProgress));
    }
  }, [challengeProgress]);

  const handleGenerateAndAnalyze = useCallback(async () => {
    if (!prompt) {
      setError("Prompt cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setAnalysisResult(null);
    setGeneratedImage(null);

    const currentChallenge = CHALLENGES[currentChallengeIndex];
    const cacheKey = `${currentChallenge.id}::${prompt.trim()}`;

    if (promptCache[cacheKey]) {
      setLoadingMessage('LOADING FROM CACHE...');
      await new Promise(resolve => setTimeout(resolve, 300));
      const { imageB64, analysisResult: cachedResult } = promptCache[cacheKey];
      setGeneratedImage(`data:image/jpeg;base64,${imageB64}`);
      setAnalysisResult(cachedResult);
      setIsLoading(false);
      setLoadingMessage('');
      return;
    }
    
    const currentProgress = challengeProgress[currentChallenge.id];

    try {
      setLoadingMessage('SYNTHESIZING IMAGE...');
      const imageB64 = await generateImage(prompt, selectedService);
      setGeneratedImage(`data:image/jpeg;base64,${imageB64}`);

      setLoadingMessage('ANALYZING RESULTS...');
      const result = await analyzeImages(currentChallenge, imageB64, prompt);
      setAnalysisResult(result);
      
      setPromptCache(prev => ({
        ...prev,
        [cacheKey]: { imageB64, analysisResult: result },
      }));

      const newSimilarityScore = result.similarityScore;
      const oldSimilarityScore = currentProgress.previousSimilarityScore;
      let newStreak = currentProgress.streak;

      if (newSimilarityScore > oldSimilarityScore) {
        newStreak++;
        setStreakChange('increase');
      } else if (newSimilarityScore < oldSimilarityScore) {
        newStreak = Math.max(0, newStreak - 2);
        setStreakChange('decrease');
      } else {
        setStreakChange('none');
      }

      setChallengeProgress(prev => {
        const newProgress = { ...prev };
        
        newProgress[currentChallenge.id] = {
            ...newProgress[currentChallenge.id],
            streak: newStreak,
            previousSimilarityScore: newSimilarityScore,
            status: (newSimilarityScore >= PASS_THRESHOLD) ? ChallengeStatus.COMPLETED : newProgress[currentChallenge.id].status,
        };

        if (newSimilarityScore >= PASS_THRESHOLD && currentChallengeIndex + 1 < CHALLENGES.length) {
            const nextChallengeId = CHALLENGES[currentChallengeIndex + 1].id;
            if (newProgress[nextChallengeId].status === ChallengeStatus.LOCKED) {
                newProgress[nextChallengeId].status = ChallengeStatus.UNLOCKED;
            }
        }
        return newProgress;
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [prompt, currentChallengeIndex, selectedService, challengeProgress, promptCache]);

  const handleSelectChallenge = (index: number) => {
    const challengeId = CHALLENGES[index].id;
    if (challengeProgress[challengeId]?.status !== ChallengeStatus.LOCKED) {
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

  const handleSaveApiKey = (key: string) => {
    if (key) {
      localStorage.setItem('gemini-api-key', key);
      try {
        initializeAi(key);
        setIsModalOpen(false);
        setIsInitialized(true);
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const currentChallenge = CHALLENGES[currentChallengeIndex];
  const currentChallengeSpecificProgress = challengeProgress[currentChallenge?.id];
  const challengeStatuses = Object.values(challengeProgress).map(p => p.status);
  
  if (!currentChallengeSpecificProgress) {
      return null; // or a loading state
  }

  return (
    <>
      {!user ? (
        <div className="relative min-h-screen text-white flex flex-col items-center justify-center p-4 overflow-hidden" style={{
          backgroundImage: `
            linear-gradient(rgba(10, 10, 26, 0.8), rgba(10, 10, 26, 0.8)),
            repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 242, 255, 0.1) 1px, rgba(0, 242, 255, 0.1) 2px),
            repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0, 242, 255, 0.1) 1px, rgba(0, 242, 255, 0.1) 2px)
          `,
          backgroundSize: '100% 100%, 50px 50px, 50px 50px',
          animation: 'grid-pan 60s linear infinite'
        }}>
          <div className={`relative z-10 w-full max-w-md ${isHidingAuth ? 'animate-fade-out-up' : 'animate-fade-in'}`}>
            <AuthForm
              onSubmit={authMode === 'login' ? handleLogin : handleSignup}
              type={authMode}
            />
            <div className="flex justify-center gap-4 mt-6">
              <button
                className={`py-2 px-6 rounded-md font-bold transition-all duration-300 border-2 ${authMode === 'login' ? 'bg-cyber-primary text-cyber-bg scale-110 shadow-lg shadow-cyber-primary/40 border-cyber-primary' : 'bg-transparent text-cyber-primary border-cyber-primary/50'}`}
                onClick={() => setAuthMode('login')}
              >
                LOGIN
              </button>
              <button
                className={`py-2 px-6 rounded-md font-bold transition-all duration-300 border-2 ${authMode === 'signup' ? 'bg-cyber-primary text-cyber-bg scale-110 shadow-lg shadow-cyber-primary/40 border-cyber-primary' : 'bg-transparent text-cyber-primary border-cyber-primary/50'}`}
                onClick={() => setAuthMode('signup')}
              >
                SIGN UP
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* NOTE: Add audio files to your project at the specified paths for this to work */}
          <audio ref={audioRef} src="/audio/cyberpunk-theme.mp3" loop />
          <audio ref={streakUpAudioRef} src="/audio/streak-up.mp3" />
          <audio ref={streakDownAudioRef} src="/audio/streak-down.mp3" />
          <ApiKeyModal
            isOpen={isModalOpen}
            onSave={handleSaveApiKey}
            onClose={() => setIsModalOpen(false)}
            isClosable={isInitialized}
          />
          {isInitialized && (
            <div className="min-h-screen font-sans animate-fade-in">
              <header className="py-4 px-8 bg-cyber-surface/50 backdrop-blur-sm border-b border-cyber-primary/20 flex justify-between items-center">
                <h1 className="title-scan text-2xl md:text-3xl font-display font-bold text-white tracking-widest">
                  <span className="text-cyber-primary">PROMPT</span>//CHALLENGE
                </h1>
                <div className="flex items-center gap-6">
                   <button onClick={() => setIsMuted(prev => !prev)} className="text-cyber-dim hover:text-cyber-primary transition-colors" aria-label={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5 5 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                      </svg>
                    )}
                  </button>
                  <div className={`flex items-center gap-2 text-cyber-accent font-bold ${streakChange === 'increase' ? 'animate-pulse-green' : ''} ${streakChange === 'decrease' ? 'animate-pulse-red text-red-500' : ''}`} title={`${currentChallengeSpecificProgress.streak} similarity score improvements!`}>
                    <span className="text-2xl drop-shadow-[0_0_5px_#00ff7f]">🔥</span>
                    <span className="text-lg">{currentChallengeSpecificProgress.streak}</span>
                  </div>
                   <div className="relative">
                    <select
                      id="image-service"
                      value={selectedService}
                      onChange={e => setSelectedService(e.target.value as ImageService)}
                      className="appearance-none py-2 pl-4 pr-10 rounded-md bg-cyber-surface border border-cyber-secondary/50 text-white font-bold transition-colors focus:outline-none focus:border-cyber-secondary cursor-pointer"
                    >
                      <option value="pollinations">Pollinations</option>
                      <option value="gemini">Imagen 3</option>
                    </select>
                     <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-cyber-secondary">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                      </div>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="hidden md:block py-2 px-4 bg-cyber-surface border border-cyber-dim/50 hover:border-cyber-dim text-white text-sm font-bold rounded-md transition-colors"
                    aria-label="Change API Key"
                  >
                    API KEY
                  </button>
                  <div className="relative inline-block text-left">
                    <button
                      className="flex items-center gap-2"
                      onClick={() => setShowProfileDropdown((prev) => !prev)}
                    >
                      <div className="w-10 h-10 rounded-full bg-cyber-primary text-cyber-bg font-bold text-xl flex items-center justify-center border-2 border-cyber-primary/50">
                        {user.email[0].toUpperCase()}
                      </div>
                    </button>
                    {showProfileDropdown && (
                      <div className="absolute right-0 mt-4 w-48 bg-cyber-surface rounded-md shadow-lg z-50 border-2 border-cyber-secondary/50">
                        <div className="p-2 text-center text-cyber-dim border-b border-cyber-secondary/30">{user.email}</div>
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-cyber-text hover:bg-cyber-secondary hover:text-cyber-bg transition-colors"
                          onClick={() => { setIsModalOpen(true); setShowProfileDropdown(false);}}
                        >
                          Change API Key
                        </button>
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-cyber-text hover:bg-red-500 hover:text-white rounded-b-md transition-colors"
                          onClick={() => { setShowProfileDropdown(false); handleLogout(); }}
                        >
                          Logout
                        </button>
                      </div>
                    )}
                  </div>
                </div>
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
                      isNextChallengeAvailable={currentChallengeIndex + 1 < CHALLENGES.length}
                      previousSimilarityScore={currentChallengeSpecificProgress.previousSimilarityScore}
                    />
                  )}
                </div>
              </main>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default App;
