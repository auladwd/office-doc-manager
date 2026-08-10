FROM node:18-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source files
COPY . .

# Create data directories
RUN mkdir -p /data/uploads

EXPOSE 3000

CMD ["node", "server.js"]
