package gov.ca.dcss.tools.hqlconsole.model;

public class FieldInfo {
    private String name;
    private String type;
    private String columnName;
    private boolean isId;
    private boolean isAssociation;

    public FieldInfo(String name, String type, String columnName, boolean isId, boolean isAssociation) {
        this.name = name;
        this.type = type;
        this.columnName = columnName;
        this.isId = isId;
        this.isAssociation = isAssociation;
    }

    public String getName() { return name; }
    public String getType() { return type; }
    public String getColumnName() { return columnName; }
    public boolean isId() { return isId; }
    public boolean isAssociation() { return isAssociation; }
}
