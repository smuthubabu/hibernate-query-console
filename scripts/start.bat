@echo off
REM =============================================
REM HQL Query Console - Windows Start Script
REM =============================================

set APP_JAR=hibernate-query-console.jar
set APP_HOME=%~dp0..

REM Set JAVA_HOME to IBM JDK path (adjust as needed)
REM set JAVA_HOME=C:\IBM\java
REM set PATH=%JAVA_HOME%\bin;%PATH%

REM Set hibernate config path (adjust as needed)
set HIBERNATE_CONFIG=%APP_HOME%\config\hibernate.cfg.xml

REM DB2 library path
set DB2_LIB=C:\Program Files\IBM\SQLLIB\BIN

set JVM_ARGS=-Xms256m -Xmx768m
set JVM_ARGS=%JVM_ARGS% -Djava.library.path="%DB2_LIB%"
set JVM_ARGS=%JVM_ARGS% -Dhibernate.config.path="%HIBERNATE_CONFIG%"
set JVM_ARGS=%JVM_ARGS% -Dspring.config.location="%APP_HOME%\config\application.properties"

REM Adjust DH key size if using Adoptium (not needed for IBM JDK)
REM set JVM_ARGS=%JVM_ARGS% -Djdk.tls.ephemeralDHKeySize=2048

echo Starting HQL Query Console...
echo Config: %HIBERNATE_CONFIG%
echo.

java %JVM_ARGS% -jar "%APP_HOME%\%APP_JAR%"

pause
