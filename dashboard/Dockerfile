# Stage 1: Build
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from Stage 1 to Nginx folder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config (we will create this in the next step)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
