FROM node:22-slim

RUN apt-get update && apt-get install -y ripgrep python3 clang git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json .
RUN npm install --production

COPY src/ src/
COPY public/ public/
COPY bin/ bin/

# Build C++ server
RUN cd src/mcp-servers/cpp && clang++ -O2 -std=c++17 -o mcp-grep-cpp main.cpp

RUN chmod +x bin/*.sh bin/*.js

ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
