FROM node:22-slim

# Install build tools + ripgrep
RUN apt-get update && apt-get install -y \
    ripgrep python3 clang git curl \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app
COPY package.json .
RUN npm install --production

COPY src/ src/
COPY public/ public/
COPY bin/ bin/

# Build MCP servers
RUN cd src/mcp-servers/cpp && clang++ -O2 -std=c++17 -o mcp-grep-cpp main.cpp
RUN cd src/mcp-servers/rust && cargo build --release 2>&1 | tail -3
# Swift + Zig: macOS only, skipped in Docker

RUN chmod +x bin/*.sh bin/*.js 2>/dev/null || true

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
