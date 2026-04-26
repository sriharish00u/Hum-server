import mongoose, { Schema, Document } from 'mongoose'

export interface ICommunity extends Document {
  name: string
  description: string
  createdBy: string
  members: string[]
  createdAt: Date
  updatedAt: Date
}

const CommunitySchema = new Schema<ICommunity>({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true, index: true },
  members: { type: [String], default: [] },
}, { timestamps: true })

export const Community = mongoose.model<ICommunity>('Community', CommunitySchema)