package com.hqc.service;

import com.hqc.model.QueryRequest;
import com.hqc.model.QueryResult;
import jakarta.persistence.Tuple;
import jakarta.persistence.TupleElement;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import org.hibernate.HibernateException;
import org.hibernate.Session;
import org.hibernate.SessionFactory;
import org.hibernate.Transaction;
import org.hibernate.query.NativeQuery;
import org.hibernate.resource.jdbc.spi.StatementInspector;
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

            @SuppressWarnings({"unchecked", "rawtypes"})
            org.hibernate.query.Query query = session.createQuery(request.getHql());
            query.setTimeout(queryTimeout);

            int max = Math.min(request.getMaxResults(), maxAllowedResults);
            query.setMaxResults(max);
            query.setFirstResult(request.getFirstResult());

            List<?> rawResults = query.list();
            String sql = generateSql(request.getHql());

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

            tx.rollback();
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

            NativeQuery<Tuple> query = session.createNativeQuery(sql, Tuple.class);
            query.setTimeout(queryTimeout);
            query.setMaxResults(Math.min(maxResults, maxAllowedResults));

            List<Tuple> rawRows = query.getResultList();
            List<Map<String, Object>> rows = new ArrayList<>();
            List<String> columns = new ArrayList<>();
            boolean columnsSet = false;

            for (Tuple tuple : rawRows) {
                Map<String, Object> row = new LinkedHashMap<>();
                List<TupleElement<?>> elements = tuple.getElements();
                for (int i = 0; i < elements.size(); i++) {
                    String alias = elements.get(i).getAlias() != null
                        ? elements.get(i).getAlias() : "col" + i;
                    row.put(alias, safeValue(tuple.get(i)));
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
        String criteriaSQL = tryGenerateSqlViaCriteria(hql);
        if (criteriaSQL != null) return criteriaSQL;
        return captureHqlSql(hql);
    }

    private String captureHqlSql(String hql) {
        List<String> captured = new ArrayList<>();
        StatementInspector inspector = sql -> { captured.add(sql); return sql; };
        Session session = null;
        Transaction tx = null;
        try {
            session = sessionFactory.withOptions().statementInspector(inspector).openSession();
            tx = session.beginTransaction();
            session.createQuery(hql).setMaxResults(1).list();
            tx.rollback();
        } catch (Exception e) {
            if (tx != null) try { tx.rollback(); } catch (Exception ignored) {}
            if (captured.isEmpty()) return "Could not generate SQL: " + e.getMessage();
        } finally {
            if (session != null) try { session.close(); } catch (Exception ignored) {}
        }
        if (captured.isEmpty()) return "No SQL generated";
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(captured));
        return String.join("\n\n/* --- */\n\n", unique);
    }

    private String tryGenerateSqlViaCriteria(String hql) {
        String trimmed = hql.trim();
        String lower = trimmed.toLowerCase();
        if (!lower.startsWith("from ")) return null;
        if (lower.contains(" where ") || lower.contains(" order by ") ||
            lower.contains(" group by ") || lower.contains(" join ") ||
            lower.contains(",") || lower.contains("select ")) return null;

        String[] parts = trimmed.split("\\s+");
        if (parts.length < 2) return null;
        String entityShortName = parts[1];

        Class<?> entityClass = resolveEntityClass(entityShortName);
        if (entityClass == null) return null;

        List<String> captured = new ArrayList<>();
        StatementInspector inspector = sql -> { captured.add(sql); return sql; };
        Session session = null;
        Transaction tx = null;
        try {
            session = sessionFactory.withOptions().statementInspector(inspector).openSession();
            tx = session.beginTransaction();
            CriteriaBuilder cb = session.getCriteriaBuilder();
            CriteriaQuery<?> cq = cb.createQuery(entityClass);
            cq.from(entityClass);
            session.createQuery(cq).getResultList();
            tx.rollback();
        } catch (Exception e) {
            if (tx != null) try { tx.rollback(); } catch (Exception ignored) {}
        } finally {
            if (session != null) try { session.close(); } catch (Exception ignored) {}
        }

        if (captured.isEmpty()) return null;
        List<String> unique = new ArrayList<>(new LinkedHashSet<>(captured));
        return String.join("\n\n/* --- */\n\n", unique);
    }

    private Class<?> resolveEntityClass(String shortName) {
        return sessionFactory.getMetamodel().getEntities().stream()
            .filter(e -> e.getName().equals(shortName) ||
                         e.getJavaType().getSimpleName().equals(shortName))
            .map(e -> (Class<?>) e.getJavaType())
            .findFirst()
            .orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> objectToMap(Object obj) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (obj == null) { map.put("value", null); return map; }

        if (obj instanceof Object[]) {
            Object[] arr = (Object[]) obj;
            for (int i = 0; i < arr.length; i++) map.put("col" + i, safeValue(arr[i]));
            return map;
        }
        if (obj instanceof Map) {
            ((Map<?, ?>) obj).forEach((k, v) -> map.put(String.valueOf(k), safeValue(v)));
            return map;
        }
        if (isPrimitive(obj)) { map.put("value", obj); return map; }

        Class<?> cls = obj.getClass();
        while (cls != null && cls != Object.class) {
            for (Field field : cls.getDeclaredFields()) {
                try {
                    field.setAccessible(true);
                    map.put(field.getName(), safeValue(field.get(obj)));
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
        try { return val.getClass().getSimpleName() + ": " + val; }
        catch (Exception e) { return val.getClass().getSimpleName(); }
    }

    private boolean isPrimitive(Object val) {
        return val instanceof String || val instanceof Number ||
               val instanceof Boolean || val instanceof Character;
    }

    private String getStackTrace(Exception e) {
        StringBuilder sb = new StringBuilder();
        sb.append(e.getClass().getName()).append(": ").append(e.getMessage()).append("\n");
        for (StackTraceElement el : e.getStackTrace()) {
            sb.append("\tat ").append(el).append("\n");
            if (sb.length() > 3000) { sb.append("... (truncated)"); break; }
        }
        return sb.toString();
    }
}
