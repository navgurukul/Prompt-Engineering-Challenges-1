import React, { useState, useEffect, useCallback, useRef } from 'react';
import { login, signup, logout, getCurrentUser } from './services/authService';
import { ChallengeStatus, ChallengeProgress, User } from './types';
import { CHALLENGES } from './constants';
import { initializeAi } from './services/analysisService';
import { audioSources } from './services/audioService';
import AuthScreen from './components/AuthScreen';
import ChallengeHost from './components/ChallengeHost';
import Spinner from './components/Spinner';

const App: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(getCurrentUser());
  const [isHidingAuth, setIsHidingAuth] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [challengeProgress, setChallengeProgress] = useState<Record<number, ChallengeProgress>>({});
  const [streakChange, setStreakChange] = useState<'increase' | 'decrease' | 'none'>('none');
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const streakUpAudioRef = useRef<HTMLAudioElement>(null);
  const streakDownAudioRef = useRef<HTMLAudioElement>(null);

  const PROGRESS_STORAGE_KEY = 'prompt-challenge-progress';

  useEffect(() => {
    // Initialize AI Service
    if (process.env.API_KEY) {
      try {
        initializeAi(process.env.API_KEY);
        setIsInitialized(true);
      } catch (e: any) {
        setError("Failed to initialize AI service: " + e.message);
        setIsInitialized(false);
      }
    } else {
      setError("CRITICAL ERROR: API_KEY environment variable not set. Application cannot function.");
      setIsInitialized(false);
    }

    // Load user progress
    try {
      const savedProgress = localStorage.getItem(PROGRESS_STORAGE_KEY);
      if (savedProgress) {
        setChallengeProgress(JSON.parse(savedProgress));
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
      // Handle potential corrupted data by resetting progress
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

  // Persist progress to local storage whenever it changes
  useEffect(() => {
    if (Object.keys(challengeProgress).length > 0) {
      localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(challengeProgress));
    }
  }, [challengeProgress]);

  // Control background music
  useEffect(() => {
    const audioElement = audioRef.current;
    if (user && audioElement) {
      audioElement.volume = 0.3;
      audioElement.play().catch(error => console.warn("Audio autoplay was prevented:", error));
    } else if (!user && audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
    }
  }, [user]);

  // Control mute state for all audio elements
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = isMuted;
    if (streakUpAudioRef.current) streakUpAudioRef.current.muted = isMuted;
    if (streakDownAudioRef.current) streakDownAudioRef.current.muted = isMuted;
  }, [isMuted]);

  // Play streak sound effects
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

  if (!isInitialized) {
    return (
      <div className="fixed inset-0 bg-cyber-bg flex flex-col items-center justify-center text-cyber-dim p-4">
        {error ? (
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-display text-red-500">INITIALIZATION FAILED</h1>
            <p className="max-w-md bg-cyber-surface p-4 border border-red-500 rounded-md">{error}</p>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <Spinner />
            <p className="text-cyber-primary animate-flicker">INITIALIZING INTERFACE...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <audio ref={audioRef} src={audioSources.backgroundMusic} loop />
      <audio ref={streakUpAudioRef} src={audioSources.streakUp} />
      <audio ref={streakDownAudioRef} src={audioSources.streakDown} />
      
      {!user ? (
        <AuthScreen onLogin={handleLogin} onSignup={handleSignup} isHiding={isHidingAuth} />
      ) : (
        <ChallengeHost
          user={user}
          onLogout={handleLogout}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(prev => !prev)}
          challengeProgress={challengeProgress}
          setChallengeProgress={setChallengeProgress}
          streakChange={streakChange}
          setStreakChange={setStreakChange}
        />
      )}
    </>
  );
};

export default App;
