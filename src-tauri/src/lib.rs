use globset::{Glob, GlobSet, GlobSetBuilder};
use ignore::WalkBuilder;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct BackupProgress {
    current_file: String,
    copied_count: u64,
    skipped_count: u64,
    total_count: u64,
}

#[derive(Clone, Serialize)]
struct BackupComplete {
    success: bool,
    copied_count: u64,
    skipped_count: u64,
    message: String,
}

#[derive(Clone, Serialize)]
struct BackupError {
    message: String,
    file: Option<String>,
}

/// Build a GlobSet from a list of patterns
fn build_glob_set(patterns: &[String]) -> GlobSet {
    let mut builder = GlobSetBuilder::new();

    for pattern in patterns {
        match Glob::new(pattern) {
            Ok(glob) => {
                builder.add(glob);
            }
            Err(_) => {
                // If pattern is invalid as glob, treat it as literal match
                if let Ok(glob) = Glob::new(&format!("**/{}", pattern)) {
                    builder.add(glob);
                }
            }
        }
    }

    builder.build().unwrap_or_else(|_| GlobSet::empty())
}

/// Check if a path should be blacklisted using glob patterns
fn is_blacklisted(relative_path: &Path, glob_set: &GlobSet) -> bool {
    // Check if the full path matches
    if glob_set.is_match(relative_path) {
        return true;
    }

    // Check if any component matches (for simple patterns like "node_modules")
    for component in relative_path.components() {
        if let std::path::Component::Normal(name) = component {
            if glob_set.is_match(name) {
                return true;
            }
        }
    }

    false
}

/// Find an available filename by adding _1, _2, etc. suffix
fn find_available_name(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }

    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let parent = path.parent().unwrap_or(Path::new(""));

    let mut counter = 1;
    loop {
        let new_name = format!("{}_{}{}", stem, counter, ext);
        let new_path = parent.join(new_name);
        if !new_path.exists() {
            return new_path;
        }
        counter += 1;
        if counter > 10000 {
            // Safety limit
            return path.to_path_buf();
        }
    }
}

/// Recursively copy directories/files using the `ignore` crate for fast traversal
/// and glob-based blacklist filtering.
#[tauri::command]
async fn backup_directory(
    app: AppHandle,
    source_paths: Vec<String>,
    target_path: String,
    blacklist: Vec<String>,
    respect_gitignore: bool,
    include_source_dir: bool,
    collision_mode: String,
) -> Result<BackupComplete, String> {
    let target = Path::new(&target_path);

    // Validate we have sources
    if source_paths.is_empty() {
        return Err("No source paths provided".to_string());
    }

    // Validate all sources exist
    for source_path in &source_paths {
        let source = Path::new(source_path);
        if !source.exists() {
            return Err(format!("Source path does not exist: {}", source_path));
        }
    }

    // Create target directory if it doesn't exist
    if let Err(e) = fs::create_dir_all(target) {
        return Err(format!("Failed to create target directory: {}", e));
    }

    // Build glob set from blacklist patterns
    let glob_set = build_glob_set(&blacklist);

    // First pass: count total files for progress calculation
    let total_count = count_files_multi(&source_paths, &glob_set, respect_gitignore);

    let mut copied_count: u64 = 0;
    let mut skipped_count: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    // Process each source path
    for source_path in &source_paths {
        let source = Path::new(source_path);

        if source.is_file() {
            // Handle single file
            if let Some(file_name) = source.file_name() {
                let mut dest_path = target.join(file_name);

                // Check blacklist
                if is_blacklisted(Path::new(file_name), &glob_set) {
                    continue;
                }

                // Handle collision
                if dest_path.exists() {
                    match collision_mode.as_str() {
                        "skip" => {
                            skipped_count += 1;
                            continue;
                        }
                        "rename" => {
                            dest_path = find_available_name(&dest_path);
                        }
                        _ => {} // overwrite
                    }
                }

                match fs::copy(source, &dest_path) {
                    Ok(_) => {
                        copied_count += 1;
                        let _ = app.emit(
                            "backup-progress",
                            BackupProgress {
                                current_file: file_name.to_string_lossy().to_string(),
                                copied_count,
                                skipped_count,
                                total_count,
                            },
                        );
                    }
                    Err(e) => {
                        errors.push(format!("Failed to copy {:?}: {}", source, e));
                        let _ = app.emit(
                            "backup-error",
                            BackupError {
                                message: e.to_string(),
                                file: Some(source_path.clone()),
                            },
                        );
                    }
                }
            }
        } else if source.is_dir() {
            // Handle directory
            let effective_target = if include_source_dir {
                if let Some(source_name) = source.file_name() {
                    target.join(source_name)
                } else {
                    target.to_path_buf()
                }
            } else {
                target.to_path_buf()
            };

            if let Err(e) = fs::create_dir_all(&effective_target) {
                errors.push(format!("Failed to create target dir {:?}: {}", effective_target, e));
                continue;
            }

            // Build the walker
            let mut builder = WalkBuilder::new(source);
            builder
                .hidden(false)
                .git_ignore(respect_gitignore)
                .git_global(false)
                .git_exclude(respect_gitignore);

            let walker = builder.build();

            for entry in walker {
                match entry {
                    Ok(dir_entry) => {
                        let path = dir_entry.path();

                        // Calculate relative path from source
                        let relative_path = match path.strip_prefix(source) {
                            Ok(p) => p,
                            Err(_) => continue,
                        };

                        // Skip if blacklisted
                        if is_blacklisted(relative_path, &glob_set) {
                            continue;
                        }

                        let mut dest_path = effective_target.join(relative_path);

                        if path.is_dir() {
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
                            // Ensure parent directory exists
                            if let Some(parent) = dest_path.parent() {
                                if let Err(e) = fs::create_dir_all(parent) {
                                    errors.push(format!("Failed to create parent dir {:?}: {}", parent, e));
                                    continue;
                                }
                            }

                            // Handle collision
                            if dest_path.exists() {
                                match collision_mode.as_str() {
                                    "skip" => {
                                        skipped_count += 1;
                                        continue;
                                    }
                                    "rename" => {
                                        dest_path = find_available_name(&dest_path);
                                    }
                                    _ => {} // overwrite
                                }
                            }

                            // Copy the file
                            match fs::copy(path, &dest_path) {
                                Ok(_) => {
                                    copied_count += 1;
                                    let _ = app.emit(
                                        "backup-progress",
                                        BackupProgress {
                                            current_file: relative_path.to_string_lossy().to_string(),
                                            copied_count,
                                            skipped_count,
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
        }
    }

    let message = if errors.is_empty() {
        if skipped_count > 0 {
            format!("Copied {} files, skipped {}", copied_count, skipped_count)
        } else {
            format!("Successfully copied {} files", copied_count)
        }
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
        skipped_count,
        message,
    };

    let _ = app.emit("backup-complete", result.clone());

    Ok(result)
}

/// Count total files to copy (for progress calculation)
fn count_files_multi(source_paths: &[String], glob_set: &GlobSet, respect_gitignore: bool) -> u64 {
    let mut count: u64 = 0;

    for source_path in source_paths {
        let source = Path::new(source_path);

        if source.is_file() {
            // Single file
            if let Some(file_name) = source.file_name() {
                if !is_blacklisted(Path::new(file_name), glob_set) {
                    count += 1;
                }
            }
        } else if source.is_dir() {
            let mut builder = WalkBuilder::new(source);
            builder
                .hidden(false)
                .git_ignore(respect_gitignore)
                .git_global(false)
                .git_exclude(respect_gitignore);
            let walker = builder.build();

            for entry in walker {
                if let Ok(dir_entry) = entry {
                    let path = dir_entry.path();

                    if path.is_file() {
                        if let Ok(relative) = path.strip_prefix(source) {
                            if !is_blacklisted(relative, glob_set) {
                                count += 1;
                            }
                        }
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
