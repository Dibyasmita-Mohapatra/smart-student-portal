-- Postal tracking event history for student-visible shipment updates.
-- Run once after 20261103_reconcile_postal_delivery.sql.
CREATE TABLE IF NOT EXISTS postal_tracking_events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  delivery_id BIGINT NOT NULL,
  status ENUM('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') NOT NULL,
  location VARCHAR(150) NULL,
  remarks VARCHAR(500) NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_postal_tracking_events_delivery
    FOREIGN KEY (delivery_id) REFERENCES request_deliveries(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_postal_tracking_events_user
    FOREIGN KEY (updated_by) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_postal_tracking_events_delivery_created (delivery_id, created_at)
);

-- Seed one visible event for shipments that were already dispatched before this feature.
INSERT INTO postal_tracking_events (delivery_id, status, location, remarks, created_at)
SELECT rd.id, rd.delivery_status, NULL,
       CASE WHEN rd.delivery_status = 'DELIVERED' THEN 'Delivery status recorded before tracking history was enabled'
            ELSE 'Dispatch status recorded before tracking history was enabled' END,
       COALESCE(rd.delivered_at, rd.dispatched_at, rd.updated_at)
FROM request_deliveries rd
WHERE rd.delivery_type = 'POSTAL'
  AND rd.tracking_number IS NOT NULL
  AND rd.tracking_number <> ''
  AND rd.delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED')
  AND NOT EXISTS (
    SELECT 1 FROM postal_tracking_events e WHERE e.delivery_id = rd.id
  );
