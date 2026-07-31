import mongoose, { Document, Schema } from 'mongoose';

export interface IWhiteLabel extends Document {
  tenantId: mongoose.Types.ObjectId;
  // App identity
  appName: string;
  bundleId: string;           // e.g. com.fitpro.gymxyz
  packageName: string;        // Android: same as bundleId usually
  appVersion: string;         // e.g. 1.0.0
  buildNumber: number;
  // Branding
  primaryColor: string;       // hex
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  logoUrl?: string;
  splashUrl?: string;
  iconUrl?: string;
  // App store metadata
  appStoreId?: string;
  playStoreId?: string;
  appStoreStatus?: 'not_submitted' | 'in_review' | 'approved' | 'rejected' | 'published';
  playStoreStatus?: 'not_submitted' | 'in_review' | 'approved' | 'rejected' | 'published';
  // Push notifications
  fcmServerKey?: string;      // Firebase Cloud Messaging
  apnsKeyId?: string;         // Apple Push Notification Service
  apnsTeamId?: string;
  // Build pipeline
  buildStatus: 'idle' | 'queued' | 'building' | 'success' | 'failed';
  lastBuildAt?: Date;
  lastBuildLog?: string;
  buildArtifacts?: {
    iosIpaUrl?: string;
    androidApkUrl?: string;
    androidAabUrl?: string;
  };
  // Feature flags for this white-label build
  featureFlags?: {
    enableCommunity?: boolean;
    enableNutrition?: boolean;
    enableGamification?: boolean;
    enablePOS?: boolean;
    enableWearable?: boolean;
    enableAI?: boolean;
    enableVideoLibrary?: boolean;
    enableEvents?: boolean;
    enableMarketplace?: boolean;
  };
  // Social / support links
  supportEmail?: string;
  privacyPolicyUrl?: string;
  termsUrl?: string;
  // Config extras
  apiBaseUrl?: string;
  customDomain?: string;
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
}

const WhiteLabelSchema = new Schema<IWhiteLabel>(
  {
    tenantId:       { type: Schema.Types.ObjectId, required: true },
    appName:        { type: String, required: true },
    bundleId:       { type: String, required: true },
    packageName:    { type: String, required: true },
    appVersion:     { type: String, default: '1.0.0' },
    buildNumber:    { type: Number, default: 1 },
    primaryColor:   { type: String, default: '#6366f1' },
    secondaryColor: { type: String, default: '#8b5cf6' },
    accentColor:    { type: String, default: '#06b6d4' },
    backgroundColor:{ type: String, default: '#0a0a0a' },
    logoUrl:        String,
    splashUrl:      String,
    iconUrl:        String,
    appStoreId:     String,
    playStoreId:    String,
    appStoreStatus: { type: String, enum: ['not_submitted','in_review','approved','rejected','published'], default: 'not_submitted' },
    playStoreStatus:{ type: String, enum: ['not_submitted','in_review','approved','rejected','published'], default: 'not_submitted' },
    fcmServerKey:   String,
    apnsKeyId:      String,
    apnsTeamId:     String,
    buildStatus:    { type: String, enum: ['idle','queued','building','success','failed'], default: 'idle' },
    lastBuildAt:    Date,
    lastBuildLog:   String,
    buildArtifacts: {
      iosIpaUrl:     String,
      androidApkUrl: String,
      androidAabUrl: String,
    },
    featureFlags: {
      enableCommunity:    { type: Boolean, default: true },
      enableNutrition:    { type: Boolean, default: true },
      enableGamification: { type: Boolean, default: true },
      enablePOS:          { type: Boolean, default: false },
      enableWearable:     { type: Boolean, default: true },
      enableAI:           { type: Boolean, default: true },
      enableVideoLibrary: { type: Boolean, default: true },
      enableEvents:       { type: Boolean, default: true },
      enableMarketplace:  { type: Boolean, default: false },
    },
    supportEmail:      String,
    privacyPolicyUrl:  String,
    termsUrl:          String,
    apiBaseUrl:        String,
    customDomain:      String,
    notes:             String,
    createdBy:         { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

WhiteLabelSchema.index({ tenantId: 1 }, { unique: true });

export default mongoose.model<IWhiteLabel>('WhiteLabel', WhiteLabelSchema);
