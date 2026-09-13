function defaultPort(url: URL): string {
  if (url.port) return url.port;
  return url.protocol === "https:" ? "443" : "80";
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1"
    || hostname === "localhost"
    || hostname === "::1"
    || hostname === "[::1]";
}

export function originHeaderAllowed(origin: string | null, requestUrl: string): boolean {
  if (!origin) return true;
  try {
    const remote = new URL(origin);
    const self = new URL(requestUrl);
    if (!isLoopbackHost(remote.hostname) || !isLoopbackHost(self.hostname)) return false;
    return defaultPort(remote) === defaultPort(self);
  } catch {
    return false;
  }
}
