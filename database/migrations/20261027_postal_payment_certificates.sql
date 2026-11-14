-- Run after database/schema.sql. These tables are used by the current controllers.
CREATE TABLE IF NOT EXISTS request_deliveries (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, request_id BIGINT NOT NULL UNIQUE,
 delivery_type ENUM('DIGITAL','POSTAL') NOT NULL DEFAULT 'DIGITAL', postal_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
 payment_status ENUM('NOT_REQUIRED','PENDING','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'NOT_REQUIRED', payment_id BIGINT NULL,
 delivery_status ENUM('NOT_REQUIRED','PENDING_PAYMENT','WAITING_FOR_CERTIFICATE','READY_FOR_DISPATCH','DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') NOT NULL DEFAULT 'NOT_REQUIRED',
 recipient_name VARCHAR(150) NULL, address_line1 VARCHAR(255) NULL, address_line2 VARCHAR(255) NULL, city VARCHAR(100) NULL, district VARCHAR(100) NULL, state VARCHAR(100) NULL, pincode VARCHAR(10) NULL, mobile VARCHAR(20) NULL,
 courier_name VARCHAR(100) NULL, tracking_number VARCHAR(150) NULL, dispatched_at DATETIME NULL, delivered_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_request_deliveries_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
 INDEX idx_delivery_queue (delivery_type,payment_status,delivery_status)
');

-- Compatibility repair: older installations may have a narrower delivery_status ENUM.
-- Payment reconciliation uses WAITING_FOR_CERTIFICATE when the certificate is not ready.
ALTER TABLE request_deliveries
  MODIFY COLUMN delivery_status ENUM(
    'NOT_REQUIRED','PENDING_PAYMENT','WAITING_FOR_CERTIFICATE',
    'READY_FOR_DISPATCH','DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED'
  ) NOT NULL DEFAULT 'NOT_REQUIRED';

CREATE TABLE IF NOT EXISTS payments (
 id BIGINT PRIMARY KEY AUTO_INCREMENT, request_id BIGINT NOT NULL,
 payment_type ENUM('POSTAL_FEE') NOT NULL DEFAULT 'POSTAL_FEE', amount DECIMAL(10,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'INR',
 payment_mode ENUM('TEST','UPI','CARD','NETBANKING','CASH','BANK_TRANSFER','OTHER') NOT NULL DEFAULT 'OTHER', gateway VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY', gateway_order_id VARCHAR(100) NULL UNIQUE,
 transaction_id VARCHAR(150) NULL UNIQUE, status ENUM('PENDING','SUCCESS','FAILED','REFUNDED') NOT NULL DEFAULT 'PENDING', paid_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_payments_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
 INDEX idx_payments_request (request_id,status,payment_type)
);


-- Tables used by the student request and staff-review controllers.
-- These were missing from the original base schema and caused POST /api/student/requests to return 500.
CREATE TABLE IF NOT EXISTS request_application_data (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 request_id BIGINT NOT NULL UNIQUE,
 application_data JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_request_application_data_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS request_staff_reviews (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 request_id BIGINT NOT NULL,
 section_id INT NOT NULL,
 assigned_to INT NULL,
 status ENUM('PENDING','UNDER_REVIEW','RESUBMITTED','APPROVED','CORRECTION_REQUIRED','REJECTED') NOT NULL DEFAULT 'PENDING',
 remarks TEXT NULL,
 correction_reason TEXT NULL,
 started_at DATETIME NULL,
 completed_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_request_staff_reviews_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT fk_request_staff_reviews_section FOREIGN KEY (section_id) REFERENCES sections(id) ON UPDATE CASCADE,
 CONSTRAINT fk_request_staff_reviews_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
 UNIQUE KEY uq_request_staff_reviews_request_section (request_id, section_id),
 INDEX idx_request_staff_reviews_queue (section_id, status, created_at)
);


-- Repair/ensure service routing sections exist even if the original seed was only partially run.
-- Safe to rerun: section.code is unique and existing records are updated in place.
INSERT INTO sections (name, code, description) VALUES
 ('Examination Section', 'EXAMINATION', 'Handles examination and academic record related services'),
 ('Establishment Section', 'ESTABLISHMENT', 'Handles establishment and administrative services')
ON DUPLICATE KEY UPDATE
 name = VALUES(name),
 description = VALUES(description);


-- Compatibility repair for databases where `payments` existed before this migration.
-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table. Add currency first
-- because payment_mode is positioned after it in the legacy schema.
SET @ssp_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN currency CHAR(3) NOT NULL DEFAULT \'INR\' AFTER amount',
    'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'currency'
);
PREPARE ssp_stmt FROM @ssp_sql;
EXECUTE ssp_stmt;
DEALLOCATE PREPARE ssp_stmt;

SET @ssp_sql = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE payments ADD COLUMN payment_mode ENUM(\'TEST\',\'UPI\',\'CARD\',\'NETBANKING\',\'CASH\',\'BANK_TRANSFER\',\'OTHER\') NOT NULL DEFAULT \'OTHER\' AFTER currency',
    'SELECT 1')
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_mode'
);
PREPARE ssp_stmt FROM @ssp_sql;
EXECUTE ssp_stmt;
DEALLOCATE PREPARE ssp_stmt;
