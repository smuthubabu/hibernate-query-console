package com.hqc.service;

import com.hqc.model.EntityInfo;
import com.hqc.model.FieldInfo;
import jakarta.annotation.PostConstruct;
import jakarta.persistence.metamodel.Attribute;
import jakarta.persistence.metamodel.EntityType;
import jakarta.persistence.metamodel.SingularAttribute;
import org.hibernate.SessionFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class EntityMetadataService {

    private static final Logger log = LoggerFactory.getLogger(EntityMetadataService.class);

    @Autowired
    private SessionFactory sessionFactory;

    private List<EntityInfo> entityCache;

    @PostConstruct
    public void init() {
        try {
            entityCache = buildEntityList();
            log.info("Loaded {} entities from Hibernate metadata", entityCache.size());
        } catch (Exception e) {
            log.warn("Could not pre-load entity metadata: {}", e.getMessage());
            entityCache = new ArrayList<>();
        }
    }

    public List<EntityInfo> getAllEntities() {
        return entityCache;
    }

    public EntityInfo getEntity(String className) {
        for (EntityInfo e : entityCache) {
            if (e.getClassName().equals(className) ||
                e.getSimpleClassName().equals(className)) {
                return e;
            }
        }
        return null;
    }

    private List<EntityInfo> buildEntityList() {
        List<EntityInfo> list = new ArrayList<>();

        for (EntityType<?> entityType : sessionFactory.getMetamodel().getEntities()) {
            String className = entityType.getJavaType().getName();
            List<FieldInfo> fields = new ArrayList<>();

            // ID attributes first
            entityType.getSingularAttributes().stream()
                .filter(SingularAttribute::isId)
                .forEach(sa -> fields.add(new FieldInfo(
                    sa.getName(),
                    sa.getJavaType().getSimpleName(),
                    sa.getName(),
                    true,
                    false
                )));

            // Non-ID attributes
            Set<String> idNames = new HashSet<>();
            entityType.getSingularAttributes().stream()
                .filter(SingularAttribute::isId)
                .forEach(sa -> idNames.add(sa.getName()));

            for (Attribute<?, ?> attr : entityType.getAttributes()) {
                if (idNames.contains(attr.getName())) continue;
                fields.add(new FieldInfo(
                    attr.getName(),
                    attr.getJavaType().getSimpleName(),
                    attr.getName(),
                    false,
                    attr.isAssociation()
                ));
            }

            list.add(new EntityInfo(className, entityType.getName(), fields));
        }

        list.sort(Comparator.comparing(EntityInfo::getClassName));
        return list;
    }
}
