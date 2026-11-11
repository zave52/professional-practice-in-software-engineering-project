# syntax=docker/dockerfile:1
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    PORT=5000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src ./src
USER node
EXPOSE 5000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
