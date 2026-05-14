package gov.ca.dcss.tools.hqlconsole.model;

import java.util.List;

public class EntityInfo {
    private String className;
    private String simpleClassName;
    private String packageName;
    private String tableName;
    private List<FieldInfo> fields;

    public EntityInfo(String className, String tableName, List<FieldInfo> fields) {
        this.className = className;
        this.tableName = tableName;
        this.fields = fields;
        int lastDot = className.lastIndexOf('.');
        this.simpleClassName = lastDot >= 0 ? className.substring(lastDot + 1) : className;
        this.packageName = lastDot >= 0 ? className.substring(0, lastDot) : "";
    }

    public String getClassName() { return className; }
    public String getSimpleClassName() { return simpleClassName; }
    public String getPackageName() { return packageName; }
    public String getTableName() { return tableName; }
    public List<FieldInfo> getFields() { return fields; }
}
