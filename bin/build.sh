#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "Building Milli-Agent MCP servers..."

echo "  [C++] Building..."
cd "$DIR/src/mcp-servers/cpp" && clang++ -O2 -std=c++17 -o mcp-grep-cpp main.cpp
echo "  [C++] $(ls -lh mcp-grep-cpp | awk '{print $5}')"

if command -v cargo &>/dev/null; then
  echo "  [Rust] Building..."
  cd "$DIR/src/mcp-servers/rust" && cargo build --release 2>&1 | tail -1
  echo "  [Rust] $(ls -lh target/release/mcp-grep-rust | awk '{print $5}')"
else
  echo "  [Rust] Skipped (no cargo)"
fi

if command -v swiftc &>/dev/null; then
  echo "  [Swift] Building..."
  cd "$DIR/src/mcp-servers/swift" && swiftc -O -o mcp-grep-swift main.swift
  echo "  [Swift] $(ls -lh mcp-grep-swift | awk '{print $5}')"
else
  echo "  [Swift] Skipped (no swiftc)"
fi

echo "  [Python] No build needed"
echo "Done!"
