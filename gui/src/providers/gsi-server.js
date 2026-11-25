// Shared Game State Integration (GSI) endpoint. Valve games (Dota 2, CS2) push
// live state as JSON POSTs to a local HTTP server. This handles the transport;
// each game supplies its own parser. Returns { server, close() }.
import http from 'node:http';

export function createGsiServer({ port, host = '127.0.0.1', token, onBody, onError } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy(); // guard against runaway bodies
    });
    req.on('end', () => {
      res.writeHead(200).end(); // the game ignores the reply; just ack
      try {
        const body = JSON.parse(raw);
        if (token && body?.auth?.token !== token) return; // optional shared secret
        onBody?.(body);
      } catch (e) {
        onError?.(e);
      }
    });
  });
  server.listen(port, host);
  return { server, close: () => new Promise((r) => server.close(r)) };
}
