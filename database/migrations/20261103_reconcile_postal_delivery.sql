-- Reconcile postal delivery records with authoritative POSTAL_FEE payment records.
-- Safe to rerun. A successful postal payment proves that the student selected physical delivery.
ALTER TABLE request_deliveries
  MODIFY COLUMN delivery_status ENUM(
    'NOT_REQUIRED','PENDING_PAYMENT','WAITING_FOR_CERTIFICATE',
    'READY_FOR_DISPATCH','DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED'
  ) NOT NULL DEFAULT 'NOT_REQUIRED';

UPDATE request_deliveries rd
JOIN (
  SELECT request_id,
         MAX(status = 'SUCCESS') AS has_success,
         MAX(status = 'PENDING') AS has_pending,
         MAX(status = 'FAILED') AS has_failed,
         MAX(amount) AS paid_fee
  FROM payments
  WHERE payment_type = 'POSTAL_FEE'
  GROUP BY request_id
) p ON p.request_id = rd.request_id
SET rd.delivery_type = 'POSTAL',
    rd.postal_fee = COALESCE(NULLIF(p.paid_fee, 0), 200.00),
    rd.payment_status = CASE
      WHEN p.has_success = 1 THEN 'PAID'
      WHEN p.has_pending = 1 THEN 'PENDING'
      WHEN p.has_failed = 1 THEN 'FAILED'
      ELSE rd.payment_status
    END,
    rd.delivery_status = CASE
      WHEN rd.delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') THEN rd.delivery_status
      WHEN p.has_success = 1 AND EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = rd.request_id) THEN 'READY_FOR_DISPATCH'
      WHEN p.has_success = 1 THEN 'WAITING_FOR_CERTIFICATE'
      WHEN p.has_pending = 1 OR p.has_failed = 1 THEN 'PENDING_PAYMENT'
      ELSE rd.delivery_status
    END;

-- Create a delivery row if an older request has a postal payment but no delivery row.
-- Address fields remain NULL if the original address was never stored; do not invent them.
INSERT INTO request_deliveries (
  request_id, delivery_type, postal_fee, payment_status, delivery_status
)
SELECT p.request_id,
       'POSTAL',
       COALESCE(NULLIF(MAX(p.amount), 0), 200.00),
       CASE WHEN MAX(p.status = 'SUCCESS') = 1 THEN 'PAID'
            WHEN MAX(p.status = 'PENDING') = 1 THEN 'PENDING'
            WHEN MAX(p.status = 'FAILED') = 1 THEN 'FAILED'
            ELSE 'PENDING' END,
       CASE WHEN MAX(p.status = 'SUCCESS') = 1 AND EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = p.request_id) THEN 'READY_FOR_DISPATCH'
            WHEN MAX(p.status = 'SUCCESS') = 1 THEN 'WAITING_FOR_CERTIFICATE'
            ELSE 'PENDING_PAYMENT' END
FROM payments p
LEFT JOIN request_deliveries rd ON rd.request_id = p.request_id
WHERE p.payment_type = 'POSTAL_FEE'
  AND rd.id IS NULL
GROUP BY p.request_id;
