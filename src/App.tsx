import { useState, useEffect } from "preact/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
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

function App() {
  const [sourcePath, setSourcePath] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [blacklist, setBlacklist] = useState<string[]>([
    "node_modules",
    ".git",
    "dist",
  ]);
  const [newTag, setNewTag] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState("");
  const [copiedCount, setCopiedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

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
          setStatusMessage(message);
          setIsRunning(false);
          if (success) {
            setProgress(100);
          }
        }
      );

      unlistenError = await listen<BackupError>("backup-error", (event) => {
        const { message, file } = event.payload;
        setErrors((prev) => [
          ...prev,
          file ? `${file}: ${message}` : message,
        ]);
      });
    };

    setupListeners();

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
      unlistenError?.();
    };
  }, []);

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

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !blacklist.includes(tag)) {
      setBlacklist([...blacklist, tag]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setBlacklist(blacklist.filter((tag) => tag !== tagToRemove));
  };

  const startBackup = async () => {
    if (!sourcePath || !targetPath) {
      setStatusMessage("Please select both source and target directories");
      return;
    }

    setIsRunning(true);
    setErrors([]);
    setProgress(0);
    setCopiedCount(0);
    setTotalCount(0);
    setCurrentFile("");
    setStatusMessage("Starting backup...");

    try {
      await invoke("backup_directory", {
        sourcePath,
        targetPath,
        blacklist,
      });
    } catch (error) {
      setStatusMessage(`Error: ${error}`);
      setIsRunning(false);
    }
  };

  const handleTagKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <main class="container">
      <h1>M4SS C0PY</h1>
      <p class="subtitle">Fast directory backup with smart filtering</p>

      <div class="form-section">
        <div class="input-row">
          <label>Source Directory</label>
          <div class="input-group">
            <input
              type="text"
              value={sourcePath}
              onInput={(e) => setSourcePath(e.currentTarget.value)}
              placeholder="/path/to/source"
              disabled={isRunning}
            />
            <button
              type="button"
              onClick={browseSource}
              disabled={isRunning}
              class="browse-btn"
            >
              Browse
            </button>
          </div>
        </div>

        <div class="input-row">
          <label>Target Directory</label>
          <div class="input-group">
            <input
              type="text"
              value={targetPath}
              onInput={(e) => setTargetPath(e.currentTarget.value)}
              placeholder="/path/to/backup"
              disabled={isRunning}
            />
            <button
              type="button"
              onClick={browseTarget}
              disabled={isRunning}
              class="browse-btn"
            >
              Browse
            </button>
          </div>
        </div>

        <div class="input-row">
          <label>Blacklisted Folders</label>
          <div class="blacklist-section">
            <div class="input-group">
              <input
                type="text"
                value={newTag}
                onInput={(e) => setNewTag(e.currentTarget.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add folder to ignore..."
                disabled={isRunning}
              />
              <button
                type="button"
                onClick={addTag}
                disabled={isRunning || !newTag.trim()}
                class="add-btn"
              >
                Add
              </button>
            </div>
            <div class="tags-container">
              {blacklist.map((tag) => (
                <span key={tag} class="tag">
                  {tag}
                  <button
                    type="button"
                    class="tag-remove"
                    onClick={() => removeTag(tag)}
                    disabled={isRunning}
                    aria-label={`Remove ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="start-btn"
        onClick={startBackup}
        disabled={isRunning || !sourcePath || !targetPath}
      >
        {isRunning ? "Backing Up..." : "Start Backup"}
      </button>

      {(isRunning || statusMessage) && (
        <div class="progress-section">
          <div class="progress-bar-container">
            <div class="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div class="progress-info">
            <span class="progress-percent">{progress}%</span>
            {totalCount > 0 && (
              <span class="file-count">
                {copiedCount} / {totalCount} files
              </span>
            )}
          </div>
          {currentFile && (
            <div class="current-file" title={currentFile}>
              Copying: {currentFile}
            </div>
          )}
          {statusMessage && <div class="status-message">{statusMessage}</div>}
        </div>
      )}

      {errors.length > 0 && (
        <div class="errors-section">
          <details>
            <summary>Errors ({errors.length})</summary>
            <ul>
              {errors.slice(0, 10).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
              {errors.length > 10 && (
                <li>...and {errors.length - 10} more</li>
              )}
            </ul>
          </details>
        </div>
      )}
    </main>
  );
}

export default App;
