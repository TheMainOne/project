import mongoose from "mongoose";

const BusinessYoutubeVideoSchema = new mongoose.Schema(
  {
    videoId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    channelId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    channelName: {
      type: String,
      default: "",
      trim: true,
    },
    channelUrl: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    publishedAt: {
      type: Date,
      required: true,
      index: true,
    },
    discoveredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    transcript: {
      status: {
        type: String,
        enum: ["available", "unavailable", "empty", "error", "metadata_only"],
        default: "metadata_only",
        index: true,
      },
      source: {
        type: String,
        default: "",
        trim: true,
      },
      languageCode: {
        type: String,
        default: "",
        trim: true,
      },
      languageName: {
        type: String,
        default: "",
        trim: true,
      },
      charCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      error: {
        type: String,
        default: "",
      },
    },
    analysis: {
      status: {
        type: String,
        enum: ["pending", "ok", "fallback", "failed"],
        default: "pending",
        index: true,
      },
      model: {
        type: String,
        default: "",
        trim: true,
      },
      generatedAt: {
        type: Date,
        default: null,
      },
      summary: {
        type: String,
        default: "",
      },
      mainIdeas: {
        type: [String],
        default: [],
      },
      insights: {
        type: [String],
        default: [],
      },
      unconventionalApplications: {
        type: [String],
        default: [],
      },
      actionsToday: {
        type: [String],
        default: [],
      },
      usefulnessRating: {
        type: String,
        enum: ["high", "medium", "low"],
        default: "medium",
      },
      transcriptStatusNote: {
        type: String,
        default: "",
      },
      error: {
        type: String,
        default: "",
      },
    },
    send: {
      status: {
        type: String,
        enum: ["pending", "sent", "failed", "skipped"],
        default: "pending",
        index: true,
      },
      sentAt: {
        type: Date,
        default: null,
      },
      messageChunkCount: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastError: {
        type: String,
        default: "",
      },
    },
    lastError: {
      type: String,
      default: "",
    },
  },
  { timestamps: true, versionKey: false }
);

BusinessYoutubeVideoSchema.index({ channelId: 1, publishedAt: -1 });
BusinessYoutubeVideoSchema.index({ "send.status": 1, publishedAt: -1 });

export default mongoose.model("BusinessYoutubeVideo", BusinessYoutubeVideoSchema);
