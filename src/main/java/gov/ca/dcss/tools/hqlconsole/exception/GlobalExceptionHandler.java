package gov.ca.dcss.tools.hqlconsole.exception;

import gov.ca.dcss.tools.hqlconsole.model.QueryResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(Exception.class)
    public ResponseEntity<QueryResult> handleException(Exception e) {
        return ResponseEntity.status(500).body(
            QueryResult.error("Internal server error: " + e.getMessage(), e.toString())
        );
    }
}
