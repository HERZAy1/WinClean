import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'

export interface RecordedRequest {
  method: string
  url: string
  headers: IncomingHttpHeaders
  body: string
}

export interface TestServer {
  url: string
  requests: RecordedRequest[]
  close: () => Promise<void>
}

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
  body: string,
  index: number
) => void | Promise<void>

export async function startTestServer(handler: Handler): Promise<TestServer> {
  const requests: RecordedRequest[] = []
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      const recorded: RecordedRequest = {
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: request.headers,
        body
      }
      requests.push(recorded)
      void Promise.resolve(handler(request, response, body, requests.length - 1)).catch(
        (error: unknown) => {
          response.statusCode = 500
          response.end(error instanceof Error ? error.message : String(error))
        }
      )
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
  }
}
