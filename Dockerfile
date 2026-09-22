FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data/uploads
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
VOLUME ["/data"]
CMD ["node", "server.js"]
