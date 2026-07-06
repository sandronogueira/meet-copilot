# Build context = RAIZ do monorepo:
#   docker build -f services/meeting-engine/Dockerfile -t meeting-engine .
FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY services/meeting-engine/package.json services/meeting-engine/

RUN npm install --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY services/meeting-engine services/meeting-engine

ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "services/meeting-engine/src/index.ts"]
