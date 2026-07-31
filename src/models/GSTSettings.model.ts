import mongoose, { Document, Schema } from 'mongoose';

export interface IGSTSettings extends Document {
  tenantId: string;
  gstin: string;
  legalBusinessName: string;
  registeredAddress: string;
  stateCode: string;
  stateName: string;
  isCompositionDealer: boolean;
  defaultGSTRate: number;
  hsnCodeMap: Array<{
    category: string;
    hsnCode: string;
    sacCode: string;
    gstRate: number;
  }>;
  reverseCharge: boolean;
  exportInvoice: boolean;
  enableGSTOnInvoices: boolean;
  signatureImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HsnCodeMapSchema = new Schema(
  {
    category: { type: String, required: true },
    hsnCode:  { type: String, default: '' },
    sacCode:  { type: String, default: '' },
    gstRate:  { type: Number, required: true },
  },
  { _id: false },
);

const GSTSettingsSchema: Schema = new Schema(
  {
    tenantId:            { type: String, required: true },
    gstin:               { type: String, default: '' },
    legalBusinessName:   { type: String, default: '' },
    registeredAddress:   { type: String, default: '' },
    stateCode:           { type: String, default: '' },
    stateName:           { type: String, default: '' },
    isCompositionDealer: { type: Boolean, default: false },
    defaultGSTRate:      { type: Number, default: 18 },
    hsnCodeMap:          { type: [HsnCodeMapSchema], default: [] },
    reverseCharge:       { type: Boolean, default: false },
    exportInvoice:       { type: Boolean, default: false },
    enableGSTOnInvoices: { type: Boolean, default: false },
    signatureImageUrl:   { type: String },
  },
  { timestamps: true },
);

GSTSettingsSchema.index({ tenantId: 1 }, { unique: true });

export const DEFAULT_HSN_MAP = [
  { category: 'membership',        hsnCode: '',      sacCode: '999729', gstRate: 18 },
  { category: 'personal_training', hsnCode: '',      sacCode: '999729', gstRate: 18 },
  { category: 'supplements',       hsnCode: '2106',  sacCode: '',       gstRate: 5  },
  { category: 'clothing',          hsnCode: '6211',  sacCode: '',       gstRate: 5  },
  { category: 'food',              hsnCode: '2106',  sacCode: '',       gstRate: 5  },
];

export default mongoose.model<IGSTSettings>('GSTSettings', GSTSettingsSchema);
