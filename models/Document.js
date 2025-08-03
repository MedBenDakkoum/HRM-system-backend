const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
    },
    type: {
      type: String,
      enum: ["attestation", "payslip", "contract"],
      required: true,
    },
    filePath: {
      type: String,
      required: true,
    },
    generatedDate: {
      type: Date,
      default: Date.now,
    },
    legalInfo: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Document", documentSchema);
