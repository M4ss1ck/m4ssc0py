import { useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useBackupStore } from "./store";
import "./App.css";

interface BackupProgress {
  current_file: string;
  copied_count: number;
  total_count: number;
}

interface BackupComplete {
  success: boolean;
  copied_count: number;
  message: string;
}

interface BackupError {
  message: string;
  file: string | null;
}

function ChipCarousel({ items, onRemove }: { items: string[]; onRemove: (item: string) => void }) {
  const containerRef = { current: null as HTMLDivElement | null };

  const scrollLeft = () => {
    containerRef.current?.scrollBy({ left: -120, behavior: "smooth" });
  };

  const scrollRight = () => {
    containerRef.current?.scrollBy({ left: 120, behavior: "smooth" });
  };

  return (
    <div class="chip-carousel">
      <button
        type="button"
        class="carousel-arrow"
        onClick={scrollLeft}
        aria-label="Scroll left"
      >
        ‹
      </button>
      <div
        class="carousel-chips"
        ref={(el) => { containerRef.current = el; }}
      >
        {items.map((item) => (
          <span key={item} class="tag">
            {item}
            <button
              type="button"
              class="tag-remove"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        type="button"
        class="carousel-arrow"
        onClick={scrollRight}
        aria-label="Scroll right"
      >
        ›
      </button>
    </div>
  );
}

function FormScreen() {
  const {
    sourcePath,
    targetPath,
    blacklist,
    respectGitignore,
    includeSourceDir,
    setSourcePath,
    setTargetPath,
    addBlacklistItem,
    removeBlacklistItem,
    setRespectGitignore,
    setIncludeSourceDir,
    setScreen,
    setProgress,
    setCopiedCount,
    setTotalCount,
    setCurrentFile,
    setMessage,
    setSuccess,
  } = useBackupStore();

  const browseSource = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Source Directory",
    });
    if (selected && typeof selected === "string") {
      setSourcePath(selected);
    }
  };

  const browseTarget = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Target Directory",
    });
    if (selected && typeof selected === "string") {
      setTargetPath(selected);
    }
  };

  const handleAddBlacklist = (e: Event) => {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).querySelector("input");
    if (input && input.value.trim()) {
      addBlacklistItem(input.value.trim());
      input.value = "";
    }
  };

  const startBackup = async () => {
    if (!sourcePath || !targetPath) {
      return;
    }

    setScreen("progress");
    setProgress(0);
    setCopiedCount(0);
    setTotalCount(0);
    setCurrentFile("");

    try {
      await invoke("backup_directory", {
        sourcePath,
        targetPath,
        blacklist,
        respectGitignore,
        includeSourceDir,
      });
    } catch (error) {
      setMessage(`Error: ${error}`);
      setSuccess(false);
    }
  };

  return (
    <div class="screen form-screen">
      <div class="path-inputs">
        <div class="path-row">
          <span class="path-label">From</span>
          <input
            type="text"
            value={sourcePath}
            onInput={(e) => setSourcePath(e.currentTarget.value)}
            placeholder="Source directory..."
          />
          <button type="button" onClick={browseSource} class="browse-btn">
            📁
          </button>
        </div>
        <div class="path-row">
          <span class="path-label">To</span>
          <input
            type="text"
            value={targetPath}
            onInput={(e) => setTargetPath(e.currentTarget.value)}
            placeholder="Target directory..."
          />
          <button type="button" onClick={browseTarget} class="browse-btn">
            📁
          </button>
        </div>
      </div>

      <div class="blacklist-section">
        <div class="blacklist-header">
          <span class="section-label">BLACKLIST</span>
          <form onSubmit={handleAddBlacklist} class="add-form">
            <input type="text" placeholder="Add item..." />
            <button type="submit" class="add-btn">
              +
            </button>
          </form>
        </div>
        <ChipCarousel
          items={blacklist}
          onRemove={removeBlacklistItem}
        />
      </div>

      <div class="options-row">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={includeSourceDir}
            onChange={(e) => setIncludeSourceDir(e.currentTarget.checked)}
          />
          <span>Include source directory</span>
        </label>
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={respectGitignore}
            onChange={(e) => setRespectGitignore(e.currentTarget.checked)}
          />
          <span>Respect .gitignore</span>
        </label>
      </div>

      <button
        type="button"
        class="action-btn"
        onClick={startBackup}
        disabled={!sourcePath || !targetPath}
      >
        Start Backup
      </button>
    </div>
  );
}

function ProgressScreen() {
  const { progress, currentFile, copiedCount, totalCount } = useBackupStore();

  // Simple file progress (simulated based on file size estimate)
  const currentFileProgress = 100;

  return (
    <div class="screen progress-screen">
      <div class="progress-section">
        <div class="progress-item">
          <div class="progress-header">
            <span class="progress-label">Total Progress</span>
            <span class="progress-value">{progress}%</span>
          </div>
          <div class="progress-bar-container">
            <div class="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div class="progress-info">
            {copiedCount} / {totalCount} files
          </div>
        </div>

        <div class="progress-item">
          <div class="progress-header">
            <span class="progress-label">Current File</span>
            <span class="progress-value">{currentFileProgress}%</span>
          </div>
          <div class="progress-bar-container">
            <div
              class="progress-bar secondary"
              style={{ width: `${currentFileProgress}%` }}
            />
          </div>
          <div class="progress-info current-file-name" title={currentFile}>
            {currentFile || "Preparing..."}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompleteScreen() {
  const { success, message, errors, copiedCount, reset } = useBackupStore();

  const handleReset = () => {
    reset();
  };

  return (
    <div class="screen complete-screen">
      <div class="complete-content">
        <div class={`status-icon ${success ? "success" : "error"}`}>
          {success ? "✓" : "✗"}
        </div>
        <h2 class="status-message">{message}</h2>
        <div class="stats">
          <div class="stat-item">
            <span class="stat-value">{copiedCount}</span>
            <span class="stat-label">Files copied</span>
          </div>
          {errors.length > 0 && (
            <div class="stat-item">
              <span class="stat-value error">{errors.length}</span>
              <span class="stat-label">Errors</span>
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <details class="error-details">
            <summary>View errors</summary>
            <ul>
              {errors.slice(0, 10).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
              {errors.length > 10 && <li>...and {errors.length - 10} more</li>}
            </ul>
          </details>
        )}
      </div>

      <button type="button" class="action-btn" onClick={handleReset}>
        Start New Backup
      </button>
    </div>
  );
}

function App() {
  const {
    currentScreen,
    setScreen,
    setProgress,
    setCurrentFile,
    setCopiedCount,
    setTotalCount,
    setSuccess,
    setMessage,
    addError,
  } = useBackupStore();

  useEffect(() => {
    let unlistenProgress: UnlistenFn;
    let unlistenComplete: UnlistenFn;
    let unlistenError: UnlistenFn;

    const setupListeners = async () => {
      unlistenProgress = await listen<BackupProgress>(
        "backup-progress",
        (event) => {
          const { current_file, copied_count, total_count } = event.payload;
          setCurrentFile(current_file);
          setCopiedCount(copied_count);
          setTotalCount(total_count);
          setProgress(
            total_count > 0 ? Math.round((copied_count / total_count) * 100) : 0
          );
        }
      );

      unlistenComplete = await listen<BackupComplete>(
        "backup-complete",
        (event) => {
          const { success, message } = event.payload;
          setMessage(message);
          setSuccess(success);
          setProgress(100);
          setScreen("complete");
        }
      );

      unlistenError = await listen<BackupError>("backup-error", (event) => {
        const { message, file } = event.payload;
        addError(file ? `${file}: ${message}` : message);
      });
    };

    setupListeners();

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
      unlistenError?.();
    };
  }, []);

  return (
    <main class="container">
      {currentScreen === "form" && <FormScreen />}
      {currentScreen === "progress" && <ProgressScreen />}
      {currentScreen === "complete" && <CompleteScreen />}
    </main>
  );
}

export default App;
