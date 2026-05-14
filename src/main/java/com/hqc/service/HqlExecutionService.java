package com.hqc.service;

import com.hqc.model.QueryRequest;
import com.hqc.model.QueryResult;
import org.hibernate.*;
import org.hibernate.engine.SessionFactoryImplementor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.lang.reflect.Field;
import java.util.*;

@Service
public class HqlExecutionService {

    private static final Logger log = LoggerFactory.getLogger(HqlExecutionService.class);

    @Autowired
    private SessionFactory sessionFactory;

    @Value("${query.timeout.seconds:30}")
    private int queryTimeout;

    @Value("${query.max.results:1000}")
    private int maxAllowedResults;

    @Value("${query.readonly.mode:false}")
    private boolean globalReadOnly;

    public QueryResult execute(QueryRequest request) {
        long start = System.currentTimeMillis();

        // Safety check for read-only mode
        if (globalReadOnly || request.isReadOnly()) {
            String hqlLower = request.getHql().trim().toLowerCase();
            if (hqlLower.startsWith("update") ||
                hqlLower.startsWith("delete") ||
                hqlLower.startsWith("insert")) {
                return QueryResult.error(
                    "Read-only mode is enabled. UPDATE/DELETE/INSERT not allowed.",
                    "Disable read-only mode in settings to run DML queries."
                );
            }
        }

        Session session = null;
        Transaction tx = null;
        try {
            session = sessionFactory.openSession();
            tx = session.beginTransaction();

            Query query = session.createQuery(request.getHql());
            query.setTimeout(queryTimeout);

            int max = Math.min(request.getMaxResults(), maxAllowedResults);
            query.setMaxResults(max);
            query.setFirstResult(request.getFirstResult());

            List<?> rawResults = query.list();

            // Generate SQL
            String sql = generateSql(request.getHql());

            // Convert results to maps
            List<Map<String, Object>> rows = new ArrayList<>();
            List<String> columns = new ArrayList<>();
            boolean columnsSet = false;

            for (Object row : rawResults) {
                Map<String, Object> rowMap = objectToMap(row);
                if (!columnsSet) {
                    columns.addAll(rowMap.keySet());
                    columnsSet = true;
                }
                rows.add(rowMap);
            }

            tx.rollback(); // Always rollback - we're read-only by default
            long elapsed = System.currentTimeMillis() - start;
            log.info("Query executed in {}ms, {} rows returned", elapsed, rows.size());
            return QueryResult.success(rows, columns, elapsed, sql);

        } catch (HibernateException e) {
            if (tx != null) try { tx.rollback(); } catch (Exception ignored) {}
            log.error("HQL execution error: {}", e.getMessage());
            return QueryResult.error(e.getMessage(), getStackTrace(e));
        } catch (Exception e) {
            if (tx != null) try { tx.rollback(); } catch (Exception ignored) {}
            log.error("Unexpected error: {}", e.getMessage());
            return QueryResult.error(e.getMessage(), getStackTrace(e));
        } finally {
            if (session != null) try { session.close(); } catch (Exception ignored) {}
        }
    }

    public QueryResult executeSql(String sql, int maxResults) {
        long start = System.currentTimeMillis();
        Session session = null;
        Transaction tx = null;
        try {
            session = sessionFactory.openSession();
            tx = session.beginTransaction();

            org.hibernate.SQLQuery query = session.createSQLQuery(sql);
            query.setTimeout(queryTimeout);
            query.setMaxResults(Math.min(maxResults, maxAllowedResults));
            query.setResultTransformer(org.hibernate.transform.Transformers.ALIAS_TO_ENTITY_MAP);

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> rawRows = query.list();

            List<Map<String, Object>> rows = new ArrayList<>();
            List<String> columns = new ArrayList<>();
            boolean columnsSet = false;
            for (Map<String, Object> raw : rawRows) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (Map.Entry<String, Object> entry : raw.entrySet()) {
                    row.put(entry.getKey(), safeValue(entry.getValue()));
                }
                if (!columnsSet) { columns.addAll(row.keySet()); columnsSet = true; }
                rows.add(row);
            }

            tx.rollback();
            long elapsed = System.currentTimeMillis() - start;
            log.info("SQL executed in {}ms, {} rows", elapsed, rows.size());
            return QueryResult.success(rows, columns, elapsed, sql);

        } catch (Exception e) {
            if (tx != null) try { tx.rollback(); } catch (Exception ignored) {}
            log.error("SQL execution error: {}", e.getMessage());
            return QueryResult.error(e.getMessage(), getStackTrace(e));
        } finally {
            if (session != null) try { session.close(); } catch (Exception ignored) {}
        }
    }

    public String generateSql(String hql) {
        // For simple "from EntityName [alias]" queries, use Criteria API so that
        // fetch="join" mappings produce the correct JOIN SQL.
        String criteriaSQL = tryGenerateSqlViaCriteria(hql);
        if (criteriaSQL != null) return criteriaSQL;

        // Complex HQL: fall back to HQL query plan (no DB hit needed)
        try {
            SessionFactoryImplementor sfi = (SessionFactoryImplementor) sessionFactory;
            org.hibernate.engine.query.HQLQueryPlan plan =
                sfi.getQueryPlanCache().getHQLQueryPlan(hql, false, Collections.emptyMap());
            String[] sqls = plan.getSqlStrings();
            if (sqls == null || sqls.length == 0) return "No SQL generated";
            return String.join("\n\n/* --- */\n\n", sqls);
        } catch (Exception e) {
            return "Could not generate SQL: " + e.getMessage();
        }
    }

    private String tryGenerateSqlViaCriteria(String hql) {
        String trimmed = hql.trim();
        String lower = trimmed.toLowerCase();
        // Only handle plain "from EntityName [alias]" — skip anything with clauses or joins
        if (!lower.startsWith("from ")) return null;
        if (lower.contains(" where ") || lower.contains(" order by ") ||
            lower.contains(" group by ") || lower.contains(" join ") ||
            lower.contains(",") || lower.contains("select ")) return null;

        String[] parts = trimmed.split("\\s+");
        if (parts.length < 2) return null;
        String entityShortName = parts[1];

        Class<?> entityClass = resolveEntityClass(entityShortName);
        if (entityClass == null) return null;

        SqlCapturingInterceptor interceptor = new SqlCapturingInterceptor();
        Session session = null;
        Transaction tx = null;
        try {
            session = ((SessionFactoryImplementor) sessionFactory).openSession(interceptor);
            tx = session.beginTransaction();
            session.createCriteria(entityClass).list();
            tx.rollback();
        } catch (Exception e) {
            if (tx != null) try { tx.rollback(); } catch (Exception ignored) {}
        } finally {
            if (session != null) try { session.close(); } catch (Exception ignored) {}
        }

        List<String> sqls = interceptor.getSqls();
        if (sqls.isEmpty()) return null;
        // Deduplicate — keep first occurrence of each unique SQL
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(sqls));
        return String.join("\n\n/* --- */\n\n", unique);
    }

    private Class<?> resolveEntityClass(String shortName) {
        SessionFactoryImplementor sfi = (SessionFactoryImplementor) sessionFactory;
        for (Object meta : sfi.getAllClassMetadata().values()) {
            org.hibernate.metadata.ClassMetadata m = (org.hibernate.metadata.ClassMetadata) meta;
            String entityName = m.getEntityName();
            if (entityName.equals(shortName) || entityName.endsWith("." + shortName)) {
                try { return Class.forName(entityName); } catch (ClassNotFoundException ignored) {}
            }
        }
        return null;
    }

    private static class SqlCapturingInterceptor extends org.hibernate.EmptyInterceptor {
        private final List<String> sqls = new ArrayList<>();
        @Override
        public String onPrepareStatement(String sql) {
            sqls.add(sql);
            return sql;
        }
        public List<String> getSqls() { return sqls; }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> objectToMap(Object obj) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (obj == null) {
            map.put("value", null);
            return map;
        }

        // Handle Object arrays (multiple return values)
        if (obj instanceof Object[]) {
            Object[] arr = (Object[]) obj;
            for (int i = 0; i < arr.length; i++) {
                map.put("col" + i, safeValue(arr[i]));
            }
            return map;
        }

        // Handle Maps
        if (obj instanceof Map) {
            Map<?, ?> m = (Map<?, ?>) obj;
            for (Map.Entry<?, ?> entry : m.entrySet()) {
                map.put(String.valueOf(entry.getKey()), safeValue(entry.getValue()));
            }
            return map;
        }

        // Handle primitives/strings
        if (isPrimitive(obj)) {
            map.put("value", obj);
            return map;
        }

        // Handle entity objects via reflection
        Class<?> cls = obj.getClass();
        while (cls != null && cls != Object.class) {
            for (Field field : cls.getDeclaredFields()) {
                try {
                    field.setAccessible(true);
                    Object val = field.get(obj);
                    map.put(field.getName(), safeValue(val));
                } catch (Exception ignored) {}
            }
            cls = cls.getSuperclass();
        }
        return map;
    }

    private Object safeValue(Object val) {
        if (val == null) return null;
        if (isPrimitive(val)) return val;
        if (val instanceof Date) return val.toString();
        // For complex objects, just return class name + toString
        try {
            return val.getClass().getSimpleName() + ": " + val.toString();
        } catch (Exception e) {
            return val.getClass().getSimpleName();
        }
    }

    private boolean isPrimitive(Object val) {
        return val instanceof String ||
               val instanceof Number ||
               val instanceof Boolean ||
               val instanceof Character;
    }

    private String getStackTrace(Exception e) {
        StringBuilder sb = new StringBuilder();
        sb.append(e.getClass().getName()).append(": ").append(e.getMessage()).append("\n");
        for (StackTraceElement el : e.getStackTrace()) {
            sb.append("\tat ").append(el.toString()).append("\n");
            if (sb.length() > 3000) { sb.append("... (truncated)"); break; }
        }
        return sb.toString();
    }
}
