import mongoose, { Schema, Document } from 'mongoose'

export interface IMessage extends Document {
  sessionId: string
  userId: string
  userName: string
  text: string
  timestamp: Date
}

const MessageSchema = new Schema<IMessage>({
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { timestamps: true })

export const Message = mongoose.model<IMessage>('Message', MessageSchema)