FROM node:22-slim

# Install build tools + ripgrep
RUN apt-get update && apt-get install -y \
    ripgrep python3 clang git curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Rust (for building Rust MCP server)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Zig
RUN curl -L "https://ziglang.org/download/0.14.1/zig-linux-x86_64-0.14.1.tar.xz" -o /tmp/zig.tar.xz \
    && mkdir -p /opt/zig && tar -xf /tmp/zig.tar.xz -C /opt/zig --strip-components=1 \
    && rm /tmp/zig.tar.xz
ENV PATH="/opt/zig:${PATH}"

WORKDIR /app
COPY package.json .
RUN npm install --production

COPY src/ src/
COPY public/ public/
COPY bin/ bin/

# Build all MCP servers
RUN cd src/mcp-servers/cpp && clang++ -O2 -std=c++17 -o mcp-grep-cpp main.cpp
RUN cd src/mcp-servers/rust && cargo build --release 2>&1 | tail -3
RUN cd src/mcp-servers/zig && zig build -Doptimize=ReleaseFast 2>&1 | tail -1
# Swift not available on Linux Docker — skip

RUN chmod +x bin/*.sh bin/*.js 2>/dev/null || true

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
