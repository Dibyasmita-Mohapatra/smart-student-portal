
const pool = require("../config/db");
const crypto = require("crypto");

const generateTestTransactionId = () => {
  const datePart = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  const randomPart = crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();

  return `TEST-${datePart}-${randomPart}`;
};

/**
 * TEST MODE ONLY
 *
 * Simulates successful payment of a postal delivery fee.
 * Does not collect real money.
 *
 * Route:
 * POST /api/student/payments/:paymentId/test-success
 */
const testPaymentSuccess = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ success: false, message: "Demo payment is disabled in production." });
  }
  let connection;

  try {
    const paymentId = Number(req.params.paymentId);
    const userId = Number(req.user?.userId);

    if (
      !Number.isSafeInteger(paymentId) ||
      paymentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid payment ID is required",
      });
    }

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    /*
     * Lock the payment row while processing it.
     * Verify that the payment belongs to the logged-in student.
     */
    const [payments] = await connection.execute(
      `
      SELECT
        p.id,
        p.request_id,
        p.payment_type,
        p.amount,
        p.gateway,
        p.transaction_id,
        p.status AS payment_status,

        r.student_id,

        rd.delivery_type,
        rd.payment_status AS delivery_payment_status,
        rd.delivery_status

      FROM payments p

      INNER JOIN requests r
        ON r.id = p.request_id

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN users u
        ON u.id = s.user_id

      INNER JOIN request_deliveries rd
        ON rd.request_id = r.id

      WHERE p.id = ?
        AND u.id = ?
        AND p.payment_type = 'POSTAL_FEE'

      LIMIT 1
      FOR UPDATE
      `,
      [paymentId, userId]
    );

    if (payments.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message:
          "Postal payment not found for this student",
      });
    }

    const payment = payments[0];

    if (payment.payment_type !== "POSTAL_FEE") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: "This is not a postal fee payment",
      });
    }

    /*
     * The expected postal fee is ₹200.
     * Store and compare monetary amounts in INR.
     */
    if (Number(payment.amount) !== 200) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Payment amount does not match the ₹200 postal fee",
      });
    }

    /*
     * Do not simulate a second successful payment.
     */
    if (payment.payment_status === "SUCCESS") {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message: "Payment has already been completed",
        payment: {
          id: Number(payment.id),
          requestId: Number(payment.request_id),
          amount: Number(payment.amount),
          status: payment.payment_status,
          transactionId: payment.transaction_id,
        },
      });
    }

    if (payment.payment_status !== "PENDING") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          `Payment cannot be completed because its status is ${payment.payment_status}`,
      });
    }

    if (
      payment.delivery_payment_status === "PAID"
    ) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          "Delivery is already marked as paid. Please verify the payment records.",
      });
    }

    const transactionId = generateTestTransactionId();

    /*
     * 1. Mark the payment successful.
     */
    const [paymentUpdate] = await connection.execute(
      `
      UPDATE payments
      SET
        status = 'SUCCESS',
        gateway = 'TEST',
        payment_mode = 'TEST',
        transaction_id = ?,
        paid_at = NOW()
      WHERE id = ?
        AND status = 'PENDING'
      `,
      [transactionId, paymentId]
    );

    if (paymentUpdate.affectedRows !== 1) {
      throw new Error(
        "Payment could not be updated"
      );
    }

    /*
     * 2. Update payment status only.
     *
     * Do not mark the delivery READY_FOR_DISPATCH here.
     * Certificate approval and generation must happen first.
     */
    const [deliveryUpdate] = await connection.execute(
      `
      UPDATE request_deliveries rd
      SET delivery_type = 'POSTAL',
          postal_fee = 200.00,
          payment_status = 'PAID',
          delivery_status = CASE
            WHEN rd.delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') THEN rd.delivery_status
            WHEN EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = rd.request_id) THEN 'READY_FOR_DISPATCH'
            ELSE 'WAITING_FOR_CERTIFICATE'
          END
      WHERE request_id = ?
      `,
      [payment.request_id]
    );

    if (deliveryUpdate.affectedRows !== 1) {
      throw new Error(
        "Postal delivery record could not be updated"
      );
    }

    /*
     * 3. Commit both changes together.
     */
    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        "Test payment completed successfully",
      testMode: true,

      payment: {
        id: Number(payment.id),
        requestId: Number(payment.request_id),
        amount: Number(payment.amount),
        currency: "INR",
        gateway: "TEST",
        status: "SUCCESS",
        transactionId,
      },

      delivery: {
        type: "POSTAL",
        paymentStatus: "PAID",
        deliveryStatus: payment.delivery_status,
        readyForDispatch: false,
        message:
          "Payment is complete. Dispatch readiness depends on certificate approval and generation.",
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Payment rollback failed:",
          rollbackError.message
        );
      }
    }

    console.error(
      "Test payment error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to complete test payment",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


const razorpayRequest = async (path, options = {}) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error("Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to server/.env.");
    error.statusCode = 503;
    throw error;
  }
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.description || "Razorpay request failed.");
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return data;
};

const getOwnedPostalPayment = async (paymentId, userId, lock = false) => {
  const [rows] = await pool.execute(`
    SELECT p.id, p.request_id, p.payment_type, p.amount, p.currency, p.gateway,
           p.gateway_order_id, p.transaction_id, p.status AS payment_status,
           r.request_number, r.student_id, u.id AS user_id,
           u.name AS student_name, u.email AS student_email, rd.mobile AS delivery_mobile,
           rd.delivery_type, rd.payment_status AS delivery_payment_status,
           rd.delivery_status, rd.recipient_name
    FROM payments p
    INNER JOIN requests r ON r.id = p.request_id
    INNER JOIN students s ON s.id = r.student_id
    INNER JOIN users u ON u.id = s.user_id
    INNER JOIN request_deliveries rd ON rd.request_id = r.id
    WHERE p.id = ? AND u.id = ? AND p.payment_type = 'POSTAL_FEE'
    LIMIT 1 ${lock ? "FOR UPDATE" : ""}
  `, [paymentId, userId]);
  return rows[0] || null;
};


/**
 * Reconcile the local postal payment against Razorpay. This is deliberately
 * server-side: a browser refresh alone cannot update a gateway payment.
 */
const syncPostalPaymentStatus = async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const userId = Number(req.user?.userId);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid payment or user." });
  }
  let connection;
  try {
    let payment = await getOwnedPostalPayment(paymentId, userId);
    if (!payment || payment.payment_type !== "POSTAL_FEE" || Number(payment.amount) !== 200) {
      return res.status(404).json({ success: false, message: "Postal payment not found for this student." });
    }
    if (payment.payment_status === "SUCCESS" || payment.delivery_payment_status === "PAID") {
      await pool.execute(`
        UPDATE request_deliveries rd
        SET rd.delivery_type = 'POSTAL',
            rd.postal_fee = 200.00,
            rd.payment_status = 'PAID',
            rd.delivery_status = CASE
              WHEN rd.delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') THEN rd.delivery_status
              WHEN EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = rd.request_id) THEN 'READY_FOR_DISPATCH'
              ELSE 'WAITING_FOR_CERTIFICATE'
            END
        WHERE rd.request_id = ?
      `, [payment.request_id]);
      return res.json({ success: true, synchronized: true, status: "SUCCESS", paymentStatus: "PAID", deliveryStatus: payment.delivery_status });
    }
    if (payment.payment_status !== "SUCCESS") {
      await pool.execute(`UPDATE request_deliveries SET delivery_type = 'POSTAL', postal_fee = 200.00,
        payment_status = ?, delivery_status = 'PENDING_PAYMENT' WHERE request_id = ?`,
        [payment.payment_status === "FAILED" ? "FAILED" : "PENDING", payment.request_id]);
    }
    if (payment.gateway !== "RAZORPAY" || !payment.gateway_order_id) {
      return res.json({ success: true, synchronized: false, status: payment.payment_status, paymentStatus: payment.payment_status === "SUCCESS" ? "PAID" : payment.payment_status, deliveryStatus: payment.delivery_status });
    }

    const result = await razorpayRequest(`/orders/${encodeURIComponent(payment.gateway_order_id)}/payments`);
    const captured = (result.items || []).find((item) => item.status === "captured" && item.order_id === payment.gateway_order_id && Number(item.amount) === 20000 && item.currency === "INR");
    if (!captured) {
      return res.json({ success: true, synchronized: false, status: payment.payment_status, paymentStatus: payment.delivery_payment_status, deliveryStatus: payment.delivery_status, gatewayOrderStatus: result.items?.some((item) => item.status === "authorized") ? "AUTHORIZED" : "NOT_CAPTURED" });
    }

    const methodMap = { upi: "UPI", card: "CARD", netbanking: "NETBANKING", wallet: "OTHER", emi: "OTHER", paylater: "OTHER" };
    const mode = methodMap[captured.method] || "OTHER";
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [locked] = await connection.execute(`
      SELECT p.id, p.request_id, p.status, p.amount, p.gateway_order_id, rd.payment_status AS delivery_payment_status
      FROM payments p
      INNER JOIN requests r ON r.id = p.request_id
      INNER JOIN students s ON s.id = r.student_id
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN request_deliveries rd ON rd.request_id = r.id
      WHERE p.id = ? AND u.id = ? AND p.payment_type = 'POSTAL_FEE'
      LIMIT 1 FOR UPDATE
    `, [paymentId, userId]);
    if (!locked.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Postal payment not found for this student." });
    }
    const current = locked[0];
    if (current.gateway_order_id !== payment.gateway_order_id || Number(current.amount) !== 200) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Payment order changed; refresh and try again." });
    }
    if (current.status !== "SUCCESS") {
      await connection.execute(
        "UPDATE payments SET status = 'SUCCESS', gateway = 'RAZORPAY', payment_mode = ?, transaction_id = ?, paid_at = COALESCE(paid_at, NOW()) WHERE id = ? AND status IN ('PENDING','FAILED')",
        [mode, captured.id, paymentId]
      );
    }
    await connection.execute(`
      UPDATE request_deliveries rd
      SET delivery_type = 'POSTAL',
          postal_fee = 200.00,
          payment_status = 'PAID',
          delivery_status = CASE
            WHEN delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') THEN delivery_status
            WHEN EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = rd.request_id) THEN 'READY_FOR_DISPATCH'
            ELSE 'WAITING_FOR_CERTIFICATE'
          END
      WHERE request_id = ?
    `, [payment.request_id]);
    await connection.commit();
    const refreshed = await getOwnedPostalPayment(paymentId, userId);
    return res.json({ success: true, synchronized: true, status: "SUCCESS", paymentStatus: refreshed?.delivery_payment_status || "PAID", deliveryStatus: refreshed?.delivery_status || "READY_FOR_DISPATCH", transactionId: captured.id });
  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch {} }
    console.error("Sync postal payment failed:", error.message);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Could not synchronize payment status." });
  } finally {
    if (connection) connection.release();
  }
};

const createRazorpayOrder = async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const userId = Number(req.user?.userId);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
    return res.status(400).json({ success: false, message: "A valid payment ID is required." });
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ success: false, message: "Online payment is not configured yet. Add Razorpay test/live API keys in server/.env." });
    }
    let payment = await getOwnedPostalPayment(paymentId, userId);
    if (!payment) return res.status(404).json({ success: false, message: "Postal payment not found for this student." });
    if (payment.payment_type !== "POSTAL_FEE" || Number(payment.amount) !== 200) {
      return res.status(400).json({ success: false, message: "Invalid postal payment amount or type." });
    }
    if (payment.payment_status === "SUCCESS" || payment.delivery_payment_status === "PAID") {
      return res.status(409).json({ success: false, message: "This postal fee is already paid." });
    }
    if (payment.payment_status === "FAILED") {
      await pool.execute("UPDATE payments SET status = 'PENDING', gateway_order_id = NULL, transaction_id = NULL, paid_at = NULL WHERE id = ? AND status = 'FAILED'", [payment.id]);
      await pool.execute("UPDATE request_deliveries SET delivery_type = 'POSTAL', postal_fee = 200.00, payment_status = 'PENDING', delivery_status = 'PENDING_PAYMENT' WHERE request_id = ? AND payment_status = 'FAILED'", [payment.request_id]);
      payment = await getOwnedPostalPayment(paymentId, userId);
    }
    if (payment.payment_status !== "PENDING") {
      return res.status(400).json({ success: false, message: `Payment cannot start while status is ${payment.payment_status}.` });
    }

    let order;
    if (payment.gateway_order_id && payment.gateway === "RAZORPAY") {
      try {
        order = await razorpayRequest(`/orders/${encodeURIComponent(payment.gateway_order_id)}`);
        if (order.status === "paid") {
          return res.status(409).json({ success: false, message: "Razorpay has already marked this order paid. Refresh the request and verify payment status." });
        }
      } catch (error) {
        if (error.statusCode === 503) throw error;
        order = null;
      }
    }
    if (!order) {
      order = await razorpayRequest("/orders", {
        method: "POST",
        body: {
          amount: 20000,
          currency: "INR",
          receipt: `SSP-${payment.request_id}-${payment.id}`,
          notes: { request_id: String(payment.request_id), payment_id: String(payment.id), request_number: payment.request_number },
        },
      });
      await pool.execute(
        "UPDATE payments SET gateway = 'RAZORPAY', gateway_order_id = ?, payment_mode = 'OTHER' WHERE id = ? AND status = 'PENDING'",
        [order.id, payment.id]
      );
    }
    return res.json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      payment: { id: Number(payment.id), requestId: Number(payment.request_id), amount: Number(payment.amount), currency: "INR" },
      student: { name: payment.student_name || "Student", email: payment.student_email || "", contact: payment.delivery_mobile || "" },
      collegeName: process.env.COLLEGE_NAME || "Smart Student Academic Portal",
    });
  } catch (error) {
    console.error("Create Razorpay order failed:", error.message);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Could not start online payment." });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  const paymentId = Number(req.params.paymentId);
  const userId = Number(req.user?.userId);
  const { razorpay_order_id: orderId, razorpay_payment_id: gatewayPaymentId, razorpay_signature: signature } = req.body || {};
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid payment or user." });
  }
  if (!orderId || !gatewayPaymentId || !signature) {
    return res.status(400).json({ success: false, message: "Razorpay payment verification details are incomplete." });
  }
  let connection;
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!process.env.RAZORPAY_KEY_ID || !keySecret) return res.status(503).json({ success: false, message: "Razorpay is not configured." });
    const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${gatewayPaymentId}`).digest("hex");
    const actualBuf = Buffer.from(String(signature));
    const expectedBuf = Buffer.from(expected);
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      return res.status(400).json({ success: false, message: "Payment signature verification failed." });
    }

    const gatewayPayment = await razorpayRequest(`/payments/${encodeURIComponent(gatewayPaymentId)}`);
    if (gatewayPayment.order_id !== orderId || Number(gatewayPayment.amount) !== 20000 || gatewayPayment.currency !== "INR") {
      return res.status(400).json({ success: false, message: "Gateway payment does not match the expected postal fee order." });
    }
    if (gatewayPayment.status !== "captured") {
      return res.status(409).json({ success: false, message: `Payment is ${gatewayPayment.status}; the fee is not confirmed as captured yet.`, gatewayStatus: gatewayPayment.status });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(`
      SELECT p.id, p.request_id, p.amount, p.status, p.gateway_order_id,
             r.student_id, u.id AS user_id, rd.delivery_type, rd.payment_status AS delivery_payment_status
      FROM payments p
      INNER JOIN requests r ON r.id = p.request_id
      INNER JOIN students s ON s.id = r.student_id
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN request_deliveries rd ON rd.request_id = r.id
      WHERE p.id = ? AND u.id = ? AND p.payment_type = 'POSTAL_FEE'
      LIMIT 1 FOR UPDATE
    `, [paymentId, userId]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Postal payment not found for this student." });
    }
    const payment = rows[0];
    if (payment.gateway_order_id !== orderId) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "The payment order does not match this request." });
    }
    if (payment.status === "SUCCESS") {
      await connection.rollback();
      return res.json({ success: true, alreadyPaid: true, message: "Payment was already confirmed." });
    }
    if (payment.status !== "PENDING" || Number(payment.amount) !== 200) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: "Payment is not in a payable state." });
    }
    const methodMap = { upi: "UPI", card: "CARD", netbanking: "NETBANKING", wallet: "OTHER", emi: "OTHER", paylater: "OTHER" };
    const mode = methodMap[gatewayPayment.method] || "OTHER";
    const [updated] = await connection.execute(
      "UPDATE payments SET status = 'SUCCESS', gateway = 'RAZORPAY', payment_mode = ?, transaction_id = ?, paid_at = NOW() WHERE id = ? AND status = 'PENDING'",
      [mode, gatewayPaymentId, payment.id]
    );
    if (updated.affectedRows !== 1) throw new Error("Payment status could not be updated safely.");
    const [deliveryUpdated] = await connection.execute(
      "UPDATE request_deliveries rd SET delivery_type = 'POSTAL', postal_fee = 200.00, payment_status = 'PAID', delivery_status = CASE WHEN rd.delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') THEN rd.delivery_status WHEN EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = rd.request_id) THEN 'READY_FOR_DISPATCH' ELSE 'WAITING_FOR_CERTIFICATE' END WHERE request_id = ?",
      [payment.request_id]
    );
    if (deliveryUpdated.affectedRows !== 1) throw new Error("Postal delivery record could not be updated.");
    await connection.commit();
    return res.json({ success: true, message: "Payment verified and recorded.", payment: { id: Number(payment.id), requestId: Number(payment.request_id), amount: 200, currency: "INR", gateway: "RAZORPAY", paymentMode: mode, status: "SUCCESS", transactionId: gatewayPaymentId }, delivery: { paymentStatus: "PAID", readyForDispatch: false, message: "Dispatch still requires the approved certificate and staff dispatch workflow." } });
  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch {} }
    console.error("Verify Razorpay payment failed:", error.message);
    return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Could not verify payment." });
  } finally {
    if (connection) connection.release();
  }
};

const razorpayWebhook = async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(503).json({ success: false, message: "Razorpay webhook secret is not configured." });
  const signature = req.headers["x-razorpay-signature"];
  if (!Buffer.isBuffer(req.body) || !signature) return res.status(400).json({ success: false, message: "Invalid webhook payload." });
  const expected = crypto.createHmac("sha256", webhookSecret).update(req.body).digest("hex");
  const a = Buffer.from(String(signature)); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ success: false, message: "Invalid webhook signature." });
  try {
    const event = JSON.parse(req.body.toString("utf8"));
    const paymentEntity = event?.payload?.payment?.entity;
    if (!paymentEntity?.order_id || !paymentEntity?.id) return res.json({ success: true, ignored: true });
    if (event.event === "payment.captured") {
      const methodMap = { upi: "UPI", card: "CARD", netbanking: "NETBANKING", wallet: "OTHER", emi: "OTHER", paylater: "OTHER" };
      const mode = methodMap[paymentEntity.method] || "OTHER";
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id, request_id, amount, status FROM payments WHERE gateway_order_id = ? AND gateway = 'RAZORPAY' LIMIT 1 FOR UPDATE", [paymentEntity.order_id]);
        if (rows.length && Number(rows[0].amount) === 200 && Number(paymentEntity.amount) === 20000 && paymentEntity.currency === "INR" && rows[0].status === "PENDING") {
          await connection.execute("UPDATE payments SET status = 'SUCCESS', payment_mode = ?, transaction_id = ?, paid_at = NOW() WHERE id = ? AND status = 'PENDING'", [mode, paymentEntity.id, rows[0].id]);
          await connection.execute("UPDATE request_deliveries rd SET delivery_type = 'POSTAL', postal_fee = 200.00, payment_status = 'PAID', delivery_status = CASE WHEN rd.delivery_status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','RETURNED') THEN rd.delivery_status WHEN EXISTS (SELECT 1 FROM certificates c WHERE c.request_id = rd.request_id) THEN 'READY_FOR_DISPATCH' ELSE 'WAITING_FOR_CERTIFICATE' END WHERE request_id = ?", [rows[0].request_id]);
        }
        await connection.commit();
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    } else if (event.event === "payment.failed") {
      await pool.execute("UPDATE payments SET status = 'FAILED', transaction_id = ? WHERE gateway_order_id = ? AND gateway = 'RAZORPAY' AND status = 'PENDING'", [paymentEntity.id, paymentEntity.order_id]);
      await pool.execute("UPDATE request_deliveries rd JOIN payments p ON p.request_id = rd.request_id SET rd.delivery_type = 'POSTAL', rd.postal_fee = 200.00, rd.payment_status = 'FAILED', rd.delivery_status = 'PENDING_PAYMENT' WHERE p.gateway_order_id = ? AND p.status = 'FAILED'", [paymentEntity.order_id]);
    }
    return res.json({ success: true, received: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed:", error.message);
    return res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
};

module.exports = {
  testPaymentSuccess,
  createRazorpayOrder,
  verifyRazorpayPayment,
  syncPostalPaymentStatus,
  razorpayWebhook,
};
