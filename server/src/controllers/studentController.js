const pool = require("../config/db");
const path = require("path");
const fs = require("fs");

// =========================================================
// GET STUDENT DASHBOARD
// =========================================================

const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;

    // --------------------------------------------------
    // 1. Get student profile
    // --------------------------------------------------

    const [studentRows] = await pool.query(
      `
      SELECT
        s.id AS student_id,
        s.user_id,

        u.name,
        u.email,
        u.phone,

        s.roll_number,
        s.registration_number,
        s.batch,
        s.admission_year,
        s.passing_year,
        s.hostel_status,
        s.gender,
        s.date_of_birth,
        s.address,

        d.id AS department_id,
        d.code AS department_code,
        d.name AS department_name

      FROM students s

      INNER JOIN users u
        ON u.id = s.user_id

      LEFT JOIN departments d
        ON d.id = s.department_id

      WHERE s.user_id = ?

      LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const student = studentRows[0];

    // --------------------------------------------------
    // 2. Request statistics
    // --------------------------------------------------

    const [requestStats] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_requests,

        SUM(
          CASE
            WHEN r.status IN (
              'SUBMITTED',
              'UNDER_REVIEW',
              'CLEARANCE_IN_PROGRESS',
              'RESUBMITTED',
              'ALL_CLEARANCES_COMPLETED',
              'FINAL_REVIEW'
            )
            THEN 1
            ELSE 0
          END
        ) AS pending_requests,

        SUM(
          CASE
            WHEN r.status = 'CORRECTION_REQUIRED'
            THEN 1
            ELSE 0
          END
        ) AS action_required,

        SUM(
          CASE
            WHEN r.status IN (
              'APPROVED',
              'DOCUMENT_GENERATED',
              'CERTIFICATE_GENERATED',
              'COMPLETED'
            )
            THEN 1
            ELSE 0
          END
        ) AS completed_requests

      FROM requests r

      WHERE r.student_id = ?
      `,
      [student.student_id]
    );

    // --------------------------------------------------
    // 3. Recent requests
    // --------------------------------------------------

    const [recentRequests] = await pool.query(
      `
      SELECT
        r.id,
        r.request_number,
        r.status,
        r.submitted_at,
        r.completed_at,

        dt.code AS document_code,
        dt.name AS document_name

      FROM requests r

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      WHERE r.student_id = ?

      ORDER BY r.created_at DESC

      LIMIT 5
      `,
      [student.student_id]
    );

    // --------------------------------------------------
    // 4. No-Due progress
    // --------------------------------------------------

    const [noDueRows] = await pool.query(
      `
      SELECT
        ndr.id,
        ndr.request_id,
        ndr.overall_status

      FROM no_due_requests ndr

      INNER JOIN requests r
        ON r.id = ndr.request_id

      WHERE r.student_id = ?

      ORDER BY ndr.created_at DESC

      LIMIT 1
      `,
      [student.student_id]
    );

    let noDue = {
      exists: false,
      total: 0,
      approved: 0,
      pending: 0,
      correction: 0,
      progress: 0,
      status: null,
    };

    if (noDueRows.length > 0) {
      const noDueRequest = noDueRows[0];

      const [taskRows] = await pool.query(
        `
        SELECT
          COUNT(*) AS total_tasks,

          SUM(
            CASE
              WHEN status = 'APPROVED'
              THEN 1
              ELSE 0
            END
          ) AS approved_tasks,

          SUM(
            CASE
              WHEN status IN (
                'PENDING',
                'UNDER_REVIEW'
              )
              THEN 1
              ELSE 0
            END
          ) AS pending_tasks,

          SUM(
            CASE
              WHEN status = 'CORRECTION_REQUIRED'
              THEN 1
              ELSE 0
            END
          ) AS correction_tasks

        FROM clearance_tasks

        WHERE no_due_request_id = ?

          AND is_required = 1
        `,
        [noDueRequest.id]
      );

      const taskStats = taskRows[0];

      const total = Number(taskStats.total_tasks || 0);
      const approved = Number(taskStats.approved_tasks || 0);
      const pending = Number(taskStats.pending_tasks || 0);
      const correction = Number(
        taskStats.correction_tasks || 0
      );

      const progress =
        total > 0
          ? Math.round((approved / total) * 100)
          : 0;

      noDue = {
        exists: true,
        total,
        approved,
        pending,
        correction,
        progress,
        status: noDueRequest.overall_status,
      };
    }

    // --------------------------------------------------
    // 5. Recent activity
    // --------------------------------------------------

    const [activities] = await pool.query(
      `
      SELECT
        h.id,
        h.old_status,
        h.new_status,
        h.remarks,
        h.created_at,

        r.request_number,

        dt.name AS document_name

      FROM request_status_history h

      INNER JOIN requests r
        ON r.id = h.request_id

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      WHERE r.student_id = ?

      ORDER BY h.created_at DESC

      LIMIT 5
      `,
      [student.student_id]
    );

    // --------------------------------------------------
    // 6. Return dashboard
    // --------------------------------------------------

    return res.json({
      success: true,

      student: {
        id: student.student_id,
        name: student.name,
        email: student.email,
        phone: student.phone,
        rollNumber: student.roll_number,
        registrationNumber: student.registration_number,
        batch: student.batch,
        hostelStatus: student.hostel_status,

        department: {
          id: student.department_id,
          code: student.department_code,
          name: student.department_name,
        },
      },

      statistics: {
        totalRequests:
          Number(requestStats[0]?.total_requests) || 0,

        pendingRequests:
          Number(requestStats[0]?.pending_requests) || 0,

        actionRequired:
          Number(requestStats[0]?.action_required) || 0,

        completedRequests:
          Number(requestStats[0]?.completed_requests) || 0,
      },

      noDue,
      recentRequests,
      activities,
    });
  } catch (error) {
    console.error(
      "Student dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load student dashboard",
    });
  }
};

// =========================================================
// GET AVAILABLE STUDENT SERVICES
// =========================================================

const getStudentServices = async (req, res) => {
  try {
    const [services] = await pool.query(
      `
      SELECT
        dt.id,
        dt.code,
        dt.name,
        dt.description,

        COALESCE(
          JSON_ARRAYAGG(
            CASE
              WHEN dr.id IS NOT NULL THEN
                JSON_OBJECT(
                  'serviceRequirementId', sdr.id,
                  'documentRequirementId', dr.id,
                  'documentCode', dr.document_code,
                  'documentName', dr.document_name,
                  'description', dr.description,
                  'allowedFileTypes', dr.allowed_file_types,
                  'maxFileSizeMb', dr.max_file_size_mb,
                  'isRequired', sdr.is_required,
                  'displayOrder', sdr.display_order
                )
            END
          ),
          JSON_ARRAY()
        ) AS requiredDocuments

      FROM document_types dt

      LEFT JOIN service_document_requirements sdr
        ON sdr.document_type_id = dt.id

      LEFT JOIN document_requirements dr
        ON dr.id = sdr.document_requirement_id
        AND dr.is_active = 1

      WHERE dt.is_active = 1

      GROUP BY
        dt.id,
        dt.code,
        dt.name,
        dt.description

      ORDER BY dt.id ASC
      `
    );

    const formattedServices = services.map((service) => {
      let requiredDocuments = service.requiredDocuments;

      /*
       * MySQL JSON fields can sometimes be returned
       * as a JSON string depending on the driver/configuration.
       * Convert them into a JavaScript array if necessary.
       */
      if (typeof requiredDocuments === "string") {
        try {
          requiredDocuments = JSON.parse(requiredDocuments);
        } catch (error) {
          requiredDocuments = [];
        }
      }

      /*
       * Remove null placeholder objects that can occur
       * for services having no document requirements.
       */
      requiredDocuments = Array.isArray(requiredDocuments)
        ? requiredDocuments.filter(
            (document) =>
              document &&
              document.documentRequirementId !== null
          )
        : [];

      return {
        id: service.id,
        code: service.code,
        name: service.name,
        description: service.description,
        requiredDocuments,
      };
    });

    return res.json({
      success: true,
      services: formattedServices,
    });
  } catch (error) {
    console.error(
      "Student services error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load available services",
    });
  }
};

// =========================================================
// CREATE STUDENT SERVICE REQUEST
// =========================================================


const createStudentRequest = async (req, res) => {
  const connection = await pool.getConnection();

  const uploadedFiles = req.files || [];
  const movedFilePaths = [];

  try {
    // --------------------------------------------------
    // 1. Read multipart/form-data body
    // --------------------------------------------------

    let {
      documentTypeCode,
      applicationData = {},
      deliveryType = "DIGITAL",
      paymentMode = "UPI",
      postalAddress = null,
      declarationAccepted = false,
      documentRequirementIds = [],
    } = req.body;

    // --------------------------------------------------
    // 2. Normalize multipart fields
    // --------------------------------------------------

    if (typeof applicationData === "string") {
      try {
        applicationData = JSON.parse(applicationData);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Application data contains invalid JSON",
        });
      }
    }

    if (typeof postalAddress === "string") {
      try {
        postalAddress = JSON.parse(postalAddress);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Postal address contains invalid JSON",
        });
      }
    }

    if (!Array.isArray(documentRequirementIds)) {
      documentRequirementIds = documentRequirementIds
        ? [documentRequirementIds]
        : [];
    }

    // --------------------------------------------------
    // 3. Validate document type
    // --------------------------------------------------

    if (!documentTypeCode) {
      return res.status(400).json({
        success: false,
        message: "Document type is required",
      });
    }

    // --------------------------------------------------
    // 4. Validate application data
    // --------------------------------------------------

    if (
      applicationData === null ||
      typeof applicationData !== "object" ||
      Array.isArray(applicationData)
    ) {
      return res.status(400).json({
        success: false,
        message: "Application data must be a valid object",
      });
    }

    // --------------------------------------------------
    // 5. Validate declaration
    // --------------------------------------------------

    const normalizedDeclaration = String(
      declarationAccepted
    )
      .trim()
      .toLowerCase();

    if (!["true", "1"].includes(normalizedDeclaration)) {
      return res.status(400).json({
        success: false,
        message:
          "You must accept the declaration before submitting.",
      });
    }

    // --------------------------------------------------
    // 6. Validate delivery type
    // --------------------------------------------------

    const normalizedDeliveryType = String(
      deliveryType || "DIGITAL"
    )
      .trim()
      .toUpperCase();

    if (!["DIGITAL", "POSTAL"].includes(normalizedDeliveryType)) {
      return res.status(400).json({
        success: false,
        message: "Delivery type must be DIGITAL or POSTAL",
      });
    }

    const normalizedPaymentMode = String(paymentMode || "UPI").trim().toUpperCase();
    if (!["UPI", "CARD", "NETBANKING", "TEST", "CASH", "BANK_TRANSFER", "OTHER"].includes(normalizedPaymentMode)) {
      return res.status(400).json({ success: false, message: "Unsupported payment mode" });
    }

    // --------------------------------------------------
    // 7. Validate postal address
    // --------------------------------------------------

    if (normalizedDeliveryType === "POSTAL") {
      if (
        !postalAddress ||
        typeof postalAddress !== "object" ||
        Array.isArray(postalAddress)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Postal address is required for physical delivery",
        });
      }

      const requiredPostalFields = [
        "recipientName",
        "addressLine1",
        "city",
        "district",
        "state",
        "pincode",
        "mobile",
      ];

      const missingPostalFields = requiredPostalFields.filter(
        (field) =>
          !postalAddress[field] ||
          String(postalAddress[field]).trim() === ""
      );

      if (missingPostalFields.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide all required postal address fields",
          missingFields: missingPostalFields,
        });
      }
    }

    // --------------------------------------------------
    // 8. Get authenticated student's profile
    // --------------------------------------------------

    const [studentRows] = await connection.query(
      `
      SELECT
        s.id AS student_id,
        s.roll_number,
        s.registration_number,
        s.hostel_status,

        d.id AS department_id,
        d.code AS department_code,
        d.name AS department_name

      FROM users u

      INNER JOIN students s
        ON s.user_id = u.id

      INNER JOIN departments d
        ON d.id = s.department_id

      WHERE u.id = ?

      LIMIT 1
      `,
      [req.user.userId]
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const student = studentRows[0];

    // --------------------------------------------------
    // 9. Find active document type
    // --------------------------------------------------

    const [documentRows] = await connection.query(
      `
      SELECT
        id,
        code,
        name,
        description

      FROM document_types

      WHERE code = ?
        AND is_active = 1

      LIMIT 1
      `,
      [documentTypeCode]
    );

    if (documentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Selected service is not available",
      });
    }

    const documentType = documentRows[0];

    // --------------------------------------------------
    // 10. Find required document requirements
    // --------------------------------------------------

    const [documentRequirementRows] =
      await connection.query(
        `
        SELECT
          sdr.id AS service_requirement_id,

          dr.id AS document_requirement_id,
          dr.document_code,
          dr.document_name,
          dr.description,
          dr.allowed_file_types,
          dr.max_file_size_mb,

          sdr.is_required,
          sdr.display_order

        FROM service_document_requirements sdr

        INNER JOIN document_requirements dr
          ON dr.id = sdr.document_requirement_id

        WHERE sdr.document_type_id = ?
          AND dr.is_active = 1

        ORDER BY
          sdr.display_order ASC,
          sdr.id ASC
        `,
        [documentType.id]
      );

    // --------------------------------------------------
    // 11. Validate uploaded documents
    // --------------------------------------------------

    const requirementMap = new Map();

    documentRequirementRows.forEach((requirement) => {
      requirementMap.set(
        String(requirement.document_requirement_id),
        requirement
      );
    });

    if (
      uploadedFiles.length !==
      documentRequirementIds.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Uploaded documents and document requirements do not match.",
      });
    }

    const uploadedRequirementIds = new Set();

    for (
      let index = 0;
      index < documentRequirementIds.length;
      index++
    ) {
      const requirementId = String(
        documentRequirementIds[index]
      );

      const requirement = requirementMap.get(
        requirementId
      );

      if (!requirement) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid document requirement submitted.",
          documentRequirementId: requirementId,
        });
      }

      if (uploadedRequirementIds.has(requirementId)) {
        return res.status(400).json({
          success: false,
          message:
            "Duplicate document requirement submitted.",
          documentRequirementId: requirementId,
        });
      }

      uploadedRequirementIds.add(requirementId);

      const file = uploadedFiles[index];

      if (!file) {
        return res.status(400).json({
          success: false,
          message:
            `File missing for ${requirement.document_name}.`,
        });
      }

      // Validate file size

      const maxSizeMb =
        Number(requirement.max_file_size_mb) || 5;

      const maxSizeBytes = maxSizeMb * 1024 * 1024;

      if (file.size > maxSizeBytes) {
        return res.status(400).json({
          success: false,
          message:
            `${requirement.document_name} exceeds the maximum file size of ${maxSizeMb} MB.`,
        });
      }

      // Validate file extension

      const extension = path
        .extname(file.originalname)
        .toLowerCase();

      const configuredTypes = String(
        requirement.allowed_file_types ||
          "PDF,JPG,JPEG,PNG"
      )
        .split(",")
        .map((type) => type.trim().toUpperCase());

      const allowedExtensions = configuredTypes
        .map((type) => {
          if (type === "PDF") return ".pdf";
          if (type === "JPG") return ".jpg";
          if (type === "JPEG") return ".jpeg";
          if (type === "PNG") return ".png";

          return null;
        })
        .filter(Boolean);

      if (!allowedExtensions.includes(extension)) {
        return res.status(400).json({
          success: false,
          message:
            `${requirement.document_name} must be one of: ${configuredTypes.join(
              ", "
            )}.`,
        });
      }
    }

    // Validate required documents

    const missingRequiredDocuments =
      documentRequirementRows.filter(
        (requirement) =>
          Boolean(requirement.is_required) &&
          !uploadedRequirementIds.has(
            String(
              requirement.document_requirement_id
            )
          )
      );

    if (missingRequiredDocuments.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Please upload all required documents.",
        missingDocuments:
          missingRequiredDocuments.map(
            (requirement) => ({
              documentRequirementId:
                requirement.document_requirement_id,

              documentCode:
                requirement.document_code,

              documentName:
                requirement.document_name,
            })
          ),
      });
    }

    // --------------------------------------------------
    // 12. Find active workflow
    // --------------------------------------------------

    const [workflowRows] = await connection.query(
      `
      SELECT
        id,
        document_type_id,
        name,
        description

      FROM workflow_definitions

      WHERE document_type_id = ?
        AND is_active = 1

      ORDER BY id ASC

      LIMIT 1
      `,
      [documentType.id]
    );

    const workflow =
      workflowRows.length > 0
        ? workflowRows[0]
        : null;

    // --------------------------------------------------
    // 13. No-Due requires workflow
    // --------------------------------------------------

    if (
      documentType.code === "NO_DUE" &&
      !workflow
    ) {
      return res.status(500).json({
        success: false,
        message: "No-Due workflow is not configured",
      });
    }

    // --------------------------------------------------
    // 14. Prevent duplicate applications
    // --------------------------------------------------

    // Start ONE transaction for the complete operation.
    await connection.beginTransaction();

    // Lock the student's row so simultaneous submissions
    // by the same student are serialized.
    await connection.query(
      `
      SELECT id
      FROM students
      WHERE id = ?
      FOR UPDATE
      `,
      [student.student_id]
    );

    // One application per student per service.
    // Existing requests of any status are considered.

    const [existingRows] = await connection.query(
      `
      SELECT
        r.id,
        r.request_number,
        r.status,
        r.created_at,
        dt.code AS document_code,
        dt.name AS document_name

      FROM requests r

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      WHERE r.student_id = ?
        AND r.document_type_id = ?

      ORDER BY r.created_at DESC

      LIMIT 1
      `,
      [
        student.student_id,
        documentType.id,
      ]
    );

    if (existingRows.length > 0) {
      await connection.rollback();

      return res.status(409).json({
        success: false,
        message:
          `You have already applied for ${documentType.name}. ` +
          "You cannot submit another application for this service.",
        existingRequest: existingRows[0],
      });
    }

    // --------------------------------------------------
    // 15. Generate request number
    // --------------------------------------------------

    const generateRequestNumber = () => {
      const date = new Date();

      const year = date.getFullYear();

      const month = String(
        date.getMonth() + 1
      ).padStart(2, "0");

      const day = String(
        date.getDate()
      ).padStart(2, "0");

      const randomPart = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      return `REQ-${year}${month}${day}-${randomPart}`;
    };

    let requestNumber = generateRequestNumber();

    // Ensure request number is unique

    let requestNumberExists = true;

    while (requestNumberExists) {
      const [numberRows] = await connection.query(
        `
        SELECT id
        FROM requests
        WHERE request_number = ?
        LIMIT 1
        `,
        [requestNumber]
      );

      if (numberRows.length === 0) {
        requestNumberExists = false;
      } else {
        requestNumber = generateRequestNumber();
      }
    }

    // --------------------------------------------------
    // 16. Determine initial request status
    // --------------------------------------------------

    const initialStatus =
      documentType.code === "NO_DUE"
        ? "CLEARANCE_IN_PROGRESS"
        : "SUBMITTED";

    // --------------------------------------------------
    // 17. Postal fee
    // --------------------------------------------------

    const postalFee =
      normalizedDeliveryType === "POSTAL"
        ? 200.0
        : 0.0;

    // --------------------------------------------------
    // 18. Payment and delivery status
    // --------------------------------------------------

    const paymentStatus =
      normalizedDeliveryType === "POSTAL"
        ? "PENDING"
        : "NOT_REQUIRED";

    const deliveryStatus =
      normalizedDeliveryType === "POSTAL"
        ? "PENDING_PAYMENT"
        : "NOT_REQUIRED";

    // --------------------------------------------------
    // 19. Create request
    // --------------------------------------------------

    const [requestResult] = await connection.query(
      `
      INSERT INTO requests (
        request_number,
        student_id,
        document_type_id,
        workflow_id,
        status,
        current_step,
        submitted_at
      )

      VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        requestNumber,
        student.student_id,
        documentType.id,
        workflow ? workflow.id : null,
        initialStatus,
        documentType.code === "NO_DUE"
          ? 1
          : null,
      ]
    );

    const requestId = requestResult.insertId;

    // --------------------------------------------------
    // 20. Create staff review for ordinary services
    // --------------------------------------------------

    /*
     * Routing confirmed from your database:
     *
     * Examination Section (ID 8):
     * FINAL_CERTIFICATE
     * PROVISIONAL_CERTIFICATE
     * GRADE_SHEET
     *
     * Establishment Section (ID 9):
     * CONDUCT_CERTIFICATE
     * CLC
     * CAUTION_MONEY
     *
     * NO_DUE is excluded and continues to use
     * clearance_tasks below.
     */

    // Route by stable section code, never by assumed numeric IDs.
    // Numeric IDs can differ between a fresh database and an existing college DB.
    const serviceSectionMap = {
      FINAL_CERTIFICATE: "EXAMINATION",
      PROVISIONAL_CERTIFICATE: "EXAMINATION",
      GRADE_SHEET: "EXAMINATION",
      CONDUCT_CERTIFICATE: "ESTABLISHMENT",
      CLC: "ESTABLISHMENT",
      CAUTION_MONEY: "ESTABLISHMENT",
    };

    const assignedSectionCode = serviceSectionMap[documentType.code];

    if (assignedSectionCode) {
      const [sectionRows] = await connection.query(
        `SELECT id FROM sections WHERE code = ? LIMIT 1`,
        [assignedSectionCode]
      );

      if (sectionRows.length === 0) {
        throw new Error(
          `Required college section '${assignedSectionCode}' is missing. Run the updated postal/certificate migration and retry.`
        );
      }

      await connection.query(
        `
        INSERT INTO request_staff_reviews (
          request_id,
          section_id,
          assigned_to,
          status
        )
        VALUES (?, ?, NULL, 'PENDING')
        `,
        [requestId, sectionRows[0].id]
      );
    }

    // --------------------------------------------------
    // 21. Move uploaded files into request directory
    // --------------------------------------------------

    const requestUploadDirectory = path.join(
      process.cwd(),
      "uploads",
      "requests",
      String(requestId)
    );

    fs.mkdirSync(
      requestUploadDirectory,
      {
        recursive: true,
      }
    );

    const storedFiles = [];

    for (
      let index = 0;
      index < uploadedFiles.length;
      index++
    ) {
      const file = uploadedFiles[index];

      const requirementId = String(
        documentRequirementIds[index]
      );

      const requirement = requirementMap.get(
        requirementId
      );

      const destinationPath = path.join(
        requestUploadDirectory,
        file.filename
      );

      fs.renameSync(
        file.path,
        destinationPath
      );

      // Track the actual moved path for rollback cleanup.
      movedFilePaths.push(destinationPath);

      storedFiles.push({
        file,
        requirement,
        destinationPath,
      });
    }

    // --------------------------------------------------
    // 22. Store application data
    // --------------------------------------------------

    await connection.query(
      `
      INSERT INTO request_application_data (
        request_id,
        application_data
      )

      VALUES (?, ?)
      `,
      [
        requestId,
        JSON.stringify(applicationData),
      ]
    );

    // --------------------------------------------------
    // 23. Store delivery information
    // --------------------------------------------------

    await connection.query(
      `
      INSERT INTO request_deliveries (
        request_id,
        delivery_type,
        postal_fee,
        payment_status,
        delivery_status,
        recipient_name,
        address_line1,
        address_line2,
        city,
        district,
        state,
        pincode,
        mobile
      )

      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      `,
      [
        requestId,
        normalizedDeliveryType,
        postalFee,
        paymentStatus,
        deliveryStatus,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.recipientName
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.addressLine1
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.addressLine2 || null
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.city
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.district
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.state
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.pincode
          : null,

        normalizedDeliveryType === "POSTAL"
          ? postalAddress.mobile
          : null,
      ]
    );

    // --------------------------------------------------
    // 24. Create payment record
    // --------------------------------------------------

    let paymentId = null;

    if (normalizedDeliveryType === "POSTAL") {
      const [paymentResult] =
        await connection.query(
          `
          INSERT INTO payments (
            request_id,
            payment_type,
            amount,
            gateway,
            payment_mode,
            status
          )

          VALUES (
            ?,
            'POSTAL_FEE',
            ?,
            'RAZORPAY',
            'OTHER',
            'PENDING'
          )
          `,
          [requestId, postalFee]
        );

      paymentId = paymentResult.insertId;
      await connection.query(
        `UPDATE request_deliveries SET payment_id = ? WHERE request_id = ?`,
        [paymentId, requestId]
      );
    }

    // --------------------------------------------------
    // 25. Save uploaded documents
    // --------------------------------------------------

    for (const storedFile of storedFiles) {
      const {
        file,
        requirement,
        destinationPath,
      } = storedFile;

      await connection.query(
        `
        INSERT INTO request_documents (
          request_id,
          document_requirement_id,
          uploaded_by,
          original_name,
          stored_name,
          file_path,
          mime_type,
          file_size,
          document_type,
          version
        )

        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        `,
        [
          requestId,
          requirement.document_requirement_id,
          req.user.userId,
          file.originalname,
          file.filename,

          path.relative(
            process.cwd(),
            destinationPath
          ),

          file.mimetype,
          file.size,
          requirement.document_code,
          1,
        ]
      );
    }

    // --------------------------------------------------
    // 26. Create No-Due record and tasks
    // --------------------------------------------------

    if (documentType.code === "NO_DUE") {
      // Get workflow steps

      const [workflowSteps] =
        await connection.query(
          `
          SELECT
            ws.id,
            ws.workflow_id,
            ws.step_order,
            ws.section_id,
            ws.condition_type,
            ws.is_required,

            s.code AS section_code,
            s.name AS section_name

          FROM workflow_steps ws

          INNER JOIN sections s
            ON s.id = ws.section_id

          WHERE ws.workflow_id = ?

          ORDER BY ws.step_order ASC
          `,
          [workflow.id]
        );

      // Select workflow steps for this student

      const selectedSteps = workflowSteps.filter(
        (step) => {
          // HOD routing

          if (step.section_code.startsWith("HOD_")) {
            return (
              step.is_required === 1 &&
              step.section_code ===
                `HOD_${student.department_code}`
            );
          }

          // Boys Warden

          if (step.section_code === "WARDEN_BOYS") {
            return (
              student.hostel_status === "HOSTELLER" &&
              step.condition_type === "HOSTELLER_ONLY"
            );
          }

          // Girls Warden

          if (step.section_code === "WARDEN_GIRLS") {
            return false;
          }

          // Required ALWAYS sections

          if (
            step.condition_type === "ALWAYS" &&
            step.is_required === 1
          ) {
            return true;
          }

          // Other conditional sections

          return false;
        }
      );

      // Safety check

      if (selectedSteps.length === 0) {
        throw new Error(
          "No valid clearance tasks could be generated for this student"
        );
      }

      // Create No-Due record

      const totalTasks = selectedSteps.length;

      const [noDueResult] =
        await connection.query(
          `
          INSERT INTO no_due_requests (
            request_id,
            overall_status,
            total_tasks,
            completed_tasks,
            pending_tasks,
            correction_tasks,
            rejected_tasks
          )

          VALUES (
            ?,
            'CLEARANCE_IN_PROGRESS',
            ?,
            0,
            ?,
            0,
            0
          )
          `,
          [
            requestId,
            totalTasks,
            totalTasks,
          ]
        );

      const noDueRequestId = noDueResult.insertId;

      // Create clearance tasks

      for (const step of selectedSteps) {
        await connection.query(
          `
          INSERT INTO clearance_tasks (
            no_due_request_id,
            workflow_step_id,
            section_id,
            assigned_to,
            status,
            is_required
          )

          VALUES (
            ?,
            ?,
            ?,
            NULL,
            'PENDING',
            1
          )
          `,
          [
            noDueRequestId,
            step.id,
            step.section_id,
          ]
        );
      }
    }

    // --------------------------------------------------
    // 27. Create initial status history
    // --------------------------------------------------

    await connection.query(
      `
      INSERT INTO request_status_history (
        request_id,
        changed_by,
        old_status,
        new_status,
        remarks
      )

      VALUES (?, ?, ?, ?, ?)
      `,
      [
        requestId,
        req.user.userId,
        "DRAFT",
        initialStatus,
        "Request submitted by student",
      ]
    );

    // --------------------------------------------------
    // 28. Create audit log
    // --------------------------------------------------

    await connection.query(
      `
      INSERT INTO audit_logs (
        user_id,
        request_id,
        action,
        entity_type,
        entity_id,
        description
      )

      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.userId,
        requestId,
        "REQUEST_SUBMITTED",
        "REQUEST",
        requestId,
        `Student submitted ${documentType.name} request with ${storedFiles.length} uploaded document(s).`,
      ]
    );

    // --------------------------------------------------
    // 29. Commit transaction
    // --------------------------------------------------

    await connection.commit();

    // --------------------------------------------------
    // 30. Prepare document requirements response
    // --------------------------------------------------

    const requiredDocuments =
      documentRequirementRows.map(
        (requirement) => ({
          serviceRequirementId:
            requirement.service_requirement_id,

          documentRequirementId:
            requirement.document_requirement_id,

          documentCode:
            requirement.document_code,

          documentName:
            requirement.document_name,

          description:
            requirement.description,

          allowedFileTypes:
            requirement.allowed_file_types,

          maxFileSizeMb:
            requirement.max_file_size_mb,

          isRequired:
            Boolean(requirement.is_required),

          displayOrder:
            requirement.display_order,
        })
      );

    // --------------------------------------------------
    // 31. Prepare uploaded document response
    // --------------------------------------------------

    const uploadedDocuments = storedFiles.map(
      ({
        file,
        requirement,
      }) => ({
        documentRequirementId:
          requirement.document_requirement_id,

        documentCode:
          requirement.document_code,

        documentName:
          requirement.document_name,

        originalName:
          file.originalname,

        fileSize:
          file.size,

        mimeType:
          file.mimetype,

        version: 1,
      })
    );

    // --------------------------------------------------
    // 32. Return created request
    // --------------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        documentType.code === "NO_DUE"
          ? "No-Due request submitted successfully"
          : "Service request submitted successfully",

      request: {
        id: requestId,

        requestNumber,

        documentType: documentType.code,

        documentName: documentType.name,

        status: initialStatus,

        workflowId: workflow
          ? workflow.id
          : null,

        deliveryType: normalizedDeliveryType,

        postalFee,

        paymentStatus,

        deliveryStatus,

        paymentId,

        requiredDocuments,

        uploadedDocuments,
      },
    });
  } catch (error) {
    // --------------------------------------------------
    // Rollback transaction
    // --------------------------------------------------

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error(
        "Transaction rollback failed:",
        rollbackError
      );
    }

    // --------------------------------------------------
    // Clean up files moved into request directory
    // --------------------------------------------------

    for (const filePath of movedFilePaths) {
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileError) {
        console.error(
          "Moved file cleanup failed:",
          fileError
        );
      }
    }

    // --------------------------------------------------
    // Clean up files still in Multer's upload directory
    // --------------------------------------------------

    for (const file of uploadedFiles) {
      try {
        if (file?.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (fileError) {
        console.error(
          "Uploaded file cleanup failed:",
          fileError
        );
      }
    }

    console.error(
      "Create student request error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to create service request",

      // Local development should expose the actionable SQL/constraint error.
      // Keep details hidden in production.
      error:
        process.env.NODE_ENV !== "production"
          ? error.message
          : undefined,
      code: error.code || undefined,
    });
  } finally {
    connection.release();
  }
};

// =========================================================
// GET STUDENT REQUESTS
// =========================================================

const getStudentRequests = async (
  req,
  res
) => {
  try {
    // --------------------------------------------------
    // 1. Get authenticated student's ID
    // --------------------------------------------------

    const userId =
      req.user.userId;

    const [studentRows] =
      await pool.query(
        `
        SELECT
          s.id AS student_id

        FROM users u

        INNER JOIN students s
          ON s.user_id = u.id

        WHERE u.id = ?

        LIMIT 1
        `,
        [userId]
      );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "Student profile not found",
      });
    }

    const studentId =
      studentRows[0].student_id;

    // --------------------------------------------------
    // 2. Get requests
    // --------------------------------------------------

    const [requests] =
      await pool.query(
        `
        SELECT
          r.id,
          r.request_number,
          r.status,
          r.current_step,
          r.submitted_at,
          r.completed_at,
          r.created_at,
          r.updated_at,

          dt.id AS document_type_id,
          dt.code AS document_code,
          dt.name AS document_name,
          dt.description AS document_description

        FROM requests r

        INNER JOIN document_types dt
          ON dt.id = r.document_type_id

        WHERE r.student_id = ?

        ORDER BY r.created_at DESC
        `,
        [studentId]
      );

    // --------------------------------------------------
    // 3. Add delivery information
    // --------------------------------------------------

    const formattedRequests =
      await Promise.all(
        requests.map(
          async (request) => {
            const [deliveryRows] =
              await pool.query(
                `
                SELECT
                  delivery_type,
                  postal_fee,
                  payment_status,
                  payment_id,
                  delivery_status,
                  recipient_name,
                  address_line1,
                  address_line2,
                  city,
                  district,
                  state,
                  pincode,
                  mobile,
                  courier_name,
                  tracking_number,
                  dispatched_at,
                  delivered_at

                FROM request_deliveries

                WHERE request_id = ?

                LIMIT 1
                `,
                [request.id]
              );

            return {
              ...request,

              delivery:
                deliveryRows.length > 0
                  ? deliveryRows[0]
                  : null,
            };
          }
        )
      );

    return res.json({
      success: true,
      requests: formattedRequests,
    });
  } catch (error) {
    console.error(
      "Student requests error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load student requests",
    });
  }
};

// =========================================================
// GET SINGLE STUDENT REQUEST DETAILS
// =========================================================

const getStudentRequestDetails = async (
  req,
  res
) => {
  try {
    const userId =
      req.user.userId;

    const requestId =
      Number(req.params.requestId);

    // --------------------------------------------------
    // 1. Validate request ID
    // --------------------------------------------------

    if (
      !Number.isInteger(requestId) ||
      requestId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid request ID",
      });
    }

    // --------------------------------------------------
    // 2. Get student profile
    // --------------------------------------------------

    const [studentRows] =
      await pool.query(
        `
        SELECT
          s.id AS student_id,
          s.user_id,

          u.name,
          u.email,
          u.phone,

          s.roll_number,
          s.registration_number,
          s.batch,
          s.admission_year,
          s.passing_year,
          s.hostel_status,
          s.gender,
          s.date_of_birth,
          s.address,

          d.id AS department_id,
          d.code AS department_code,
          d.name AS department_name

        FROM students s

        INNER JOIN users u
          ON u.id = s.user_id

        LEFT JOIN departments d
          ON d.id = s.department_id

        WHERE s.user_id = ?

        LIMIT 1
        `,
        [userId]
      );

    if (
      studentRows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Student profile not found",
      });
    }

    const student =
      studentRows[0];

    // --------------------------------------------------
    // 3. Get request
    // --------------------------------------------------

    const [requestRows] =
      await pool.query(
        `
        SELECT
          r.id,
          r.student_id,
          r.request_number,
          r.document_type_id,
          r.workflow_id,
          r.status,
          r.current_step,
          r.submitted_at,
          r.completed_at,
          r.created_at,
          r.updated_at,

          dt.code AS document_code,
          dt.name AS document_name,
          dt.description AS document_description

        FROM requests r

        INNER JOIN document_types dt
          ON dt.id = r.document_type_id

        WHERE r.id = ?

          AND r.student_id = ?

        LIMIT 1
        `,
        [
          requestId,
          student.student_id,
        ]
      );

    if (
      requestRows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Request not found",
      });
    }

    const request =
      requestRows[0];

    // --------------------------------------------------
    // 4. Get application data
    // --------------------------------------------------

    const [
      applicationRows,
    ] = await pool.query(
      `
      SELECT
        id,
        request_id,
        application_data,
        created_at,
        updated_at

      FROM request_application_data

      WHERE request_id = ?

      LIMIT 1
      `,
      [requestId]
    );

    let applicationData = null;

    if (
      applicationRows.length > 0
    ) {
      applicationData =
        applicationRows[0]
          .application_data;

      if (
        typeof applicationData ===
        "string"
      ) {
        try {
          applicationData =
            JSON.parse(
              applicationData
            );
        } catch (parseError) {
          console.error(
            "Application data JSON parse error:",
            parseError
          );
        }
      }
    }

    // --------------------------------------------------
    // 5. Get delivery information
    // --------------------------------------------------

    const [
      deliveryRows,
    ] = await pool.query(
      `
      SELECT
        id,
        request_id,
        delivery_type,
        postal_fee,
        payment_status,
        payment_id,
        recipient_name,
        address_line1,
        address_line2,
        city,
        district,
        state,
        pincode,
        mobile,
        delivery_status,
        courier_name,
        tracking_number,
        dispatched_at,
        delivered_at,
        created_at,
        updated_at

      FROM request_deliveries

      WHERE request_id = ?

      LIMIT 1
      `,
      [requestId]
    );

    const delivery =
      deliveryRows.length > 0
        ? deliveryRows[0]
        : null;

    if (delivery) {
      const [deliveryEvents] = await pool.query(
        `SELECT status, location, remarks, created_at
         FROM postal_tracking_events
         WHERE delivery_id = ?
         ORDER BY created_at DESC, id DESC`,
        [delivery.id]
      );
      delivery.events = deliveryEvents;
    }

    // --------------------------------------------------
    // 6. Get payment information
    // --------------------------------------------------

    const [paymentRows] =
      await pool.query(
        `
        SELECT
          id,
          request_id,
          payment_type,
          amount,
          gateway,
          payment_mode,
          transaction_id,
          status,
          paid_at,
          created_at,
          updated_at

        FROM payments

        WHERE request_id = ?

        ORDER BY id DESC
        `,
        [requestId]
      );

    // --------------------------------------------------
    // 7. Get uploaded documents
    // --------------------------------------------------

    const [documentRows] =
      await pool.query(
        `
        SELECT
          id,
          request_id,
          uploaded_by,
          document_type,
          original_name,
          stored_name,
          file_path,
          mime_type,
          file_size,
          version,
          created_at

        FROM request_documents

        WHERE request_id = ?

        ORDER BY
          created_at ASC,
          id ASC
        `,
        [requestId]
      );

    // --------------------------------------------------
    // 8. Get status history
    // --------------------------------------------------

    const [historyRows] =
      await pool.query(
        `
        SELECT
          id,
          request_id,
          changed_by,
          old_status,
          new_status,
          remarks,
          created_at

        FROM request_status_history

        WHERE request_id = ?

        ORDER BY
          created_at ASC,
          id ASC
        `,
        [requestId]
      );

    // --------------------------------------------------
    // 9. No-Due details
    // --------------------------------------------------

    let noDue = null;
    let clearanceTasks = [];

    if (
      request.document_code ===
      "NO_DUE"
    ) {
      // ----------------------------------------------
      // No-Due summary
      // ----------------------------------------------

      const [noDueRows] =
        await pool.query(
          `
          SELECT
            id,
            request_id,
            overall_status,
            total_tasks,
            completed_tasks,
            pending_tasks,
            correction_tasks,
            rejected_tasks,
            final_approved_by,
            final_approved_at,
            created_at,
            updated_at

          FROM no_due_requests

          WHERE request_id = ?

          LIMIT 1
          `,
          [requestId]
        );

      noDue =
        noDueRows.length > 0
          ? noDueRows[0]
          : null;

      // ----------------------------------------------
      // Clearance tasks
      // ----------------------------------------------

      if (noDue) {
        const [taskRows] =
          await pool.query(
            `
            SELECT
              ct.id,
              ct.no_due_request_id,
              ct.workflow_step_id,
              ct.section_id,
              ct.assigned_to,

              ct.status,
              ct.is_required,
              ct.remarks,
              ct.correction_reason,

              ct.started_at,
              ct.completed_at,
              ct.created_at,
              ct.updated_at,

              ws.step_order,
              ws.is_required AS workflow_step_required,
              ws.condition_type,
              ws.condition_value,

              sec.code AS section_code,
              sec.name AS section_name

            FROM clearance_tasks ct

            LEFT JOIN workflow_steps ws
              ON ws.id = ct.workflow_step_id

            LEFT JOIN sections sec
              ON sec.id = ct.section_id

            WHERE ct.no_due_request_id = ?

            ORDER BY
              ws.step_order ASC,
              ct.id ASC
            `,
            [noDue.id]
          );

        clearanceTasks =
          taskRows;
      }
    }

    // --------------------------------------------------
    // 10. Get certificates
    // --------------------------------------------------

    const [certificateRows] =
      await pool.query(
        `
        SELECT
          id,
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
          generated_by,
          created_at

        FROM certificates

        WHERE request_id = ?

        ORDER BY
          issue_date DESC,
          id DESC
        `,
        [requestId]
      );

    // --------------------------------------------------
    // 11. Format documents
    // --------------------------------------------------

    const documents =
      documentRows.map(
        (document) => ({
          id: document.id,

          requestId:
            document.request_id,

          uploadedBy:
            document.uploaded_by,

          documentType:
            document.document_type,

          originalName:
            document.original_name,

          storedName:
            document.stored_name,

          filePath:
            document.file_path,

          mimeType:
            document.mime_type,

          fileSize:
            document.file_size,

          version:
            document.version,

          uploadedAt:
            document.created_at,
        })
      );

    // --------------------------------------------------
    // 12. Format status history
    // --------------------------------------------------

    const statusHistory =
      historyRows.map(
        (history) => ({
          id: history.id,

          requestId:
            history.request_id,

          changedBy:
            history.changed_by,

          oldStatus:
            history.old_status,

          newStatus:
            history.new_status,

          remarks:
            history.remarks,

          createdAt:
            history.created_at,
        })
      );

    // --------------------------------------------------
    // 13. Format clearance tasks
    // --------------------------------------------------

    const formattedClearanceTasks =
      clearanceTasks.map(
        (task) => ({
          id: task.id,

          noDueRequestId:
            task.no_due_request_id,

          workflowStepId:
            task.workflow_step_id,

          sectionId:
            task.section_id,

          assignedTo:
            task.assigned_to,

          status:
            task.status,

          isRequired:
            Boolean(
              task.is_required
            ),

          remarks:
            task.remarks,

          correctionReason:
            task.correction_reason,

          startedAt:
            task.started_at,

          completedAt:
            task.completed_at,

          createdAt:
            task.created_at,

          updatedAt:
            task.updated_at,

          stepOrder:
            task.step_order,

          workflowStepRequired:
            Boolean(
              task.workflow_step_required
            ),

          conditionType:
            task.condition_type,

          conditionValue:
            task.condition_value,

          section: {
            id:
              task.section_id,

            code:
              task.section_code,

            name:
              task.section_name,
          },
        })
      );

    // --------------------------------------------------
    // 14. Format certificates
    // --------------------------------------------------

    const certificates =
      certificateRows.map(
        (certificate) => ({
          id:
            certificate.id,

          requestId:
            certificate.request_id,

          certificateNumber:
            certificate.certificate_number,

          certificateType:
            certificate.certificate_type,

          studentName:
            certificate.student_name,

          rollNumber:
            certificate.roll_number,

          registrationNumber:
            certificate.registration_number,

          departmentName:
            certificate.department_name,

          issueDate:
            certificate.issue_date,

          filePath:
            certificate.file_path,

          qrCodeData:
            certificate.qr_code_data,

          generatedBy:
            certificate.generated_by,

          createdAt:
            certificate.created_at,
        })
      );

    // --------------------------------------------------
    // 15. Format No-Due
    // --------------------------------------------------

    const formattedNoDue =
      noDue
        ? {
            id:
              noDue.id,

            requestId:
              noDue.request_id,

            overallStatus:
              noDue.overall_status,

            totalTasks:
              noDue.total_tasks,

            completedTasks:
              noDue.completed_tasks,

            pendingTasks:
              noDue.pending_tasks,

            correctionTasks:
              noDue.correction_tasks,

            rejectedTasks:
              noDue.rejected_tasks,

            finalApprovedBy:
              noDue.final_approved_by,

            finalApprovedAt:
              noDue.final_approved_at,

            createdAt:
              noDue.created_at,

            updatedAt:
              noDue.updated_at,
          }
        : null;

    // --------------------------------------------------
    // 16. Return complete request details
    // --------------------------------------------------

    return res.json({
      success: true,

      request: {
        id:
          request.id,

        requestNumber:
          request.request_number,

        documentTypeId:
          request.document_type_id,

        documentCode:
          request.document_code,

        documentName:
          request.document_name,

        documentDescription:
          request.document_description,

        workflowId:
          request.workflow_id,

        status:
          request.status,

        currentStep:
          request.current_step,

        submittedAt:
          request.submitted_at,

        completedAt:
          request.completed_at,

        createdAt:
          request.created_at,

        updatedAt:
          request.updated_at,

        student: {
          id:
            student.student_id,

          userId:
            student.user_id,

          name:
            student.name,

          email:
            student.email,

          phone:
            student.phone,

          rollNumber:
            student.roll_number,

          registrationNumber:
            student.registration_number,

          batch:
            student.batch,

          admissionYear:
            student.admission_year,

          passingYear:
            student.passing_year,

          hostelStatus:
            student.hostel_status,

          gender:
            student.gender,

          dateOfBirth:
            student.date_of_birth,

          address:
            student.address,

          department: {
            id:
              student.department_id,

            code:
              student.department_code,

            name:
              student.department_name,
          },
        },

        // Application form data
        applicationData,

        // Delivery information
        delivery,

        // Payment information
        payments:
          paymentRows,

        documents,

        statusHistory,

        noDue:
          formattedNoDue,

        clearanceTasks:
          formattedClearanceTasks,

        certificates,
      },
    });
  } catch (error) {
    console.error(
      "Get student request details error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to fetch request details",

      error:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined,
    });
  }
};

// =========================================================
// RESUBMIT CORRECTED STUDENT REQUEST
// =========================================================

const resubmitStudentRequest = async (req, res) => {
  let connection;

  try {
    const userId = req.user.userId;
    const requestId = Number(req.params.requestId);

    // --------------------------------------------------
    // 1. Validate request ID
    // --------------------------------------------------

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID",
      });
    }

    // --------------------------------------------------
    // 2. Get database connection
    // --------------------------------------------------

    connection = await pool.getConnection();

    await connection.beginTransaction();

    // --------------------------------------------------
    // 3. Verify student profile
    // --------------------------------------------------

    const [studentRows] = await connection.query(
      `
      SELECT
        s.id AS student_id

      FROM students s

      INNER JOIN users u
        ON u.id = s.user_id

      WHERE u.id = ?

      LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      });
    }

    const studentId = studentRows[0].student_id;

    // --------------------------------------------------
    // 4. Get student's request
    // --------------------------------------------------

    const [requestRows] = await connection.query(
      `
      SELECT
        r.id,
        r.student_id,
        r.request_number,
        r.document_type_id,
        r.status,

        dt.code AS document_code,
        dt.name AS document_name

      FROM requests r

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      WHERE r.id = ?
        AND r.student_id = ?

      LIMIT 1
      `,
      [
        requestId,
        studentId,
      ]
    );

    if (requestRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const request = requestRows[0];

    // --------------------------------------------------
    // 5. Only correction-required requests can be
    //    resubmitted
    // --------------------------------------------------

    if (request.status !== "CORRECTION_REQUIRED") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Only requests marked for correction can be resubmitted",
        currentStatus: request.status,
      });
    }

    // --------------------------------------------------
    // 6. Handle regular-service correction resubmission
    // --------------------------------------------------

    if (request.document_code !== "NO_DUE") {
      // Find the staff review for this service request.

      const [reviewRows] = await connection.query(
        `
        SELECT
          id,
          request_id,
          section_id,
          assigned_to,
          status,
          remarks,
          correction_reason

        FROM request_staff_reviews

        WHERE request_id = ?

          AND status = 'CORRECTION_REQUIRED'

        LIMIT 1

        FOR UPDATE
        `,
        [requestId]
      );

      if (reviewRows.length === 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message:
            "No staff review is currently waiting for correction.",
        });
      }

      const review = reviewRows[0];

      // Return the same review to the same section.
      // Do not create a new review record.

      await connection.query(
        `
        UPDATE request_staff_reviews

        SET
          status = 'RESUBMITTED',
          assigned_to = NULL,
          started_at = NULL,
          completed_at = NULL

        WHERE id = ?

          AND request_id = ?
        `,
        [
          review.id,
          requestId,
        ]
      );

      // Update the main request status.

      await connection.query(
        `
        UPDATE requests

        SET status = 'RESUBMITTED'

        WHERE id = ?

          AND student_id = ?
        `,
        [
          requestId,
          studentId,
        ]
      );

      // Record the status change.

      await connection.query(
        `
        INSERT INTO request_status_history (
          request_id,
          changed_by,
          old_status,
          new_status,
          remarks
        )

        VALUES (?, ?, ?, ?, ?)
        `,
        [
          requestId,
          userId,
          "CORRECTION_REQUIRED",
          "RESUBMITTED",
          `Student resubmitted corrected documents for ${request.document_name}.`,
        ]
      );

      // Record the audit entry.

      await connection.query(
        `
        INSERT INTO audit_logs (
          user_id,
          request_id,
          action,
          entity_type,
          entity_id,
          description
        )

        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          requestId,
          "SERVICE_REQUEST_RESUBMITTED",
          "REQUEST_STAFF_REVIEW",
          review.id,
          `Student resubmitted ${request.document_name} for review by section ${review.section_id}.`,
        ]
      );

      await connection.commit();

      return res.json({
        success: true,

        message:
          "Corrected service request resubmitted successfully.",

        request: {
          id: request.id,
          requestNumber: request.request_number,
          documentType: request.document_code,
          documentName: request.document_name,
          status: "RESUBMITTED",
        },

        resubmittedReview: {
          id: review.id,
          sectionId: review.section_id,
          status: "RESUBMITTED",
        },
      });
    }

    // --------------------------------------------------
    // 7. No-Due continues through its existing workflow
    // --------------------------------------------------

    // Do not add an else block here.
    // The existing No-Due correction-task code below
    // should remain unchanged.

    // --------------------------------------------------
    // 7. Get correction-required clearance tasks
    // --------------------------------------------------

    const [correctionTasks] = await connection.query(
      `
      SELECT
        ct.id,
        ct.no_due_request_id,
        ct.section_id,
        ct.status,
        ct.remarks,
        ct.correction_reason

      FROM clearance_tasks ct

      INNER JOIN no_due_requests ndr
        ON ndr.id = ct.no_due_request_id

      WHERE ndr.request_id = ?
        AND ct.status = 'CORRECTION_REQUIRED'

      ORDER BY ct.id ASC
      `,
      [requestId]
    );

    if (correctionTasks.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "No clearance task is currently waiting for correction",
      });
    }

    // --------------------------------------------------
    // 8. Change correction tasks to RESUBMITTED
    // --------------------------------------------------
    //
    // Keep section_id unchanged so the SAME section can
    // review the corrected request again.
    //
    // assigned_to is cleared because the request is
    // returning to the section's pending queue.
    // --------------------------------------------------

    for (const task of correctionTasks) {
      await connection.query(
        `
        UPDATE clearance_tasks

        SET
          status = 'RESUBMITTED',
          assigned_to = NULL,
          started_at = NULL,
          completed_at = NULL

        WHERE id = ?
        `,
        [task.id]
      );
    }

    // --------------------------------------------------
    // 9. Change main request status
    // --------------------------------------------------

    await connection.query(
      `
      UPDATE requests

      SET
        status = 'RESUBMITTED'

      WHERE id = ?
        AND student_id = ?
      `,
      [
        requestId,
        studentId,
      ]
    );

    // --------------------------------------------------
    // 10. Recalculate No-Due task statistics
    // --------------------------------------------------

    const [taskStats] = await connection.query(
      `
      SELECT
        COUNT(*) AS total_tasks,

        SUM(
          CASE
            WHEN status = 'APPROVED'
            THEN 1
            ELSE 0
          END
        ) AS completed_tasks,

        SUM(
          CASE
            WHEN status IN (
              'PENDING',
              'UNDER_REVIEW',
              'RESUBMITTED'
            )
            THEN 1
            ELSE 0
          END
        ) AS pending_tasks,

        SUM(
          CASE
            WHEN status = 'CORRECTION_REQUIRED'
            THEN 1
            ELSE 0
          END
        ) AS correction_tasks,

        SUM(
          CASE
            WHEN status = 'REJECTED'
            THEN 1
            ELSE 0
          END
        ) AS rejected_tasks

      FROM clearance_tasks

      WHERE no_due_request_id = (
        SELECT id
        FROM no_due_requests
        WHERE request_id = ?
        LIMIT 1
      )
      `,
      [requestId]
    );

    const stats = taskStats[0];

    // --------------------------------------------------
    // 11. Update No-Due summary
    // --------------------------------------------------

    await connection.query(
      `
      UPDATE no_due_requests

      SET
        overall_status = 'CLEARANCE_IN_PROGRESS',
        total_tasks = ?,
        completed_tasks = ?,
        pending_tasks = ?,
        correction_tasks = ?,
        rejected_tasks = ?

      WHERE request_id = ?
      `,
      [
        Number(stats.total_tasks || 0),
        Number(stats.completed_tasks || 0),
        Number(stats.pending_tasks || 0),
        Number(stats.correction_tasks || 0),
        Number(stats.rejected_tasks || 0),
        requestId,
      ]
    );

    // --------------------------------------------------
    // 12. Add request status history
    // --------------------------------------------------

    await connection.query(
      `
      INSERT INTO request_status_history (
        request_id,
        changed_by,
        old_status,
        new_status,
        remarks
      )

      VALUES (?, ?, ?, ?, ?)
      `,
      [
        requestId,
        userId,
        "CORRECTION_REQUIRED",
        "RESUBMITTED",
        "Student resubmitted the corrected request",
      ]
    );

    // --------------------------------------------------
    // 13. Commit transaction
    // --------------------------------------------------

    await connection.commit();

    // --------------------------------------------------
    // 14. Return success
    // --------------------------------------------------

    return res.json({
      success: true,

      message:
        "Corrected request resubmitted successfully",

      request: {
        id: request.id,
        requestNumber: request.request_number,
        documentType: request.document_code,
        documentName: request.document_name,
        status: "RESUBMITTED",
      },

      resubmittedTasks: correctionTasks.map(
        (task) => ({
          taskId: task.id,
          sectionId: task.section_id,
          status: "RESUBMITTED",
        })
      ),
    });
  } catch (error) {
    // --------------------------------------------------
    // Rollback on error
    // --------------------------------------------------

    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Resubmission rollback failed:",
          rollbackError
        );
      }
    }

    console.error(
      "Resubmit student request error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to resubmit corrected request",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// =========================================================
// UPLOAD CORRECTED DOCUMENT
// Supports No-Due and regular service requests
// =========================================================

const uploadCorrectedDocument = async (req, res) => {
  let connection;

  try {
    const requestId = Number(req.params.requestId);
    const userId = req.user.userId;
    const { documentType } = req.body;

    // --------------------------------------------------
    // 1. Validate input
    // --------------------------------------------------

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid request ID.",
      });
    }

    if (!documentType || !String(documentType).trim()) {
      return res.status(400).json({
        success: false,
        message: "Document type is required.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a document.",
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // --------------------------------------------------
    // 2. Find logged-in student's database ID
    // --------------------------------------------------

    const [studentRows] = await connection.query(
      `
      SELECT id
      FROM students
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Student profile not found.",
      });
    }

    const studentId = studentRows[0].id;

    // --------------------------------------------------
    // 3. Verify request belongs to this student
    // --------------------------------------------------

    const [requestRows] = await connection.query(
      `
      SELECT
        r.id,
        r.student_id,
        r.status,
        r.document_type_id,
        dt.code AS document_code,
        dt.name AS document_name

      FROM requests r

      INNER JOIN document_types dt
        ON dt.id = r.document_type_id

      WHERE r.id = ?
        AND r.student_id = ?

      LIMIT 1
      FOR UPDATE
      `,
      [requestId, studentId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: "Request not found.",
      });
    }

    const request = requestRows[0];

    // --------------------------------------------------
    // 4. Only correction-required requests can upload
    // --------------------------------------------------

    if (request.status !== "CORRECTION_REQUIRED") {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message:
          "Corrected documents can only be uploaded for requests marked CORRECTION_REQUIRED.",
        currentStatus: request.status,
      });
    }

    // --------------------------------------------------
    // 5. Check the correct review workflow
    // --------------------------------------------------

    let correctionTasks = [];
    let correctionReviews = [];

    if (request.document_code === "NO_DUE") {
      // ----------------------------------------------
      // No-Due: check correction-required clearance
      // tasks from the different college sections
      // ----------------------------------------------

      const [tasks] = await connection.query(
        `
        SELECT
          ct.id,
          ct.section_id,
          ct.status,
          ct.remarks,
          ct.correction_reason,
          s.code AS section_code,
          s.name AS section_name

        FROM clearance_tasks ct

        INNER JOIN sections s
          ON s.id = ct.section_id

        WHERE ct.no_due_request_id = (
          SELECT id
          FROM no_due_requests
          WHERE request_id = ?
          LIMIT 1
        )
          AND ct.status = 'CORRECTION_REQUIRED'
          AND ct.is_required = 1
        `,
        [requestId]
      );

      correctionTasks = tasks;

      if (correctionTasks.length === 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message:
            "No required section is currently waiting for a correction.",
        });
      }
    } else {
      // ----------------------------------------------
      // Regular services: check request_staff_reviews
      // for the section asking for corrections
      // ----------------------------------------------

      const [reviews] = await connection.query(
        `
        SELECT
          rsr.id,
          rsr.request_id,
          rsr.section_id,
          rsr.assigned_to,
          rsr.status,
          rsr.remarks,
          rsr.correction_reason,
          s.code AS section_code,
          s.name AS section_name

        FROM request_staff_reviews rsr

        INNER JOIN sections s
          ON s.id = rsr.section_id

        WHERE rsr.request_id = ?
          AND rsr.status = 'CORRECTION_REQUIRED'

        FOR UPDATE
        `,
        [requestId]
      );

      correctionReviews = reviews;

      if (correctionReviews.length === 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message:
            "No section is currently waiting for a correction.",
        });
      }
    }

    // --------------------------------------------------
    // 6. Calculate new document version
    // --------------------------------------------------

    const [latestDocuments] = await connection.query(
      `
      SELECT
        COALESCE(MAX(version), 0) AS latestVersion

      FROM request_documents

      WHERE request_id = ?
        AND document_type = ?
      `,
      [requestId, documentType]
    );

    const latestVersion =
      Number(latestDocuments[0]?.latestVersion) || 0;

    const newVersion = latestVersion + 1;

    // --------------------------------------------------
    // 7. Store corrected document in database
    // --------------------------------------------------

    const relativeFilePath = path
      .join(
        "uploads",
        "requests",
        String(requestId),
        req.file.filename
      )
      .replace(/\\/g, "/");

    const [documentResult] = await connection.query(
      `
      INSERT INTO request_documents (
        request_id,
        uploaded_by,
        original_name,
        stored_name,
        file_path,
        mime_type,
        file_size,
        document_type,
        version
      )

      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        requestId,
        userId,
        req.file.originalname,
        req.file.filename,
        relativeFilePath,
        req.file.mimetype,
        req.file.size,
        documentType,
        newVersion,
      ]
    );

    // --------------------------------------------------
    // 8. Add audit log
    // --------------------------------------------------

    await connection.query(
      `
      INSERT INTO audit_logs (
        user_id,
        request_id,
        action,
        entity_type,
        entity_id,
        description
      )

      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        requestId,
        "CORRECTED_DOCUMENT_UPLOADED",
        "REQUEST_DOCUMENT",
        documentResult.insertId,
        `Corrected document uploaded: ${req.file.originalname}, version ${newVersion}`,
      ]
    );

    // --------------------------------------------------
    // 9. Commit transaction
    // --------------------------------------------------

    await connection.commit();

    // IMPORTANT:
    // Do not change the request or review status here.
    // The student must click the separate Resubmit button
    // after uploading all corrected documents.

    return res.status(201).json({
      success: true,

      message:
        "Corrected document uploaded successfully.",

      workflowType:
        request.document_code === "NO_DUE"
          ? "NO_DUE"
          : "REGULAR_SERVICE",

      document: {
        id: documentResult.insertId,
        requestId,
        documentType,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        filePath: relativeFilePath,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        version: newVersion,
      },

      pendingCorrections: {
        clearanceTasks: correctionTasks.length,
        staffReviews: correctionReviews.length,
      },
    });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Upload rollback failed:",
          rollbackError
        );
      }
    }

    console.error(
      "Upload corrected document error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to upload corrected document.",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [rows] = await pool.query(
      `
      SELECT
        s.id,
        s.user_id,
        u.name,
        u.email,
        u.phone,
        u.profile_photo_path,

        s.father_name,
        s.mother_name,

        s.roll_number,
        s.registration_number,

        s.department_id,
        d.code AS department_code,
        d.name AS department_name,

        s.batch,
        s.current_semester,
        s.academic_year,
        s.admission_year,
        s.passing_year,

        s.hostel_status,
        s.gender,
        s.category,
        s.date_of_birth,
        s.address,
        s.aadhaar_number,

        s.created_at,
        s.updated_at

      FROM students s

      INNER JOIN users u
        ON u.id = s.user_id

      INNER JOIN departments d
        ON d.id = s.department_id

      WHERE s.user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found.",
      });
    }

    const student = rows[0];

    return res.json({
      success: true,
      profile: {
        id: student.id,
        userId: student.user_id,

        name: student.name,
        email: student.email,
        phone: student.phone,
        profilePhotoUrl: student.profile_photo_path ? `/uploads/profile-photos/${require("path").basename(student.profile_photo_path)}` : null,

        fatherName: student.father_name,
        motherName: student.mother_name,

        rollNumber: student.roll_number,
        registrationNumber: student.registration_number,

        departmentId: student.department_id,
        departmentCode: student.department_code,
        departmentName: student.department_name,

        batch: student.batch,
        currentSemester: student.current_semester,
        academicYear: student.academic_year,
        admissionYear: student.admission_year,
        passingYear: student.passing_year,

        hostelStatus: student.hostel_status,

        gender: student.gender,
        category: student.category,
        dateOfBirth: student.date_of_birth,
        address: student.address,
        aadhaarNumber: student.aadhaar_number,

        createdAt: student.created_at,
        updatedAt: student.updated_at,
      },
    });
  } catch (error) {
    console.error("Get student profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load student profile.",
    });
  }
};

const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const {
      fatherName,
      motherName,
      gender,
      category,
      dateOfBirth,
      address,
      aadhaarNumber,
      hostelStatus,
      name,
      phone,
    } = req.body;

    const allowedGender = ["MALE", "FEMALE", "OTHER"];
    const allowedHostelStatus = [
      "HOSTELLER",
      "DAY_SCHOLAR",
    ];

    if (gender && !allowedGender.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: "Invalid gender value.",
      });
    }

    if (
      hostelStatus &&
      !allowedHostelStatus.includes(hostelStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid hostel status.",
      });
    }

    const [studentRows] = await pool.query(
      `
      SELECT id
      FROM students
      WHERE user_id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found.",
      });
    }

    if (name !== undefined || phone !== undefined) {
      await pool.query(
        `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?`,
        [name ? String(name).trim().slice(0, 150) : null, phone ? String(phone).trim().slice(0, 20) : null, userId]
      );
    }

    await pool.query(
      `
      UPDATE students
      SET
        father_name = ?,
        mother_name = ?,
        gender = ?,
        category = ?,
        date_of_birth = ?,
        address = ?,
        aadhaar_number = ?,
        hostel_status = ?
      WHERE user_id = ?
      `,
      [
        fatherName || null,
        motherName || null,
        gender || null,
        category || null,
        dateOfBirth || null,
        address || null,
        aadhaarNumber || null,
        hostelStatus || "DAY_SCHOLAR",
        userId,
      ]
    );

    return res.json({
      success: true,
      message: "Student profile updated successfully.",
    });
  } catch (error) {
    console.error("Update student profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update student profile.",
    });
  }
};


const uploadStudentProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Choose a JPG, PNG or WEBP photo (maximum 2 MB)." });
    const relative = `uploads/profile-photos/${req.file.filename}`;
    await pool.query("UPDATE users SET profile_photo_path = ? WHERE id = ?", [relative, req.user.userId]);
    return res.json({ success: true, profilePhotoUrl: `/uploads/profile-photos/${req.file.filename}` });
  } catch (error) {
    console.error("Student profile photo upload error:", error);
    return res.status(500).json({ success: false, message: "Unable to save profile photo." });
  }
};



// =========================================================
// STUDENT CERTIFICATE LIBRARY AND NOTIFICATIONS
// =========================================================
const getStudentCertificates = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.request_id, c.certificate_number, c.certificate_type,
             c.student_name, c.issue_date, c.file_path, c.qr_code_data,
             r.request_number, r.status AS request_status, dt.name AS service_name
      FROM certificates c
      INNER JOIN requests r ON r.id = c.request_id
      INNER JOIN students s ON s.id = r.student_id
      INNER JOIN document_types dt ON dt.id = r.document_type_id
      WHERE s.user_id = ?
      ORDER BY c.created_at DESC`, [req.user.userId]);
    return res.json({ success: true, certificates: rows.map(row => ({
      id: Number(row.id), requestId: Number(row.request_id),
      certificateNumber: row.certificate_number, certificateType: row.certificate_type,
      studentName: row.student_name, issueDate: row.issue_date,
      requestNumber: row.request_number, requestStatus: row.request_status,
      serviceName: row.service_name, qrCodeData: row.qr_code_data,
      fileAvailable: Boolean(row.file_path)
    })) });
  } catch (error) {
    console.error('Student certificate library error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load certificates.' });
  }
};

const getStudentNotifications = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT n.id, n.request_id, n.title, n.message, n.type, n.is_read, n.created_at, r.request_number
      FROM notifications n
      LEFT JOIN requests r ON r.id = n.request_id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC LIMIT 100`, [req.user.userId]);
    return res.json({ success: true, notifications: rows.map(row => ({
      ...row, id: Number(row.id), requestId: row.request_id == null ? null : Number(row.request_id),
      isRead: Boolean(row.is_read), createdAt: row.created_at
    })) });
  } catch (error) {
    console.error('Student notifications error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load notifications.' });
  }
};

const markStudentNotificationRead = async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId);
    if (!Number.isSafeInteger(notificationId) || notificationId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    }
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [notificationId, req.user.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Notification not found.' });
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update notification.' });
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getStudentDashboard,
  getStudentServices,
  createStudentRequest,
  getStudentRequests,
  getStudentRequestDetails,
  resubmitStudentRequest,
  uploadCorrectedDocument,

  getStudentProfile,
  updateStudentProfile,
  uploadStudentProfilePhoto,
  getStudentCertificates,
  getStudentNotifications,
  markStudentNotificationRead,
};