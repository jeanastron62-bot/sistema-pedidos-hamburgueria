# ---- Frontend ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
# Fase 15 -- Vite embute VITE_* no bundle em tempo de BUILD, não de runtime.
# Setar essas variáveis só no serviço do Railway não basta: precisam chegar
# aqui como build arg (Railway: Settings -> Build -> Variables). Sem elas, o
# botão "Conectar WhatsApp" sempre mostra "não configurado", mesmo em prod.
ARG VITE_META_APP_ID
ARG VITE_META_ES_CONFIG_ID
ENV VITE_META_APP_ID=$VITE_META_APP_ID
ENV VITE_META_ES_CONFIG_ID=$VITE_META_ES_CONFIG_ID
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Backend ----
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
COPY backend/prisma ./prisma
RUN npm ci
COPY backend/ ./
RUN npx prisma generate
RUN npm run build

# ---- Runtime ----
FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/package.json ./backend/package.json
COPY --from=backend-builder /app/backend/prisma ./backend/prisma
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
WORKDIR /app/backend
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
