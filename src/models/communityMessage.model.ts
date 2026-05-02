import mongoose, { Schema, Document } from 'mongoose'

export interface ICommunityMessage extends Document {
  communityId: string
  userId: string
  userName: string
  text: string
  timestamp: Date
}

const CommunityMessageSchema = new Schema<ICommunityMessage>({
  communityId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true })

export const CommunityMessage = mongoose.model<ICommunityMessage>('CommunityMessage', CommunityMessageSchema)