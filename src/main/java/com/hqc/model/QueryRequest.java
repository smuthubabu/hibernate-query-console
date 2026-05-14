package com.hqc.model;

import java.util.List;

public class QueryRequest {
    private String hql;
    private int maxResults = 100;
    private int firstResult = 0;
    private boolean readOnly = true;

    public String getHql() { return hql; }
    public void setHql(String hql) { this.hql = hql; }
    public int getMaxResults() { return maxResults; }
    public void setMaxResults(int maxResults) { this.maxResults = maxResults; }
    public int getFirstResult() { return firstResult; }
    public void setFirstResult(int firstResult) { this.firstResult = firstResult; }
    public boolean isReadOnly() { return readOnly; }
    public void setReadOnly(boolean readOnly) { this.readOnly = readOnly; }
}
