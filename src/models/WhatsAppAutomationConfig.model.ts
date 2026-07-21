import mongoose, { Schema, Document } from 'mongoose';

export interface IFestival {
    name: string;
    date: string; // MM-DD format
    enabled: boolean;
    template: string;
}

export interface IBirthdayConfig {
    enabled: boolean;
    template: string;
    sendTime: string; // HH:mm format
    daysInAdvance: number;
}

export interface IFestivalTemplate {
    message: string;
    enabled: boolean;
    sendTime: string;
}

export interface IWhatsAppAutomationConfig extends Document {
    tenantId: mongoose.Types.ObjectId;
    birthday: IBirthdayConfig;
    festivals: IFestival[];
    festivalTemplate: IFestivalTemplate;
    createdAt: Date;
    updatedAt: Date;
}

const DEFAULT_FESTIVALS: IFestival[] = [
    { name: 'Diwali', date: '11-01', enabled: true, template: 'Wishing you a Happy Diwali, {name}! 🪔 From {gymName}' },
    { name: 'New Year', date: '01-01', enabled: true, template: 'Happy New Year {name}! 🎉 Wishing you health and fitness in the new year. From {gymName}' },
    { name: 'Holi', date: '03-25', enabled: true, template: 'Happy Holi {name}! 🎨 Enjoy the festival of colours. From {gymName}' },
    { name: 'Christmas', date: '12-25', enabled: true, template: 'Merry Christmas {name}! 🎄 From {gymName}' },
    { name: 'Eid', date: '04-10', enabled: true, template: 'Eid Mubarak {name}! 🌙 From {gymName}' },
];

const WhatsAppAutomationConfigSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
        birthday: {
            enabled: { type: Boolean, default: false },
            template: { type: String, default: 'Happy Birthday {name}! 🎂 Wishing you great health and fitness. From {gymName}' },
            sendTime: { type: String, default: '09:00' },
            daysInAdvance: { type: Number, default: 0 },
        },
        festivalTemplate: {
            message: { type: String, default: 'Happy {festivalName}, {name}! From {gymName}' },
            enabled: { type: Boolean, default: true },
            sendTime: { type: String, default: '09:00' },
        },
        festivals: {
            type: [
                {
                    name: { type: String, required: true },
                    date: { type: String, required: true },
                    enabled: { type: Boolean, default: true },
                    template: { type: String, required: true },
                },
            ],
            default: DEFAULT_FESTIVALS,
        },
    },
    { timestamps: true }
);

export default mongoose.model<IWhatsAppAutomationConfig>('WhatsAppAutomationConfig', WhatsAppAutomationConfigSchema);
