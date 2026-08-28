# rumdl Browser Extension

A Chrome extension that provides real-time Markdown linting for GitHub and GitLab using [rumdl](https://github.com/rvben/rumdl), a fast Rust-based Markdown linter.

## Features

- **Real-time linting**: Lint your markdown as you type in issue descriptions, PR descriptions, comments, and more
- **Multi-site support**: Works on GitHub and GitLab
- **Visual indicators**: Gutter markers show warning locations directly in the editor
- **Warning panel**: Responsive issue panel with keyboard and click-to-jump navigation
- **Auto-fix**: Fix all auto-fixable issues with one click (Cmd/Ctrl+Shift+F)
- **Per-issue fixes**: Fix individual issues inline
- **Multiple markdown flavors**: Standard, MkDocs, MDX, Quarto, and Obsidian
- **Reflow support**: Automatically rewrap long lines to configured width
- **Theme support**: Automatic dark/light mode support matching site themes
- **Page readiness**: The popup shows whether an editor is detected or a tab needs attention

## Requirements

- **Chrome 121+** (or a compatible Chromium-based browser)
- WebAssembly support (enabled by default in modern browsers)

## Installation

### From Chrome Web Store

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/rumdl-%E2%80%94-markdown-linter/inepnnojhghmcjcnalkgailijhlaejce)

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
- Only requests permissions for the supported sites (GitHub, GitLab)

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
- Check that the site is supported (GitHub, GitLab)
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

The WASM binary is approximately 5 MB and runs entirely within the extension.

## Development

All CI/CD steps are Make targets that can be run locally:

```bash
make install        # Install dependencies
make build          # Build the extension
make lint           # TypeScript type checking
make test-unit      # Run the unit test suite
make test-e2e        # Build and test the loaded extension in Chromium
npm run screenshots  # Capture real-extension popup and editor UI states
npm run screenshots:store # Render 1280x800 Chrome Web Store listing images
make test           # Lint + unit tests
make check          # Lint + test + build
make package        # Create rumdl-extension.zip
make ci             # Full CI pipeline (install + check + package)
make check-size     # Verify extension size is under Chrome Web Store limit
make watch          # Development watch mode
```

The latest visual and behavioral assessment is available as an
[HTML before/after report](reports/extension-before-after.html). To preserve an
existing screenshot baseline while capturing a new comparison set, run:

```bash
SCREENSHOT_PREFIX=after- npm run screenshots
```

Tagged releases can also upload and submit the verified package to the Chrome
Web Store using short-lived GitHub OIDC credentials. See the
[Chrome Web Store automation guide](store/cws-automation.md) for the one-time
Google Cloud and repository configuration.

### WASM Module

The WASM module is provided by the [`rumdl-wasm`](https://www.npmjs.com/package/rumdl-wasm) npm package.
It is installed via `npm install` and the binary is copied to `dist/wasm/` during build.
An auto-update workflow bumps the version when new releases are published.

To manually update:

```bash
npm install rumdl-wasm@latest --save-exact
make build
```

## Contributing

Contributions are welcome! Please open an issue or PR on the [GitHub repository](https://github.com/rvben/rumdl-chrome-extension).

## License

MIT - see [LICENSE](LICENSE)
