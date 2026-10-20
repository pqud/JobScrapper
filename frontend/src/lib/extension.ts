/** Bridge helpers for communicating with the Chrome extension from the webapp. */

export function pingExtension(timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "JOBSCRAP_PONG") {
        cleanup();
        resolve(true);
      }
    };
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ type: "JOBSCRAP_PING" }, "*");
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
  });
}

export function sendAuthTokenToExtension(token: string, expiry?: number) {
  window.postMessage(
    {
      type: "JOBSCRAP_AUTH_TOKEN",
      token,
      expiry: expiry ?? Date.now() + 55 * 60 * 1000,
    },
    "*"
  );
}
