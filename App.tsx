/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Smile, 
  Wind, 
  Flower2, 
  BarChart3, 
  Users, 
  Send, 
  Camera, 
  Sparkles,
  Moon,
  Sun,
  User as UserIcon,
  History,
  LogOut,
  ChevronDown,
  ChevronRight,
  X,
  LogIn,
  Timer,
  Music,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Leaf,
  Gamepad2,
  Brain,
  Zap,
  Palette,
  Trophy,
  RefreshCw,
  Settings,
  Ticket,
  Trash2
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, BarChart, Bar, Legend, AreaChart, Area
} from 'recharts';
import { getGeminiResponse, detectMoodFromImage } from './lib/gemini';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  Timestamp,
  limit,
  writeBatch,
  getDocs
} from 'firebase/firestore';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07050f] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mb-6">
            <X size={40} />
          </div>
          <h1 className="font-display text-3xl font-bold mb-4 text-white">Something went wrong</h1>
          <p className="text-white/40 max-w-md mb-8">We've encountered an unexpected error. Please try refreshing the page or contact support if the issue persists.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 rounded-full bg-white text-black font-bold hover:scale-105 transition-all"
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Types ---
type Message = {
  id?: string;
  role: 'user' | 'ai';
  text: string;
  time: string;
  timestamp?: any;
};

type Page = 'home' | 'companion' | 'mood' | 'hub' | 'games' | 'garden' | 'analytics' | 'challenges' | 'community' | 'profile' | 'chathistory' | 'coupons';

type CommunityPost = {
  id: string;
  uid: string;
  authorName: string;
  text: string;
  emoji: string;
  likes: number;
  timestamp: any;
};

type LeaderboardEntry = {
  uid: string;
  displayName: string;
  xp: number;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activePage, setActivePage] = useState<Page>('home');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hey, I'm really glad you're here. 🌿 What's on your mind right now? There's no rush — I'm listening.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [toasts, setToasts] = useState<{id: string, message: string, type: 'error' | 'success'}[]>([]);
  const [chatPersistence, setChatPersistence] = useState<'permanent' | 'disappearing'>('permanent');
  const [disappearingDuration, setDisappearingDuration] = useState<'immediate' | '24h' | '7d'>('24h');
  const [showSettings, setShowSettings] = useState(false);
  const [purchasedCoupons, setPurchasedCoupons] = useState<string[]>([]);

  const addToast = (message: string, type: 'error' | 'success' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };
  const [gardenPlants, setGardenPlants] = useState<{id: string, type: string, emoji: string, label: string, time: string, height: number}[]>([]);
  const [moodEntries, setMoodEntries] = useState<{id: string, emoji: string, label: string, time: string}[]>([]);
  const [xp, setXp] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBreathingMonitorActive, setIsBreathingMonitorActive] = useState(false);
  const [breathingData, setBreathingData] = useState<number[]>([]);
  const [breathingRate, setBreathingRate] = useState(0);
  const [isMoodScanning, setIsMoodScanning] = useState(false);
  const [isUserPerforming, setIsUserPerforming] = useState(false);
  const [lastFrameData, setLastFrameData] = useState<ImageData | null>(null);
  const [motionLevel, setMotionLevel] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [analysisFrameRef] = [useRef<number>(0)];

  const [quests, setQuests] = useState([
    { id: 'breaths', label: 'Take 5 deep breaths', icon: <Wind size={16} />, points: 5, completed: false },
    { id: 'positive', label: 'Write one positive thought', icon: <Smile size={16} />, points: 5, completed: false },
    { id: 'focus', label: 'Play one focus game', icon: <Gamepad2 size={16} />, points: 10, completed: false },
    { id: 'meditation', label: '2min meditation', icon: <Timer size={16} />, points: 10, completed: false },
    { id: 'talk', label: 'Talk to mate', icon: <MessageSquare size={16} />, points: 5, completed: false },
    { id: 'gratitude', label: 'Plant gratitude', icon: <Flower2 size={16} />, points: 10, completed: false },
  ]);
  const [positiveThought, setPositiveThought] = useState('');
  const [showPositiveInput, setShowPositiveInput] = useState(false);

  const [breathCount, setBreathCount] = useState(0);

  const [challenges, setChallenges] = useState([
    { id: 'meditation_master', title: 'Meditation Master', description: 'Complete 10 meditation sessions', icon: <Timer size={24} />, progress: 0, target: 10, reward: 100 },
    { id: 'social_butterfly', title: 'Social Butterfly', description: 'Talk to Mate 20 times', icon: <MessageSquare size={24} />, progress: 0, target: 20, reward: 150 },
    { id: 'green_thumb', title: 'Green Thumb', description: 'Grow 15 plants in your garden', icon: <Flower2 size={24} />, progress: 0, target: 15, reward: 200 },
    { id: 'focus_pro', title: 'Focus Pro', description: 'Win 5 focus games', icon: <Gamepad2 size={24} />, progress: 0, target: 5, reward: 120 },
  ]);

  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [newPostText, setNewPostText] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const updateChallenge = (id: string, amount: number = 1) => {
    setChallenges(prev => prev.map(c => {
      if (c.id === id && c.progress < c.target) {
        const newProgress = Math.min(c.target, c.progress + amount);
        if (newProgress === c.target) {
          addXP(c.reward);
        }
        return { ...c, progress: newProgress };
      }
      return c;
    }));
  };

  const completeQuest = (id: string) => {
    setQuests(prev => prev.map(q => {
      if (q.id === id && !q.completed) {
        addXP(q.points);
        // Link quests to challenges
        if (id === 'meditation') updateChallenge('meditation_master');
        if (id === 'talk') updateChallenge('social_butterfly');
        if (id === 'focus') updateChallenge('focus_pro');
        return { ...q, completed: true };
      }
      return q;
    }));
  };

  // --- Relax Hub State ---
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [timerIsActive, setTimerIsActive] = useState(false);
  const [timerMode, setTimerMode] = useState<'focus' | 'break'>('focus');
  const [activeNatureSound, setActiveNatureSound] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [breathingPhase, setBreathingPhase] = useState<'inhale' | 'hold' | 'exhale' | 'rest'>('rest');
  const [breathingProgress, setBreathingProgress] = useState(0);
  const [isBreathingActive, setIsBreathingActive] = useState(false);

  // --- Games State ---
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [gameScore, setGameScore] = useState(0);
  
  // Memory Card
  const [memoryCards, setMemoryCards] = useState<{ id: number, emoji: string, isFlipped: boolean, isMatched: boolean }[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  
  // Pattern Pulse
  const [patternSequence, setPatternSequence] = useState<number[]>([]);
  const [userSequence, setUserSequence] = useState<number[]>([]);
  const [isShowingPattern, setIsShowingPattern] = useState(false);
  const [activePatternPad, setActivePatternPad] = useState<number | null>(null);
  
  // Reaction Zen
  const [reactionState, setReactionState] = useState<'idle' | 'waiting' | 'ready' | 'result'>('idle');
  const [reactionStartTime, setReactionStartTime] = useState<number>(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  
  // Color Harmony
  const [targetColor, setTargetColor] = useState<string>('');
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  const [selectedMoodForAction, setSelectedMoodForAction] = useState<{id: string, emoji: string, label: string} | null>(null);
  const [moodActionChoice, setMoodActionChoice] = useState<'talk' | 'task' | null>(null);
  const [moodTalkInput, setMoodTalkInput] = useState('');

  // --- Relax Hub Logic ---
  useEffect(() => {
    let interval: any = null;
    if (timerIsActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerIsActive(false);
      completeQuest('meditation');
      addPlant('meditation');
    }
    return () => clearInterval(interval);
  }, [timerIsActive, timerSeconds]);

  useEffect(() => {
    let interval: any = null;
    if (isBreathingActive) {
      let startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = (Date.now() - startTime) % 16000; // 16s cycle: 4-4-4-4
        if (elapsed < 4000) {
          setBreathingPhase('inhale');
          setBreathingProgress(elapsed / 4000);
        } else if (elapsed < 8000) {
          setBreathingPhase('hold');
          setBreathingProgress((elapsed - 4000) / 4000);
        } else if (elapsed < 12000) {
          setBreathingPhase('exhale');
          setBreathingProgress((elapsed - 8000) / 4000);
        } else {
          if (breathingPhase !== 'rest') {
            setBreathCount(c => {
              const next = c + 1;
              if (next >= 5) completeQuest('breaths');
              return next;
            });
          }
          setBreathingPhase('rest');
          setBreathingProgress((elapsed - 12000) / 4000);
        }
      }, 50);
    } else {
      setBreathingPhase('rest');
      setBreathingProgress(0);
    }
    return () => clearInterval(interval);
  }, [isBreathingActive]);

  const toggleNatureSound = (soundUrl: string) => {
    if (activeNatureSound === soundUrl) {
      audioRef.current?.pause();
      setActiveNatureSound(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = soundUrl;
        audioRef.current.loop = true;
        audioRef.current.play();
      } else {
        const audio = new Audio(soundUrl);
        audio.loop = true;
        audio.play();
        audioRef.current = audio;
      }
      setActiveNatureSound(soundUrl);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const natureSounds = [
    { id: 'rain', label: 'Rainfall', icon: '🌧️', url: 'https://assets.mixkit.co/sfx/preview/mixkit-rain-on-window-1519.mp3' },
    { id: 'forest', label: 'Forest', icon: '🌲', url: 'https://assets.mixkit.co/sfx/preview/mixkit-forest-birds-ambience-1210.mp3' },
    { id: 'ocean', label: 'Ocean', icon: '🌊', url: 'https://assets.mixkit.co/sfx/preview/mixkit-sea-waves-loop-1196.mp3' },
    { id: 'birds', label: 'Birds', icon: '🐦', url: 'https://assets.mixkit.co/sfx/preview/mixkit-morning-birds-2472.mp3' },
  ];

  // --- Games Logic ---
  
  // Memory Card
  const initMemoryGame = () => {
    const emojis = ['🌸', '🌿', '🍃', '🍄', '🦋', '🌙', '⭐', '🌊'];
    const deck = [...emojis, ...emojis]
      .sort(() => Math.random() - 0.5)
      .map((emoji, idx) => ({ id: idx, emoji, isFlipped: false, isMatched: false }));
    setMemoryCards(deck);
    setFlippedIndices([]);
    setGameScore(0);
    setActiveGame('memory');
  };

  const handleCardClick = (index: number) => {
    if (flippedIndices.length === 2 || memoryCards[index].isFlipped || memoryCards[index].isMatched) return;

    const newCards = [...memoryCards];
    newCards[index].isFlipped = true;
    setMemoryCards(newCards);

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      const [first, second] = newFlipped;
      if (newCards[first].emoji === newCards[second].emoji) {
        newCards[first].isMatched = true;
        newCards[second].isMatched = true;
        setMemoryCards(newCards);
        setFlippedIndices([]);
        setGameScore(s => s + 10);
        if (newCards.every(c => c.isMatched)) {
          addPlant('game');
          completeQuest('focus');
        }
      } else {
        setTimeout(() => {
          newCards[first].isFlipped = false;
          newCards[second].isFlipped = false;
          setMemoryCards(newCards);
          setFlippedIndices([]);
        }, 1000);
      }
    }
  };

  // Pattern Pulse
  const initPatternGame = () => {
    setPatternSequence([Math.floor(Math.random() * 4)]);
    setUserSequence([]);
    setGameScore(0);
    setActiveGame('pattern');
    setTimeout(() => playSequence([Math.floor(Math.random() * 4)]), 500);
  };

  const playSequence = async (seq: number[]) => {
    setIsShowingPattern(true);
    for (const pad of seq) {
      setActivePatternPad(pad);
      await new Promise(r => setTimeout(r, 600));
      setActivePatternPad(null);
      await new Promise(r => setTimeout(r, 200));
    }
    setIsShowingPattern(false);
  };

  const handlePatternClick = (pad: number) => {
    if (isShowingPattern) return;
    
    const nextUserSeq = [...userSequence, pad];
    setUserSequence(nextUserSeq);
    
    if (pad !== patternSequence[nextUserSeq.length - 1]) {
      alert("Wrong pattern! Game over.");
      setActiveGame(null);
      return;
    }

    if (nextUserSeq.length === patternSequence.length) {
      setGameScore(s => s + 1);
      const nextSeq = [...patternSequence, Math.floor(Math.random() * 4)];
      setPatternSequence(nextSeq);
      setUserSequence([]);
      setTimeout(() => playSequence(nextSeq), 1000);
    }
  };

  // Reaction Zen
  const initReactionGame = () => {
    setReactionState('idle');
    setReactionTime(null);
    setActiveGame('reaction');
  };

  const startReactionTest = () => {
    setReactionState('waiting');
    const delay = 2000 + Math.random() * 3000;
    setTimeout(() => {
      setReactionState('ready');
      setReactionStartTime(Date.now());
    }, delay);
  };

  const handleReactionClick = () => {
    if (reactionState === 'waiting') {
      alert("Too early! Wait for the color to change.");
      setReactionState('idle');
    } else if (reactionState === 'ready') {
      const time = Date.now() - reactionStartTime;
      setReactionTime(time);
      setReactionState('result');
      addPlant('game');
    }
  };

  // Color Harmony
  const initColorGame = () => {
    const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
    const target = colors[Math.floor(Math.random() * colors.length)];
    setTargetColor(target);
    setColorOptions([...colors].sort(() => Math.random() - 0.5));
    setGameScore(0);
    setActiveGame('color');
  };

  const handleColorClick = (color: string) => {
    if (color === targetColor) {
      setGameScore(s => s + 1);
      const colors = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
      const nextTarget = colors[Math.floor(Math.random() * colors.length)];
      setTargetColor(nextTarget);
      setColorOptions([...colors].sort(() => Math.random() - 0.5));
    } else {
      alert("Wrong color! Try again.");
    }
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      setCameraStream(null);
      setIsCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraStream(stream);
        setIsCameraActive(true);
      } catch (err) {
        console.error("Camera Error:", err);
        alert("Could not access camera. Please check permissions.");
      }
    }
  };

  useEffect(() => {
    if (isCameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [isCameraActive, cameraStream]);

  useEffect(() => {
    if ((!isBreathingMonitorActive && !isBreathingActive) || !isCameraActive || !videoRef.current || !canvasRef.current) {
      setBreathingData([]);
      setBreathingRate(0);
      setIsUserPerforming(false);
      if (analysisFrameRef.current) cancelAnimationFrame(analysisFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const video = videoRef.current;
    
    let lastValues: number[] = [];
    let peaks: number[] = [];
    const windowSize = 40; // Number of bars in the visualizer
    const sampleRate = 10; // Samples per second
    let frameCount = 0;
    let prevFrameData: Uint8ClampedArray | null = null;

    const analyze = () => {
      if ((!isBreathingMonitorActive && !isBreathingActive) || !isCameraActive) return;
      
      frameCount++;
      if (frameCount % (60 / sampleRate) === 0) {
        if (video.videoWidth > 0) {
          canvas.width = 100;
          canvas.height = 100;
          
          // Draw a small portion of the video (chest area)
          // Assuming the user is centered, chest is roughly middle-bottom
          ctx?.drawImage(video, 30, 60, 40, 30, 0, 0, 100, 100);
          
          const imageData = ctx?.getImageData(0, 0, 100, 100);
          if (imageData) {
            // Motion Detection for Performance Check
            if (prevFrameData) {
              let diff = 0;
              for (let i = 0; i < imageData.data.length; i += 40) {
                diff += Math.abs(imageData.data[i] - prevFrameData[i]);
              }
              const normalizedDiff = diff / (imageData.data.length / 40);
              setMotionLevel(normalizedDiff);
              setIsUserPerforming(normalizedDiff > 2); // Threshold for "performing"
            }
            prevFrameData = new Uint8ClampedArray(imageData.data);

            if (isBreathingMonitorActive) {
              let totalBrightness = 0;
              for (let i = 0; i < imageData.data.length; i += 4) {
                // Simple grayscale conversion
                totalBrightness += (imageData.data[i] + imageData.data[i+1] + imageData.data[i+2]) / 3;
              }
              const avgBrightness = totalBrightness / (imageData.data.length / 4);
              
              // Normalize and smooth
              const normalized = avgBrightness / 255;
              lastValues.push(normalized);
              if (lastValues.length > windowSize) lastValues.shift();
              
              setBreathingData([...lastValues]);

              // Simple peak detection for breathing rate
              // Breathing is slow, so we look for peaks over a longer period
              if (lastValues.length >= windowSize) {
                const now = Date.now();
                const threshold = 0.005; // Sensitivity
                
                // Find local maxima in the last few samples
                const current = lastValues[lastValues.length - 1];
                const prev = lastValues[lastValues.length - 2];
                const prevPrev = lastValues[lastValues.length - 3];
                
                if (prev > current && prev > prevPrev && prev > threshold) {
                  peaks.push(now);
                  // Keep only peaks from the last 30 seconds
                  peaks = peaks.filter(p => now - p < 30000);
                  
                  if (peaks.length >= 2) {
                    const duration = (peaks[peaks.length - 1] - peaks[0]) / 1000; // seconds
                    const rate = Math.round((peaks.length - 1) / (duration / 60));
                    if (rate > 5 && rate < 30) { // Realistic range
                      setBreathingRate(rate);
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      analysisFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();

    return () => {
      if (analysisFrameRef.current) cancelAnimationFrame(analysisFrameRef.current);
    };
  }, [isBreathingMonitorActive, isBreathingActive, isCameraActive]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // --- Auth & Data Sync ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    // Sync Profile
    const profileRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setXp(data.xp || 0);
        if (data.chatPersistence) setChatPersistence(data.chatPersistence);
        if (data.disappearingDuration) setDisappearingDuration(data.disappearingDuration);
        if (data.purchasedCoupons) setPurchasedCoupons(data.purchasedCoupons);
      } else {
        // Initialize profile
        setDoc(profileRef, {
          uid: user.uid,
          displayName: user.displayName || 'Friend',
          xp: 0,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

    // Sync Plants
    const plantsRef = collection(db, 'users', user.uid, 'plants');
    const unsubPlants = onSnapshot(query(plantsRef, orderBy('timestamp', 'asc')), (snap) => {
      const plantsData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setGardenPlants(plantsData.map(p => ({
        ...p,
        time: p.timestamp?.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Just now'
      })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/plants`));

    // Sync Moods
    const moodsRef = collection(db, 'users', user.uid, 'moods');
    const unsubMoods = onSnapshot(query(moodsRef, orderBy('timestamp', 'desc'), limit(10)), (snap) => {
      const moodsData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      setMoodEntries(moodsData.map(m => ({
        ...m,
        time: m.timestamp?.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Just now'
      })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/moods`));

    // Sync Community Posts
    const communityRef = collection(db, 'community');
    const unsubCommunity = onSnapshot(query(communityRef, orderBy('timestamp', 'desc'), limit(50)), (snap) => {
      const posts = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CommunityPost[];
      setCommunityPosts(posts);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'community'));

    // Sync Leaderboard (Top 10 by XP)
    const usersRef = collection(db, 'users');
    const unsubLeaderboard = onSnapshot(query(usersRef, orderBy('xp', 'desc'), limit(10)), (snap) => {
      const entries = snap.docs.map(doc => ({
        uid: doc.id,
        displayName: doc.data().displayName,
        xp: doc.data().xp
      })) as LeaderboardEntry[];
      setLeaderboard(entries);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));

    // Sync Chats (Current Session)
    const chatsRef = collection(db, 'users', user.uid, 'chats');
    const unsubChats = onSnapshot(query(chatsRef, orderBy('timestamp', 'asc'), limit(50)), (snap) => {
      if (snap.empty) {
        return;
      }
      const chatsData = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // Filter based on persistence settings
      let filteredChats = chatsData;
      if (chatPersistence === 'disappearing') {
        const now = Date.now();
        if (disappearingDuration === '24h') {
          filteredChats = chatsData.filter(c => {
            const ts = c.timestamp?.toMillis() || now;
            return now - ts < 24 * 60 * 60 * 1000;
          });
        } else if (disappearingDuration === '7d') {
          filteredChats = chatsData.filter(c => {
            const ts = c.timestamp?.toMillis() || now;
            return now - ts < 7 * 24 * 60 * 60 * 1000;
          });
        } else if (disappearingDuration === 'immediate') {
          // For immediate, we'll handle it via a cleanup effect or manual clear
          // But here we can just show the current session's messages
          filteredChats = chatsData; 
        }
      }

      setMessages(filteredChats.map(c => ({
        role: c.role,
        text: c.text,
        time: c.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'Just now'
      })));
    }, (err) => {
      console.error("Chat Sync Error:", err);
      addToast("Failed to sync chat history", "error");
    });

    return () => {
      unsubProfile();
      unsubPlants();
      unsubMoods();
      unsubChats();
    };
  }, [user, isAuthReady]);

  const addXP = async (points: number) => {
    if (!user) return;
    const profileRef = doc(db, 'users', user.uid);
    const amount = points * 5;
    try {
      await setDoc(profileRef, { xp: xp + amount }, { merge: true });
    } catch (err) {
      console.error("XP Update Error:", err);
    }
  };

  const handleCameraMoodScan = async () => {
    if (!videoRef.current || !canvasRef.current || !user) return;
    
    setIsMoodScanning(true);
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      
      // Ensure video is ready and has dimensions
      if (video.readyState < 2 || video.videoWidth === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }

      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("Camera not ready. Please ensure your camera is enabled and visible.");
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        
        if (!base64Image || base64Image.length < 100) {
          throw new Error("Captured image is invalid. Please try again.");
        }

        const detectedMoodRaw = await detectMoodFromImage(base64Image);
        
        // Clean up response from Gemini
        const detectedMood = detectedMoodRaw.replace(/[^a-z]/g, '');
        
        const moodOption = moodOptions.find(m => m.id === detectedMood) || moodOptions.find(m => m.id === 'bored')!;
        handlePickMood(moodOption.id, moodOption.emoji);
        addToast(`Mind Scanner detected: ${moodOption.label}`, 'success');
      }
    } catch (err) {
      console.error("Mood Scan Error:", err);
      addToast("Could not scan mood. Try manual selection.", "error");
    } finally {
      setIsMoodScanning(false);
    }
  };

  const clearChatHistory = async (silent = false) => {
    if (!user) return;
    try {
      const chatsRef = collection(db, 'users', user.uid, 'chats');
      const snap = await getDocs(chatsRef);
      if (snap.empty) {
        setMessages([]);
        return;
      }
      const batch = writeBatch(db);
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      setMessages([]);
      if (!silent) addToast("Chat history cleared", "success");
    } catch (err) {
      console.error("Clear Chat Error:", err);
    }
  };

  const changePage = (page: Page) => {
    if (activePage === 'companion' && chatPersistence === 'disappearing' && disappearingDuration === 'immediate') {
      clearChatHistory(true);
    }
    setActivePage(page);
  };
  const handlePickMood = async (moodId: string, emoji: string) => {
    if (!user) {
      addToast("Please sign in to save your mood", "error");
      return;
    }
    
    const moodOption = moodOptions.find(m => m.id === moodId);
    if (!moodOption) return;

    setSelectedMoodForAction({ id: moodId, emoji, label: moodOption.label });
    setMoodActionChoice(null);
    setMoodTalkInput('');

    const moodsRef = collection(db, 'users', user.uid, 'moods');
    try {
      await addDoc(moodsRef, {
        uid: user.uid,
        emoji,
        label: moodOption.label,
        timestamp: serverTimestamp()
      });
      addXP(1);
    } catch (err) {
      console.error("Mood Selection Error:", err);
      addToast("Failed to save mood", "error");
    }
  };

  const handleMoodActionTalk = async () => {
    if (!user || !selectedMoodForAction || !moodTalkInput.trim()) return;

    const mood = selectedMoodForAction.id;
    const emoji = selectedMoodForAction.emoji;
    
    try {
      setIsTyping(true);
      changePage('companion');
      
      let aiResponse = `I see you're feeling ${mood} today. ${emoji} Thank you for sharing that with me. You mentioned: "${moodTalkInput}". How can I support you further?`;
      
      if (mood === 'happy') {
        aiResponse = `That's wonderful! 😊 I'm so glad you're feeling happy. You shared: "${moodTalkInput}". It sounds like a beautiful moment. Would you like to talk more about it or maybe capture this in your garden?`;
      } else if (mood === 'sad') {
        aiResponse = `I'm here for you. 😢 It's okay to feel sad. You mentioned: "${moodTalkInput}". Thank you for opening up. Would you like to keep talking, or should we try a calming activity together?`;
      } else if (mood === 'stressed') {
        aiResponse = `Take a deep breath. 😤 We'll get through this. You said: "${moodTalkInput}". That sounds like a lot to handle. Let's break it down together or try a quick reset?`;
      } else if (mood === 'overthinking') {
        aiResponse = `Your mind is busy right now. 🌀 You shared: "${moodTalkInput}". Let's try to ground those thoughts. Would you like to explore them more or try to shift your focus to something creative?`;
      }

      const chatsRef = collection(db, 'users', user.uid, 'chats');
      
      // Add user message first
      await addDoc(chatsRef, {
        uid: user.uid,
        sessionId: 'default',
        role: 'user',
        text: `I'm feeling ${mood}. ${moodTalkInput}`,
        timestamp: serverTimestamp()
      });

      // Then AI response
      await addDoc(chatsRef, {
        uid: user.uid,
        sessionId: 'default',
        role: 'ai',
        text: aiResponse,
        timestamp: serverTimestamp()
      });

      setSelectedMoodForAction(null);
      setMoodActionChoice(null);
      setMoodTalkInput('');
    } catch (err) {
      console.error("Mood Talk Error:", err);
      addToast("Failed to send message", "error");
    } finally {
      setIsTyping(false);
    }
  };

  const addPlant = async (type: string) => {
    if (!user) return;
    updateChallenge('green_thumb');
    const flowerEmojis = ['🌸', '🌼', '🌺', '🌻', '🌹', '🌷', '💐', '🌿', '🍀', '🌱'];
    const typeLabels: Record<string, string> = { meditation: 'Meditation', breath: 'Breathing', game: 'Mind Game', journal: 'Journaling', gratitude: 'Gratitude' };
    
    const plantsRef = collection(db, 'users', user.uid, 'plants');
    try {
      await addDoc(plantsRef, {
        uid: user.uid,
        type,
        emoji: flowerEmojis[gardenPlants.length % flowerEmojis.length],
        label: typeLabels[type] || 'Activity',
        height: 30 + Math.random() * 60,
        timestamp: serverTimestamp()
      });
      addXP(2);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/plants`);
    }
  };

  const createCommunityPost = async () => {
    if (!user || !newPostText.trim()) return;
    setIsPosting(true);
    const communityRef = collection(db, 'community');
    const emojis = ['✨', '🌿', '🧘', '🌊', '☀️', '🌙', '🌸', '🍃'];
    try {
      await addDoc(communityRef, {
        uid: user.uid,
        authorName: user.displayName || 'Mindful Soul',
        text: newPostText,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
        likes: 0,
        timestamp: serverTimestamp()
      });
      setNewPostText('');
      changePage('community');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'community');
    } finally {
      setIsPosting(false);
    }
  };

  const likePost = async (postId: string, currentLikes: number) => {
    if (!user) return;
    const postRef = doc(db, 'community', postId);
    try {
      await setDoc(postRef, { likes: currentLikes + 1 }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `community/${postId}`);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      if (user && chatPersistence === 'disappearing' && disappearingDuration === 'immediate') {
        await clearChatHistory(true);
      }
      await signOut(auth);
      setMessages([{ role: 'ai', text: "Hey, I'm really glad you're here. 🌿 What's on your mind right now? There's no rush — I'm listening.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setGardenPlants([]);
      setMoodEntries([]);
      setXp(0);
      changePage('home');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const moodOptions = [
    { id: 'happy', emoji: '🤩', label: 'Happy', desc: 'Positive and energized', color: 'rgba(252,211,77,0.2)', tip: 'Savor this feeling! Share your joy with someone or write down what made you smile today.' },
    { id: 'sad', emoji: '🥺', label: 'Sad', desc: 'Heavy-hearted or tearful', color: 'rgba(99,102,241,0.2)', tip: 'It\'s okay to feel this way. Be gentle with yourself. Maybe a warm drink or a short walk could help?' },
    { id: 'stressed', emoji: '🤯', label: 'Stressed', desc: 'Overwhelmed with pressure', color: 'rgba(248,113,113,0.2)', tip: 'Take a deep breath. Try to break your tasks into tiny, manageable steps. You don\'t have to do it all at once.' },
    { id: 'overthinking', emoji: '🫠', label: 'Overthinking', desc: 'Mind won\'t stop racing', color: 'rgba(167,139,250,0.2)', tip: 'Try the 5-4-3-2-1 grounding technique: Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, and 1 you can taste.' },
    { id: 'anxious', emoji: '🫣', label: 'Anxious', desc: 'Worried or on edge', color: 'rgba(251,191,36,0.2)', tip: 'Focus on your breathing. Inhale for 4, hold for 4, exhale for 4. Your safety is here in the present moment.' },
    { id: 'tired', emoji: '🥱', label: 'Tired', desc: 'Low energy and drained', color: 'rgba(147,197,253,0.2)', tip: 'Your body is asking for rest. Even a 10-minute power nap or just closing your eyes can make a difference.' },
    { id: 'unmotivated', emoji: '😶', label: 'Unmotivated', desc: 'Can\'t find drive or purpose', color: 'rgba(196,181,253,0.2)', tip: 'Start with something incredibly small. Just standing up or drinking a glass of water can break the inertia.' },
    { id: 'lonely', emoji: '🫂', label: 'Lonely', desc: 'Disconnected from others', color: 'rgba(167,139,250,0.2)', tip: 'Reach out to one person, even with a simple text. Or, spend time in a public space like a park or cafe to feel the presence of others.' },
    { id: 'bored', emoji: '🥱', label: 'Bored', desc: 'Restless or uninterested', color: 'rgba(156,163,175,0.2)', tip: 'Boredom is a gateway to creativity. Try doodling, listening to a new genre of music, or exploring a topic you know nothing about.' },
  ];

  const [userName, setUserName] = useState('Friend');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isTyping || !user) {
      if (!user) addToast("Please sign in to chat with MindMate", "error");
      return;
    }

    const text = inputText.trim();
    const lowerText = text.toLowerCase();
    
    // Keyword-based replies
    const keywordReplies: Record<string, string> = {
      'happy': "That’s nice to hear 🤩 what’s been going so well today?",
      'sad': "Hey… that sounds rough. Wanna talk about what’s going on? 🥺",
      'stressed': "Ugh that sounds like a lot to deal with. What’s been stressing you out? 🤯",
      'overthinking': "Ah the overthinking spiral… been there. What’s been on your mind? 🫠",
      'anxious': "That feeling can be really uncomfortable. Do you wanna tell me what’s making you anxious? 🫣",
      'tired': "Sounds like you’re really drained today. What’s been taking all your energy? 🥱",
      'unmotivated': "Yeah those days happen to all of us. What’s making things feel heavy lately? 😶",
      'lonely': "Hey, you don’t have to sit with that alone. Wanna tell me what’s been making you feel this way? 🫂",
      'bored': "Looks like the day’s moving slow huh 🥱 what are you up to right now?"
    };

    let cannedResponse = null;
    for (const [keyword, reply] of Object.entries(keywordReplies)) {
      if (lowerText.includes(keyword)) {
        cannedResponse = reply;
        break;
      }
    }

    const chatsRef = collection(db, 'users', user.uid, 'chats');
    try {
      await addDoc(chatsRef, {
        uid: user.uid,
        sessionId: 'default',
        role: 'user',
        text: text,
        timestamp: serverTimestamp()
      });
      setInputText('');
      setIsTyping(true);
      completeQuest('talk');

      if (cannedResponse) {
        // Delay slightly for natural feel
        await new Promise(r => setTimeout(r, 1000));
        await addDoc(chatsRef, {
          uid: user.uid,
          sessionId: 'default',
          role: 'ai',
          text: cannedResponse,
          timestamp: serverTimestamp()
        });
      } else {
        // Prepare history for Gemini - ensure alternating roles and starting with user
        let history = messages
          .filter(m => m.text && m.text.length > 0)
          .map(m => ({
            role: m.role === 'user' ? 'user' as const : 'model' as const,
            parts: [{ text: m.text }]
          }));
        
        const filteredHistory: { role: "user" | "model"; parts: { text: string }[] }[] = [];
        for (let i = 0; i < history.length; i++) {
          if (filteredHistory.length === 0) {
            if (history[i].role === 'user') {
              filteredHistory.push(history[i]);
            }
          } else if (history[i].role !== filteredHistory[filteredHistory.length - 1].role) {
            filteredHistory.push(history[i]);
          }
        }

        const response = await getGeminiResponse(text, filteredHistory);
        
        await addDoc(chatsRef, {
          uid: user.uid,
          sessionId: 'default',
          role: 'ai',
          text: response || "I'm here with you.",
          timestamp: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      addToast("MindMate is having trouble responding. Please try again.", "error");
    } finally {
      setIsTyping(false);
    }
  };

  const navItems = [
    { id: 'home', label: 'Home', icon: <Brain size={18} /> },
    { id: 'companion', label: 'AI Companion', icon: <MessageSquare size={18} /> },
    { id: 'mood', label: 'Mood', icon: <Smile size={18} /> },
    { id: 'hub', label: 'Relax Hub', icon: <Wind size={18} /> },
    { id: 'games', label: 'Games', icon: <Gamepad2 size={18} /> },
    { id: 'garden', label: 'Garden', icon: <Flower2 size={18} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={18} /> },
    { id: 'challenges', label: 'Challenges', icon: <Trophy size={18} /> },
    { id: 'community', label: 'Community', icon: <Users size={18} /> },
    { id: 'coupons', label: 'Coupons', icon: <Ticket size={18} /> },
  ];

  // Cleanup for immediate disappearing chats
  useEffect(() => {
    if (chatPersistence === 'disappearing' && disappearingDuration === 'immediate' && activePage !== 'companion' && user) {
      clearChatHistory(true);
    }
  }, [activePage, chatPersistence, disappearingDuration, user]);

  const analyticsData = (() => {
    const now = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      return d.toLocaleDateString([], { weekday: 'short' });
    });

    const stressPattern = last7Days.map(day => {
      const dayMoods = moodEntries.filter(m => {
        const d = m.timestamp?.toDate();
        return d && d.toLocaleDateString([], { weekday: 'short' }) === day;
      });
      const stressLevel = dayMoods.reduce((acc, m) => {
        if (m.label === 'Stressed' || m.label === 'Anxious') return acc + 80;
        if (m.label === 'Happy' || m.label === 'Calm') return acc + 20;
        return acc + 50;
      }, 0) / (dayMoods.length || 1);
      return { day, stress: dayMoods.length ? Math.round(stressLevel) : 0 };
    });

    const moodCounts: Record<string, number> = {};
    moodEntries.forEach(m => {
      moodCounts[m.label] = (moodCounts[m.label] || 0) + 1;
    });
    const moodBreakdown = Object.entries(moodCounts).map(([name, value]) => ({ name, value }));

    const weeklySummary = last7Days.map(day => {
      const dayPlants = gardenPlants.filter(p => {
        const d = p.timestamp?.toDate();
        return d && d.toLocaleDateString([], { weekday: 'short' }) === day;
      });
      return { day, activities: dayPlants.length };
    });

    const activityCounts: Record<string, number> = {};
    gardenPlants.forEach(p => {
      activityCounts[p.label] = (activityCounts[p.label] || 0) + 1;
    });
    const helpfulActivities = Object.entries(activityCounts).map(([name, value]) => ({ name, value }));

    return { stressPattern, moodBreakdown, weeklySummary, helpfulActivities };
  })();

  const COLORS = ['#c4b5fd', '#6ee7b7', '#93c5fd', '#fcd34d', '#f87171', '#a78bfa'];

  return (
    <ErrorBoundary>
      <div className={`min-h-screen font-sans transition-colors duration-500 ${isLightTheme ? 'bg-[#f3f0ff] text-[#1e1035]' : 'bg-[#07050f] text-[#ede9ff]'}`}>
      {/* Background Ambient Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[150px] -left-[150px] w-[600px] height-[600px] rounded-full bg-[#c4b5fd]/10 blur-[90px] animate-pulse" />
        <div className="absolute -bottom-[150px] -right-[150px] w-[500px] height-[500px] rounded-full bg-[#93c5fd]/10 blur-[90px] animate-pulse delay-700" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] height-[350px] rounded-full bg-[#6ee7b7]/10 blur-[90px] animate-pulse delay-1000" />
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className={`max-w-md w-full p-8 rounded-[40px] border border-white/10 shadow-2xl ${isLightTheme ? 'bg-white' : 'bg-[#0e0b1e]'}`}
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="font-display text-2xl font-light">Settings</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full hover:bg-white/5 text-white/30"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                {/* Theme Toggle */}
                <div className="space-y-4">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Appearance</div>
                  <button 
                    onClick={() => setIsLightTheme(!isLightTheme)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl glass border border-white/5 hover:border-white/10 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      {isLightTheme ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-indigo-400" />}
                      <span className="text-sm font-medium">{isLightTheme ? 'Light Mode' : 'Dark Mode'}</span>
                    </div>
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${isLightTheme ? 'bg-amber-400' : 'bg-indigo-600'}`}>
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isLightTheme ? 'right-1' : 'left-1'}`} />
                    </div>
                  </button>
                </div>

                {/* Chat Settings */}
                <div className="space-y-4">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Chat Settings</div>
                  <div className="space-y-6">
                    <div className="flex p-1 rounded-2xl glass border border-white/5">
                      <button 
                        onClick={() => {
                          setChatPersistence('permanent');
                          if (user) {
                            const profileRef = doc(db, 'users', user.uid);
                            setDoc(profileRef, { chatPersistence: 'permanent' }, { merge: true });
                          }
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${chatPersistence === 'permanent' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                      >
                        Permanent
                      </button>
                      <button 
                        onClick={() => {
                          setChatPersistence('disappearing');
                          if (user) {
                            const profileRef = doc(db, 'users', user.uid);
                            setDoc(profileRef, { chatPersistence: 'disappearing' }, { merge: true });
                          }
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${chatPersistence === 'disappearing' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                      >
                        Disappearing
                      </button>
                    </div>

                    {chatPersistence === 'disappearing' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-4 border-t border-white/5"
                      >
                        <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Clear Messages After</div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'immediate', label: 'Immediately' },
                            { id: '24h', label: '24 Hours' },
                            { id: '7d', label: '7 Days' }
                          ].map(opt => (
                            <button 
                              key={opt.id}
                              onClick={() => {
                                setDisappearingDuration(opt.id as any);
                                if (user) {
                                  const profileRef = doc(db, 'users', user.uid);
                                  setDoc(profileRef, { disappearingDuration: opt.id }, { merge: true });
                                }
                              }}
                              className={`py-3 rounded-xl text-[10px] font-bold border transition-all ${disappearingDuration === opt.id ? 'bg-[#c4b5fd]/20 border-[#c4b5fd]/40 text-[#c4b5fd]' : 'glass border-white/5 text-white/30 hover:border-white/20'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    <button 
                      onClick={clearChatHistory}
                      className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/10 text-red-400 text-xs font-bold border border-red-500/20 hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 size={14} />
                      Clear Chat History Now
                    </button>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="w-full mt-8 py-4 rounded-2xl bg-white text-black text-sm font-bold hover:scale-[1.02] transition-all"
              >
                Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 h-16 z-50 flex items-center px-6 gap-2 glass border-b ${isLightTheme ? 'bg-white/80' : 'bg-[#07050f]/75'}`}>
        <div className="font-display text-xl font-bold text-gradient mr-auto tracking-tight">✦ MindMate</div>
        
        <div className="hidden lg:flex items-center gap-1">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => changePage(item.id as Page)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center gap-2 ${
                activePage === item.id 
                  ? 'bg-[#c4b5fd]/20 text-[#c4b5fd] border border-[#c4b5fd]/30' 
                  : 'text-white/50 hover:text-[#c4b5fd] hover:bg-white/5'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 ml-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#c4b5fd]/10 border border-[#c4b5fd]/20 text-[#c4b5fd] text-xs font-semibold">
            <Zap size={14} />
            <span>{xp} XP</span>
          </div>

          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full hover:bg-white/5 text-white/50 transition-colors"
          >
            <Settings size={18} />
          </button>

          <div className="relative">
            {user ? (
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full glass hover:border-white/20 transition-all"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#c4b5fd] to-[#6ee7b7] flex items-center justify-center text-[10px] font-bold text-white">
                  {user.displayName?.[0] || 'U'}
                </div>
                <span className="text-xs font-medium hidden sm:block">{user.displayName?.split(' ')[0]}</span>
                <ChevronDown size={12} className="text-white/30" />
              </button>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#7c3aed] text-white text-xs font-bold hover:bg-[#6d28d9] transition-all"
              >
                <LogIn size={14} />
                Sign In
              </button>
            )}

            <AnimatePresence>
              {showUserMenu && user && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`absolute top-12 right-0 w-48 rounded-2xl p-2 glass shadow-2xl z-[60] ${isLightTheme ? 'bg-white' : 'bg-[#0e0b1e]'}`}
                >
                  <button onClick={() => {changePage('profile'); setShowUserMenu(false)}} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm transition-colors">
                    <UserIcon size={16} /> My Profile
                  </button>
                  <button onClick={() => {changePage('chathistory'); setShowUserMenu(false)}} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm transition-colors">
                    <History size={16} /> Chat History
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-400 text-sm transition-colors">
                    <LogOut size={16} /> Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 pt-24 pb-12 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activePage === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center py-12"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border-white/10 text-[10px] uppercase tracking-[0.2em] text-[#c4b5fd] mb-8">
                ✦ AI-Powered Mental Wellness
              </div>
              
              <div className="relative w-48 h-48 mb-12">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#c4b5fd] via-[#6ee7b7] to-[#93c5fd] animate-spin-slow opacity-70 blur-sm" />
                <div className={`absolute inset-4 rounded-full flex items-center justify-center text-5xl ${isLightTheme ? 'bg-[#f3f0ff]' : 'bg-[#07050f]'}`}>
                  🧠
                </div>
              </div>

              <h1 className="font-display text-5xl md:text-7xl font-light leading-tight mb-6">
                Your mind deserves<br />
                <span className="italic text-gradient">a safe space</span>
              </h1>
              
              <p className="max-w-xl text-lg text-white/50 font-light leading-relaxed mb-10">
                MindMate combines artificial intelligence with immersive wellness experiences to help you reduce stress, reset mentally, and build lasting healthy habits — one moment at a time.
              </p>

              <div className="flex flex-wrap justify-center gap-4">
                <button 
                  onClick={() => changePage('companion')}
                  className="px-8 py-4 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] text-white font-semibold text-sm shadow-[0_0_40px_rgba(124,58,237,0.4)] hover:scale-105 transition-transform"
                >
                  Start Your Mind Reset ✦
                </button>
                <button 
                  onClick={() => changePage('hub')}
                  className="px-8 py-4 rounded-full glass hover:border-white/20 text-sm font-medium transition-all"
                >
                  3-Min Reset →
                </button>
              </div>

              {/* Daily Quests Section */}
              <div className="mt-20 w-full max-w-4xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="text-left">
                    <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-1">Daily Wellness</div>
                    <h3 className="font-display text-2xl font-light">Your <span className="italic text-gradient">daily quests</span></h3>
                  </div>
                  <div className="glass px-4 py-2 rounded-2xl flex items-center gap-2">
                    <Trophy size={16} className="text-amber-400" />
                    <span className="text-sm font-bold">{quests.filter(q => q.completed).length}/{quests.length}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {quests.map((quest) => (
                    <motion.button
                      key={quest.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (quest.completed) return;
                        if (quest.id === 'breaths') {
                          setIsBreathingActive(true);
                          changePage('hub');
                        } else if (quest.id === 'positive') {
                          setShowPositiveInput(true);
                        } else if (quest.id === 'focus') {
                          changePage('games');
                        } else if (quest.id === 'meditation') {
                          changePage('hub');
                          setTimerIsActive(true);
                        } else if (quest.id === 'talk') {
                          changePage('companion');
                        } else if (quest.id === 'gratitude') {
                          addPlant('gratitude');
                          completeQuest('gratitude');
                        }
                      }}
                      className={`p-6 rounded-[32px] text-left transition-all relative overflow-hidden group ${
                        quest.completed 
                          ? 'bg-white/5 border border-white/5 opacity-60' 
                          : 'glass border-white/10 hover:border-[#c4b5fd]/30'
                      }`}
                    >
                      {quest.completed && (
                        <div className="absolute top-4 right-4 text-[#6ee7b7]">
                          <Zap size={16} />
                        </div>
                      )}
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-4 ${
                        quest.completed ? 'bg-white/5 text-white/20' : 'bg-[#c4b5fd]/10 text-[#c4b5fd]'
                      }`}>
                        {quest.icon}
                      </div>
                      <div className="font-medium text-sm mb-1">{quest.label}</div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider">+{quest.points} Points</div>
                      
                      {!quest.completed && (
                        <div className="mt-4 flex items-center gap-1 text-[10px] text-[#c4b5fd] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          START <ChevronRight size={10} />
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              <AnimatePresence>
                {showPositiveInput && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="glass max-w-md w-full p-8 rounded-[40px] border-white/10"
                    >
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 rounded-3xl bg-[#c4b5fd]/10 flex items-center justify-center mx-auto mb-4">
                          <Smile size={32} className="text-[#c4b5fd]" />
                        </div>
                        <h3 className="font-display text-2xl font-light mb-2">Positive Thought</h3>
                        <p className="text-sm text-white/40 leading-relaxed">What's one good thing that happened today, or something you're looking forward to?</p>
                      </div>
                      
                      <textarea 
                        value={positiveThought}
                        onChange={(e) => setPositiveThought(e.target.value)}
                        placeholder="Write it here..."
                        className="w-full glass rounded-2xl p-4 text-sm outline-none min-h-[100px] mb-6 focus:border-[#c4b5fd]/40 transition-colors"
                      />
                      
                      <div className="flex gap-3">
                        <button 
                          onClick={() => {
                            if (positiveThought.trim()) {
                              completeQuest('positive');
                              setPositiveThought('');
                              setShowPositiveInput(false);
                            }
                          }}
                          className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] text-white text-sm font-bold shadow-lg"
                        >
                          Save Thought
                        </button>
                        <button 
                          onClick={() => setShowPositiveInput(false)}
                          className="px-6 py-4 rounded-2xl glass text-sm font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-20 flex flex-wrap justify-center gap-3">
                {['🤖 AI Companion', '🌿 Mind Garden', '🎮 Brain Games', '📊 Mood Analytics', '🫁 Breathing', '🌍 Community Wall'].map(feat => (
                  <div key={feat} className="px-4 py-2 rounded-full glass text-xs text-white/40 border-white/5">
                    {feat}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activePage === 'companion' && (
            <motion.div 
              key="companion"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col glass rounded-[32px] overflow-hidden h-[calc(100vh-180px)] max-w-4xl mx-auto"
            >
              <div className="p-6 border-b border-white/10 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#c4b5fd] to-[#6ee7b7] flex items-center justify-center text-xl animate-pulse">
                  ✦
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold">Mate</h2>
                  <div className="flex items-center gap-2 text-[10px] text-[#6ee7b7] font-medium uppercase tracking-wider">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6ee7b7] animate-ping" />
                    Present with you
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] group`}>
                      <div className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-gradient-to-br from-[#7c3aed]/80 to-[#4c1d95]/80 text-white rounded-br-none border border-white/10' 
                          : 'glass rounded-bl-none'
                      }`}>
                        {msg.text}
                      </div>
                      <div className={`text-[10px] text-white/20 mt-1.5 px-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {msg.time}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start">
                    <div className="glass px-5 py-3.5 rounded-2xl rounded-bl-none flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce" />
                      <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce delay-150" />
                      <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce delay-300" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-6 border-t border-white/10 flex gap-3">
                <textarea 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Share what's on your mind..."
                  className="flex-1 glass rounded-2xl px-5 py-3 text-sm outline-none resize-none min-h-[50px] max-h-32 focus:border-[#c4b5fd]/40 transition-colors"
                  rows={1}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || isTyping}
                  className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#7c3aed] to-[#4c1d95] flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:scale-100"
                >
                  <Send size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {activePage === 'mood' && (
            <motion.div 
              key="mood"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {!selectedMoodForAction ? (
                <>
                  <div className="text-center max-w-2xl mx-auto mb-12">
                    <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Mood Scanner</div>
                    <h2 className="font-display text-4xl md:text-5xl font-light mb-4">How are you <span className="italic text-gradient">feeling</span>?</h2>
                    <p className="text-white/40 mb-8">Tap your current mood or let our AI Mind Scanner detect it through your camera.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                      <div className="glass rounded-3xl p-6 flex flex-col items-center justify-center">
                        <div className="flex items-center justify-between w-full mb-4">
                          <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Face Emotion</div>
                          <div className={`w-2 h-2 rounded-full animate-pulse ${isCameraActive ? 'bg-red-500' : 'bg-white/10'}`} />
                        </div>
                        <div className="aspect-video w-full bg-black/40 rounded-2xl flex flex-col items-center justify-center gap-3 border border-white/5 overflow-hidden relative">
                          {isCameraActive ? (
                            <>
                              <video 
                                ref={videoRef} 
                                autoPlay 
                                playsInline 
                                muted 
                                className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                              />
                              <canvas ref={canvasRef} className="hidden" />
                            </>
                          ) : (
                            <Camera size={32} className="text-white/10" />
                          )}
                        </div>
                        <div className="mt-6 flex gap-3 w-full">
                          <button 
                            onClick={toggleCamera}
                            className={`flex-1 px-4 py-3 rounded-xl text-white text-[10px] font-bold uppercase tracking-wider transition-colors z-10 ${
                              isCameraActive ? 'bg-red-500 hover:bg-red-600' : 'bg-[#7c3aed] hover:bg-[#6d28d9]'
                            }`}
                          >
                            {isCameraActive ? 'Disable Camera' : 'Enable Camera'}
                          </button>
                          <button 
                            onClick={handleCameraMoodScan}
                            disabled={isMoodScanning || !isCameraActive}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all ${
                              isMoodScanning 
                                ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30 animate-pulse' 
                                : 'bg-[#c4b5fd] text-[#1e1035] hover:scale-105 active:scale-95 shadow-lg shadow-[#c4b5fd]/20 disabled:opacity-30 disabled:scale-100'
                            }`}
                          >
                            {isMoodScanning ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                            {isMoodScanning ? 'Scanning...' : 'Scan Mood'}
                          </button>
                        </div>
                      </div>

                      <div className="glass rounded-3xl p-6 text-center flex flex-col items-center justify-center">
                        <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-4">Detected Emotion</div>
                        <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-gradient-to-br from-[#c4b5fd]/20 to-[#6ee7b7]/10 flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(196,181,253,0.1)]">
                          <Sparkles size={32} className="text-[#c4b5fd]" />
                        </div>
                        <div className="text-lg font-display font-bold mb-1">
                          {selectedMoodForAction ? selectedMoodForAction.label : 'Waiting...'}
                        </div>
                        <div className="text-[10px] text-white/40">
                          {isCameraActive ? 'Analyzing your expression' : 'Enable camera to start'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {moodOptions.map(mood => (
                      <button
                        key={mood.id}
                        onClick={() => handlePickMood(mood.id, mood.emoji)}
                        className="glass p-8 rounded-[32px] text-center group hover:scale-105 transition-all duration-300 border-white/5 hover:border-white/20"
                        style={{ boxShadow: `0 0 20px ${mood.color}00` }}
                      >
                        <span className="text-5xl block mb-4 group-hover:scale-110 transition-transform">{mood.emoji}</span>
                        <div className="font-display text-xl font-bold mb-1">{mood.label}</div>
                        <div className="text-[10px] text-white/30">{mood.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-2xl mx-auto glass p-10 rounded-[40px] border-white/10 text-center"
                >
                  <div className="text-6xl mb-6">{selectedMoodForAction.emoji}</div>
                  <h2 className="font-display text-3xl font-light mb-2">You're feeling <span className="italic text-gradient">{selectedMoodForAction.label.toLowerCase()}</span></h2>
                  
                  {/* Mood Tip */}
                  <div className="max-w-lg mx-auto mb-8 p-6 rounded-3xl bg-white/5 border border-white/10 text-left relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[#c4b5fd]" />
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[#c4b5fd]/10 flex items-center justify-center text-[#c4b5fd] shrink-0">
                        <Zap size={20} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-1">MindMate Tip</div>
                        <p className="text-sm text-white/70 leading-relaxed">
                          {moodOptions.find(m => m.id === selectedMoodForAction.id)?.tip || "Take a moment for yourself. You deserve it."}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-white/40 mb-10">I'm here for you. How would you like to proceed?</p>

                  {!moodActionChoice ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button 
                        onClick={() => setMoodActionChoice('talk')}
                        className="p-6 rounded-3xl glass border-white/10 hover:border-[#c4b5fd]/40 transition-all flex flex-col items-center gap-3 group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-[#c4b5fd]/10 flex items-center justify-center text-[#c4b5fd] group-hover:scale-110 transition-transform">
                          <MessageSquare size={24} />
                        </div>
                        <div className="font-bold">Talk more about it</div>
                        <div className="text-[10px] text-white/30 uppercase tracking-widest">Share your thoughts</div>
                      </button>
                      <button 
                        onClick={() => setMoodActionChoice('task')}
                        className="p-6 rounded-3xl glass border-white/10 hover:border-[#6ee7b7]/40 transition-all flex flex-col items-center gap-3 group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-[#6ee7b7]/10 flex items-center justify-center text-[#6ee7b7] group-hover:scale-110 transition-transform">
                          <Zap size={24} />
                        </div>
                        <div className="font-bold">Do a quick task</div>
                        <div className="text-[10px] text-white/30 uppercase tracking-widest">Mood-based activities</div>
                      </button>
                    </div>
                  ) : moodActionChoice === 'talk' ? (
                    <div className="space-y-6">
                      <textarea 
                        value={moodTalkInput}
                        onChange={(e) => setMoodTalkInput(e.target.value)}
                        placeholder="What's on your mind? I'm listening..."
                        className="w-full glass rounded-3xl p-6 text-sm outline-none min-h-[150px] focus:border-[#c4b5fd]/40 transition-colors"
                      />
                      <div className="flex gap-3">
                        <button 
                          onClick={handleMoodActionTalk}
                          disabled={!moodTalkInput.trim() || isTyping}
                          className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] text-white text-sm font-bold shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-30"
                        >
                          {isTyping ? 'Sending...' : 'Share with Mate'}
                        </button>
                        <button 
                          onClick={() => setMoodActionChoice(null)}
                          className="px-8 py-4 rounded-2xl glass text-sm font-bold"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 gap-3">
                        {(selectedMoodForAction.id === 'happy' ? [
                          { label: 'Journal this moment', icon: <History size={16} />, action: () => { addPlant('journal'); completeQuest('gratitude'); changePage('garden'); setSelectedMoodForAction(null); } },
                          { label: 'Share joy in community', icon: <Users size={16} />, action: () => { changePage('community'); setSelectedMoodForAction(null); } },
                        ] : selectedMoodForAction.id === 'sad' ? [
                          { label: '5-min Breathing', icon: <Wind size={16} />, action: () => { setIsBreathingActive(true); changePage('hub'); setSelectedMoodForAction(null); } },
                          { label: 'Nature Sounds', icon: <Music size={16} />, action: () => { changePage('hub'); setSelectedMoodForAction(null); } },
                        ] : selectedMoodForAction.id === 'stressed' ? [
                          { label: 'Quick Focus Game', icon: <Gamepad2 size={16} />, action: () => { changePage('games'); setSelectedMoodForAction(null); } },
                          { label: 'Box Breathing', icon: <Wind size={16} />, action: () => { setIsBreathingActive(true); changePage('hub'); setSelectedMoodForAction(null); } },
                        ] : selectedMoodForAction.id === 'overthinking' ? [
                          { label: 'Color Harmony Game', icon: <Palette size={16} />, action: () => { initColorGame(); changePage('games'); setSelectedMoodForAction(null); } },
                          { label: 'Pattern Pulse', icon: <Zap size={16} />, action: () => { initPatternGame(); changePage('games'); setSelectedMoodForAction(null); } },
                        ] : [
                          { label: 'Grounding Breath', icon: <Wind size={16} />, action: () => { setIsBreathingActive(true); changePage('hub'); setSelectedMoodForAction(null); } },
                          { label: 'Talk to Mate', icon: <MessageSquare size={16} />, action: () => { changePage('companion'); setSelectedMoodForAction(null); } },
                        ]).map((task, idx) => (
                          <button 
                            key={idx}
                            onClick={task.action}
                            className="w-full flex items-center justify-between p-5 rounded-2xl glass border-white/5 hover:border-white/20 transition-all group"
                          >
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/60 group-hover:bg-[#c4b5fd]/20 group-hover:text-[#c4b5fd] transition-all">
                                {task.icon}
                              </div>
                              <span className="font-medium text-sm">{task.label}</span>
                            </div>
                            <ChevronRight size={16} className="text-white/20 group-hover:translate-x-1 transition-transform" />
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => setMoodActionChoice(null)}
                        className="w-full py-4 rounded-2xl glass text-sm font-bold"
                      >
                        Back to choices
                      </button>
                    </div>
                  )}

                  <button 
                    onClick={() => setSelectedMoodForAction(null)}
                    className="mt-8 text-[10px] uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors"
                  >
                    Cancel and pick another mood
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {activePage === 'chathistory' && (
            <motion.div 
              key="chathistory"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8 max-w-3xl mx-auto"
            >
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Conversation Archive</div>
                <h2 className="font-display text-4xl font-light mb-4">Your <span className="italic text-gradient">journey</span> in words</h2>
                <p className="text-white/40">Reflect on your past conversations with MindMate to see how far you've come.</p>
              </div>

              <div className="space-y-4">
                {messages.length <= 1 ? (
                  <div className="glass p-12 text-center rounded-[32px] opacity-40">
                    <History size={48} className="mx-auto mb-4" />
                    <p className="text-sm">No chat history found yet. Start a conversation in the AI Companion!</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => (
                    <div 
                      key={msg.id || idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === 'user' 
                          ? 'bg-[#7c3aed] text-white rounded-tr-none' 
                          : 'glass text-white/80 rounded-tl-none'
                      }`}>
                        <div className="mb-1">{msg.text}</div>
                        <div className={`text-[10px] ${msg.role === 'user' ? 'text-white/50' : 'text-white/30'}`}>
                          {msg.time}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-center gap-4 pt-8">
                <button 
                  onClick={() => changePage('companion')}
                  className="px-8 py-3 rounded-full bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] text-white text-sm font-bold shadow-lg hover:scale-105 active:scale-95 transition-all"
                >
                  Continue Chatting
                </button>
                <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="px-8 py-3 rounded-full glass border-red-500/20 text-red-400 text-sm font-bold hover:bg-red-500/10 transition-all"
                >
                  Clear History
                </button>
              </div>

              <AnimatePresence>
                {showClearConfirm && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="glass p-8 rounded-[32px] max-w-sm w-full text-center"
                    >
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-red-500">
                        <History size={32} />
                      </div>
                      <h3 className="text-xl font-display font-bold mb-2">Clear History?</h3>
                      <p className="text-sm text-white/40 mb-8">This will permanently delete all your past conversations. This action cannot be undone.</p>
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={async () => {
                            if (!user) return;
                            const chatsRef = collection(db, 'users', user.uid, 'chats');
                            const q = query(chatsRef);
                            const snap = await getDocs(q);
                            const batch = writeBatch(db);
                            snap.docs.forEach(doc => batch.delete(doc.ref));
                            await batch.commit();
                            setMessages([{ role: 'ai', text: "History cleared. How can I help you today?", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
                            setShowClearConfirm(false);
                          }}
                          className="w-full py-3 rounded-2xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-all"
                        >
                          Yes, Clear Everything
                        </button>
                        <button 
                          onClick={() => setShowClearConfirm(false)}
                          className="w-full py-3 rounded-2xl glass text-sm font-bold hover:bg-white/5 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {activePage === 'garden' && (
            <motion.div 
              key="garden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="max-w-xl">
                  <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Mind Garden</div>
                  <h2 className="font-display text-4xl font-light mb-4">Your wellness <span className="italic text-gradient">blossoms</span></h2>
                  <p className="text-white/40">Every activity you complete grows a new plant. Watch your garden flourish as your mental health journey unfolds.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['meditation', 'breath', 'game', 'journal'].map(type => (
                    <button 
                      key={type}
                      onClick={() => addPlant(type)}
                      className="px-4 py-2 rounded-full glass border-white/10 text-xs font-medium hover:bg-white/5 transition-all"
                    >
                      + Add {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative h-[400px] glass rounded-[40px] overflow-hidden border-white/10">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-white/5 border-t border-white/5" />
                
                <div className="absolute inset-0 p-12 flex items-end justify-center gap-8">
                  {gardenPlants.length === 0 ? (
                    <div className="text-center opacity-20 mb-20">
                      <Flower2 size={64} className="mx-auto mb-4" />
                      <p className="text-sm">Your garden is waiting for its first seed...</p>
                    </div>
                  ) : (
                    gardenPlants.map((plant, idx) => (
                      <motion.div 
                        key={plant.id}
                        initial={{ scale: 0, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="flex flex-col items-center group cursor-help"
                      >
                        <div className="text-4xl mb-1 group-hover:scale-125 transition-transform">{plant.emoji}</div>
                        <div className="w-1 bg-gradient-to-b from-[#6ee7b7] to-transparent rounded-full transition-all" style={{ height: `${plant.height}px` }} />
                        <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity glass px-3 py-1.5 rounded-xl text-[10px] whitespace-nowrap pointer-events-none">
                          {plant.label} • {plant.time}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Plants Grown', value: gardenPlants.length, color: 'text-[#6ee7b7]' },
                  { label: 'Total Points', value: gardenPlants.length * 2, color: 'text-amber-400' },
                  { label: 'Wellness XP', value: xp, color: 'text-[#93c5fd]' },
                ].map(stat => (
                  <div key={stat.label} className="glass p-6 rounded-3xl text-center">
                    <div className={`text-3xl font-display font-light mb-1 ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider">{stat.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activePage === 'hub' && (
            <motion.div 
              key="hub"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="max-w-xl">
                <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Relax Hub</div>
                <h2 className="font-display text-4xl font-light mb-4">Find your <span className="italic text-gradient">inner peace</span></h2>
                <p className="text-white/40">A collection of tools designed to help you decompress, focus, and reset your mind.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Guided Breathing */}
                <div className="glass rounded-[40px] p-8 flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-white/5" />
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Guided Breathing</div>
                  
                  <div className="relative w-64 h-64 flex items-center justify-center mb-8">
                    {/* Breathing Circle */}
                    <motion.div 
                      animate={{ 
                        scale: isBreathingActive ? (breathingPhase === 'inhale' ? 1.5 : breathingPhase === 'exhale' ? 1 : breathingPhase === 'hold' ? 1.5 : 1) : 1,
                        opacity: isBreathingActive ? 0.6 : 0.2
                      }}
                      transition={{ duration: 4, ease: "easeInOut" }}
                      className="absolute inset-0 rounded-full bg-gradient-to-br from-[#c4b5fd] to-[#6ee7b7] blur-2xl"
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <Wind size={48} className={`text-white mb-4 ${isBreathingActive ? 'animate-pulse' : 'opacity-20'}`} />
                      <div className="text-2xl font-display font-bold capitalize">
                        {isBreathingActive ? breathingPhase : 'Ready?'}
                      </div>
                      {isBreathingActive && (
                        <div className="text-[10px] text-white/40 mt-2 uppercase tracking-widest">
                          {Math.ceil(4 - (breathingProgress * 4))}s
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    onClick={() => setIsBreathingActive(!isBreathingActive)}
                    className={`px-10 py-4 rounded-full font-bold text-sm transition-all ${
                      isBreathingActive 
                        ? 'bg-white/10 text-white border border-white/20' 
                        : 'bg-gradient-to-r from-[#7c3aed] to-[#4c1d95] text-white shadow-lg shadow-purple-500/20'
                    }`}
                  >
                    {isBreathingActive ? 'Stop Session' : 'Start 4-4-4-4 Breathing'}
                  </button>
                  
                  <p className="mt-6 text-[10px] text-white/30 max-w-xs">
                    Inhale for 4s, Hold for 4s, Exhale for 4s, Rest for 4s. Repeat to lower cortisol levels.
                  </p>
                </div>

                {/* Focus Timer */}
                <div className="glass rounded-[40px] p-8 flex flex-col items-center text-center">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Focus Timer</div>
                  
                  <div className="relative w-64 h-64 flex flex-col items-center justify-center mb-8">
                    <div className="text-6xl font-display font-light tracking-tighter mb-2">
                      {formatTime(timerSeconds)}
                    </div>
                    <div className={`text-[10px] uppercase tracking-[0.3em] font-bold ${timerMode === 'focus' ? 'text-[#c4b5fd]' : 'text-[#6ee7b7]'}`}>
                      {timerMode === 'focus' ? 'Deep Work' : 'Short Break'}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setTimerIsActive(!timerIsActive)}
                      className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                    >
                      {timerIsActive ? <Pause size={24} /> : <Play size={24} />}
                    </button>
                    <button 
                      onClick={() => {
                        setTimerIsActive(false);
                        setTimerSeconds(timerMode === 'focus' ? 25 * 60 : 5 * 60);
                      }}
                      className="w-14 h-14 rounded-2xl glass flex items-center justify-center hover:bg-white/5 transition-all"
                    >
                      <RotateCcw size={24} />
                    </button>
                  </div>

                  <div className="flex gap-2 mt-8">
                    <button 
                      onClick={() => {
                        setTimerMode('focus');
                        setTimerSeconds(25 * 60);
                        setTimerIsActive(false);
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                        timerMode === 'focus' ? 'bg-[#c4b5fd]/20 text-[#c4b5fd] border border-[#c4b5fd]/30' : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      Focus (25m)
                    </button>
                    <button 
                      onClick={() => {
                        setTimerMode('break');
                        setTimerSeconds(5 * 60);
                        setTimerIsActive(false);
                      }}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                        timerMode === 'break' ? 'bg-[#6ee7b7]/20 text-[#6ee7b7] border border-[#6ee7b7]/30' : 'text-white/30 hover:text-white/60'
                      }`}
                    >
                      Break (5m)
                    </button>
                  </div>
                </div>

                {/* Nature Sounds */}
                <div className="glass rounded-[40px] p-8">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Nature Soundscapes</div>
                  <div className="grid grid-cols-2 gap-4">
                    {natureSounds.map(sound => (
                      <button
                        key={sound.id}
                        onClick={() => toggleNatureSound(sound.url)}
                        className={`p-6 rounded-3xl border transition-all flex flex-col items-center gap-3 ${
                          activeNatureSound === sound.url 
                            ? 'bg-white/10 border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                            : 'glass border-white/5 hover:border-white/20'
                        }`}
                      >
                        <span className="text-3xl">{sound.icon}</span>
                        <div className="text-xs font-medium">{sound.label}</div>
                        {activeNatureSound === sound.url ? (
                          <div className="flex gap-0.5 items-end h-3">
                            {[0, 1, 2].map(i => (
                              <motion.div 
                                key={i}
                                animate={{ height: [4, 12, 4] }}
                                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
                                className="w-1 bg-white rounded-full"
                              />
                            ))}
                          </div>
                        ) : (
                          <Volume2 size={12} className="opacity-20" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Meditation */}
                <div className="glass rounded-[40px] p-8 flex flex-col">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Guided Meditation</div>
                  <div className="space-y-4 flex-1">
                    {[
                      { title: 'Morning Clarity', duration: '5 min', icon: <Sun size={18} /> },
                      { title: 'Stress Release', duration: '10 min', icon: <Leaf size={18} /> },
                      { title: 'Deep Sleep Prep', duration: '15 min', icon: <Moon size={18} /> },
                    ].map(med => (
                      <button 
                        key={med.title}
                        className="w-full glass p-4 rounded-2xl flex items-center justify-between group hover:border-white/20 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[#c4b5fd] group-hover:bg-[#c4b5fd]/10 transition-colors">
                            {med.icon}
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-bold">{med.title}</div>
                            <div className="text-[10px] text-white/30">{med.duration}</div>
                          </div>
                        </div>
                        <Play size={16} className="text-white/20 group-hover:text-white transition-colors" />
                      </button>
                    ))}
                  </div>
                  <div className="mt-8 p-4 rounded-2xl bg-gradient-to-br from-[#c4b5fd]/10 to-transparent border border-white/5">
                    <div className="text-[10px] text-white/40 leading-relaxed">
                      "Meditation is not about stopping thoughts, but about not letting them stop you."
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activePage === 'games' && (
            <motion.div 
              key="games"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div className="max-w-xl">
                  <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Mind Games</div>
                  <h2 className="font-display text-4xl font-light mb-4">Train your <span className="italic text-gradient">focus</span></h2>
                  <p className="text-white/40">Cognitive exercises designed to improve memory, reaction time, and pattern recognition.</p>
                </div>
                {activeGame && (
                  <button 
                    onClick={() => setActiveGame(null)}
                    className="px-6 py-2 rounded-full glass border-white/10 text-xs font-medium hover:bg-white/5 transition-all flex items-center gap-2"
                  >
                    <RotateCcw size={14} /> Exit Game
                  </button>
                )}
              </div>

              {!activeGame ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { id: 'memory', title: 'Memory Card', desc: 'Match pairs of nature-inspired symbols.', icon: <Brain />, color: 'from-purple-500/20', action: initMemoryGame },
                    { id: 'pattern', title: 'Pattern Pulse', desc: 'Follow the sequence of glowing pads.', icon: <RefreshCw />, color: 'from-emerald-500/20', action: initPatternGame },
                    { id: 'reaction', title: 'Reaction Zen', desc: 'Test your reflexes in a calm state.', icon: <Zap />, color: 'from-amber-500/20', action: initReactionGame },
                    { id: 'color', title: 'Color Harmony', desc: 'Identify the target color among options.', icon: <Palette />, color: 'from-blue-500/20', action: initColorGame },
                  ].map(game => (
                    <button 
                      key={game.id}
                      onClick={game.action}
                      className={`glass p-8 rounded-[40px] text-left group hover:border-white/20 transition-all relative overflow-hidden bg-gradient-to-br ${game.color} to-transparent`}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        {game.icon}
                      </div>
                      <h3 className="text-xl font-display font-bold mb-2">{game.title}</h3>
                      <p className="text-sm text-white/40 mb-6">{game.desc}</p>
                      <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-[#c4b5fd]">
                        Play Now <ChevronRight size={12} className="ml-1 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="glass rounded-[40px] p-8 min-h-[500px] flex flex-col items-center justify-center">
                  {activeGame === 'memory' && (
                    <div className="w-full max-w-md">
                      <div className="flex justify-between items-center mb-8">
                        <div className="text-sm font-bold">Score: {gameScore}</div>
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Match all pairs</div>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        {memoryCards.map((card, idx) => (
                          <button
                            key={card.id}
                            onClick={() => handleCardClick(idx)}
                            className={`aspect-square rounded-2xl transition-all duration-500 preserve-3d relative ${
                              card.isFlipped || card.isMatched ? '[transform:rotateY(180deg)]' : ''
                            }`}
                          >
                            <div className="absolute inset-0 backface-hidden glass flex items-center justify-center rounded-2xl border-white/5">
                              <div className="w-2 h-2 rounded-full bg-white/10" />
                            </div>
                            <div className="absolute inset-0 backface-hidden [transform:rotateY(180deg)] bg-white/10 flex items-center justify-center rounded-2xl text-2xl">
                              {card.emoji}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeGame === 'pattern' && (
                    <div className="w-full max-w-xs text-center">
                      <div className="mb-8">
                        <div className="text-3xl font-display font-light mb-2">{gameScore}</div>
                        <div className="text-[10px] uppercase tracking-widest text-white/40">Current Level</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {[0, 1, 2, 3].map(pad => (
                          <button
                            key={pad}
                            onClick={() => handlePatternClick(pad)}
                            className={`aspect-square rounded-3xl transition-all ${
                              activePatternPad === pad 
                                ? 'bg-white scale-95 shadow-[0_0_30px_rgba(255,255,255,0.5)]' 
                                : 'glass border-white/5 hover:bg-white/5'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="mt-8 text-xs text-white/30">
                        {isShowingPattern ? "Watch the pattern..." : "Your turn! Repeat the sequence."}
                      </p>
                    </div>
                  )}

                  {activeGame === 'reaction' && (
                    <div className="w-full max-w-md text-center">
                      {reactionState === 'idle' && (
                        <button 
                          onClick={startReactionTest}
                          className="px-12 py-6 rounded-full bg-white text-black font-bold text-lg hover:scale-105 transition-all"
                        >
                          Start Test
                        </button>
                      )}
                      {(reactionState === 'waiting' || reactionState === 'ready') && (
                        <button 
                          onClick={handleReactionClick}
                          className={`w-full h-64 rounded-[40px] transition-all flex items-center justify-center text-2xl font-display font-bold ${
                            reactionState === 'ready' ? 'bg-[#6ee7b7] text-black' : 'bg-red-500/20 text-red-500'
                          }`}
                        >
                          {reactionState === 'ready' ? 'CLICK NOW!' : 'Wait for Green...'}
                        </button>
                      )}
                      {reactionState === 'result' && (
                        <div className="space-y-6">
                          <div className="w-20 h-20 rounded-full bg-[#6ee7b7]/10 flex items-center justify-center mx-auto text-[#6ee7b7]">
                            <Trophy size={40} />
                          </div>
                          <div>
                            <div className="text-5xl font-display font-light mb-2">{reactionTime}ms</div>
                            <div className="text-[10px] uppercase tracking-widest text-white/40">Your Reaction Time</div>
                          </div>
                          <button 
                            onClick={startReactionTest}
                            className="px-8 py-3 rounded-full glass hover:bg-white/5 transition-all text-sm font-bold"
                          >
                            Try Again
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {activeGame === 'color' && (
                    <div className="w-full max-w-md text-center">
                      <div className="mb-12">
                        <div className="text-[10px] uppercase tracking-widest text-white/40 mb-4">Find this color</div>
                        <div 
                          className="w-32 h-32 rounded-full mx-auto shadow-2xl"
                          style={{ backgroundColor: targetColor }}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        {colorOptions.map((color, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleColorClick(color)}
                            className="aspect-square rounded-2xl hover:scale-110 transition-all shadow-lg"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div className="mt-12 text-sm font-bold">Score: {gameScore}</div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {activePage === 'analytics' && (
            <motion.div 
              key="analytics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="max-w-xl">
                <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Wellness Analytics</div>
                <h2 className="font-display text-4xl font-light mb-4">Your <span className="italic text-gradient">growth</span> journey</h2>
                <p className="text-white/40">Visualizing your emotional patterns and wellness activities over the past week.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Weekly Stress Pattern */}
                <div className="glass rounded-[40px] p-8">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Weekly Stress Pattern</div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={analyticsData.stressPattern}>
                        <defs>
                          <linearGradient id="colorStress" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0e0b1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          itemStyle={{ color: '#f87171' }}
                        />
                        <Area type="monotone" dataKey="stress" stroke="#f87171" fillOpacity={1} fill="url(#colorStress)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Mood Breakdown */}
                <div className="glass rounded-[40px] p-8">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Mood Breakdown</div>
                  <div className="h-64 w-full flex items-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analyticsData.moodBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {analyticsData.moodBreakdown.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0e0b1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Weekly Summary */}
                <div className="glass rounded-[40px] p-8">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Weekly Summary (Activities)</div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analyticsData.weeklySummary}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#0e0b1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        />
                        <Bar dataKey="activities" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Mood Helpful Activities */}
                <div className="glass rounded-[40px] p-8">
                  <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Mood Helpful Activities</div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={analyticsData.helpfulActivities}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                        <XAxis type="number" stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.3)" fontSize={10} axisLine={false} tickLine={false} width={80} />
                        <Tooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: '#0e0b1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        />
                        <Bar dataKey="value" fill="#c4b5fd" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activePage === 'community' && (
            <motion.div 
              key="community"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                <div className="max-w-xl">
                  <div className="text-[10px] uppercase tracking-widest text-[#6ee7b7] font-bold mb-4">Community Hub</div>
                  <h2 className="font-display text-4xl font-light mb-4">You are not <span className="italic text-gradient">alone</span></h2>
                  <p className="text-white/40">Connect with others on their mindfulness journey. Share your moments and celebrate collective growth.</p>
                </div>
                <div className="flex gap-4">
                  <div className="glass rounded-2xl px-6 py-3 flex items-center gap-3">
                    <Users size={18} className="text-[#6ee7b7]" />
                    <div>
                      <div className="text-[10px] text-white/30 uppercase tracking-wider">Active Now</div>
                      <div className="text-sm font-bold">1,242 Souls</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                {/* Community Feed */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Create Post */}
                  <div className="glass rounded-[40px] p-8 border border-white/10 bg-white/[0.02]">
                    <div className="flex gap-4 mb-6">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-xl">
                        {user?.photoURL ? <img src={user.photoURL} alt="" className="w-full h-full rounded-full" referrerPolicy="no-referrer" /> : '🧘'}
                      </div>
                      <textarea 
                        value={newPostText}
                        onChange={(e) => setNewPostText(e.target.value)}
                        placeholder="Share a mindful moment or a positive thought..."
                        className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder:text-white/20 resize-none h-24 pt-2"
                      />
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <div className="flex gap-2">
                        {['✨', '🌿', '🧘', '🌊', '☀️'].map(e => (
                          <button 
                            key={e} 
                            onClick={() => setNewPostText(prev => prev + e)}
                            className="w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={createCommunityPost}
                        disabled={isPosting || !newPostText.trim()}
                        className="px-8 py-3 rounded-2xl bg-white text-black font-bold text-sm hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
                      >
                        {isPosting ? <RefreshCw size={18} className="animate-spin" /> : 'Share Moment'}
                      </button>
                    </div>
                  </div>

                  {/* Posts List */}
                  <div className="space-y-6">
                    {communityPosts.map(post => (
                      <motion.div 
                        layout
                        key={post.id} 
                        className="glass rounded-[32px] p-8 border border-white/5 hover:border-white/10 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-lg">
                              {post.emoji}
                            </div>
                            <div>
                              <div className="font-bold text-sm">{post.authorName}</div>
                              <div className="text-[10px] text-white/30 uppercase tracking-widest">
                                {post.timestamp?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => likePost(post.id, post.likes)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-white/5 transition-colors text-white/40 hover:text-rose-400"
                          >
                            <Sparkles size={16} />
                            <span className="text-xs font-bold">{post.likes}</span>
                          </button>
                        </div>
                        <p className="text-white/80 leading-relaxed">{post.text}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Sidebar: Leaderboard & Stats */}
                <div className="space-y-8">
                  <div className="glass rounded-[40px] p-8 border border-white/5">
                    <div className="flex items-center justify-between mb-8">
                      <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Top Practitioners</div>
                      <Trophy size={16} className="text-amber-400" />
                    </div>
                    <div className="space-y-6">
                      {leaderboard.map((entry, idx) => (
                        <div key={entry.uid} className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-amber-400 text-black' : idx === 1 ? 'bg-slate-300 text-black' : idx === 2 ? 'bg-orange-400 text-black' : 'bg-white/5 text-white/40'}`}>
                              {idx + 1}
                            </div>
                            <div>
                              <div className="text-sm font-bold group-hover:text-[#6ee7b7] transition-colors">{entry.displayName}</div>
                              <div className="text-[10px] text-white/30 uppercase tracking-widest">{entry.xp} XP</div>
                            </div>
                          </div>
                          <div className="text-xs font-mono text-white/60">{entry.xp} XP</div>
                        </div>
                      ))}
                    </div>
                    <button className="w-full mt-8 py-4 rounded-2xl border border-white/5 hover:bg-white/5 text-[10px] uppercase tracking-widest font-bold transition-all">
                      View Full Rankings
                    </button>
                  </div>

                  <div className="glass rounded-[40px] p-8 border border-white/5 bg-gradient-to-br from-[#6ee7b7]/10 to-transparent">
                    <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-6">Community Pulse</div>
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white/40">Total Breaths</span>
                        <span className="text-sm font-bold font-mono">1.2M</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white/40">Trees Planted</span>
                        <span className="text-sm font-bold font-mono">42.5K</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white/40">Mindful Minutes</span>
                        <span className="text-sm font-bold font-mono">890K</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activePage === 'challenges' && (
            <motion.div 
              key="challenges"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="max-w-xl">
                <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-4">Wellness Challenges</div>
                <h2 className="font-display text-4xl font-light mb-4">Push your <span className="italic text-gradient">boundaries</span></h2>
                <p className="text-white/40">Long-term goals to help you build lasting habits and earn exclusive rewards.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {challenges.map(challenge => (
                  <div key={challenge.id} className="glass rounded-[32px] p-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                      {challenge.icon}
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl glass flex items-center justify-center">
                          {challenge.icon}
                        </div>
                        <div>
                          <h3 className="font-display text-xl font-bold">{challenge.title}</h3>
                          <p className="text-[10px] text-white/40 uppercase tracking-wider">{challenge.description}</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/40">Progress</span>
                          <span className="font-bold">{challenge.progress} / {challenge.target}</span>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${(challenge.progress / challenge.target) * 100}%` }}
                            className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
                          />
                        </div>
                        <div className="flex justify-between items-center pt-4">
                          <div className="flex items-center gap-2">
                            <Zap size={14} className="text-amber-400" />
                            <span className="text-xs font-bold">+{challenge.reward} XP</span>
                          </div>
                          {challenge.progress >= challenge.target ? (
                            <div className="px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest border border-emerald-500/30">
                              Completed
                            </div>
                          ) : (
                            <div className="text-[10px] text-white/20 uppercase tracking-widest">
                              In Progress
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Community Challenges */}
              <div className="mt-12">
                <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold mb-8">Community Milestones</div>
                <div className="glass rounded-[40px] p-8 border border-white/5">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#c4b5fd] to-[#6ee7b7] flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(196,181,253,0.2)]">
                      🌍
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h3 className="font-display text-2xl font-bold mb-2">Global Meditation Marathon</h3>
                      <p className="text-sm text-white/40 mb-6">Join thousands of others in our collective goal to reach 1,000,000 minutes of mindfulness this month.</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold">
                          <span className="text-[#6ee7b7]">742,890 / 1,000,000 mins</span>
                          <span className="text-white/40">74%</span>
                        </div>
                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full w-[74%] bg-gradient-to-r from-[#c4b5fd] to-[#6ee7b7]" />
                        </div>
                      </div>
                    </div>
                    <button className="px-8 py-4 rounded-2xl bg-white text-black font-bold text-sm hover:scale-105 transition-all">
                      Join Event
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activePage === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="glass rounded-[40px] p-10 border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-10 opacity-5">
                  <UserIcon size={200} />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#c4b5fd] to-[#6ee7b7] flex items-center justify-center text-4xl font-bold text-white shadow-2xl">
                    {user?.displayName?.[0] || 'U'}
                  </div>
                  <div className="text-center md:text-left">
                    <h2 className="font-display text-4xl font-bold mb-2">{user?.displayName || 'Mindful Soul'}</h2>
                    <p className="text-white/40 mb-4">{user?.email}</p>
                    <div className="flex flex-wrap justify-center md:justify-start gap-3">
                      <div className="px-4 py-1.5 rounded-full glass border-white/10 text-xs font-bold text-[#c4b5fd]">
                        Level {Math.floor(xp / 100) + 1} Practitioner
                      </div>
                      <div className="px-4 py-1.5 rounded-full glass border-white/10 text-xs font-bold text-[#6ee7b7]">
                        {xp} XP Earned
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass rounded-[32px] p-8 border border-white/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-[#c4b5fd]/10 flex items-center justify-center text-[#c4b5fd]">
                      <MessageSquare size={20} />
                    </div>
                    <h3 className="font-display text-xl font-bold">Chat Persistence</h3>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="flex p-1 rounded-2xl glass border border-white/5">
                      <button 
                        onClick={() => {
                          setChatPersistence('permanent');
                          const profileRef = doc(db, 'users', user?.uid || '');
                          setDoc(profileRef, { chatPersistence: 'permanent' }, { merge: true });
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${chatPersistence === 'permanent' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                      >
                        Permanent
                      </button>
                      <button 
                        onClick={() => {
                          setChatPersistence('disappearing');
                          const profileRef = doc(db, 'users', user?.uid || '');
                          setDoc(profileRef, { chatPersistence: 'disappearing' }, { merge: true });
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${chatPersistence === 'disappearing' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                      >
                        Disappearing
                      </button>
                    </div>

                    {chatPersistence === 'disappearing' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-4 border-t border-white/5"
                      >
                        <div className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Clear Messages After</div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'immediate', label: 'Immediately' },
                            { id: '24h', label: '24 Hours' },
                            { id: '7d', label: '7 Days' }
                          ].map(opt => (
                            <button 
                              key={opt.id}
                              onClick={() => {
                                setDisappearingDuration(opt.id as any);
                                const profileRef = doc(db, 'users', user?.uid || '');
                                setDoc(profileRef, { disappearingDuration: opt.id }, { merge: true });
                              }}
                              className={`py-3 rounded-xl text-[10px] font-bold border transition-all ${disappearingDuration === opt.id ? 'bg-[#c4b5fd]/20 border-[#c4b5fd]/40 text-[#c4b5fd]' : 'glass border-white/5 text-white/30 hover:border-white/20'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-white/20 italic leading-relaxed">
                          {disappearingDuration === 'immediate' ? "Messages will be deleted as soon as you leave the chat companion." : `Messages older than ${disappearingDuration === '24h' ? '24 hours' : '7 days'} will be automatically hidden.`}
                        </p>
                      </motion.div>
                    )}
                  </div>
                </div>

                <div className="glass rounded-[32px] p-8 border border-white/10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Trophy size={20} />
                    </div>
                    <h3 className="font-display text-xl font-bold">Your Achievements</h3>
                  </div>
                  <div className="space-y-4">
                    {challenges.filter(c => c.progress >= c.target).length === 0 ? (
                      <div className="py-8 text-center opacity-20">
                        <Trophy size={32} className="mx-auto mb-2" />
                        <p className="text-xs">No challenges completed yet.</p>
                      </div>
                    ) : (
                      challenges.filter(c => c.progress >= c.target).map(c => (
                        <div key={c.id} className="flex items-center gap-4 p-4 rounded-2xl glass border border-white/5">
                          <div className="text-2xl">{c.icon}</div>
                          <div>
                            <div className="text-sm font-bold">{c.title}</div>
                            <div className="text-[10px] text-[#6ee7b7] uppercase tracking-widest">Completed</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activePage === 'coupons' && (
            <motion.div 
              key="coupons"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                <div className="max-w-xl">
                  <div className="text-[10px] uppercase tracking-widest text-[#c4b5fd] font-bold mb-4">Rewards Shop</div>
                  <h2 className="font-display text-4xl font-light mb-4">Redeem your <span className="italic text-gradient">wellness points</span></h2>
                  <p className="text-white/40">Use your hard-earned XP to unlock exclusive discounts and wellness rewards from our partners.</p>
                </div>
                <div className="glass rounded-2xl px-6 py-3 flex items-center gap-3">
                  <Zap size={18} className="text-[#c4b5fd]" />
                  <div>
                    <div className="text-[10px] text-white/30 uppercase tracking-wider">Available Balance</div>
                    <div className="text-sm font-bold">{xp} XP</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { id: 'c1', title: '20% Off Calm App', cost: 500, desc: 'One year subscription discount', icon: '🧘' },
                  { id: 'c2', title: 'Free Yoga Session', cost: 300, desc: 'One-on-one virtual session', icon: '🧘‍♀️' },
                  { id: 'c3', title: '15% Off Organic Tea', cost: 150, desc: 'Valid on all herbal collections', icon: '🍵' },
                  { id: 'c4', title: 'Mindfulness Journal', cost: 400, desc: 'Physical copy delivered to you', icon: '📓' },
                  { id: 'c5', title: 'Sleep Mask Pro', cost: 250, desc: 'Weighted silk sleep mask', icon: '😴' },
                  { id: 'c6', title: 'Aromatherapy Set', cost: 600, desc: 'Essential oils & diffuser kit', icon: '🕯️' },
                ].map(coupon => (
                  <div key={coupon.id} className="glass rounded-[32px] p-8 border border-white/10 relative overflow-hidden group">
                    <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-4xl opacity-10 group-hover:opacity-20 transition-opacity">
                      {coupon.icon}
                    </div>
                    <div className="relative z-10">
                      <div className="text-3xl mb-4">{coupon.icon}</div>
                      <h3 className="font-display text-xl font-bold mb-1">{coupon.title}</h3>
                      <p className="text-xs text-white/40 mb-6">{coupon.desc}</p>
                      
                      <div className="flex items-center justify-between pt-6 border-t border-white/5">
                        <div className="flex items-center gap-2">
                          <Zap size={14} className="text-[#c4b5fd]" />
                          <span className="text-sm font-bold">{coupon.cost} XP</span>
                        </div>
                        
                        {purchasedCoupons.includes(coupon.id) ? (
                          <div className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest border border-emerald-500/30">
                            Purchased
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              if (xp >= coupon.cost) {
                                setXp(prev => prev - coupon.cost);
                                setPurchasedCoupons(prev => [...prev, coupon.id]);
                                addToast(`Successfully purchased ${coupon.title}!`, 'success');
                                // Update XP and Purchased Coupons in Firestore
                                const profileRef = doc(db, 'users', user?.uid || '');
                                setDoc(profileRef, { 
                                  xp: xp - coupon.cost,
                                  purchasedCoupons: [...purchasedCoupons, coupon.id]
                                }, { merge: true });
                              } else {
                                addToast("Not enough XP to purchase this coupon.", "error");
                              }
                            }}
                            className="px-6 py-2 rounded-xl bg-white text-black text-xs font-bold hover:scale-105 transition-all"
                          >
                            Buy Coupon
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .preserve-3d {
          transform-style: preserve-3d;
        }
        .backface-hidden {
          backface-visibility: hidden;
        }
      `}</style>

      {/* Toast System */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`pointer-events-auto px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${
                toast.type === 'error' 
                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}
            >
              {toast.type === 'error' ? <X size={18} /> : <Sparkles size={18} />}
              <span className="text-sm font-medium">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      </div>
    </ErrorBoundary>
  );
}
