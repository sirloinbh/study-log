import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

export type ReminderEmail = { to: string; from: string; subject: string; text: string };
export type ReminderSender = (email: ReminderEmail) => Promise<void>;

// Sends through AWS SES (#365). Credentials follow the AWS SDK default chain (the server's IAM role);
// the region is SES_REGION, else AWS_REGION. The client is created on the first send.
export function sesSender(
  region = process.env.SES_REGION || process.env.AWS_REGION,
): ReminderSender {
  let client: SESv2Client | undefined;
  return async ({ to, from, subject, text }) => {
    client ??= new SESv2Client({ region });
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Text: { Data: text, Charset: 'UTF-8' } },
          },
        },
      }),
    );
  };
}
