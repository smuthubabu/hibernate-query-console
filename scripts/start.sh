#!/bin/bash
# =============================================
# HQL Query Console - Start Script
# =============================================

APP_NAME="hibernate-query-console"
APP_JAR="target/hibernate-query-console.jar"
APP_HOME="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$APP_HOME/logs/app.pid"
LOG_FILE="$APP_HOME/logs/hibernate-query-console.log"

# Create logs dir
mkdir -p "$APP_HOME/logs"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "[$APP_NAME] Already running with PID $PID"
        echo "Use stop.sh to stop it first."
        exit 1
    fi
fi

# Check JAVA_HOME
if [ -z "$JAVA_HOME" ]; then
    echo "[$APP_NAME] WARNING: JAVA_HOME not set, using system java"
    JAVA_CMD="java"
else
    JAVA_CMD="$JAVA_HOME/bin/java"
fi

echo "[$APP_NAME] Java: $($JAVA_CMD -version 2>&1 | head -1)"

# Check JAR exists
if [ ! -f "$APP_HOME/$APP_JAR" ]; then
    echo "[$APP_NAME] ERROR: JAR not found at $APP_HOME/$APP_JAR"
    echo "Build first with: mvn clean package"
    exit 1
fi

# Check hibernate config
HIBERNATE_CFG="${HIBERNATE_CONFIG:-$APP_HOME/config/hibernate.cfg.xml}"
if [ ! -f "$HIBERNATE_CFG" ]; then
    echo "[$APP_NAME] WARNING: hibernate.cfg.xml not found at $HIBERNATE_CFG"
    echo "Set HIBERNATE_CONFIG environment variable or copy to $APP_HOME/config/hibernate.cfg.xml"
fi

# JVM Args
JVM_ARGS="-Xms256m -Xmx768m"
JVM_ARGS="$JVM_ARGS -Dhibernate.config.path=$HIBERNATE_CFG"
JVM_ARGS="$JVM_ARGS -Dspring.config.location=$APP_HOME/config/application.properties"

# DB2 library path (adjust if needed)
if [ -d "/opt/ibm/db2/java" ]; then
    JVM_ARGS="$JVM_ARGS -Djava.library.path=/opt/ibm/db2/java"
fi

echo "[$APP_NAME] Starting on port 8080..."
echo "[$APP_NAME] Config: $HIBERNATE_CFG"
echo "[$APP_NAME] Logs: $LOG_FILE"

# Start app
nohup "$JAVA_CMD" $JVM_ARGS -jar "$APP_HOME/$APP_JAR" \
    >> "$LOG_FILE" 2>&1 &

PID=$!
echo $PID > "$PID_FILE"
echo "[$APP_NAME] Started with PID $PID"
echo "[$APP_NAME] Access at: http://localhost:8080"
echo "[$APP_NAME] Logs: tail -f $LOG_FILE"
