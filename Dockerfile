# docker file for otel refinery tester
FROM node:latest

WORKDIR /app

RUN apt-get update && apt-get install -y zstd && \
apt-get install -y --no-install-recommends \
build-essential

COPY package.json .
# copy everything excluding node_modules
RUN mkdir runtime
COPY backend ./backend
COPY frontend ./frontend
COPY certs ./certs
COPY examples ./examples
COPY templates ./templates
COPY config.yaml .
RUN npm install

EXPOSE 3000
EXPOSE 3001

CMD ["npm", "run", "dev"]