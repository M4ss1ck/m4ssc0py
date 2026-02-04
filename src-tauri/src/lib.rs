use ignore::WalkBuilder;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct BackupProgress {
    current_file: String,
    copied_count: u64,
    total_count: u64,
}

#[derive(Clone, Serialize)]
struct BackupComplete {
    success: bool,
    copied_count: u64,
    message: String,
}

#[derive(Clone, Serialize)]
struct BackupError {
    message: String,
    file: Option<String>,
}

/// Recursively copy a directory using the `ignore` crate for fast traversal
/// and blacklist filtering.
#[tauri::command]
async fn backup_directory(
    app: AppHandle,
    source_path: String,
    target_path: String,
    blacklist: Vec<String>,
) -> Result<BackupComplete, String> {
    let source = Path::new(&source_path);
    let target = Path::new(&target_path);

    // Validate source exists
    if !source.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }

    if !source.is_dir() {
        return Err(format!("Source path is not a directory: {}", source_path));
    }

    // Create target directory if it doesn't exist
    if let Err(e) = fs::create_dir_all(target) {
        return Err(format!("Failed to create target directory: {}", e));
    }

    // First pass: count total files for progress calculation
    let total_count = count_files(&source_path, &blacklist);

    let mut copied_count: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    // Build the walker with blacklist filtering
    let mut builder = WalkBuilder::new(source);
    builder
        .hidden(false) // Don't skip hidden files by default
        .git_ignore(true) // Respect .gitignore files
        .git_global(false)
        .git_exclude(true);

    // Add custom ignore patterns for blacklisted folders
    for pattern in &blacklist {
        // These patterns will match directory names anywhere in the tree
        builder.add_custom_ignore_filename(".m4ssc0pyignore");
    }

    let walker = builder.build();

    for entry in walker {
        match entry {
            Ok(dir_entry) => {
                let path = dir_entry.path();

                // Skip blacklisted directories
                if path.is_dir() {
                    if let Some(name) = path.file_name() {
                        if blacklist.contains(&name.to_string_lossy().to_string()) {
                            continue;
                        }
                    }
                }

                // Calculate relative path from source
                let relative_path = match path.strip_prefix(source) {
                    Ok(p) => p,
                    Err(_) => continue,
                };

                let dest_path = target.join(relative_path);

                if path.is_dir() {
                    // Check if this directory or any parent is blacklisted
                    let should_skip = relative_path.components().any(|c| {
                        if let std::path::Component::Normal(name) = c {
                            blacklist.contains(&name.to_string_lossy().to_string())
                        } else {
                            false
                        }
                    });

                    if should_skip {
                        continue;
                    }

                    // Create directory in target
                    if let Err(e) = fs::create_dir_all(&dest_path) {
                        errors.push(format!("Failed to create dir {:?}: {}", dest_path, e));
                        let _ = app.emit(
                            "backup-error",
                            BackupError {
                                message: e.to_string(),
                                file: Some(path.to_string_lossy().to_string()),
                            },
                        );
                    }
                } else if path.is_file() {
                    // Check if any parent directory is blacklisted
                    let should_skip = relative_path.components().any(|c| {
                        if let std::path::Component::Normal(name) = c {
                            blacklist.contains(&name.to_string_lossy().to_string())
                        } else {
                            false
                        }
                    });

                    if should_skip {
                        continue;
                    }

                    // Ensure parent directory exists
                    if let Some(parent) = dest_path.parent() {
                        if let Err(e) = fs::create_dir_all(parent) {
                            errors.push(format!("Failed to create parent dir {:?}: {}", parent, e));
                            continue;
                        }
                    }

                    // Copy the file
                    match fs::copy(path, &dest_path) {
                        Ok(_) => {
                            copied_count += 1;

                            // Emit progress event
                            let _ = app.emit(
                                "backup-progress",
                                BackupProgress {
                                    current_file: relative_path.to_string_lossy().to_string(),
                                    copied_count,
                                    total_count,
                                },
                            );
                        }
                        Err(e) => {
                            errors.push(format!("Failed to copy {:?}: {}", path, e));
                            let _ = app.emit(
                                "backup-error",
                                BackupError {
                                    message: e.to_string(),
                                    file: Some(path.to_string_lossy().to_string()),
                                },
                            );
                        }
                    }
                }
            }
            Err(e) => {
                errors.push(format!("Walker error: {}", e));
            }
        }
    }

    let message = if errors.is_empty() {
        format!("Successfully copied {} files", copied_count)
    } else {
        format!(
            "Copied {} files with {} errors",
            copied_count,
            errors.len()
        )
    };

    let result = BackupComplete {
        success: errors.is_empty(),
        copied_count,
        message: message.clone(),
    };

    // Emit completion event
    let _ = app.emit("backup-complete", result.clone());

    Ok(result)
}

/// Count total files to copy (for progress calculation)
fn count_files(source_path: &str, blacklist: &[String]) -> u64 {
    let source = Path::new(source_path);
    let mut count: u64 = 0;

    let builder = WalkBuilder::new(source);
    let walker = builder.build();

    for entry in walker {
        if let Ok(dir_entry) = entry {
            let path = dir_entry.path();

            if path.is_file() {
                // Check if any component is blacklisted
                if let Ok(relative) = path.strip_prefix(source) {
                    let should_skip = relative.components().any(|c| {
                        if let std::path::Component::Normal(name) = c {
                            blacklist.contains(&name.to_string_lossy().to_string())
                        } else {
                            false
                        }
                    });

                    if !should_skip {
                        count += 1;
                    }
                }
            }
        }
    }

    count
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![backup_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
