import { create } from 'zustand';

type Screen = 'form' | 'progress' | 'complete';

interface BackupState {
  // Screen navigation
  currentScreen: Screen;
  setScreen: (screen: Screen) => void;

  // Form data
  sourcePath: string;
  targetPath: string;
  blacklist: string[];
  respectGitignore: boolean;
  includeSourceDir: boolean;

  setSourcePath: (path: string) => void;
  setTargetPath: (path: string) => void;
  addBlacklistItem: (item: string) => void;
  removeBlacklistItem: (item: string) => void;
  setRespectGitignore: (value: boolean) => void;
  setIncludeSourceDir: (value: boolean) => void;

  // Progress data
  progress: number;
  currentFile: string;
  currentFileProgress: number;
  copiedCount: number;
  totalCount: number;

  setProgress: (progress: number) => void;
  setCurrentFile: (file: string) => void;
  setCurrentFileProgress: (progress: number) => void;
  setCopiedCount: (count: number) => void;
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
  sourcePath: '',
  targetPath: '',
  blacklist: ['node_modules', '.git', 'dist', 'target', 'build'],
  respectGitignore: false,
  includeSourceDir: true,
  progress: 0,
  currentFile: '',
  currentFileProgress: 0,
  copiedCount: 0,
  totalCount: 0,
  success: false,
  message: '',
  errors: [],
};

export const useBackupStore = create<BackupState>((set) => ({
  ...initialState,

  setScreen: (screen) => set({ currentScreen: screen }),

  setSourcePath: (path) => set({ sourcePath: path }),
  setTargetPath: (path) => set({ targetPath: path }),
  addBlacklistItem: (item) => set((state) => ({
    blacklist: state.blacklist.includes(item) ? state.blacklist : [...state.blacklist, item]
  })),
  removeBlacklistItem: (item) => set((state) => ({
    blacklist: state.blacklist.filter((i) => i !== item)
  })),
  setRespectGitignore: (value) => set({ respectGitignore: value }),
  setIncludeSourceDir: (value) => set({ includeSourceDir: value }),

  setProgress: (progress) => set({ progress }),
  setCurrentFile: (file) => set({ currentFile: file }),
  setCurrentFileProgress: (progress) => set({ currentFileProgress: progress }),
  setCopiedCount: (count) => set({ copiedCount: count }),
  setTotalCount: (count) => set({ totalCount: count }),

  setSuccess: (success) => set({ success }),
  setMessage: (message) => set({ message }),
  addError: (error) => set((state) => ({ errors: [...state.errors, error] })),

  reset: () => set(initialState),
}));
