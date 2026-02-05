# m4ssc0py

A lightweight desktop file backup utility built with Tauri.

## Features

- Copy files and folders to a target directory
- Drag-and-drop support for source and target paths
- Blacklist patterns to exclude files (glob syntax)
- Respect `.gitignore` rules
- Collision handling: overwrite, skip, or rename
- Real-time progress tracking

## Development

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build
```

## License

MIT
