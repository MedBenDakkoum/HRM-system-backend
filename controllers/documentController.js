const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const cloudinary = require("cloudinary").v2;
const Employee = require("../models/Employee");
const Document = require("../models/Document");

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
    const pdfFile = path.join(documentsDir, `${docName}.pdf`);

    // Ensure documents directory exists
    fs.mkdirSync(documentsDir, { recursive: true });

    // Create PDF with PDFKit
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });
    const stream = fs.createWriteStream(pdfFile);

    doc.pipe(stream);
    doc
      .font("Times-Roman")
      .fontSize(20)
      .text("Attestation of Work/Internship", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text("FLESK Consulting", { align: "center" });
    doc.moveDown(2);

    doc
      .fontSize(12)
      .text(
        `This is to certify that ${employee.name} has been employed as a ${
          employee.role === "stagiaire"
            ? "Stagiaire"
            : employee.position || "Employee"
        } at FLESK Consulting.`,
        { align: "justify" }
      );
    doc.moveDown();

    if (employee.role === "stagiaire" && employee.internshipDetails) {
      doc.text(
        `Internship Period: ${
          employee.internshipDetails.startDate
            ? new Date(
                employee.internshipDetails.startDate
              ).toLocaleDateString()
            : "N/A"
        } to ${
          employee.internshipDetails.endDate
            ? new Date(employee.internshipDetails.endDate).toLocaleDateString()
            : "N/A"
        }`
      );
      doc.text(`Supervisor: ${employee.internshipDetails.supervisor || "N/A"}`);
      doc.text(`Objectives: ${employee.internshipDetails.objectives || "N/A"}`);
      doc.moveDown();
    }

    doc.text(
      `Legal Information: ${
        legalInfo || "FLESK Consulting, 123 Business St, Monastir, Moknine"
      }`
    );
    doc.moveDown(2);
    doc.text("Authorized Signature: ____________________", { align: "right" });
    doc.moveDown();
    doc.lineWidth(1).moveTo(450, doc.y).lineTo(650, doc.y).stroke();

    doc.end();

    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // Verify PDF exists
    if (!fs.existsSync(pdfFile)) {
      throw new Error("PDF file was not generated");
    }

    // Upload PDF to Cloudinary
    try {
      const cloudinaryResult = await cloudinary.uploader.upload(pdfFile, {
        resource_type: "raw",
        public_id: `flesk/documents/${docName}`,
        format: "pdf",
      });

      // Clean up temporary PDF file
      if (fs.existsSync(pdfFile)) {
        fs.unlinkSync(pdfFile);
      }

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
    } catch (cloudinaryError) {
      console.error("Cloudinary upload error:", cloudinaryError.message);
      throw new Error(`Cloudinary upload failed: ${cloudinaryError.message}`);
    }
  } catch (error) {
    console.error("Generate attestation error:", error.message);
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
    console.error("Get documents error:", error.message);
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
    console.error("Get all attestations error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { generateAttestation, getDocuments, getAllAttestations };
