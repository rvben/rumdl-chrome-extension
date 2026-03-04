.PHONY: all build clean typecheck lint test test-unit test-e2e test-coverage install package watch rebuild-wasm check ci check-size

# Default target
all: build

# Install dependencies
install:
	npm install

# Build the extension
build:
	npm run build

# Clean build artifacts
clean:
	npm run clean

# TypeScript type checking
typecheck:
	npm run typecheck

# Lint TypeScript files
lint: typecheck

# Run unit tests
test-unit:
	npm run test

# Run tests with coverage
test-coverage:
	npm run test:coverage

# Run E2E tests (requires puppeteer)
test-e2e: build
	npm run test:e2e

# Run all tests (typecheck + unit tests)
test: typecheck test-unit

# Full check: lint + test + build
check: lint test build

# CI pipeline: install + full check + package
ci: install check package

# Package the extension for distribution
package:
	npm run package

# Development watch mode
watch:
	npm run watch

# Rebuild WASM from rumdl (requires wasm-pack)
rebuild-wasm:
	cd ../rumdl/wasm-demo && wasm-pack build --target web
	npm run build:wasm

# Check extension zip size (Chrome Web Store limit: 100MB)
check-size: package
	@SIZE=$$(stat -f%z rumdl-extension.zip 2>/dev/null || stat -c%s rumdl-extension.zip 2>/dev/null); \
	SIZE_MB=$$(echo "scale=2; $$SIZE / 1048576" | bc); \
	echo "Extension size: $${SIZE_MB}MB"; \
	if [ $$SIZE -gt 104857600 ]; then echo "WARNING: Exceeds 100MB Chrome Web Store limit!"; exit 1; fi
