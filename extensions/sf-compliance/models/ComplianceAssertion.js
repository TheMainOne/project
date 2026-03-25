import mongoose from "mongoose";

const { Schema } = mongoose;

const complianceAssertionSchema = new Schema(
  {
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },

    documentId: {
      type: Schema.Types.ObjectId,
      ref: "ComplianceDocument",
      required: true,
      index: true,
    },

    regulationId: {
      type: Schema.Types.ObjectId,
      ref: "Regulation",
      required: true,
      index: true,
    },

    assertionType: {
      type: String,
      enum: [
        "compliant",
        "free_from",
        "contains",
        "non_compliant",
        "partial",
        "informational",
      ],
      required: true,
      index: true,
    },

coverageLevel: {
  type: String,
  enum: [
    "supplier_all",
    "supplier_partial",
    "supplier_subset",
    "item_single",
    "item_list",
    "material_family",
    "component_family",
    "country_specific",
    "plant_specific",
  ],
  required: true,
  index: true,
},

    scope: {
      allSupplierItems: {
        type: Boolean,
        default: false,
      },

      dwkItemNumbers: {
        type: [String],
        default: [],
      },

      supplierPartNumbers: {
        type: [String],
        default: [],
      },

      families: {
        type: [String],
        default: [],
      },

      countries: {
        type: [String],
        default: [],
      },

      plants: {
        type: [String],
        default: [],
      },

      notes: {
        type: String,
        default: "",
      },
    },

    statementText: {
      type: String,
      default: "",
    },

    issueDate: {
      type: Date,
      default: null,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "expired", "superseded", "needs_review"],
      default: "active",
      index: true,
    },

    confidence: {
      type: String,
      enum: ["manual_verified", "ai_extracted", "parsed"],
      default: "manual_verified",
    },

    exceptions: {
      type: [String],
      default: [],
    },

    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

complianceAssertionSchema.index({
  supplierId: 1,
  regulationId: 1,
  status: 1,
});

complianceAssertionSchema.index({
  supplierId: 1,
  documentId: 1,
});

complianceAssertionSchema.index({
  "scope.dwkItemNumbers": 1,
});

complianceAssertionSchema.index({
  "scope.families": 1,
});

complianceAssertionSchema.pre("save", function (next) {
  if (Array.isArray(this.scope?.dwkItemNumbers)) {
    this.scope.dwkItemNumbers = this.scope.dwkItemNumbers.map((item) =>
      String(item || "").trim().toUpperCase()
    ).filter(Boolean);
  }

  if (Array.isArray(this.scope?.supplierPartNumbers)) {
    this.scope.supplierPartNumbers = this.scope.supplierPartNumbers.map((item) =>
      String(item || "").trim().toUpperCase()
    ).filter(Boolean);
  }

  if (Array.isArray(this.scope?.families)) {
    this.scope.families = this.scope.families.map((item) =>
      String(item || "").trim()
    ).filter(Boolean);
  }

  next();
});

export default mongoose.model("ComplianceAssertion", complianceAssertionSchema);