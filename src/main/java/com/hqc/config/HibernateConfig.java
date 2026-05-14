package com.hqc.config;

import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;

import java.io.File;

@org.springframework.context.annotation.Configuration
public class HibernateConfig {

    private static final Logger log = LoggerFactory.getLogger(HibernateConfig.class);

    @Value("${hibernate.config.path:config/hibernate.cfg.xml}")
    private String hibernateConfigPath;

    @Value("${hibernate.mapping.dir:config/mappings}")
    private String mappingDir;

    @Bean
    public SessionFactory sessionFactory() {
        try {
            log.info("Loading Hibernate config from: {}", hibernateConfigPath);
            File configFile = new File(hibernateConfigPath);
            if (!configFile.exists()) {
                throw new RuntimeException("hibernate.cfg.xml not found at: " + hibernateConfigPath);
            }

            StandardServiceRegistry registry = new StandardServiceRegistryBuilder()
                .configure(configFile)
                .build();

            MetadataSources sources = new MetadataSources(registry);

            File mappingDirectory = new File(mappingDir);
            if (mappingDirectory.exists() && mappingDirectory.isDirectory()) {
                File[] files = mappingDirectory.listFiles((d, name) -> name.endsWith(".hbm.xml"));
                if (files != null) {
                    for (File f : files) {
                        log.debug("Loading mapping: {}", f.getName());
                        sources.addFile(f);
                    }
                    log.info("Loaded {} mapping files from {}", files.length, mappingDirectory.getPath());
                }
            }

            SessionFactory sf = sources.buildMetadata().buildSessionFactory();
            log.info("SessionFactory created successfully!");
            return sf;

        } catch (Exception e) {
            log.error("Failed to create SessionFactory: {}", e.getMessage(), e);
            throw new RuntimeException("Hibernate initialization failed", e);
        }
    }
}
