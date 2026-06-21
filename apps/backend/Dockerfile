FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --workspaces=false

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 5000
CMD ["npm", "run", "start"]
