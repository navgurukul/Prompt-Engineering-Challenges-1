
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AuthForm from './components/AuthForm';
import { login, signup, logout, getCurrentUser, User } from './services/authService';
import { Challenge, ChallengeStatus, AnalysisResult, ChallengeProgress } from './types';
import { CHALLENGES, PASS_THRESHOLD } from './constants';
import ChallengeSelector from './components/ChallengeSelector';
import ChallengeView from './components/ChallengeView';
import { generateImage, analyzeImages, initializeAi, ImageService } from './services/ApiService';
import { audioSources } from './services/audioService';

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streakUpAudioRef = useRef<HTMLAudioElement>(null);
  const streakDownAudioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [streakChange, setStreakChange] = useState<'increase' | 'decrease' | 'none'>('none');

  const PROGRESS_STORAGE_KEY = 'prompt-challenge-progress';

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

  const handleSaveProgress = () => {
    try {
      setShowProfileDropdown(false);
      // Use the live state as the source of truth, not localStorage.
      if (!challengeProgress || Object.keys(challengeProgress).length === 0) {
        alert("No progress data to save.");
        return;
      }
      const progressData = JSON.stringify(challengeProgress, null, 2); // Pretty-print for readability
      const blob = new Blob([progressData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prompt-challenge-progress.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to save progress:", error);
      alert("An error occurred while saving progress.");
    }
  };

  const handleLoadProgressClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileLoad = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error("Failed to read file content.");
        }
        
        const loadedProgressJson: Record<string, ChallengeProgress> = JSON.parse(text);

        if (typeof loadedProgressJson !== 'object' || loadedProgressJson === null) {
            throw new Error("Invalid progress file: data is not a valid JSON object.");
        }
        
        const newProgress: Record<number, ChallengeProgress> = {};
        
        for (const key in loadedProgressJson) {
          if (Object.prototype.hasOwnProperty.call(loadedProgressJson, key)) {
            const challengeId = parseInt(key, 10);
            if (isNaN(challengeId)) {
                throw new Error(`Invalid key in progress file: "${key}". Expected a number.`);
            }
            const progressItem = loadedProgressJson[key];
            if (
              !progressItem ||
              !Object.values(ChallengeStatus).includes(progressItem.status) ||
              typeof progressItem.streak !== 'number' ||
              typeof progressItem.previousSimilarityScore !== 'number'
            ) {
              throw new Error(`Data for challenge ${key} is malformed.`);
            }
            newProgress[challengeId] = progressItem;
          }
        }
        
        // Update state
        setChallengeProgress(newProgress);
        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(newProgress));
        setShowProfileDropdown(false);

        // Recalculate and set the current challenge index based on loaded data
        const statuses = CHALLENGES.map(c => newProgress[c.id]?.status);
        const lastCompleted = statuses.lastIndexOf(ChallengeStatus.COMPLETED);
        const nextChallenge = lastCompleted + 1;
        setCurrentChallengeIndex(nextChallenge < CHALLENGES.length ? nextChallenge : lastCompleted > -1 ? lastCompleted : 0);

      } catch (error) {
        console.error("Failed to load or parse progress file:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        alert(`Failed to load progress file. Please ensure it is a valid progress JSON. \n\nDetails: ${errorMessage}`);
      } finally {
        // Reset file input to allow loading the same file again
        if (event.target) {
            event.target.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleSelectChallenge = useCallback((index: number) => {
    if (challengeProgress[CHALLENGES[index].id]?.status !== ChallengeStatus.LOCKED) {
      setCurrentChallengeIndex(index);
      setGeneratedImage(null);
      setAnalysisResult(null);
      setError(null);
      setPrompt('');
    }
  }, [challengeProgress]);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setGeneratedImage(null);
    setAnalysisResult(null);
    setError(null);

    const currentChallenge = CHALLENGES[currentChallengeIndex];

    try {
      setLoadingMessage('Generating image...');
      const generatedImageBase64 = await generateImage(prompt, selectedService);
      setGeneratedImage(`data:image/jpeg;base64,${generatedImageBase64}`);

      setLoadingMessage('Analyzing results...');
      const result = await analyzeImages(currentChallenge, generatedImageBase64, prompt);
      setAnalysisResult(result);

      const isPassed = result.similarityScore >= PASS_THRESHOLD;

      const currentProgress = challengeProgress[currentChallenge.id];
      let newStreak = currentProgress.streak;
      if (result.similarityScore > currentProgress.previousSimilarityScore) {
          newStreak++;
          setStreakChange('increase');
      } else if (result.similarityScore < currentProgress.previousSimilarityScore) {
          newStreak = Math.max(0, newStreak - 2);
          setStreakChange('decrease');
      } else {
          setStreakChange('none');
      }

      const updatedProgress = { ...challengeProgress };
      updatedProgress[currentChallenge.id] = {
        ...updatedProgress[currentChallenge.id],
        streak: newStreak,
        previousSimilarityScore: result.similarityScore,
      };

      if (isPassed && updatedProgress[currentChallenge.id].status !== ChallengeStatus.COMPLETED) {
        updatedProgress[currentChallenge.id].status = ChallengeStatus.COMPLETED;
        if (currentChallengeIndex + 1 < CHALLENGES.length) {
          const nextChallengeId = CHALLENGES[currentChallengeIndex + 1].id;
          if (updatedProgress[nextChallengeId].status === ChallengeStatus.LOCKED) {
            updatedProgress[nextChallengeId].status = ChallengeStatus.UNLOCKED;
          }
        }
      }

      setChallengeProgress(updatedProgress);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [prompt, currentChallengeIndex, challengeProgress, selectedService]);

  const handleNextChallenge = () => {
    if (currentChallengeIndex < CHALLENGES.length - 1) {
      handleSelectChallenge(currentChallengeIndex + 1);
    }
  };

  const currentChallenge = CHALLENGES[currentChallengeIndex];
  const currentProgress = challengeProgress[currentChallenge.id];

  const handleApiKeySave = (apiKey: string) => {
    localStorage.setItem('gemini-api-key', apiKey);
    initializeAi(apiKey);
    setIsInitialized(true);
    setIsModalOpen(false);
  };
  
  if (!user) {
    return (
      <div className={`w-full min-h-screen flex items-center justify-center p-4 bg-cyber-bg bg-[linear-gradient(to_bottom,rgba(0,0,0,0.8),rgba(0,0,0,0.8)),url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%3E%3Cg%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%2300f2ff%22%20fill-opacity%3D%220.1%22%3E%3Cpath%20d%3D%22M0%2038.59l2.83-2.83L0%2032.93V38.59zM0%200h4.24l2.83%202.83L0%209.66V0zM38.59%200l-2.83%202.83L38.59%209.66V0zM38.59%2038.59l-2.83-2.83L38.59%2032.93V38.59zM20%2017.17L37.17%200H22.83L5%2017.83l15%2015%2015-15L22.83%200H37.17L20%2017.17z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]`}>
         <div className={`transition-transform duration-1000 ${isHidingAuth ? 'scale-0' : 'scale-100'}`}>
          <div className="max-w-md w-full">
            <h1 className="text-5xl font-display font-bold text-cyber-primary text-center mb-2 animate-glow title-scan">PROMPT ENGINEERING</h1>
            <h2 className="text-2xl font-display text-cyber-accent text-center mb-8 animate-flicker">CHALLENGE</h2>
            {authMode === 'login' ? (
              <>
                <AuthForm onSubmit={handleLogin} type="login" />
                <p className="text-center mt-4 text-cyber-dim">
                  New agent?{' '}
                  <button onClick={() => setAuthMode('signup')} className="text-cyber-primary hover:underline">
                    Create an ID
                  </button>
                </p>
              </>
            ) : (
              <>
                <AuthForm onSubmit={handleSignup} type="signup" />
                <p className="text-center mt-4 text-cyber-dim">
                  Already registered?{' '}
                  <button onClick={() => setAuthMode('login')} className="text-cyber-primary hover:underline">
                    Login
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ApiKeyModal isOpen={isModalOpen && !isInitialized} onSave={handleApiKeySave} onClose={() => setIsModalOpen(false)} isClosable={isInitialized} />
      <div className="bg-cyber-bg min-h-screen bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(0,242,255,0.2),rgba(255,255,255,0))] bg-[length:100px_100px] animate-grid-pan">
      <audio ref={audioRef} src={audioSources.backgroundMusic} loop />
      <audio ref={streakUpAudioRef} src={audioSources.streakUp} />
      <audio ref={streakDownAudioRef} src={audioSources.streakDown} />
      <input type="file" ref={fileInputRef} onChange={handleFileLoad} accept=".json" style={{ display: 'none' }} />

      <header className="bg-cyber-surface/80 backdrop-blur-sm p-4 border-b-2 border-cyber-primary/30 flex justify-between items-center relative z-10">
        <h1 className="text-xl font-display font-bold text-cyber-primary tracking-widest animate-flicker">P.E.C. TERMINAL</h1>
        <div className="hidden md:flex items-center">
            <span className="text-cyber-dim mr-4 text-sm">SERVICE:</span>
            <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value as ImageService)}
                className="bg-cyber-bg border border-cyber-secondary/50 rounded-md p-2 text-cyber-text focus:outline-none focus:ring-2 focus:ring-cyber-secondary"
            >
                <option value="gemini">Gemini 3.0</option>
                <option value="pollinations">Pollinations (Flux)</option>
            </select>
        </div>
        <div className="flex items-center gap-4">
            <button onClick={() => setIsMuted(!isMuted)} className="text-cyber-dim hover:text-cyber-primary transition-colors" aria-label={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? 
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                :
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              }
            </button>
            <div className="relative">
                <button onClick={() => setShowProfileDropdown(!showProfileDropdown)} className="flex items-center gap-2 p-2 rounded-md hover:bg-cyber-surface transition-colors" aria-haspopup="true" aria-expanded={showProfileDropdown}>
                    <span className="text-cyber-text font-semibold">{user.email}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-cyber-dim transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </button>
                {showProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-56 bg-cyber-surface rounded-md shadow-lg border-2 border-cyber-secondary/50 z-20 animate-fade-in">
                        <ul className="py-1">
                            <li><button onClick={() => { setIsModalOpen(true); setShowProfileDropdown(false); }} className="w-full text-left px-4 py-2 text-sm text-cyber-text hover:bg-cyber-primary hover:text-cyber-bg transition-colors">API Key</button></li>
                            <li><button onClick={handleSaveProgress} className="w-full text-left px-4 py-2 text-sm text-cyber-text hover:bg-cyber-primary hover:text-cyber-bg transition-colors">Save Progress</button></li>
                            <li><button onClick={() => { handleLoadProgressClick(); setShowProfileDropdown(false); }} className="w-full text-left px-4 py-2 text-sm text-cyber-text hover:bg-cyber-primary hover:text-cyber-bg transition-colors">Load Progress</button></li>
                            <li><hr className="border-cyber-dim/20 my-1"/></li>
                            <li><button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white transition-colors">Logout</button></li>
                        </ul>
                    </div>
                )}
            </div>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="md:hidden text-cyber-dim hover:text-cyber-primary transition-colors" aria-label="Toggle menu">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
            </button>
        </div>
      </header>
       {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden bg-cyber-surface/95 p-4 border-b-2 border-cyber-primary/30 space-y-2 animate-fade-in">
            <label htmlFor="mobile-service-select" className="block text-cyber-dim text-sm">SERVICE:</label>
             <select
                id="mobile-service-select"
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value as ImageService)}
                className="w-full bg-cyber-bg border border-cyber-secondary/50 rounded-md p-2 text-cyber-text focus:outline-none focus:ring-2 focus:ring-cyber-secondary"
            >
                <option value="gemini">Gemini 3.0</option>
                <option value="pollinations">Pollinations (Flux)</option>
            </select>
        </div>
      )}


      <main className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          <div className="md:col-span-1 lg:col-span-1">
            {currentProgress && (
              <ChallengeSelector
                challenges={CHALLENGES}
                statuses={CHALLENGES.map(c => challengeProgress[c.id]?.status || ChallengeStatus.LOCKED)}
                currentChallengeId={currentChallenge.id}
                onSelectChallenge={handleSelectChallenge}
              />
            )}
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            {currentProgress && (
              <ChallengeView
                challenge={currentChallenge}
                prompt={prompt}
                onPromptChange={setPrompt}
                onGenerate={handleGenerate}
                isLoading={isLoading}
                loadingMessage={loadingMessage}
                generatedImage={generatedImage}
                analysisResult={analysisResult}
                error={error}
                onNextChallenge={handleNextChallenge}
                isPassed={!!analysisResult && analysisResult.similarityScore >= PASS_THRESHOLD}
                isNextChallengeAvailable={currentChallengeIndex < CHALLENGES.length - 1}
                previousSimilarityScore={currentProgress.previousSimilarityScore}
              />
            )}
          </div>
        </div>
      </main>
      </div>
    </>
  );
};

export default App;
