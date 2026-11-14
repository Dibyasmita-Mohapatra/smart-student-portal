-- Run this file against the existing project database. Safe to rerun.
-- Repairs legacy payments tables; CREATE TABLE IF NOT EXISTS alone cannot add columns.
SET @ssp_sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE payments ADD COLUMN currency CHAR(3) NOT NULL DEFAULT \'INR\' AFTER amount',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='currency');
PREPARE ssp_stmt FROM @ssp_sql; EXECUTE ssp_stmt; DEALLOCATE PREPARE ssp_stmt;

SET @ssp_sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE payments ADD COLUMN payment_mode ENUM(\'TEST\',\'UPI\',\'CARD\',\'NETBANKING\',\'CASH\',\'BANK_TRANSFER\',\'OTHER\') NOT NULL DEFAULT \'OTHER\' AFTER currency',
  'SELECT 1') FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='payment_mode');
PREPARE ssp_stmt FROM @ssp_sql; EXECUTE ssp_stmt; DEALLOCATE PREPARE ssp_stmt;
