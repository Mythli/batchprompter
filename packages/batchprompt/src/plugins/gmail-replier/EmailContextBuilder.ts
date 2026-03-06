import { GmailClient, EmailMetadata } from 'gmail-puppet';

export class EmailContextBuilder {
    constructor(private gmailClient: GmailClient) {}

    async buildInspirationContext(emails: EmailMetadata[]): Promise<string> {
        let context = '';
        for (let i = 0; i < emails.length; i++) {
            const thread = await this.gmailClient.readThread(emails[i].id, { keepUnread: false });
            if (thread.length > 0) {
                // Find the last messages to show the context and the reply.
                const recent = thread.slice(-2);
                context += `Example ${i + 1}:\n`;
                for (const msg of recent) {
                    context += `From: ${msg.senderName} <${msg.senderEmail}>\nDate: ${msg.date}\nBody:\n${msg.textBody}\n\n`;
                }
                context += `------------------------\n`;
            }
        }
        return context || 'No inspiration examples found.';
    }

    async buildTargetContext(email: EmailMetadata): Promise<string> {
        const thread = await this.gmailClient.readThread(email.id, { keepUnread: false });
        let context = `Subject: ${email.subject}\n\n`;
        for (const msg of thread) {
            context += `From: ${msg.senderName} <${msg.senderEmail}>\nDate: ${msg.date}\nBody:\n${msg.textBody}\n\n---\n\n`;
        }
        return context;
    }
}
