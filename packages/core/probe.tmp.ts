import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });
for (const modelId of ['us.amazon.nova-pro-v1:0', 'us.amazon.nova-lite-v1:0', 'amazon.nova-pro-v1:0']) {
  try {
    const res = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: 'Answer only from the provided documents. Cite with [n].' }],
        messages: [
          {
            role: 'user',
            content: [
              {
                text: [
                  '<documents>',
                  '[1] peptides/bpc-157.md — BPC-157 > Dosing',
                  'Typical research protocols use 250-500mcg once or twice daily.',
                  '</documents>',
                  '',
                  'How is BPC-157 dosed?',
                ].join('\n'),
              },
            ],
          },
        ],
        inferenceConfig: { maxTokens: 200 },
      }),
    );
    const text = res.output?.message?.content?.map((c) => c.text).join('') ?? '';
    console.log(modelId, '→ OK:', text.slice(0, 140));
    break;
  } catch (e) {
    console.log(modelId, '→', (e as Error).name, (e as Error).message.slice(0, 100));
  }
}
