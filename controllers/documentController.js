const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const Employee = require("../models/Employee");
const Document = require("../models/Document");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const generateAttestation = async (req, res) => {
  try {
    const { employeeId, legalInfo } = req.body;

    // Validate employee
    const employee = await Employee.findById(employeeId).select(
      "name role position internshipDetails"
    );
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const docName = `attestation-${employeeId}-${Date.now()}`;
    const documentsDir = path
      .resolve(__dirname, "../documents")
      .replace(/\\/g, "/");
    const texFile = path.join(documentsDir, `${docName}.tex`);
    const pdfFile = path.join(documentsDir, `${docName}.pdf`);

    // Ensure documents directory exists
    fs.mkdirSync(documentsDir, { recursive: true });

    // Read LaTeX template
    const template = fs.readFileSync(
      path.join(__dirname, "../templates/attestation.tex"),
      "utf8"
    );

    // Replace placeholders
    let texContent = template
      .replace("EMPLOYEE_NAME", employee.name.replace(/[&%$#_{}]/g, "\\$&"))
      .replace(
        "POSITION",
        employee.role === "stagiaire"
          ? "Stagiaire"
          : employee.position || "Employee"
      )
      .replace(
        "LEGAL_INFO",
        (
          legalInfo || "FLESK Consulting, 123 Business St, Monastir, Moknine"
        ).replace(/[&%$#_{}]/g, "\\$&")
      );

    if (employee.role === "stagiaire" && employee.internshipDetails) {
      texContent = texContent
        .replace(
          "START_DATE",
          employee.internshipDetails.startDate
            ? new Date(
                employee.internshipDetails.startDate
              ).toLocaleDateString()
            : "N/A"
        )
        .replace(
          "END_DATE",
          employee.internshipDetails.endDate
            ? new Date(employee.internshipDetails.endDate).toLocaleDateString()
            : "N/A"
        )
        .replace(
          "SUPERVISOR",
          (employee.internshipDetails.supervisor || "N/A").replace(
            /[&%$#_{}]/g,
            "\\$&"
          )
        )
        .replace(
          "OBJECTIVES",
          (employee.internshipDetails.objectives || "N/A").replace(
            /[&%$#_{}]/g,
            "\\$&"
          )
        )
        .replace("ROLE", "stagiaire");
    } else {
      texContent = texContent.replace("ROLE", "employee");
    }

    // Write LaTeX file
    fs.writeFileSync(texFile, texContent);

    // Send LaTeX file to PDF service
    const pdfServiceUrl = "http://flesk-pdf-generator.internal:8080";
    const texContentBase64 = fs.readFileSync(texFile, { encoding: "base64" });
    const response = await axios.post(pdfServiceUrl, {
      texContent: texContentBase64,
      docName: docName,
      outputDir: "/data",
    });

    if (response.status !== 200) {
      throw new Error("PDF generation failed");
    }

    // Save PDF from response
    const pdfData = Buffer.from(response.data.pdfContent, "base64");
    fs.writeFileSync(pdfFile, pdfData);

    // Verify PDF exists
    if (!fs.existsSync(pdfFile)) {
      throw new Error("PDF file was not generated");
    }

    // Upload PDF to Cloudinary
    const cloudinaryResult = await cloudinary.uploader.upload(pdfFile, {
      resource_type: "raw",
      public_id: `flesk/documents/${docName}`,
      format: "pdf",
    });

    // Clean up temporary files
    ["aux", "log", "out", "tex"].forEach((ext) => {
      const tempFile = path.join(documentsDir, `${docName}.${ext}`);
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    // Save document metadata with Cloudinary URL
    const document = new Document({
      employee: employeeId,
      type: "attestation",
      fileUrl: cloudinaryResult.secure_url,
      legalInfo,
    });
    await document.save();

    res
      .status(201)
      .json({ message: "Attestation generated successfully", document });
  } catch (error) {
    console.error("Generate attestation error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getDocuments = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }
    console.log("Querying documents for employeeId:", employeeId);
    const documents = await Document.find({
      employee: new mongoose.Types.ObjectId(employeeId),
    }).populate("employee", "name");
    if (!documents.length) {
      return res
        .status(404)
        .json({ message: "No documents found for this employee" });
    }
    res.status(200).json(documents);
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllAttestations = async (req, res) => {
  try {
    console.log("Querying all attestations");
    const documents = await Document.find({ type: "attestation" }).populate(
      "employee",
      "name"
    );
    if (!documents.length) {
      return res.status(404).json({ message: "No attestations found" });
    }
    res.status(200).json(documents);
  } catch (error) {
    console.error("Get all attestations error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { generateAttestation, getDocuments, getAllAttestations };
