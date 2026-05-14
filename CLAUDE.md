# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A web-based Hibernate HQL query console — a Spring Boot app that lets users run HQL (and native SQL) queries against a Hibernate 3.x / DB2 database via a browser UI. Intended as a replacement for Hibern8IDE.

## Build & Run

```bash
# Build
mvn clean package

# Run (Linux)
./scripts/start.sh

# Run (Windows)
scripts\start.bat

# Stop
./scripts/stop.sh
```

The JAR is self-contained; the frontend is embedded as static resources. App starts on `http://localhost:8080`.

There are no tests (`src/test/java` is empty).

## Required Setup Before First Run

1. Copy `config/hibernate.cfg.xml.template` to `config/hibernate.cfg.xml` and fill in DB2 connection details.
2. Optionally place additional `*.hbm.xml` mapping files in `config/mappings/` — they are auto-loaded.

Key `application.properties` settings (all overridable via `-D` or env):
- `server.port=8080`
- `hibernate.config.path=config/hibernate.cfg.xml`
- `query.timeout.seconds=30`
- `query.max.results=1000`
- `query.readonly.mode=false`

## Architecture

**Backend:** Spring Boot 2.7 REST API (Java 8 target), Hibernate 3.6.10 (legacy), DB2 JDBC (jcc 11.5.9.0). No Spring Data JPA — Hibernate `SessionFactory` is managed manually.

**Frontend:** Single-page app (`src/main/resources/static/index.html` + `js/app.js`). Pure AJAX calls to the REST API. Uses CodeMirror for HQL syntax highlighting.

### Key Packages (`com.hqc`)

| Package | Responsibility |
|---|---|
| `config.HibernateConfig` | Builds the `SessionFactory` from `hibernate.cfg.xml` and auto-loads `config/mappings/*.hbm.xml` |
| `controller.HqlController` | REST endpoints for query execution (`/api/query/*`) |
| `controller.EntityController` | REST endpoints for entity metadata (`/api/entities`, `/api/health`) |
| `service.HqlExecutionService` | Core query logic: HQL execution, SQL generation, native SQL execution, read-only enforcement |
| `service.EntityMetadataService` | Loads and caches entity/field metadata from Hibernate's `ClassMetadata` |
| `model.*` | DTOs: `QueryRequest`, `QueryResult`, `EntityInfo`, `FieldInfo` |
| `exception.GlobalExceptionHandler` | Catches all unhandled exceptions, returns HTTP 500 with `errorDetail` |

### REST API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/query/execute` | Run an HQL query |
| POST | `/api/query/sql` | Get generated SQL for an HQL query |
| POST | `/api/query/execute-sql` | Run native SQL |
| POST | `/api/query/validate` | Validate HQL syntax only |
| GET | `/api/entities` | List all mapped entities |
| GET | `/api/entities/{name}` | Get entity details (fields, table name) |
| GET | `/api/health` | Health check (returns entity count) |

### Request/Response Shape

`QueryRequest` carries: `query` (HQL/SQL string), `maxResults`, `firstResult`, `readOnly`.  
`QueryResult` carries: `success`, `rows` (list of maps), `columns`, `executionTimeMs`, `generatedSql`, `errorDetail`.

### Important Constraints

- `HqlConsoleApplication` excludes `DataSourceAutoConfiguration` and `HibernateJpaAutoConfiguration` — Spring Boot's auto-config for JPA/datasource is intentionally disabled. All Hibernate setup is in `HibernateConfig`.
- Read-only mode (`query.readonly.mode=true`) blocks any HQL/SQL containing UPDATE, DELETE, or INSERT at the service layer.
- SQL generation uses Hibernate's internal `QueryPlanCache` / `CriteriaImpl` — this is Hibernate 3.x API, not JPA.
- JVM is started with `-Xms256m -Xmx768m` by the start scripts; keep heap constraints in mind when tuning result sizes.

## Sample Entities

`com.example.report` contains `ReportDefinitionBO` and `ReportScheduleBO` with their `.hbm.xml` mappings — these exist purely as a usage example and are not part of the core console logic.