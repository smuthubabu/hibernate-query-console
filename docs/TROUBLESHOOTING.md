# Troubleshooting Guide

## 1. DH Key Size 256 Error

**Error:**
```
java.security.InvalidAlgorithmParameterException:
DH key size must be multiple of 64, and can only range from 512 to 8192.
The specific key size 256 is not supported
ERRORCODE=-4223
```

**Cause:** Standard Java (Adoptium/Oracle) hardcodes minimum DH key of 512.
DB2 JDBC driver uses 256-bit DH keys for encryption.

**Fix:** Use IBM JDK 8 or IBM Semeru Certified Edition.
- IBM JDK 8: https://www.ibm.com/support/pages/java-sdk-downloads
- IBM Semeru: https://developer.ibm.com/languages/java/semeru-runtimes/downloads/

Verify with: `java -version` → should say "IBM" not "Temurin" or "OpenJDK"

---

## 2. Cannot find hibernate.cfg.xml

**Error:**
```
hibernate.cfg.xml not found at: config/hibernate.cfg.xml
```

**Fix:**
```bash
# Option A: Set environment variable
export HIBERNATE_CONFIG=/path/to/your/hibernate.cfg.xml
./scripts/start.sh

# Option B: Use application.properties
hibernate.config.path=/full/path/to/hibernate.cfg.xml

# Option C: Copy your file
cp /your/project/hibernate.cfg.xml config/hibernate.cfg.xml
```

---

## 3. db2jcct2.dll / UnsatisfiedLinkError

**Error:**
```
Failure in loading native library db2jcct2
java.lang.UnsatisfiedLinkError: db2jcct2 (Not found in java.library.path)
ERRORCODE=-4472
```

**Cause:** Using Type 2 DB2 driver which needs native DLL.

**Fix:** Switch to Type 4 URL in hibernate.cfg.xml:
```xml
<!-- Type 4 format (no DLL needed) -->
<property name="connection.url">jdbc:db2://HOST:50000/DBNAME</property>
<property name="connection.driver_class">com.ibm.db2.jcc.DB2Driver</property>
```

---

## 4. No entities showing in browser

**Cause:** Hibernate mappings not loaded.

**Fix:** Ensure your hibernate.cfg.xml has mapping entries:
```xml
<mapping resource="com/example/MyEntity.hbm.xml"/>
```
Or set `hibernate.mapping.dir=path/to/hbm/files` in application.properties.

---

## 5. Connection Timeout / Cannot Open Connection

**Check:**
```bash
# Can you reach DB2 server?
telnet DB2_HOST 50000

# Try direct DB2 connect
db2 connect to DBNAME user USERNAME using PASSWORD
```

**Fix:** Check firewall, VPN, DB2 server status with your DBA.

---

## 6. SQL1031N Database directory not found

**Cause:** DB2 client not catalogued.

**Fix:**
```bash
db2 catalog tcpip node MYNODE remote DB2_HOST server 50000
db2 catalog database DBNAME at node MYNODE
db2 terminate
```

---

## 7. Port 8080 already in use

**Fix:**
```bash
# Change port in application.properties
server.port=9090

# Or find and kill process using 8080
lsof -i :8080
kill -9 PID
```
