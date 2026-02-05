.PHONY: all build clean typecheck lint test test-unit test-coverage install package

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

# Lint TypeScript files (if eslint is configured)
lint: typecheck

# Run unit tests
test-unit:
	npm run test

# Run tests with coverage
test-coverage:
	npm run test:coverage

# Run all tests (typecheck + unit tests)
test: typecheck test-unit

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
