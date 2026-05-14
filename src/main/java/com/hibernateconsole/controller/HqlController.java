package com.hibernateconsole.controller;

import com.hibernateconsole.model.QueryRequest;
import com.hibernateconsole.model.QueryResult;
import com.hibernateconsole.service.HqlExecutionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/query")
public class HqlController {

    @Autowired
    private HqlExecutionService hqlExecutionService;

    @PostMapping("/execute")
    public ResponseEntity<QueryResult> execute(@RequestBody QueryRequest request) {
        if (request.getHql() == null || request.getHql().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(
                QueryResult.error("HQL query cannot be empty", null)
            );
        }
        return ResponseEntity.ok(hqlExecutionService.execute(request));
    }

    @PostMapping("/sql")
    public ResponseEntity<Map<String, String>> getSql(@RequestBody QueryRequest request) {
        Map<String, String> response = new HashMap<>();
        try {
            String sql = hqlExecutionService.generateSql(request.getHql());
            response.put("sql", sql);
            response.put("success", "true");
        } catch (Exception e) {
            response.put("error", e.getMessage());
            response.put("success", "false");
        }
        return ResponseEntity.ok(response);
    }

    @PostMapping("/execute-sql")
    public ResponseEntity<QueryResult> executeSql(@RequestBody QueryRequest request) {
        if (request.getHql() == null || request.getHql().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(QueryResult.error("SQL cannot be empty", null));
        }
        return ResponseEntity.ok(hqlExecutionService.executeSql(request.getHql(), request.getMaxResults()));
    }

    @PostMapping("/validate")
    public ResponseEntity<Map<String, Object>> validate(@RequestBody QueryRequest request) {
        Map<String, Object> response = new HashMap<>();
        try {
            hqlExecutionService.generateSql(request.getHql());
            response.put("valid", true);
            response.put("message", "HQL syntax is valid");
        } catch (Exception e) {
            response.put("valid", false);
            response.put("message", e.getMessage());
        }
        return ResponseEntity.ok(response);
    }
}
