import mongoose from "../config/mongo.js";

const sessionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  {
    timestamps: true,
    minimize: false
  }
);

export default mongoose.models.Session || mongoose.model("Session", sessionSchema);
