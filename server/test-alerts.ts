import { config } from 'dotenv';
import { EmailService } from './services/email.service';
import { CostMonitorService } from './services/cost-monitor.service';

// Load environment variables from .env.production
config({ path: '.env.production' });

async function testAlerts() {
  try {
    const emailService = new EmailService();
    const costMonitorService = new CostMonitorService(emailService);

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
    await emailService.sendErrorAlert(
      new Error('Test error message'),
      'Test Error Context'
    );

    console.log('All alert tests completed successfully!');
  } catch (error) {
    console.error('Error during alert testing:', error);
  }
}

// Run the tests
testAlerts(); 