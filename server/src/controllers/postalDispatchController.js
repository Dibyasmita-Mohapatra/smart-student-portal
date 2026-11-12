
const pool = require("../config/db");

const POSTAL_FEE = 200;

const getPostalDispatchQueue = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        rd.id AS deliveryId,
        rd.request_id AS requestId,
        r.request_number AS requestNumber,
        r.status AS requestStatus,

        s.roll_number AS rollNumber,
        s.registration_number AS registrationNumber,
        u.name AS studentName,

        c.id AS certificateId,
        c.certificate_number AS certificateNumber,
        c.certificate_type AS certificateType,
        c.issue_date AS issueDate,

        rd.recipient_name AS recipientName,
        rd.address_line1 AS addressLine1,
        rd.address_line2 AS addressLine2,
        rd.city,
        rd.district,
        rd.state,
        rd.pincode,
        rd.mobile,

        rd.postal_fee AS postalFee,
        rd.payment_status AS paymentStatus,
        rd.delivery_status AS deliveryStatus,
        rd.courier_name AS courierName,
        rd.tracking_number AS trackingNumber,
        rd.dispatched_at AS dispatchedAt,
        rd.delivered_at AS deliveredAt

      FROM request_deliveries rd

      INNER JOIN requests r
        ON r.id = rd.request_id

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN users u
        ON u.id = s.user_id

      INNER JOIN certificates c
        ON c.request_id = r.id

      WHERE rd.delivery_type = 'POSTAL'
        AND rd.payment_status = 'PAID'
        AND rd.postal_fee = ?
        AND r.status IN ('CERTIFICATE_GENERATED', 'COMPLETED')

        AND EXISTS (
          SELECT 1
          FROM payments p
          WHERE p.request_id = r.id
            AND p.payment_type = 'POSTAL_FEE'
            AND p.amount = ?
            AND p.status = 'SUCCESS'
        )

        AND rd.delivery_status IN (
          'READY_FOR_DISPATCH',
          'DISPATCHED',
          'IN_TRANSIT'
        )

      ORDER BY
        CASE rd.delivery_status
          WHEN 'READY_FOR_DISPATCH' THEN 1
          WHEN 'IN_TRANSIT' THEN 2
          WHEN 'DISPATCHED' THEN 3
          ELSE 4
        END,
        rd.created_at ASC
      `,
      [POSTAL_FEE, POSTAL_FEE]
    );

    return res.status(200).json({
      success: true,
      count: rows.length,
      deliveries: rows,
    });
  } catch (error) {
    console.error("Get postal dispatch queue error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch postal dispatch queue",
    });
  }
};

const updatePostalDispatch = async (req, res) => {
  const deliveryId = Number(req.params.deliveryId);
  const { status, courierName, trackingNumber, location, remarks } = req.body;

  const allowedStatuses = [
    "DISPATCHED",
    "IN_TRANSIT",
    "DELIVERED",
    "RETURNED",
  ];

  if (
    !Number.isSafeInteger(deliveryId) ||
    deliveryId <= 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid delivery ID",
    });
  }

  if (location !== undefined && (typeof location !== "string" || location.length > 150)) {
    return res.status(400).json({ success: false, message: "Location must not exceed 150 characters" });
  }
  if (remarks !== undefined && (typeof remarks !== "string" || remarks.length > 500)) {
    return res.status(400).json({ success: false, message: "Remarks must not exceed 500 characters" });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid delivery status",
    });
  }

  if (
    status === "DISPATCHED" &&
    (
      typeof courierName !== "string" ||
      !courierName.trim() ||
      typeof trackingNumber !== "string" ||
      !trackingNumber.trim()
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Courier name and tracking number are required for dispatch",
    });
  }

  if (
    courierName !== undefined &&
    (typeof courierName !== "string" || courierName.length > 100)
  ) {
    return res.status(400).json({
      success: false,
      message: "Courier name must not exceed 100 characters",
    });
  }

  if (
    trackingNumber !== undefined &&
    (typeof trackingNumber !== "string" || trackingNumber.length > 150)
  ) {
    return res.status(400).json({
      success: false,
      message: "Tracking number must not exceed 150 characters",
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        rd.id,
        rd.request_id,
        rd.delivery_type,
        rd.postal_fee,
        rd.payment_status,
        rd.delivery_status,
        rd.courier_name,
        rd.tracking_number,
        r.status AS request_status

      FROM request_deliveries rd

      INNER JOIN requests r
        ON r.id = rd.request_id

      INNER JOIN certificates c
        ON c.request_id = r.id

      WHERE rd.id = ?

        AND rd.delivery_type = 'POSTAL'
        AND rd.postal_fee = ?
        AND rd.payment_status = 'PAID'
        AND r.status IN ('CERTIFICATE_GENERATED', 'COMPLETED')

        AND EXISTS (
          SELECT 1
          FROM payments p
          WHERE p.request_id = r.id
            AND p.payment_type = 'POSTAL_FEE'
            AND p.amount = ?
            AND p.status = 'SUCCESS'
        )

      LIMIT 1
      FOR UPDATE
      `,
      [deliveryId, POSTAL_FEE, POSTAL_FEE]
    );

    if (rows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Eligible postal delivery not found. Verify the certificate and payment first.",
      });
    }

    const delivery = rows[0];
    const currentStatus = delivery.delivery_status;

    const transitions = {
      READY_FOR_DISPATCH: ["DISPATCHED"],
      DISPATCHED: ["IN_TRANSIT", "DELIVERED", "RETURNED"],
      IN_TRANSIT: ["IN_TRANSIT", "DELIVERED", "RETURNED"],
      DELIVERED: [],
      RETURNED: [],
    };

    if (
      !transitions[currentStatus] ||
      !transitions[currentStatus].includes(status)
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: `Cannot change delivery status from ${currentStatus} to ${status}`,
      });
    }

    if (
      status === "DISPATCHED" &&
      (!courierName?.trim() || !trackingNumber?.trim())
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "Courier name and tracking number are required",
      });
    }

    await connection.query(
      `
      UPDATE request_deliveries
      SET
        delivery_status = ?,

        courier_name = CASE
          WHEN ? = 'DISPATCHED' THEN ?
          ELSE courier_name
        END,

        tracking_number = CASE
          WHEN ? = 'DISPATCHED' THEN ?
          ELSE tracking_number
        END,

        dispatched_at = CASE
          WHEN ? = 'DISPATCHED' THEN NOW()
          ELSE dispatched_at
        END,

        delivered_at = CASE
          WHEN ? = 'DELIVERED' THEN NOW()
          ELSE delivered_at
        END

      WHERE id = ?
      `,
      [
        status,
        status,
        courierName?.trim() || null,
        status,
        trackingNumber?.trim() || null,
        status,
        status,
        deliveryId,
      ]
    );

    await connection.query(
      `INSERT INTO postal_tracking_events
        (delivery_id, status, location, remarks, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [deliveryId, status, location?.trim() || null, remarks?.trim() || null, req.user?.id || req.user?.userId || null]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `Postal delivery status updated to ${status}`,
      delivery: {
        deliveryId,
        requestId: delivery.request_id,
        previousStatus: currentStatus,
        deliveryStatus: status,
        courierName:
          status === "DISPATCHED"
            ? courierName.trim()
            : delivery.courier_name,
        trackingNumber:
          status === "DISPATCHED"
            ? trackingNumber.trim()
            : delivery.tracking_number,
      },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Postal dispatch rollback error:", rollbackError);
    }

    console.error("Update postal dispatch error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update postal delivery",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  getPostalDispatchQueue,
  updatePostalDispatch,
};
