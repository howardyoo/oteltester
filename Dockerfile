# docker file for otel refinery tester
FROM node:latest AS base

WORKDIR /app

RUN apt-get update && apt-get install -y zstd && \
apt-get install -y --no-install-recommends \
build-essential

COPY package.json .
RUN npm install

# stage 2
FROM base AS derived

WORKDIR /app
# copy everything excluding node_modules
RUN mkdir runtime
COPY backend ./backend
COPY frontend ./frontend
COPY certs ./certs
COPY examples ./examples
COPY templates ./templates
COPY config.yaml .

EXPOSE 3000
EXPOSE 3001

CMD ["npm", "run", "dev"]