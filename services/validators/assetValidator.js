import Joi from "joi";
import joiObjectId from "joi-objectid";

Joi.objectId = joiObjectId(Joi);

export const validateAssetSchema = Joi.object({
  name: Joi.string().required(),
  entityType: Joi.string()
    .valid("equipment", "document", "event", "contract", "location")
    .required(),
  assetCategory: Joi.string(),

  description: Joi.string().allow(""),
  notes: Joi.string().allow(""),
  priority: Joi.string().valid("low", "medium", "high", "critical"),

  parentEntity: Joi.objectId().allow(null),

  location: Joi.object({
    site: Joi.string(),
    building: Joi.string(),
    floor: Joi.string(),
    room: Joi.string(),
    zone: Joi.string(),
    address: Joi.object({
      street: Joi.string(),
      city: Joi.string(),
      state: Joi.string(),
      country: Joi.string(),
      postalCode: Joi.string(),
    }),
    gps: Joi.object({
      lat: Joi.number(),
      lng: Joi.number(),
    }),
  }),

  lifecycleStatus: Joi.string().valid(
    "draft",
    "pending",
    "under_review",
    "active",
    "under_maintenance",
    "suspended",
    "expired",
    "decommissioned",
    "archived",
    "cancelled"
  ),

  contractDetails: Joi.object({
    contractNumber: Joi.string(),
    contractType: Joi.string(),
    provider: Joi.object({
      name: Joi.string(),
      taxId: Joi.string(),
      contactEmail: Joi.string().email(),
      contactPhone: Joi.string(),
      contactPerson: Joi.object({
        name: Joi.string(),
        email: Joi.string().email(),
        phone: Joi.string(),
        position: Joi.string(),
      }),
      address: Joi.object({
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        country: Joi.string(),
        postalCode: Joi.string(),
      }),
      website: Joi.string(),
      notes: Joi.string(),
    }),
    coverageScope: Joi.string(),
    serviceLevel: Joi.string(),
    contractValue: Joi.number(),
    currency: Joi.string(),
    billingCycle: Joi.string(),
    issuedDate: Joi.date(),
    effectiveDate: Joi.date(),
    expiryDate: Joi.date(),
  }),

  conditionStatus: Joi.string().valid(
    "operational",
    "faulty",
    "under_maintenance",
    "normal"
  ),

  lastInspectionDate: Joi.date(),
  nextInspectionDueDate: Joi.date(),
  riskLevel: Joi.string().valid("low", "medium", "high"),

  effectiveDate: Joi.date(),
  expiryDate: Joi.date(),

  responsiblePerson: Joi.object({
    userId: Joi.objectId(),
    name: Joi.string(),
    email: Joi.string().email(),
    phone: Joi.string(),
    department: Joi.string(),
    position: Joi.string(),
    external: Joi.boolean(),
    notes: Joi.string(),
  }),

  fileDetails: Joi.object({
    fileUrl: Joi.string().uri(),
    fileType: Joi.string(),
    uploadedBy: Joi.string(),
    documentNumber: Joi.string(),
    documentType: Joi.string(),
    issuingAuthority: Joi.string(),
    issuedDate: Joi.date(),
    revisionNumber: Joi.string(),
  }),

  eventDetails: Joi.object({
    scheduledDate: Joi.date(),
    completedDate: Joi.date(),
    eventType: Joi.string(),
    participants: Joi.array().items(
      Joi.object({
        name: Joi.string(),
        role: Joi.string(),
        userId: Joi.objectId(),
      })
    ),
    performedBy: Joi.string(),
    result: Joi.string().valid("passed", "failed", "postponed", "pending"),
    eventOutcomeNotes: Joi.string(),
  }),

  manufacturer: Joi.string(),
  model: Joi.string(),
  assetTag: Joi.string(),
  serialNumber: Joi.string(),
  installationDate: Joi.date(),
  warrantyExpiryDate: Joi.date(),

  linkedAssets: Joi.array().items(Joi.objectId()),

  notificationPreferences: Joi.array().items(
    Joi.object({
      type: Joi.string().valid(
        "expiryReminder",
        "maintenanceSchedule",
        "inspectionReminder",
        "contractRenewal",
        "warrantyExpiry",
        "licenseRenewal",
        "custom"
      ),
      daysBefore: Joi.number().min(0),
      onExactDate: Joi.date(),
      repeat: Joi.string().valid(
        "none",
        "daily",
        "weekly",
        "monthly",
        "yearly"
      ),
      cancelIfLifecycleStatusIn: Joi.array().items(Joi.string()),
    })
  ),

  customFields: Joi.object().unknown(true),
  isDeleted: Joi.boolean(),
});

export const validateAssetUpdateSchema = Joi.object({
  name: Joi.string(),
  entityType: Joi.string().valid(
    "equipment",
    "document",
    "event",
    "contract",
    "location"
  ),
  assetCategory: Joi.string(),

  description: Joi.string().allow(""),
  notes: Joi.string().allow(""),
  priority: Joi.string().valid("low", "medium", "high", "critical"),

  parentEntity: Joi.objectId().allow(null),

  location: Joi.object({
    site: Joi.string(),
    building: Joi.string(),
    floor: Joi.string(),
    room: Joi.string(),
    zone: Joi.string(),
    address: Joi.object({
      street: Joi.string(),
      city: Joi.string(),
      state: Joi.string(),
      country: Joi.string(),
      postalCode: Joi.string(),
    }),
    gps: Joi.object({
      lat: Joi.number(),
      lng: Joi.number(),
    }),
  }),

  lifecycleStatus: Joi.string().valid(
    "draft",
    "pending",
    "under_review",
    "active",
    "under_maintenance",
    "suspended",
    "expired",
    "decommissioned",
    "archived",
    "cancelled"
  ),

  contractDetails: Joi.object({
    contractNumber: Joi.string(),
    contractType: Joi.string(),
    provider: Joi.object({
      name: Joi.string(),
      taxId: Joi.string(),
      contactEmail: Joi.string().email(),
      contactPhone: Joi.string(),
      contactPerson: Joi.object({
        name: Joi.string(),
        email: Joi.string().email(),
        phone: Joi.string(),
        position: Joi.string(),
      }),
      address: Joi.object({
        street: Joi.string(),
        city: Joi.string(),
        state: Joi.string(),
        country: Joi.string(),
        postalCode: Joi.string(),
      }),
      website: Joi.string(),
      notes: Joi.string(),
    }),
    coverageScope: Joi.string(),
    serviceLevel: Joi.string(),
    contractValue: Joi.number(),
    currency: Joi.string(),
    billingCycle: Joi.string(),
    issuedDate: Joi.date(),
    effectiveDate: Joi.date(),
    expiryDate: Joi.date(),
  }),

  conditionStatus: Joi.string().valid(
    "operational",
    "faulty",
    "under_maintenance",
    "normal"
  ),

  lastInspectionDate: Joi.date(),
  nextInspectionDueDate: Joi.date(),
  riskLevel: Joi.string().valid("low", "medium", "high"),

  effectiveDate: Joi.date(),
  expiryDate: Joi.date(),

  responsiblePerson: Joi.object({
    userId: Joi.objectId(),
    name: Joi.string(),
    email: Joi.string().email(),
    phone: Joi.string(),
    department: Joi.string(),
    position: Joi.string(),
    external: Joi.boolean(),
    notes: Joi.string(),
  }),

  fileDetails: Joi.object({
    fileUrl: Joi.string().uri(),
    fileType: Joi.string(),
    uploadedBy: Joi.string(),
    documentNumber: Joi.string(),
    documentType: Joi.string(),
    issuingAuthority: Joi.string(),
    issuedDate: Joi.date(),
    revisionNumber: Joi.string(),
  }),

  eventDetails: Joi.object({
    scheduledDate: Joi.date(),
    completedDate: Joi.date(),
    eventType: Joi.string(),
    participants: Joi.array().items(
      Joi.object({
        name: Joi.string(),
        role: Joi.string(),
        userId: Joi.objectId(),
      })
    ),
    performedBy: Joi.string(),
    result: Joi.string().valid("passed", "failed", "postponed", "pending"),
    eventOutcomeNotes: Joi.string(),
  }),

  manufacturer: Joi.string(),
  model: Joi.string(),
  assetTag: Joi.string(),
  serialNumber: Joi.string(),
  installationDate: Joi.date(),
  warrantyExpiryDate: Joi.date(),

  linkedAssets: Joi.array().items(Joi.objectId()),

  notificationPreferences: Joi.array().items(
    Joi.object({
      type: Joi.string().valid(
        "expiryReminder",
        "maintenanceSchedule",
        "inspectionReminder",
        "contractRenewal",
        "warrantyExpiry",
        "licenseRenewal",
        "custom"
      ),
      daysBefore: Joi.number().min(0),
      onExactDate: Joi.date(),
      repeat: Joi.string().valid(
        "none",
        "daily",
        "weekly",
        "monthly",
        "yearly"
      ),
      cancelIfLifecycleStatusIn: Joi.array().items(Joi.string()),
    })
  ),

  customFields: Joi.object().unknown(true),
  isDeleted: Joi.boolean(),
});
