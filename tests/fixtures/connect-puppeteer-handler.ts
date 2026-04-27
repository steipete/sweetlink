export async function authorize(context: { connectPuppeteer: () => Promise<unknown> }) {
  await context.connectPuppeteer();
  return { handled: true, action: "connect-invoked" };
}
