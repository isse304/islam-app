"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const email_service_1 = require("./services/email.service");
const cost_monitor_service_1 = require("./services/cost-monitor.service");
// Load environment variables from .env.production
(0, dotenv_1.config)({ path: '.env.production' });
async function testAlerts() {
    try {
        const emailService = new email_service_1.EmailService();
        const costMonitorService = new cost_monitor_service_1.CostMonitorService(emailService);
        console.log('Starting alert tests...');
        // Test cost alerts
        console.log('Testing daily cost alert...');
        await emailService.sendCostAlert('daily', 15.50, 10);
        console.log('Testing hourly cost alert...');
        await emailService.sendCostAlert('hourly', 3.75, 2);
        // Test usage alert
        console.log('Testing usage alert...');
        await emailService.sendUsageAlert('test-user-123', 55, 50);
        // Test error alert
        console.log('Testing error alert...');
        await emailService.sendErrorAlert(new Error('Test error message'), 'Test Error Context');
        console.log('All alert tests completed successfully!');
    }
    catch (error) {
        console.error('Error during alert testing:', error);
    }
}
// Run the tests
testAlerts();
//# sourceMappingURL=test-alerts.js.map