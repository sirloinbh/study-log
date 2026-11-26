import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

export type ReminderEmail = { to: string; from: string; subject: string; text: string };
export type ReminderSender = (email: ReminderEmail) => Promise<void>;

// The SES key of its own (#416): the server's AWS_ACCESS_KEY_ID is the files user, which cannot send.
// Both variables set means explicit credentials; otherwise the AWS SDK default chain is used.
export function sesCredentials(env: NodeJS.ProcessEnv = process.env) {
  const accessKeyId = env.SES_AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.SES_AWS_SECRET_ACCESS_KEY?.trim();
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
}

// Sends through AWS SES (#365); the region is SES_REGION, else AWS_REGION. The client is created on
// the first send.
export function sesSender(
  region = process.env.SES_REGION || process.env.AWS_REGION,
  credentials = sesCredentials(),
): ReminderSender {
  let client: SESv2Client | undefined;
  return async ({ to, from, subject, text }) => {
    client ??= new SESv2Client({ region, credentials });
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
