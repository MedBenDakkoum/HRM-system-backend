const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["employee", "stagiaire", "admin"],
      default: "employee",
    },
    hireDate: {
      type: Date,
      default: Date.now,
    },
    position: {
      type: String,
      trim: true,
    },
    internshipDetails: {
      startDate: { type: Date },
      endDate: { type: Date },
      supervisor: { type: String },
      objectives: { type: String },
    },
    faceDescriptor: {
      type: [Number], // Array for face-api.js descriptor (128 numbers)
      default: undefined,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Employee", employeeSchema);
