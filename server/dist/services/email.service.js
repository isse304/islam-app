"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
class EmailService {
    constructor() {
        this.transporter = nodemailer_1.default.createTransport({
            service: 'gmail',
            auth: {
                user: process.env['SMTP_USER'],
                pass: process.env['SMTP_PASS']
            }
        });
    }
    async sendCostAlert(type, currentCost, threshold) {
        const subject = `[Nura] ${type.charAt(0).toUpperCase() + type.slice(1)} Cost Alert`;
        const text = `
${type.charAt(0).toUpperCase() + type.slice(1)} cost has exceeded $${threshold}.
Current cost: $${currentCost.toFixed(2)}

This is an automated alert from your Nura AI application.
    `.trim();
        await this.sendEmail(subject, text);
    }
    async sendUsageAlert(userId, currentUsage, limit) {
        const subject = '[Nura] Daily Usage Limit Alert';
        const text = `
User ${userId} has exceeded their daily usage limit.
Current usage: ${currentUsage} requests
Daily limit: ${limit} requests

This is an automated alert from your Nura AI application.
    `.trim();
        await this.sendEmail(subject, text);
    }
    async sendErrorAlert(error, context) {
        const subject = '[Nura] System Error Alert';
        const text = `
An error occurred in ${context}:
Error: ${error.message}
Stack: ${error.stack}

This is an automated alert from your Nura AI application.
    `.trim();
        await this.sendEmail(subject, text);
    }
    async sendEmail(subject, text) {
        try {
            await this.transporter.sendMail({
                from: process.env['SMTP_FROM'],
                to: process.env['ALERT_EMAIL'],
                subject,
                text,
                html: text.replace(/\n/g, '<br>')
            });
        }
        catch (error) {
            console.error('Failed to send email alert:', error);
            // Don't throw the error to prevent cascading failures
        }
    }
}
exports.EmailService = EmailService;
//# sourceMappingURL=email.service.js.map