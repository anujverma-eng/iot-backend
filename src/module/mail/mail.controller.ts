import { Controller, Post, Body, HttpStatus, HttpCode, Get } from '@nestjs/common';
import { MailService, InviteEmailData } from './mail.service';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { Public } from '../auth/public.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('mail')
export class MailController {
  constructor(
    private readonly mailService: MailService,
    private readonly configService: ConfigService
  ) {}

  @Get('config')
  @Public()
  @HttpCode(HttpStatus.OK)
  getSESConfig() {
    return {
      region: this.configService.get('ses.region') || this.configService.get('aws.region') || 'not-set',
      fromEmail: this.configService.get('ses.fromEmail') || 'not-set',
      configSet: this.configService.get('ses.configSet') || 'not-set',
      awsRegion: this.configService.get('aws.region') || 'not-set',
      message: 'Check your environment variables: SES_REGION, SES_FROM_EMAIL, SES_CONFIG_SET'
    };
  }

  @Post('test/simple')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendTestEmail(@Body() dto: SendTestEmailDto) {
    try {
      const messageId = await this.mailService.sendSimpleEmail(
        dto.to,
        dto.subject,
        dto.htmlBody,
        dto.textBody
      );

      return {
        success: true,
        messageId,
        message: `Test email sent successfully to ${dto.to}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to send test email to ${dto.to}`,
      };
    }
  }

  @Post('test/invite')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendTestInviteEmail(@Body() body: { 
    to: string; 
    orgName: string; 
    role: string;
    inviterName?: string;
  }) {
    try {
      const inviteData: InviteEmailData = {
        orgName: body.orgName,
        role: body.role,
        inviteUrl: 'https://example.com/invite/accept?token=test-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        inviterName: body.inviterName,
      };

      // Since we might not have SES templates set up, let's use simple email with generated HTML
      const htmlBody = this.mailService.generateInviteEmailHtml(inviteData);
      const subject = `You're invited to join ${body.orgName}`;

      const messageId = await this.mailService.sendSimpleEmail(
        body.to,
        subject,
        htmlBody
      );

      return {
        success: true,
        messageId,
        message: `Test invite email sent successfully to ${body.to}`,
        inviteData,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to send test invite email to ${body.to}`,
      };
    }
  }

  @Post('test/quick')
  @Public()
  @HttpCode(HttpStatus.OK)
  async sendQuickTestEmail(@Body() body: { to: string }) {
    try {
      const htmlBody = `
        <h2>SES Test Email</h2>
        <p>This is a test email sent from your IoT Platform backend.</p>
        <p>Timestamp: ${new Date().toISOString()}</p>
        <p>If you received this email, your SES configuration is working correctly!</p>
      `;

      const messageId = await this.mailService.sendSimpleEmail(
        body.to,
        'SES Test Email - IoT Platform',
        htmlBody,
        'This is a test email sent from your IoT Platform backend. If you received this email, your SES configuration is working correctly!'
      );

      return {
        success: true,
        messageId,
        message: `Quick test email sent successfully to ${body.to}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: `Failed to send quick test email to ${body.to}`,
      };
    }
  }
}