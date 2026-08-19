import * as http from 'node:http';

export interface CapturedRequest {
  auth: string | undefined;
  event: Record<string, unknown>;
}

export interface FakeEventServer {
  port: number;
  token: string;
  received: CapturedRequest[];
  close(): Promise<void>;
}

/** Stands in for Placet's LocalServer so adapters (forwarder, opencode plugin) can be driven for real without the extension host. */
export async function startFakeEventServer(token = 'test-token'): Promise<FakeEventServer> {
  const received: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      received.push({ auth: req.headers.authorization, event: JSON.parse(body) });
      res.writeHead(204).end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    port,
    token,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
