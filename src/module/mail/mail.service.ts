import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

export interface InviteEmailData {
  orgName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string;
  inviterName?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly sesClient: SESv2Client;
  private readonly fromEmail: string;
  private readonly configSet?: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get('ses.region') || this.config.get('aws.region');
    this.fromEmail = this.config.get('ses.fromEmail') || 'noreply@motionics.com';
    this.configSet = this.config.get('ses.configSet');
    
    // TODO: SES client initialization temporarily disabled for testing
    // Uncomment when SES is properly configured
    // this.sesClient = new SESv2Client({
    //   region,
    //   // AWS SDK will automatically pick up credentials from environment
    // });
    
    this.logger.log('MailService initialized (SES disabled for testing)');
  }

  /**
   * Send invite email using SES template
   */
  async sendInviteEmail(
    to: string,
    templateName: string,
    templateData: InviteEmailData
  ): Promise<string> {
    // TODO: Email sending temporarily disabled for testing
    // Uncomment when SES is properly configured
    this.logger.log(`[MOCK] Would send invite email to ${to} with template ${templateName}`);
    this.logger.log(`[MOCK] Template data:`, templateData);
    
    // Return mock message ID for testing
    return `mock-message-id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    /* Uncomment when SES is configured:
    try {
      const command = new SendEmailCommand({
        FromEmailAddress: this.fromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Content: {
          Template: {
            TemplateName: templateName,
            TemplateData: JSON.stringify(templateData),
          },
        },
        ConfigurationSetName: this.configSet,
      });

      const response = await this.sesClient.send(command);
      this.logger.log(`Email sent successfully to ${to}, MessageId: ${response.MessageId}`);
      
      return response.MessageId || '';
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
    */
  }

  /**
   * Send simple email without template
   */
  async sendSimpleEmail(
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<string> {
    // TODO: Email sending temporarily disabled for testing
    // Uncomment when SES is properly configured
    this.logger.log(`[MOCK] Would send simple email to ${to} with subject: ${subject}`);
    this.logger.log(`[MOCK] HTML body length: ${htmlBody.length} chars`);
    
    // Return mock message ID for testing
    return `mock-simple-email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    /* Uncomment when SES is configured:
    try {
      const command = new SendEmailCommand({
        FromEmailAddress: this.fromEmail,
        Destination: {
          ToAddresses: [to],
        },
        Content: {
          Simple: {
            Subject: {
              Data: subject,
              Charset: 'UTF-8',
            },
            Body: {
              Html: {
                Data: htmlBody,
                Charset: 'UTF-8',
              },
              ...(textBody && {
                Text: {
                  Data: textBody,
                  Charset: 'UTF-8',
                },
              }),
            },
          },
        },
        ConfigurationSetName: this.configSet,
      });

      const response = await this.sesClient.send(command);
      this.logger.log(`Simple email sent successfully to ${to}, MessageId: ${response.MessageId}`);
      
      return response.MessageId || '';
    } catch (error) {
      this.logger.error(`Failed to send simple email to ${to}:`, error);
      throw error;
    }
    */
  }

  /**
   * Generate invite email HTML (fallback if no template)
   */
  generateInviteEmailHtml(data: InviteEmailData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>You're invited to join ${data.orgName}</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>You're invited to join ${data.orgName}</h2>
        <p>Hello,</p>
        <p>You've been invited to join <strong>${data.orgName}</strong> as a <strong>${data.role}</strong>.</p>
        ${data.inviterName ? `<p>This invitation was sent by ${data.inviterName}.</p>` : ''}
        <p>Click the button below to accept your invitation:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.inviteUrl}" 
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        <p><strong>This invitation expires on ${data.expiresAt}.</strong></p>
        <p>If you don't want to join this organization, you can ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          ${data.inviteUrl}
        </p>
      </body>
      </html>
    `;
  }
}
