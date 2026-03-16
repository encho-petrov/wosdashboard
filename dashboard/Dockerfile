FROM node:18-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package*.json ./

FROM base AS development
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

FROM base AS builder
RUN npm ci
COPY . .

ARG BUILD_MODE=production
RUN npm run build -- --mode $BUILD_MODE

FROM openresty/openresty:alpine AS production
COPY --from=builder /app/dist /usr/local/openresty/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["openresty", "-g", "daemon off;"]