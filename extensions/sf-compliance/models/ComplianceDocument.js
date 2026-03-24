import mongoose from "mongoose";

const { Schema } = mongoose;

const complianceDocumentSchema = new Schema(
  {
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    fileName: {
      type: String,
      trim: true,
      default: "",
    },

    storage: {
      provider: {
        type: String,
        enum: ["sharepoint"],
        default: "sharepoint",
      },
      url: {
        type: String,
        required: true,
        trim: true,
      },
      site: {
        type: String,
        trim: true,
        default: "",
      },
      library: {
        type: String,
        trim: true,
        default: "",
      },
      folderPath: {
        type: String,
        trim: true,
        default: "",
      },
      documentId: {
        type: String,
        trim: true,
        default: "",
      },
    },

    documentType: {
      type: String,
      enum: [
        "comprehensive_statement",
        "declaration",
        "certificate",
        "sds",
        "tds",
        "test_report",
        "email_confirmation",
        "portal_response",
        "other",
      ],
      default: "other",
    },

    source: {
      type: String,
      enum: ["supplier", "internal", "portal", "email"],
      default: "supplier",
    },

    issueDate: {
      type: Date,
      default: null,
    },

    receivedDate: {
      type: Date,
      default: null,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "expired", "superseded", "draft"],
      default: "active",
      index: true,
    },

    notes: {
      type: String,
      default: "",
    },

    tags: {
      type: [String],
      default: [],
    },

    replacesDocumentId: {
      type: Schema.Types.ObjectId,
      ref: "ComplianceDocument",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

complianceDocumentSchema.index({ supplierId: 1, status: 1 });
complianceDocumentSchema.index({ supplierId: 1, issueDate: -1 });
complianceDocumentSchema.index({ supplierId: 1, validUntil: 1 });
complianceDocumentSchema.index({ "storage.url": 1 });

export default mongoose.model("ComplianceDocument", complianceDocumentSchema);