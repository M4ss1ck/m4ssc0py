import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Screen = 'form' | 'progress' | 'complete';
type CollisionMode = 'overwrite' | 'skip' | 'rename';

interface BackupState {
  // Screen navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Form data
  sourcePaths: string[];
  sourceHistory: string[];
  targetPath: string;
  targetHistory: string[];
  blacklist: string[];
  respectGitignore: boolean;
  includeSourceDir: boolean;
  collisionMode: CollisionMode;

  addSourcePath: (path: string) => void;
  removeSourcePath: (path: string) => void;
  clearSourcePaths: () => void;
  addToSourceHistory: (path: string) => void;
  setTargetPath: (path: string) => void;
  addToTargetHistory: (path: string) => void;
  addBlacklistItem: (item: string) => void;
  removeBlacklistItem: (item: string) => void;
  setRespectGitignore: (value: boolean) => void;
  setIncludeSourceDir: (value: boolean) => void;
  setCollisionMode: (mode: CollisionMode) => void;

  // Progress data
  progress: number;
  currentFile: string;
  currentFileProgress: number;
  copiedCount: number;
  skippedCount: number;
  totalCount: number;

  setProgress: (progress: number) => void;
  setCurrentFile: (file: string) => void;
  setCurrentFileProgress: (progress: number) => void;
  setCopiedCount: (count: number) => void;
  setSkippedCount: (count: number) => void;
  setTotalCount: (count: number) => void;

  // Completion data
  success: boolean;
  message: string;
  errors: string[];

  setSuccess: (success: boolean) => void;
  setMessage: (message: string) => void;
  addError: (error: string) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  currentScreen: 'form' as Screen,
  sourcePaths: [] as string[],
  sourceHistory: [] as string[],
  targetPath: '',
  targetHistory: [] as string[],
  blacklist: ['node_modules', 'dist'],
  respectGitignore: false,
  includeSourceDir: true,
  collisionMode: 'overwrite' as CollisionMode,
  progress: 0,
  currentFile: '',
  currentFileProgress: 0,
  copiedCount: 0,
  skippedCount: 0,
  totalCount: 0,
  success: false,
  message: '',
  errors: [],
};

export const useBackupStore = create<BackupState>()(
  persist(
    (set) => ({
      ...initialState,

      setScreen: (screen) => set({ currentScreen: screen }),

      addSourcePath: (path) => set((state) => ({
        sourcePaths: state.sourcePaths.includes(path)
          ? state.sourcePaths
          : [...state.sourcePaths, path]
      })),
      removeSourcePath: (path) => set((state) => ({
        sourcePaths: state.sourcePaths.filter((p) => p !== path)
      })),
      clearSourcePaths: () => set({ sourcePaths: [] }),
      addToSourceHistory: (path) => set((state) => ({
        sourceHistory: state.sourceHistory.includes(path)
          ? state.sourceHistory
          : [path, ...state.sourceHistory].slice(0, 10)
      })),
      setTargetPath: (path) => set({ targetPath: path }),
      addToTargetHistory: (path) => set((state) => ({
        targetHistory: state.targetHistory.includes(path)
          ? state.targetHistory
          : [path, ...state.targetHistory].slice(0, 10)
      })),
      addBlacklistItem: (item) => set((state) => ({
        blacklist: state.blacklist.includes(item) ? state.blacklist : [...state.blacklist, item]
      })),
      removeBlacklistItem: (item) => set((state) => ({
        blacklist: state.blacklist.filter((i) => i !== item)
      })),
      setRespectGitignore: (value) => set({ respectGitignore: value }),
      setIncludeSourceDir: (value) => set({ includeSourceDir: value }),
      setCollisionMode: (mode) => set({ collisionMode: mode }),

      setProgress: (progress) => set({ progress }),
      setCurrentFile: (file) => set({ currentFile: file }),
      setCurrentFileProgress: (progress) => set({ currentFileProgress: progress }),
      setCopiedCount: (count) => set({ copiedCount: count }),
      setSkippedCount: (count) => set({ skippedCount: count }),
      setTotalCount: (count) => set({ totalCount: count }),

      setSuccess: (success) => set({ success }),
      setMessage: (message) => set({ message }),
      addError: (error) => set((state) => ({ errors: [...state.errors, error] })),

      reset: () => set((state) => ({
        ...initialState,
        sourceHistory: state.sourceHistory,
        targetHistory: state.targetHistory,
        blacklist: state.blacklist,
        respectGitignore: state.respectGitignore,
        includeSourceDir: state.includeSourceDir,
        collisionMode: state.collisionMode,
      })),
    }),
    {
      name: 'm4ssc0py-storage',
      partialize: (state) => ({
        sourcePaths: state.sourcePaths,
        sourceHistory: state.sourceHistory,
        targetPath: state.targetPath,
        targetHistory: state.targetHistory,
        blacklist: state.blacklist,
        respectGitignore: state.respectGitignore,
        includeSourceDir: state.includeSourceDir,
        collisionMode: state.collisionMode,
      }),
    }
  )
);
