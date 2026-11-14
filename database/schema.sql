-- ============================================================
-- SMART STUDENT DOCUMENT & ACADEMIC CLEARANCE PORTAL
-- DATABASE SCHEMA
-- ============================================================

CREATE DATABASE IF NOT EXISTS smart_student_portal
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE smart_student_portal;


-- ============================================================
-- 1. ROLES
-- ============================================================

CREATE TABLE roles (
                       id INT PRIMARY KEY AUTO_INCREMENT,
                       name VARCHAR(50) NOT NULL UNIQUE,
                       description VARCHAR(255),
                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 2. DEPARTMENTS
-- ============================================================

CREATE TABLE departments (
                             id INT PRIMARY KEY AUTO_INCREMENT,
                             name VARCHAR(100) NOT NULL UNIQUE,
                             code VARCHAR(20) NOT NULL UNIQUE,
                             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 3. SECTIONS
-- ============================================================

CREATE TABLE sections (
                          id INT PRIMARY KEY AUTO_INCREMENT,
                          name VARCHAR(100) NOT NULL UNIQUE,
                          code VARCHAR(50) NOT NULL UNIQUE,
                          description VARCHAR(255),
                          department_id INT NULL,
                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                          CONSTRAINT fk_sections_department
                              FOREIGN KEY (department_id)
                                  REFERENCES departments(id)
                                  ON DELETE SET NULL
                                  ON UPDATE CASCADE
);


-- ============================================================
-- 4. USERS
-- ============================================================

CREATE TABLE users (
                       id INT PRIMARY KEY AUTO_INCREMENT,

                       name VARCHAR(150) NOT NULL,

                       email VARCHAR(150) NOT NULL UNIQUE,

                       password_hash VARCHAR(255) NOT NULL,

                       role_id INT NOT NULL,

                       department_id INT NULL,

                       section_id INT NULL,

                       phone VARCHAR(20),

                       status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')
        DEFAULT 'ACTIVE',

                       last_login_at DATETIME NULL,

                       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,

                       CONSTRAINT fk_users_role
                           FOREIGN KEY (role_id)
                               REFERENCES roles(id)
                               ON UPDATE CASCADE,

                       CONSTRAINT fk_users_department
                           FOREIGN KEY (department_id)
                               REFERENCES departments(id)
                               ON DELETE SET NULL
                               ON UPDATE CASCADE,

                       CONSTRAINT fk_users_section
                           FOREIGN KEY (section_id)
                               REFERENCES sections(id)
                               ON DELETE SET NULL
                               ON UPDATE CASCADE
);


-- ============================================================
-- 5. STUDENTS
-- ============================================================

CREATE TABLE students (
                          id INT PRIMARY KEY AUTO_INCREMENT,

                          user_id INT NOT NULL UNIQUE,

                          roll_number VARCHAR(50) NOT NULL UNIQUE,

                          registration_number VARCHAR(100) NOT NULL UNIQUE,

                          department_id INT NOT NULL,

                          batch VARCHAR(20) NOT NULL,

                          admission_year YEAR NULL,

                          passing_year YEAR NULL,

                          hostel_status ENUM('HOSTELLER', 'DAY_SCHOLAR')
        DEFAULT 'DAY_SCHOLAR',

                          gender ENUM('MALE', 'FEMALE', 'OTHER') NULL,

                          date_of_birth DATE NULL,

                          address TEXT NULL,

                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,

                          CONSTRAINT fk_students_user
                              FOREIGN KEY (user_id)
                                  REFERENCES users(id)
                                  ON DELETE CASCADE
                                  ON UPDATE CASCADE,

                          CONSTRAINT fk_students_department
                              FOREIGN KEY (department_id)
                                  REFERENCES departments(id)
                                  ON UPDATE CASCADE
);


-- ============================================================
-- 6. DOCUMENT / SERVICE TYPES
-- ============================================================

CREATE TABLE document_types (
                                id INT PRIMARY KEY AUTO_INCREMENT,

                                name VARCHAR(150) NOT NULL UNIQUE,

                                code VARCHAR(50) NOT NULL UNIQUE,

                                description TEXT,

                                category ENUM(
        'CLEARANCE',
        'CERTIFICATE',
        'DOCUMENT',
        'FINANCIAL'
    ) NOT NULL,

                                requires_supporting_document BOOLEAN DEFAULT FALSE,

                                is_active BOOLEAN DEFAULT TRUE,

                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- 7. WORKFLOW DEFINITIONS
-- ============================================================

CREATE TABLE workflow_definitions (
                                      id INT PRIMARY KEY AUTO_INCREMENT,

                                      document_type_id INT NOT NULL,

                                      name VARCHAR(150) NOT NULL,

                                      description TEXT,

                                      version INT DEFAULT 1,

                                      is_active BOOLEAN DEFAULT TRUE,

                                      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                      CONSTRAINT fk_workflow_document_type
                                          FOREIGN KEY (document_type_id)
                                              REFERENCES document_types(id)
                                              ON DELETE CASCADE
                                              ON UPDATE CASCADE
);


-- ============================================================
-- 8. WORKFLOW STEPS
-- ============================================================

CREATE TABLE workflow_steps (
                                id INT PRIMARY KEY AUTO_INCREMENT,

                                workflow_id INT NOT NULL,

                                section_id INT NOT NULL,

                                step_order INT NOT NULL,

                                is_required BOOLEAN DEFAULT TRUE,

                                condition_type ENUM(
        'ALWAYS',
        'HOSTELLER_ONLY',
        'DAY_SCHOLAR_ONLY',
        'CONDITIONAL'
    ) DEFAULT 'ALWAYS',

                                condition_value VARCHAR(100) NULL,

                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                CONSTRAINT fk_workflow_steps_workflow
                                    FOREIGN KEY (workflow_id)
                                        REFERENCES workflow_definitions(id)
                                        ON DELETE CASCADE
                                        ON UPDATE CASCADE,

                                CONSTRAINT fk_workflow_steps_section
                                    FOREIGN KEY (section_id)
                                        REFERENCES sections(id)
                                        ON UPDATE CASCADE,

                                UNIQUE(workflow_id, section_id)
);


-- ============================================================
-- 9. REQUESTS
-- ============================================================

CREATE TABLE requests (
                          id BIGINT PRIMARY KEY AUTO_INCREMENT,

                          request_number VARCHAR(50) NOT NULL UNIQUE,

                          student_id INT NOT NULL,

                          document_type_id INT NOT NULL,

                          workflow_id INT NULL,

                          status ENUM(
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'CLEARANCE_IN_PROGRESS',
        'CORRECTION_REQUIRED',
        'RESUBMITTED',
        'ALL_CLEARANCES_COMPLETED',
        'FINAL_REVIEW',
        'APPROVED',
        'REJECTED',
        'DOCUMENT_GENERATED',
        'CERTIFICATE_GENERATED',
        'COMPLETED'
    ) DEFAULT 'DRAFT',

                          current_step INT NULL,

                          submitted_at DATETIME NULL,

                          completed_at DATETIME NULL,

                          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,

                          CONSTRAINT fk_requests_student
                              FOREIGN KEY (student_id)
                                  REFERENCES students(id)
                                  ON UPDATE CASCADE,

                          CONSTRAINT fk_requests_document_type
                              FOREIGN KEY (document_type_id)
                                  REFERENCES document_types(id)
                                  ON UPDATE CASCADE,

                          CONSTRAINT fk_requests_workflow
                              FOREIGN KEY (workflow_id)
                                  REFERENCES workflow_definitions(id)
                                  ON DELETE SET NULL
                                  ON UPDATE CASCADE
);


-- ============================================================
-- 10. REQUEST DOCUMENTS
-- ============================================================

CREATE TABLE request_documents (
                                   id BIGINT PRIMARY KEY AUTO_INCREMENT,

                                   request_id BIGINT NOT NULL,

                                   uploaded_by INT NOT NULL,

                                   original_name VARCHAR(255) NOT NULL,

                                   stored_name VARCHAR(255) NOT NULL,

                                   file_path VARCHAR(500) NOT NULL,

                                   mime_type VARCHAR(100),

                                   file_size BIGINT,

                                   document_type VARCHAR(100),

                                   version INT DEFAULT 1,

                                   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                   CONSTRAINT fk_request_documents_request
                                       FOREIGN KEY (request_id)
                                           REFERENCES requests(id)
                                           ON DELETE CASCADE
                                           ON UPDATE CASCADE,

                                   CONSTRAINT fk_request_documents_user
                                       FOREIGN KEY (uploaded_by)
                                           REFERENCES users(id)
                                           ON UPDATE CASCADE
);


-- ============================================================
-- 11. NO-DUE REQUESTS
-- ============================================================

CREATE TABLE no_due_requests (
                                 id BIGINT PRIMARY KEY AUTO_INCREMENT,

                                 request_id BIGINT NOT NULL UNIQUE,

                                 overall_status ENUM(
        'SUBMITTED',
        'CLEARANCE_IN_PROGRESS',
        'CORRECTION_REQUIRED',
        'ALL_CLEARANCES_COMPLETED',
        'FINAL_REVIEW',
        'APPROVED',
        'CERTIFICATE_GENERATED',
        'COMPLETED',
        'REJECTED'
    ) DEFAULT 'SUBMITTED',

                                 total_tasks INT DEFAULT 0,

                                 completed_tasks INT DEFAULT 0,

                                 pending_tasks INT DEFAULT 0,

                                 correction_tasks INT DEFAULT 0,

                                 rejected_tasks INT DEFAULT 0,

                                 final_approved_by INT NULL,

                                 final_approved_at DATETIME NULL,

                                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,

                                 CONSTRAINT fk_no_due_request
                                     FOREIGN KEY (request_id)
                                         REFERENCES requests(id)
                                         ON DELETE CASCADE
                                         ON UPDATE CASCADE,

                                 CONSTRAINT fk_no_due_final_approver
                                     FOREIGN KEY (final_approved_by)
                                         REFERENCES users(id)
                                         ON DELETE SET NULL
                                         ON UPDATE CASCADE
);


-- ============================================================
-- 12. CLEARANCE TASKS
-- ============================================================

CREATE TABLE clearance_tasks (
                                 id BIGINT PRIMARY KEY AUTO_INCREMENT,

                                 no_due_request_id BIGINT NOT NULL,

                                 workflow_step_id INT NULL,

                                 section_id INT NOT NULL,

                                 assigned_to INT NULL,

                                 status ENUM(
        'NOT_REQUIRED',
        'PENDING',
        'UNDER_REVIEW',
        'CORRECTION_REQUIRED',
        'RESUBMITTED',
        'APPROVED',
        'REJECTED'
    ) DEFAULT 'PENDING',

                                 is_required BOOLEAN DEFAULT TRUE,

                                 remarks TEXT NULL,

                                 correction_reason TEXT NULL,

                                 started_at DATETIME NULL,

                                 completed_at DATETIME NULL,

                                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,

                                 CONSTRAINT fk_clearance_no_due
                                     FOREIGN KEY (no_due_request_id)
                                         REFERENCES no_due_requests(id)
                                         ON DELETE CASCADE
                                         ON UPDATE CASCADE,

                                 CONSTRAINT fk_clearance_workflow_step
                                     FOREIGN KEY (workflow_step_id)
                                         REFERENCES workflow_steps(id)
                                         ON DELETE SET NULL
                                         ON UPDATE CASCADE,

                                 CONSTRAINT fk_clearance_section
                                     FOREIGN KEY (section_id)
                                         REFERENCES sections(id)
                                         ON UPDATE CASCADE,

                                 CONSTRAINT fk_clearance_assigned_to
                                     FOREIGN KEY (assigned_to)
                                         REFERENCES users(id)
                                         ON DELETE SET NULL
                                         ON UPDATE CASCADE
);


-- ============================================================
-- 13. CLEARANCE ACTIONS
-- ============================================================

CREATE TABLE clearance_actions (
                                   id BIGINT PRIMARY KEY AUTO_INCREMENT,

                                   clearance_task_id BIGINT NOT NULL,

                                   action_by INT NOT NULL,

                                   action ENUM(
        'OPENED',
        'APPROVED',
        'REQUESTED_CORRECTION',
        'REJECTED',
        'RESUBMITTED'
    ) NOT NULL,

                                   remarks TEXT NULL,

                                   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                   CONSTRAINT fk_clearance_actions_task
                                       FOREIGN KEY (clearance_task_id)
                                           REFERENCES clearance_tasks(id)
                                           ON DELETE CASCADE
                                           ON UPDATE CASCADE,

                                   CONSTRAINT fk_clearance_actions_user
                                       FOREIGN KEY (action_by)
                                           REFERENCES users(id)
                                           ON UPDATE CASCADE
);


-- ============================================================
-- 14. REQUEST STATUS HISTORY
-- ============================================================

CREATE TABLE request_status_history (
                                        id BIGINT PRIMARY KEY AUTO_INCREMENT,

                                        request_id BIGINT NOT NULL,

                                        changed_by INT NULL,

                                        old_status VARCHAR(50),

                                        new_status VARCHAR(50) NOT NULL,

                                        remarks TEXT NULL,

                                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                        CONSTRAINT fk_status_history_request
                                            FOREIGN KEY (request_id)
                                                REFERENCES requests(id)
                                                ON DELETE CASCADE
                                                ON UPDATE CASCADE,

                                        CONSTRAINT fk_status_history_user
                                            FOREIGN KEY (changed_by)
                                                REFERENCES users(id)
                                                ON DELETE SET NULL
                                                ON UPDATE CASCADE
);


-- ============================================================
-- 15. CERTIFICATES
-- ============================================================

CREATE TABLE certificates (
                              id BIGINT PRIMARY KEY AUTO_INCREMENT,

                              request_id BIGINT NOT NULL UNIQUE,

                              certificate_number VARCHAR(100) NOT NULL UNIQUE,

                              certificate_type VARCHAR(100) NOT NULL,

                              student_name VARCHAR(150) NOT NULL,

                              roll_number VARCHAR(50) NOT NULL,

                              registration_number VARCHAR(100) NOT NULL,

                              department_name VARCHAR(100) NOT NULL,

                              issue_date DATE NOT NULL,

                              file_path VARCHAR(500) NOT NULL,

                              qr_code_data TEXT,

                              generated_by INT NULL,

                              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                              CONSTRAINT fk_certificates_request
                                  FOREIGN KEY (request_id)
                                      REFERENCES requests(id)
                                      ON UPDATE CASCADE,

                              CONSTRAINT fk_certificates_user
                                  FOREIGN KEY (generated_by)
                                      REFERENCES users(id)
                                      ON DELETE SET NULL
                                      ON UPDATE CASCADE
);


-- ============================================================
-- 16. CERTIFICATE VERIFICATION
-- ============================================================

CREATE TABLE certificate_verifications (
                                           id BIGINT PRIMARY KEY AUTO_INCREMENT,

                                           certificate_id BIGINT NOT NULL,

                                           verification_count INT DEFAULT 0,

                                           last_verified_at DATETIME NULL,

                                           last_verified_ip VARCHAR(45) NULL,

                                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                                           CONSTRAINT fk_verification_certificate
                                               FOREIGN KEY (certificate_id)
                                                   REFERENCES certificates(id)
                                                   ON DELETE CASCADE
                                                   ON UPDATE CASCADE
);


-- ============================================================
-- 17. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
                               id BIGINT PRIMARY KEY AUTO_INCREMENT,

                               user_id INT NOT NULL,

                               request_id BIGINT NULL,

                               title VARCHAR(200) NOT NULL,

                               message TEXT NOT NULL,

                               type ENUM(
        'INFO',
        'SUCCESS',
        'WARNING',
        'ERROR'
    ) DEFAULT 'INFO',

                               is_read BOOLEAN DEFAULT FALSE,

                               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                               CONSTRAINT fk_notifications_user
                                   FOREIGN KEY (user_id)
                                       REFERENCES users(id)
                                       ON DELETE CASCADE
                                       ON UPDATE CASCADE,

                               CONSTRAINT fk_notifications_request
                                   FOREIGN KEY (request_id)
                                       REFERENCES requests(id)
                                       ON DELETE SET NULL
                                       ON UPDATE CASCADE
);


-- ============================================================
-- 18. AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
                            id BIGINT PRIMARY KEY AUTO_INCREMENT,

                            user_id INT NULL,

                            request_id BIGINT NULL,

                            action VARCHAR(100) NOT NULL,

                            entity_type VARCHAR(100),

                            entity_id BIGINT NULL,

                            description TEXT,

                            ip_address VARCHAR(45),

                            user_agent TEXT,

                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                            CONSTRAINT fk_audit_user
                                FOREIGN KEY (user_id)
                                    REFERENCES users(id)
                                    ON DELETE SET NULL
                                    ON UPDATE CASCADE,

                            CONSTRAINT fk_audit_request
                                FOREIGN KEY (request_id)
                                    REFERENCES requests(id)
                                    ON DELETE SET NULL
                                    ON UPDATE CASCADE
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_role
    ON users(role_id);

CREATE INDEX idx_users_department
    ON users(department_id);

CREATE INDEX idx_users_section
    ON users(section_id);

CREATE INDEX idx_students_department
    ON students(department_id);

CREATE INDEX idx_requests_student
    ON requests(student_id);

CREATE INDEX idx_requests_status
    ON requests(status);

CREATE INDEX idx_requests_document_type
    ON requests(document_type_id);

CREATE INDEX idx_requests_submitted
    ON requests(submitted_at);

CREATE INDEX idx_clearance_tasks_section
    ON clearance_tasks(section_id);

CREATE INDEX idx_clearance_tasks_status
    ON clearance_tasks(status);

CREATE INDEX idx_clearance_tasks_assigned
    ON clearance_tasks(assigned_to);

CREATE INDEX idx_notifications_user
    ON notifications(user_id);

CREATE INDEX idx_notifications_read
    ON notifications(is_read);

CREATE INDEX idx_audit_logs_request
    ON audit_logs(request_id);

CREATE INDEX idx_audit_logs_user
    ON audit_logs(user_id);

CREATE INDEX idx_certificates_number
    ON certificates(certificate_number);