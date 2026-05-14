package com.example.report;

import java.io.Serializable;
import java.util.Date;

public class ReportScheduleBO implements Serializable {

    private Long scheduleId;
    private ReportDefinitionBO reportDefinition;
    private String cronExpression;
    private String status;
    private Date nextRunDate;
    private Date lastRunDate;
    private String createdBy;

    public Long getScheduleId() { return scheduleId; }
    public void setScheduleId(Long scheduleId) { this.scheduleId = scheduleId; }

    public ReportDefinitionBO getReportDefinition() { return reportDefinition; }
    public void setReportDefinition(ReportDefinitionBO reportDefinition) { this.reportDefinition = reportDefinition; }

    public String getCronExpression() { return cronExpression; }
    public void setCronExpression(String cronExpression) { this.cronExpression = cronExpression; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Date getNextRunDate() { return nextRunDate; }
    public void setNextRunDate(Date nextRunDate) { this.nextRunDate = nextRunDate; }

    public Date getLastRunDate() { return lastRunDate; }
    public void setLastRunDate(Date lastRunDate) { this.lastRunDate = lastRunDate; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
}