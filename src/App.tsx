import { useEffect, useState } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useBackupStore } from "./store";
import "./App.css";

interface DragDropPayload {
  paths: string[];
  position: { x: number; y: number };
}

interface DragPayload {
  position: { x: number; y: number };
}

interface BackupProgress {
  current_file: string;
  copied_count: number;
  skipped_count: number;
  total_count: number;
}

interface BackupComplete {
  success: boolean;
  copied_count: number;
  skipped_count: number;
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
    sourcePaths,
    sourceHistory,
    targetPath,
    targetHistory,
    blacklist,
    respectGitignore,
    includeSourceDir,
    collisionMode,
    addSourcePath,
    removeSourcePath,
    clearSourcePaths,
    addToSourceHistory,
    setTargetPath,
    addToTargetHistory,
    addBlacklistItem,
    removeBlacklistItem,
    setRespectGitignore,
    setIncludeSourceDir,
    setCollisionMode,
    setScreen,
    setProgress,
    setCopiedCount,
    setSkippedCount,
    setTotalCount,
    setCurrentFile,
    setMessage,
    setSuccess,
  } = useBackupStore();

  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [showBrowseMenu, setShowBrowseMenu] = useState(false);
  const [showCollisionDropdown, setShowCollisionDropdown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dropZone, setDropZone] = useState<'source' | 'target' | null>(null);

  const browseFiles = async () => {
    setShowBrowseMenu(false);
    const selected = await open({
      directory: false,
      multiple: true,
      title: "Select Files",
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      paths.forEach((path) => {
        if (typeof path === "string") {
          addSourcePath(path);
          addToSourceHistory(path);
        }
      });
    }
  };

  const browseFolder = async () => {
    setShowBrowseMenu(false);
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Folder",
    });
    if (selected && typeof selected === "string") {
      addSourcePath(selected);
      addToSourceHistory(selected);
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

  // Use Tauri's native drag-drop events
  useEffect(() => {
    let unlistenDragEnter: UnlistenFn;
    let unlistenDragOver: UnlistenFn;
    let unlistenDragLeave: UnlistenFn;
    let unlistenDrop: UnlistenFn;

    const setupDragDropListeners = async () => {
      unlistenDragEnter = await listen<DragPayload>(
        TauriEvent.DRAG_ENTER,
        (event) => {
          setIsDragging(true);
          // Determine which zone based on position
          const { y } = event.payload.position;
          const windowHeight = window.innerHeight;
          // Source input is roughly in the top third, target in the middle
          if (y < windowHeight * 0.35) {
            setDropZone('source');
          } else if (y < windowHeight * 0.55) {
            setDropZone('target');
          } else {
            setDropZone('source'); // Default to source
          }
        }
      );

      unlistenDragOver = await listen<DragPayload>(
        TauriEvent.DRAG_OVER,
        (event) => {
          const { y } = event.payload.position;
          const windowHeight = window.innerHeight;
          if (y < windowHeight * 0.35) {
            setDropZone('source');
          } else if (y < windowHeight * 0.55) {
            setDropZone('target');
          } else {
            setDropZone('source');
          }
        }
      );

      unlistenDragLeave = await listen(
        TauriEvent.DRAG_LEAVE,
        () => {
          setIsDragging(false);
          setDropZone(null);
        }
      );

      unlistenDrop = await listen<DragDropPayload>(
        TauriEvent.DRAG_DROP,
        (event) => {
          const { paths, position } = event.payload;
          const { y } = position;
          const windowHeight = window.innerHeight;

          // Determine target zone based on drop position
          if (y < windowHeight * 0.35) {
            // Source zone - add all paths
            paths.forEach((path) => {
              addSourcePath(path);
              addToSourceHistory(path);
            });
          } else if (y < windowHeight * 0.55) {
            // Target zone - use first path (single directory)
            if (paths.length > 0) {
              setTargetPath(paths[0]);
              addToTargetHistory(paths[0]);
            }
          } else {
            // Default to source
            paths.forEach((path) => {
              addSourcePath(path);
              addToSourceHistory(path);
            });
          }

          setIsDragging(false);
          setDropZone(null);
        }
      );
    };

    setupDragDropListeners();

    return () => {
      unlistenDragEnter?.();
      unlistenDragOver?.();
      unlistenDragLeave?.();
      unlistenDrop?.();
    };
  }, [addSourcePath, addToSourceHistory, setTargetPath, addToTargetHistory]);

  const collisionOptions = [
    { value: 'overwrite', label: 'Overwrite' },
    { value: 'skip', label: 'Skip' },
    { value: 'rename', label: 'Rename' },
  ] as const;

  const startBackup = async () => {
    if (sourcePaths.length === 0 || !targetPath) {
      return;
    }

    addToTargetHistory(targetPath);

    setScreen("progress");
    setProgress(0);
    setCopiedCount(0);
    setSkippedCount(0);
    setTotalCount(0);
    setCurrentFile("");

    try {
      await invoke("backup_directory", {
        sourcePaths,
        targetPath,
        blacklist,
        respectGitignore,
        includeSourceDir,
        collisionMode,
      });
    } catch (error) {
      setMessage(`Error: ${error}`);
      setSuccess(false);
    }
  };

  const sourceDisplayValue = sourcePaths.length > 0
    ? sourcePaths.map(p => p.split(/[/\\]/).pop()).join(", ")
    : "";

  return (
    <div class="screen form-screen">
      <div class="path-inputs">
        <div class="path-row source-row">
          <span class="path-label">From</span>
          <div
            class={`source-input-wrapper drop-zone ${isDragging && dropZone === 'source' ? "drag-active" : ""}`}
          >
            <input
              type="text"
              value={sourceDisplayValue}
              onFocus={() => setShowSourceDropdown(true)}
              onBlur={() => setTimeout(() => setShowSourceDropdown(false), 150)}
              placeholder="Drop or select source..."
              readOnly
            />
            {sourcePaths.length > 0 && (
              <button
                type="button"
                class="clear-btn"
                onClick={clearSourcePaths}
                aria-label="Clear all sources"
              >
                ×
              </button>
            )}
            {showSourceDropdown && sourceHistory.length > 0 && (
              <div class="source-dropdown">
                {sourceHistory.map((path) => (
                  <button
                    key={path}
                    type="button"
                    class="source-dropdown-item"
                    onMouseDown={() => addSourcePath(path)}
                  >
                    {path}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div class="browse-menu-wrapper">
            <button
              type="button"
              onClick={() => setShowBrowseMenu(!showBrowseMenu)}
              onBlur={() => setTimeout(() => setShowBrowseMenu(false), 150)}
              class="browse-btn"
              title="Add source"
            >
              +
            </button>
            {showBrowseMenu && (
              <div class="browse-menu">
                <button type="button" class="browse-menu-item" onMouseDown={browseFiles}>
                  Files
                </button>
                <button type="button" class="browse-menu-item" onMouseDown={browseFolder}>
                  Folder
                </button>
              </div>
            )}
          </div>
        </div>

        {sourcePaths.length > 1 && (
          <div class="source-chips-row">
            {sourcePaths.map((path) => (
              <span key={path} class="source-chip" title={path}>
                {path.split(/[/\\]/).pop()}
                <button
                  type="button"
                  class="chip-remove"
                  onClick={() => removeSourcePath(path)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div class="path-row target-row">
          <span class="path-label">To</span>
          <div
            class={`target-input-wrapper drop-zone ${isDragging && dropZone === 'target' ? "drag-active" : ""}`}
          >
            <input
              type="text"
              value={targetPath}
              onInput={(e) => setTargetPath(e.currentTarget.value)}
              onFocus={() => setShowTargetDropdown(true)}
              onBlur={() => setTimeout(() => setShowTargetDropdown(false), 150)}
              placeholder="Drop or select target..."
            />
            {showTargetDropdown && targetHistory.length > 0 && (
              <div class="target-dropdown">
                {targetHistory.map((path) => (
                  <button
                    key={path}
                    type="button"
                    class="target-dropdown-item"
                    onMouseDown={() => setTargetPath(path)}
                  >
                    {path}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={browseTarget} class="browse-btn">
            📁
          </button>
        </div>
      </div>

      <div class="blacklist-section">
        <div class="blacklist-header">
          <span class="section-label">BLACKLIST</span>
          <form onSubmit={handleAddBlacklist} class="add-form">
            <input type="text" placeholder="Pattern (e.g., *.log)" />
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
          <span>Include source dir</span>
        </label>
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={respectGitignore}
            onChange={(e) => setRespectGitignore(e.currentTarget.checked)}
          />
          <span>Respect .gitignore</span>
        </label>
        <div class="collision-dropdown-wrapper">
          <button
            type="button"
            class="collision-trigger"
            onClick={() => setShowCollisionDropdown(!showCollisionDropdown)}
            onBlur={() => setTimeout(() => setShowCollisionDropdown(false), 150)}
          >
            {collisionOptions.find(o => o.value === collisionMode)?.label}
            <span class="dropdown-arrow">▾</span>
          </button>
          {showCollisionDropdown && (
            <div class="collision-dropdown">
              {collisionOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  class={`collision-dropdown-item ${collisionMode === option.value ? 'active' : ''}`}
                  onMouseDown={() => setCollisionMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        class="action-btn"
        onClick={startBackup}
        disabled={sourcePaths.length === 0 || !targetPath}
      >
        Start Backup
      </button>
    </div>
  );
}

function ProgressScreen() {
  const { progress, currentFile, copiedCount, skippedCount, totalCount } = useBackupStore();

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
            {copiedCount} copied{skippedCount > 0 ? `, ${skippedCount} skipped` : ""} / {totalCount} total
          </div>
        </div>

        <div class="progress-item">
          <div class="progress-header">
            <span class="progress-label">Current File</span>
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
  const { success, message, errors, copiedCount, skippedCount, reset } = useBackupStore();

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
            <span class="stat-label">Copied</span>
          </div>
          {skippedCount > 0 && (
            <div class="stat-item">
              <span class="stat-value">{skippedCount}</span>
              <span class="stat-label">Skipped</span>
            </div>
          )}
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
    setSkippedCount,
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
          const { current_file, copied_count, skipped_count, total_count } = event.payload;
          setCurrentFile(current_file);
          setCopiedCount(copied_count);
          setSkippedCount(skipped_count);
          setTotalCount(total_count);
          setProgress(
            total_count > 0 ? Math.round(((copied_count + skipped_count) / total_count) * 100) : 0
          );
        }
      );

      unlistenComplete = await listen<BackupComplete>(
        "backup-complete",
        (event) => {
          const { success, message, skipped_count } = event.payload;
          setMessage(message);
          setSuccess(success);
          setSkippedCount(skipped_count);
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
