# rumdl Browser Extension

A Chrome extension that provides real-time Markdown linting for GitHub, GitLab, and Reddit using [rumdl](https://github.com/rvben/rumdl), a fast Rust-based Markdown linter.

## Features

- **Real-time linting**: Lint your markdown as you type in issue descriptions, PR descriptions, comments, and more
- **Multi-site support**: Works on GitHub, GitLab, and Reddit
- **Visual indicators**: Gutter markers show warning locations directly in the editor
- **Warning panel**: Side panel showing all issues with click-to-jump navigation
- **Auto-fix**: Fix all auto-fixable issues with one click (Cmd/Ctrl+Shift+F)
- **Per-issue fixes**: Fix individual issues inline
- **Multiple markdown flavors**: Standard, MkDocs, MDX, Quarto, and Obsidian
- **Reflow support**: Automatically rewrap long lines to configured width
- **Theme support**: Automatic dark/light mode support matching site themes

## Requirements

- **Chrome 90+** (or Chromium-based browser like Edge, Brave, Arc)
- WebAssembly support (enabled by default in modern browsers)

## Installation

### From Chrome Web Store

[Install from Chrome Web Store](https://chrome.google.com/webstore) *(Coming soon)*

### From Source (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/rvben/rumdl-chrome-extension.git
   cd rumdl-chrome-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

## Supported Sites

### GitHub
- Issue descriptions
- PR descriptions
- Issue/PR comments
- Review comments
- Inline PR comments
- Wiki pages
- Discussions
- Gist comments

### GitLab
- Issue descriptions
- MR descriptions
- Comments
- Wiki pages
- Snippets

### Reddit
- Post creation (new Reddit)
- Comments (new Reddit)
- Old Reddit text editors

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Shift+F` | Fix all auto-fixable issues |
| `Cmd/Ctrl+Shift+L` | Toggle warning panel |
| `Cmd/Ctrl+.` | Fix issue at cursor |
| `Cmd/Ctrl+Alt+]` | Jump to next warning |
| `Cmd/Ctrl+Alt+[` | Jump to previous warning |
| `Escape` | Close warning panel |

## Configuration

Click the extension icon in the toolbar to access settings:

- **Enable rumdl**: Toggle linting on/off
- **Markdown Flavor**: Choose between Standard, MkDocs, MDX, Quarto, or Obsidian
- **Line Length**: Set the maximum line length (default: 80)
- **Reflow long lines**: Enable paragraph reflow for long lines
- **Disabled Rules**: Rules to disable (e.g., MD041 for first heading)
- **Show gutter icons**: Show/hide warning markers in the editor gutter

## Privacy

This extension:
- **Does NOT collect or transmit any data** - all linting happens locally in your browser
- **Does NOT require any account or login**
- **Does NOT access any data outside of markdown editors**
- Only requests permissions for the supported sites (GitHub, GitLab, Reddit)

The WASM module runs entirely in your browser's sandbox with no network access.

## Troubleshooting

### Extension shows "Linting unavailable"
- The WASM module failed to load. Try reloading the page or restarting Chrome.
- Check if your browser supports WebAssembly (chrome://flags/#enable-webassembly)

### No warnings shown even with errors
- Make sure the extension is enabled (check popup settings)
- The rule might be disabled - check disabled rules in settings
- Some content (like code blocks) is intentionally not linted

### Extension not working on a page
- Reload the page after installing the extension
- Check that the site is supported (GitHub, GitLab, Reddit)
- For GitLab self-hosted instances, add the domain to the extension permissions

### Fix button not working
- Some rules don't have auto-fixes available
- Make sure the reflow option is enabled for MD013 line length fixes

### Performance issues
- For very large files (>1000 lines), linting may take longer
- Consider disabling real-time linting and using manual lint via keyboard shortcut

## Architecture

The extension uses WebAssembly to run rumdl directly in the browser:

- **Service Worker**: Loads the WASM module and handles linting requests
- **Content Script**: Detects editors and manages the lint UI
- **Popup**: Configuration interface

The WASM binary is ~3 MB (downloaded once and cached).

## Development

All CI/CD steps are Make targets that can be run locally:

```bash
make install        # Install dependencies
make build          # Build the extension
make lint           # TypeScript type checking
make test-unit      # Run unit tests (128 tests)
make test           # Lint + unit tests
make check          # Lint + test + build
make package        # Create rumdl-extension.zip
make ci             # Full CI pipeline (install + check + package)
make check-size     # Verify extension size is under Chrome Web Store limit
make rebuild-wasm   # Rebuild WASM from rumdl source
make watch          # Development watch mode
```

### Building the WASM Module

The WASM module is built from the main rumdl repository:

```bash
make rebuild-wasm
```

Or manually:

```bash
cd ../rumdl/wasm-demo && wasm-pack build --target web
```

## Contributing

Contributions are welcome! Please open an issue or PR on the [GitHub repository](https://github.com/rvben/rumdl-chrome-extension).

## License

MIT - see [LICENSE](LICENSE)
