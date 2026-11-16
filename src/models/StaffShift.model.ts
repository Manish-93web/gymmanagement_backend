import mongoose, { Document, Schema } from 'mongoose';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface IShiftSegment {
    startTime: string;   // "HH:mm" local
    endTime: string;     // "HH:mm" local, later than startTime on the same day
}

/**
 * A named working pattern a gym defines once (Morning, Evening, Split ...) and gives to any number of staff.
 * A shift has one window, or up to three for split shifts (for example 06:00-10:00 and 17:00-21:00).
 */
export interface IStaffShift extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    segments: IShiftSegment[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const staffShiftSchema = new Schema<IStaffShift>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 40 },
        segments: {
            type: [{
                _id: false,
                startTime: { type: String, required: true, match: HHMM },
                endTime:   { type: String, required: true, match: HHMM },
            }],
            validate: [(v: unknown[]) => v.length >= 1 && v.length <= 3, 'A shift has 1 to 3 time windows'],
        },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

staffShiftSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IStaffShift>('StaffShift', staffShiftSchema);
