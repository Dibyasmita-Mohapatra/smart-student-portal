const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const pool = require("../config/db");

const generateNoDueCertificate = async ({
  requestId,
  generatedBy = null,
}) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --------------------------------------------------
    // 1. Get No-Due request + student information
    // --------------------------------------------------
    const [rows] = await connection.query(
      `
      SELECT
        r.id AS request_id,
        r.request_number,
        r.status AS request_status,

        nd.id AS no_due_request_id,
        nd.overall_status,
        nd.total_tasks,
        nd.completed_tasks,
        nd.pending_tasks,
        nd.correction_tasks,
        nd.rejected_tasks,

        s.id AS student_id,
        s.roll_number,
        s.registration_number,

        u.name AS student_name,
        u.profile_photo_path,

        d.name AS department_name

      FROM requests r

      INNER JOIN no_due_requests nd
        ON nd.request_id = r.id

      INNER JOIN students s
        ON s.id = r.student_id

      INNER JOIN users u
        ON u.id = s.user_id

      INNER JOIN departments d
        ON d.id = s.department_id

      WHERE r.id = ?

      FOR UPDATE
      `,
      [requestId]
    );

    if (rows.length === 0) {
      throw new Error("No-Due request not found.");
    }

    const request = rows[0];

    // --------------------------------------------------
    // 2. Make sure ALL required clearance tasks are approved
    // --------------------------------------------------
    const [taskRows] = await connection.query(
      `
      SELECT
        COUNT(*) AS total_required,
        SUM(
          CASE
            WHEN status = 'APPROVED' THEN 1
            ELSE 0
          END
        ) AS approved_required,
        SUM(
          CASE
            WHEN status = 'CORRECTION_REQUIRED' THEN 1
            ELSE 0
          END
        ) AS correction_required,
        SUM(
          CASE
            WHEN status = 'REJECTED' THEN 1
            ELSE 0
          END
        ) AS rejected_required
      FROM clearance_tasks
      WHERE no_due_request_id = ?
        AND is_required = 1
      `,
      [request.no_due_request_id]
    );

    const taskSummary = taskRows[0];

    const totalRequired = Number(taskSummary.total_required || 0);
    const approvedRequired = Number(taskSummary.approved_required || 0);
    const correctionRequired = Number(
      taskSummary.correction_required || 0
    );
    const rejectedRequired = Number(
      taskSummary.rejected_required || 0
    );

    if (totalRequired === 0) {
      throw new Error(
        "No required clearance tasks found for this No-Due request."
      );
    }

    if (correctionRequired > 0) {
      throw new Error(
        "No-Due certificate cannot be generated because correction is required."
      );
    }

    if (rejectedRequired > 0) {
      throw new Error(
        "No-Due certificate cannot be generated because one or more clearances were rejected."
      );
    }

    if (approvedRequired !== totalRequired) {
      throw new Error(
        `No-Due certificate cannot be generated. ${approvedRequired} of ${totalRequired} required clearances are approved.`
      );
    }

    // --------------------------------------------------
    // 3. Check whether certificate already exists
    // --------------------------------------------------
    const [existingCertificates] = await connection.query(
      `
      SELECT
        id,
        certificate_number,
        file_path
      FROM certificates
      WHERE request_id = ?
      LIMIT 1
      `,
      [requestId]
    );

    if (existingCertificates.length > 0) {
      await connection.rollback();

      return {
        alreadyExists: true,
        certificate: existingCertificates[0],
      };
    }

    // --------------------------------------------------
    // 4. Generate certificate number
    // --------------------------------------------------
    const year = new Date().getFullYear();

    // Random suffix prevents duplicate certificate numbers when different requests
    // are approved concurrently. The database UNIQUE constraint remains the final guard.
    const randomSuffix = require("crypto").randomBytes(4).toString("hex").toUpperCase();
    const certificateNumber = `NDC/${year}/${randomSuffix}`;

    // --------------------------------------------------
    // 5. QR verification data
    // --------------------------------------------------
    const apiBase = (process.env.API_PUBLIC_URL || "http://localhost:5000").replace(/\/$/, "");
    const qrData = `${apiBase}/api/student/certificates/verify/${encodeURIComponent(certificateNumber)}`;

    // --------------------------------------------------
    // 6. Create certificate directory
    // --------------------------------------------------
    const certificateDirectory = path.join(
      process.cwd(),
      "uploads",
      "certificates"
    );

    if (!fs.existsSync(certificateDirectory)) {
      fs.mkdirSync(certificateDirectory, {
        recursive: true,
      });
    }

    const fileName =
      `${certificateNumber.replace(/\//g, "-")}.pdf`;

    const absoluteFilePath = path.join(
      certificateDirectory,
      fileName
    );

    const relativeFilePath =
      path.join(
        "uploads",
        "certificates",
        fileName
      ).replace(/\\/g, "/");

    // --------------------------------------------------
    // 7. Generate QR image
    // --------------------------------------------------
    const qrBuffer = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 180,
      margin: 2,
    });

    // --------------------------------------------------
    // 8. Generate PDF
    // --------------------------------------------------
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 60,
      });

      const stream = fs.createWriteStream(
        absoluteFilePath
      );

      doc.pipe(stream);
      const certificateAssets = path.join(__dirname, "..", "..", "assets", "certificates");
      const emblemPath = path.join(certificateAssets, "college-emblem.png");
      const signaturePath = path.join(certificateAssets, "authorised-signature.png");
      if (fs.existsSync(emblemPath)) doc.image(emblemPath, 62, 52, { fit: [58, 58] });
      if (request.profile_photo_path) {
        const photoPath = path.resolve(__dirname, "..", "..", request.profile_photo_path);
        if (fs.existsSync(photoPath)) doc.image(photoPath, 478, 52, { fit: [65, 82] });
      }

      // Header
      doc
        .fontSize(18)
        .font("Helvetica-Bold")
        .text(
          process.env.COLLEGE_NAME || "Government College of Engineering, Keonjhar",
          { x: 128, y: 63, width: 340, align: "center" }
        );

      doc
        .moveDown(0.3)
        .fontSize(10)
        .font("Helvetica")
        .text(
          process.env.COLLEGE_AFFILIATION || "Biju Patnaik University of Technology",
          { x: 128, y: 88, width: 340, align: "center" }
        );

      doc
        .moveDown(0.8)
        .moveTo(70, doc.y)
        .lineTo(525, doc.y)
        .stroke();

      doc.moveDown(1.2);

      // Certificate title
      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(
          "NO-DUE CERTIFICATE",
          {
            align: "center",
          }
        );

      doc.moveDown(1.5);

      // Certificate number
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(
          `Certificate No.: ${certificateNumber}`,
          {
            align: "right",
          }
        );

      doc
        .moveDown(1.2)
        .fontSize(13)
        .font("Helvetica")
        .text(
          `This is to certify that `
        )
        .font("Helvetica-Bold")
        .text(
          request.student_name,
          {
            continued: true,
          }
        )
        .font("Helvetica")
        .text(
          `, Roll No. ${request.roll_number}, Registration No. ${request.registration_number},`
        )
        .text(
          ` of the ${request.department_name} department, has completed the required No-Due clearance process from the concerned sections of the college.`
        );

      doc.moveDown(1);

      doc.text(
        "As per the records available with the college, there are no pending dues or clearance obligations against the student for the purpose for which this certificate has been issued."
      );

      doc.moveDown(1);

      doc.text(
        "This certificate has been generated electronically through the Smart Student Document & Academic Clearance Portal."
      );

      doc.moveDown(2);

      // Issue date
      doc
        .font("Helvetica-Bold")
        .text(
          `Date of Issue: ${new Date().toLocaleDateString(
            "en-IN"
          )}`
        );

      // Signature block aligned above the signatory designation.
      if (fs.existsSync(signaturePath)) doc.image(signaturePath, 390, 520, { fit: [125, 58] });
      doc.font("Helvetica").fontSize(10).text("Authorized Signatory", 365, 580, { width: 160, align: "center" });
      doc.fontSize(9).text(process.env.COLLEGE_NAME || "Government College of Engineering, Keonjhar", 350, 596, { width: 190, align: "center" });

      // QR
      doc.image(
        qrBuffer,
        70,
        650,
        {
          width: 110,
        }
      );

      doc
        .fontSize(8)
        .text(
          "Scan QR code to verify this certificate",
          60,
          765,
          {
            width: 130,
            align: "center",
          }
        );

      doc.end();

      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // --------------------------------------------------
    // 9. Insert certificate record
    // --------------------------------------------------
    const [certificateResult] = await connection.query(
      `
      INSERT INTO certificates (
        request_id,
        certificate_number,
        certificate_type,
        student_name,
        roll_number,
        registration_number,
        department_name,
        issue_date,
        file_path,
        qr_code_data,
        generated_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?)
      `,
      [
        requestId,
        certificateNumber,
        "NO_DUE",
        request.student_name,
        request.roll_number,
        request.registration_number,
        request.department_name,
        relativeFilePath,
        qrData,
        generatedBy,
      ]
    );

    const certificateId = certificateResult.insertId;

    // --------------------------------------------------
    // 10. Create verification record
    // --------------------------------------------------
    await connection.query(
      `
      INSERT INTO certificate_verifications (
        certificate_id
      )
      VALUES (?)
      `,
      [certificateId]
    );

    // --------------------------------------------------
    // 11. Update request status
    // --------------------------------------------------
    await connection.query(
      `
      UPDATE requests
      SET status = 'CERTIFICATE_GENERATED'
      WHERE id = ?
      `,
      [requestId]
    );

    await connection.query(
      `UPDATE request_deliveries
       SET delivery_status = CASE
         WHEN delivery_type = 'POSTAL' AND payment_status = 'PAID' THEN 'READY_FOR_DISPATCH'
         WHEN delivery_type = 'POSTAL' THEN 'PENDING_PAYMENT'
         ELSE 'NOT_REQUIRED' END
       WHERE request_id = ?`,
      [requestId]
    );

    // --------------------------------------------------
    // 12. Update No-Due overall status
    // --------------------------------------------------
    await connection.query(
      `
      UPDATE no_due_requests
      SET
        overall_status = 'APPROVED',
        completed_tasks = ?,
        pending_tasks = 0,
        correction_tasks = 0,
        rejected_tasks = 0
      WHERE id = ?
      `,
      [
        approvedRequired,
        request.no_due_request_id,
      ]
    );

    // --------------------------------------------------
    // 13. Commit
    // --------------------------------------------------
    await connection.commit();

    return {
      alreadyExists: false,
      certificate: {
        id: certificateId,
        certificateNumber,
        certificateType: "NO_DUE",
        filePath: relativeFilePath,
        qrCodeData: qrData,
      },
    };
  } catch (error) {
    await connection.rollback();

    // Remove PDF if database operation failed
    try {
      if (
        typeof absoluteFilePath !== "undefined" &&
        fs.existsSync(absoluteFilePath)
      ) {
        fs.unlinkSync(absoluteFilePath);
      }
    } catch (cleanupError) {
      console.error(
        "Certificate file cleanup failed:",
        cleanupError.message
      );
    }

    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  generateNoDueCertificate,
};