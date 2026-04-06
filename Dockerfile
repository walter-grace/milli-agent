FROM node:22-slim AS base

RUN apt-get update && apt-get install -y \
    ripgrep python3 clang git curl xz-utils \
    binutils libncurses6 libedit2 libsqlite3-0 libz3-4 \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Zig
RUN curl -L "https://ziglang.org/download/0.14.1/zig-x86_64-linux-0.14.1.tar.xz" -o /tmp/zig.tar.xz \
    && mkdir -p /opt/zig && tar -xf /tmp/zig.tar.xz -C /opt/zig --strip-components=1 \
    && rm /tmp/zig.tar.xz
ENV PATH="/opt/zig:${PATH}"

# Install Swift
RUN curl -L "https://download.swift.org/swift-6.1.2-release/ubuntu2404/swift-6.1.2-RELEASE/swift-6.1.2-RELEASE-ubuntu24.04.tar.gz" -o /tmp/swift.tar.gz \
    && mkdir -p /opt/swift && tar -xzf /tmp/swift.tar.gz -C /opt/swift --strip-components=2 \
    && rm /tmp/swift.tar.gz
ENV PATH="/opt/swift/bin:${PATH}"

WORKDIR /app
COPY package.json .
RUN npm install --production

COPY src/ src/
COPY public/ public/
COPY bin/ bin/

# Build all MCP servers
RUN echo "Building C++..." && cd src/mcp-servers/cpp && clang++ -O2 -std=c++17 -o mcp-grep-cpp main.cpp && ls -lh mcp-grep-cpp
RUN echo "Building Rust..." && cd src/mcp-servers/rust && cargo build --release 2>&1 | tail -1 && ls -lh target/release/mcp-grep-rust
RUN echo "Building Zig..." && cd src/mcp-servers/zig && zig build -Doptimize=ReleaseFast && ls -lh zig-out/bin/mcp-grep-zig
RUN echo "Building Swift..." && cd src/mcp-servers/swift && swiftc -O -o mcp-grep-swift main.swift && ls -lh mcp-grep-swift

RUN chmod +x bin/*.sh bin/*.js 2>/dev/null || true

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
