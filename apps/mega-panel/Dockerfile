FROM node:20-alpine

WORKDIR /app/apps/mega-panel
ENV NEXT_TELEMETRY_DISABLED=1

COPY apps/mega-panel/package*.json ./

# Copy the Mega Panel source. The docker-compose dev service also mounts this folder.
COPY apps/mega-panel ./

EXPOSE 3001
CMD ["npm", "run", "dev"]
