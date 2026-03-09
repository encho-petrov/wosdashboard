FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM openresty/openresty:alpine

COPY --from=builder /app/dist /usr/local/openresty/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["openresty", "-g", "daemon off;"]