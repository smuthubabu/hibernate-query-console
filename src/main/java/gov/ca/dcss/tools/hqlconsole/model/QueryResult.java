package gov.ca.dcss.tools.hqlconsole.model;

import java.util.List;
import java.util.Map;

public class QueryResult {
    private boolean success;
    private String message;
    private List<Map<String, Object>> rows;
    private List<String> columns;
    private int totalRows;
    private long executionTimeMs;
    private String generatedSql;
    private String errorDetail;

    public static QueryResult success(List<Map<String, Object>> rows,
                                      List<String> columns,
                                      long execTime,
                                      String sql) {
        QueryResult r = new QueryResult();
        r.success = true;
        r.rows = rows;
        r.columns = columns;
        r.totalRows = rows.size();
        r.executionTimeMs = execTime;
        r.generatedSql = sql;
        return r;
    }

    public static QueryResult error(String message, String detail) {
        QueryResult r = new QueryResult();
        r.success = false;
        r.message = message;
        r.errorDetail = detail;
        return r;
    }

    public boolean isSuccess() { return success; }
    public String getMessage() { return message; }
    public List<Map<String, Object>> getRows() { return rows; }
    public List<String> getColumns() { return columns; }
    public int getTotalRows() { return totalRows; }
    public long getExecutionTimeMs() { return executionTimeMs; }
    public String getGeneratedSql() { return generatedSql; }
    public String getErrorDetail() { return errorDetail; }
}
