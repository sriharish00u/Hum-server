import mongoose, { Schema, Document } from 'mongoose'

export interface ICommunity extends Document {
  name: string
  description: string
  createdBy: string
  members: string[]
  createdAt: Date
}

const CommunitySchema = new Schema<ICommunity>({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  createdBy: { type: String, required: true, index: true },
  members: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
})

export const Community = mongoose.model<ICommunity>('Community', CommunitySchema)