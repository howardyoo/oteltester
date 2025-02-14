# OpenTelemetry Collector and Refinery Tester
![screenshot](./frontend/images/otel-tester-screen.png)
# What is it?
It's a simple web application that allows user to download, install, and test the Opentelemetry Collector, and Honeycomb Refinery together.

# Installation instructions
You can run the application locally using npm, run in the docker, run in the github codepace, or run in the gitpod.

## install zstd
- refinery communicates using zstd, so you need to have zstd library installed

for macos:
```
brew install zstd
```
(it may already be installed)
- also, link the zstd dylib to the path that npm looks for. Somehow, in macos, npm tries to look for the dylib in `/usr/local/lib/libzstd.1.dylib`, but the actual location is in `/opt/homebrew/Cellar/zstd/1.5.x/lib/libzstd.1.dylib`. The version number `x` can vary, so set it accordingly as such:

```
sudo ln -s /opt/homebrew/Cellar/zstd/1.5.6/lib/libzstd.1.5.6.dylib /usr/local/lib/libzstd.1.dylib
```

# Running the application locally
run the application using npm:
```
npm run
```
or
```
npm run dev
```

# Running the application in docker
Make sure you have docker installed.
run the following command to start the application:

```
./run.sh
```

To stop the application, run the following command:
```
./stop.sh
```

# Accessing the application
- use the browser to access the application at `http://localhost:3000/`
