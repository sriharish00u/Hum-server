import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  deviceId: string;
  name: string;
  avatarId: number;
  reputation: number;
  alertsHandled: number;
  reportsSubmitted: number;
  activitiesJoined: number;
  impactPoints: number;
  isVerifiedVolunteer: boolean;
  volunteerProofUrl?: string;
  volunteerVerificationStatus: 'none' | 'pending' | 'verified' | 'rejected';
  refreshTokenHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  deviceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, default: 'Anonymous' },
  avatarId: { type: Number, default: 1 },
  reputation: { type: Number, default: 0 },
  alertsHandled: { type: Number, default: 0 },
  reportsSubmitted: { type: Number, default: 0 },
  activitiesJoined: { type: Number, default: 0 },
  impactPoints: { type: Number, default: 0 },
  isVerifiedVolunteer: { type: Boolean, default: false },
  volunteerProofUrl: { type: String },
  volunteerVerificationStatus: { type: String, enum: ['none', 'pending', 'verified', 'rejected'], default: 'none' },
  refreshTokenHash: { type: String },
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
