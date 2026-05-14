# Hibernate Query Console

A web-based replacement for Hibern8IDE — run HQL queries against your
Hibernate 3.x / DB2 project from any browser.

## Features

- 🔷 Entity browser with field inspector
- ✏️ HQL editor with syntax highlighting (CodeMirror)
- ▶ Execute HQL queries and view results in a table
- 📄 View generated SQL
- 🔍 Object inspector — click any result row for full details
- ⏱ Query history (last 20 queries)
- ⭐ Save named queries
- ⬇ Export results as CSV or JSON
- 🌙 Dark mode
- 🔒 Read-only mode to prevent accidental DML

---

## Requirements

- **Java**: JDK 8+ (standard Adoptium/Oracle/OpenJDK all work)
- **DB2**: IBM DB2 with Type 4 JDBC driver (`db2jcc4.jar` or `jcc-11.5.9.0.jar`)
- **Maven**: 3.6+ for building

---

## Quick Start

### 1. Build
```bash
cd hibernate-query-console

# Add DB2 JARs to local Maven repo first (they're not on Maven Central)
mvn install:install-file -Dfile=/path/to/jcc-11.5.9.0.jar \
    -DgroupId=com.ibm.db2 -DartifactId=jcc -Dversion=11.5.9.0 -Dpackaging=jar

mvn install:install-file -Dfile=/path/to/db2jcc_license_cu.jar \
    -DgroupId=com.ibm.db2 -DartifactId=db2jcc_license_cu -Dversion=11.5.9.0 -Dpackaging=jar

mvn clean package
```

### 2. Configure
```bash
# Copy the template
cp config/hibernate.cfg.xml.template config/hibernate.cfg.xml

# Edit with your DB2 details
nano config/hibernate.cfg.xml
```

Fill in:
- `HOST` → your DB2 server hostname or IP
- `DATABASE` → your database name (e.g. CSE01)
- `YOUR_USERNAME` / `YOUR_PASSWORD`
- `YOUR_SCHEMA` → e.g. RMADDINE
- Add your `<mapping resource="..."/>` entries

### 3. Start
```bash
# Linux
chmod +x scripts/start.sh scripts/stop.sh
./scripts/start.sh

# Windows
scripts\start.bat
```

### 4. Open Browser
```
http://localhost:8080
```

---

## Configuration

Edit `config/application.properties`:

```properties
# Point to your hibernate.cfg.xml
hibernate.config.path=config/hibernate.cfg.xml

# Optional directory with extra .hbm.xml files
hibernate.mapping.dir=config/mappings

# Query safety limits
query.timeout.seconds=30
query.max.results=1000
query.readonly.mode=false

# Port
server.port=8080
```

---

## DB2 JAR Setup

The DB2 JDBC driver is NOT on Maven Central. You must install it locally:

```bash
# Install main driver
mvn install:install-file \
  -Dfile=/opt/ibm/jcc-11.5.9.0.jar \
  -DgroupId=com.ibm.db2 \
  -DartifactId=jcc \
  -Dversion=11.5.9.0 \
  -Dpackaging=jar

# Install license JAR
mvn install:install-file \
  -Dfile=/opt/ibm/db2jcc_license_cu.jar \
  -DgroupId=com.ibm.db2 \
  -DartifactId=db2jcc_license_cu \
  -Dversion=11.5.9.0 \
  -Dpackaging=jar
```

---

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for common issues including:
- DH key size 256 error
- Cannot find hibernate.cfg.xml
- db2jcct2.dll missing
- Connection timeout

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute query |
| Click entity | Insert basic HQL + expand fields |
| Click field | Insert field into SELECT |
| Click result row | Open object inspector |
