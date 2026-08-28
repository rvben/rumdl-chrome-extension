# Privacy Policy — rumdl Chrome Extension

**Last updated:** August 28, 2026

## Data Collection

The rumdl Chrome extension does **not** collect or transmit Markdown content or personal data to the developer or any third party. All Markdown linting and auto-fix processing happens on your device using a WebAssembly (WASM) module.

## What the extension accesses

- **Textarea content** on supported sites (GitHub, GitLab) — read in-memory only for linting. Never transmitted anywhere.
- **Chrome storage** (`chrome.storage.sync`) — used solely to persist extension preferences such as enabled rules and line length. Chrome may synchronize these preferences through your browser profile. They never contain Markdown content.

## What the extension does NOT do

- No analytics or telemetry
- No network requests initiated by rumdl for analytics, processing, advertising, or tracking
- No cookies or tracking
- No data shared with third parties
- No user accounts or authentication

## Data retention

Markdown content is processed in memory and is not retained by the extension. Preferences stored through `chrome.storage.sync` remain until you change them, clear extension storage, or uninstall the extension. Chrome Sync is provided and governed by Google as part of your browser profile.

## Permissions explained

| Permission | Purpose |
|---|---|
| `storage` | Save your extension settings |
| Host permissions (github.com, gitlab.com) | Inject the content script that enables linting on these sites |

The extension also requires `wasm-unsafe-eval` in its content security policy to execute the WebAssembly linting engine. This only applies to the extension's own code and does not affect web pages.

## GDPR and CCPA

The developer does not receive or retain user data and therefore has no user data to access, correct, sell, or delete. Browser-profile synchronization is controlled through your Google Chrome settings.

## Open source

The extension source code is publicly available at [github.com/rvben/rumdl-chrome-extension](https://github.com/rvben/rumdl-chrome-extension).

## Contact

For questions about this privacy policy, email support@am8.nl or open an issue on the [GitHub repository](https://github.com/rvben/rumdl-chrome-extension).
