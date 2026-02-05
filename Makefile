.PHONY: all build clean typecheck lint test install package

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

# Run all tests (currently just typecheck)
test: typecheck

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
