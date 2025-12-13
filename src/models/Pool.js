import mongoose from "../config/mongo.js";

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    displayName: { type: String, required: true },
    status: {
      type: String,
      enum: ["invited", "joined", "marked_paid", "confirmed"],
      default: "invited"
    },
    paidAmount: { type: Number, default: 0 },
    expectedAmount: { type: Number, default: 0 },
    payMethod: { type: String, enum: ["transfer", "cash", "unknown"], default: "transfer" },
    note: String,
    joinedAt: Date,
    markedAt: Date,
    confirmedAt: Date
  },
  { _id: true }
);

const poolSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    description: String,
    amountType: { type: String, enum: ["total", "per_person"], required: true },
    totalAmount: Number,
    perPersonAmount: Number,
    shareAmount: Number,
    expectedParticipantsCount: { type: Number, default: 1 },
    paymentDetails: { type: String, required: true },
    joinCode: { type: String, required: true, unique: true },
    currency: { type: String, default: "RUB" },
    participants: [participantSchema],
    isClosed: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

export default mongoose.models.Pool || mongoose.model("Pool", poolSchema);
