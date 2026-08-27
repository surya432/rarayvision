# Stage 1: Build the Vue.js SPA
FROM node:22-alpine3.19 AS build-stage

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ARG VITE_API_BASE_URL

# Proxy untuk npm (Node.js)
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTP_PROXY
ENV no_proxy=$NO_PROXY

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:1.25-alpine

# Copy built assets from build-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8001

CMD ["nginx", "-g", "daemon off;"]
