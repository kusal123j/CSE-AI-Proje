FROM node:20-alpine

WORKDIR /app/apps/mega-panel
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy the Mega Panel source.
COPY . ./

EXPOSE 3001
CMD ["npm", "run", "dev"]
