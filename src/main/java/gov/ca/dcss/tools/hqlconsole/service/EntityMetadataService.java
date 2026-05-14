package gov.ca.dcss.tools.hqlconsole.service;

import gov.ca.dcss.tools.hqlconsole.model.EntityInfo;
import gov.ca.dcss.tools.hqlconsole.model.FieldInfo;
import org.hibernate.SessionFactory;
import org.hibernate.metadata.ClassMetadata;
import org.hibernate.type.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
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

    @SuppressWarnings("unchecked")
    private List<EntityInfo> buildEntityList() {
        List<EntityInfo> list = new ArrayList<>();
        Map<String, ClassMetadata> allMeta = sessionFactory.getAllClassMetadata();

        for (Map.Entry<String, ClassMetadata> entry : allMeta.entrySet()) {
            String className = entry.getKey();
            ClassMetadata meta = entry.getValue();

            List<FieldInfo> fields = new ArrayList<>();

            // ID property
            String idName = meta.getIdentifierPropertyName();
            if (idName != null) {
                Type idType = meta.getIdentifierType();
                fields.add(new FieldInfo(
                    idName,
                    idType != null ? idType.getName() : "unknown",
                    idName,
                    true,
                    false
                ));
            }

            // Other properties
            String[] propNames = meta.getPropertyNames();
            Type[] propTypes = meta.getPropertyTypes();

            for (int i = 0; i < propNames.length; i++) {
                String propName = propNames[i];
                Type propType = propTypes[i];
                boolean isAssoc = propType instanceof AssociationType;

                fields.add(new FieldInfo(
                    propName,
                    propType != null ? propType.getName() : "unknown",
                    propName,
                    false,
                    isAssoc
                ));
            }

            String tableName = meta.getEntityName();
            list.add(new EntityInfo(className, tableName, fields));
        }

        // Sort by class name
        list.sort(Comparator.comparing(EntityInfo::getClassName));
        return list;
    }
}
