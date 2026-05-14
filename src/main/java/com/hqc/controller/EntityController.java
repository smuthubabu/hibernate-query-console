package com.hqc.controller;

import com.hqc.model.EntityInfo;
import com.hqc.service.EntityMetadataService;
import org.hibernate.SessionFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class EntityController {

    @Autowired
    private EntityMetadataService entityMetadataService;

    @Autowired
    private SessionFactory sessionFactory;

    @GetMapping("/entities")
    public ResponseEntity<List<EntityInfo>> getAllEntities() {
        return ResponseEntity.ok(entityMetadataService.getAllEntities());
    }

    @GetMapping("/entities/{name}")
    public ResponseEntity<?> getEntity(@PathVariable String name) {
        EntityInfo entity = entityMetadataService.getEntity(name);
        if (entity == null) {
            Map<String, String> error = new HashMap<>();
            error.put("error", "Entity not found: " + name);
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(entity);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> status = new HashMap<>();
        try {
            // Try to open and immediately close a session
            sessionFactory.openSession().close();
            status.put("status", "UP");
            status.put("message", "DB2 connection is healthy");
            status.put("entityCount", entityMetadataService.getAllEntities().size());
            return ResponseEntity.ok(status);
        } catch (Exception e) {
            status.put("status", "DOWN");
            status.put("message", e.getMessage());
            return ResponseEntity.status(503).body(status);
        }
    }
}
