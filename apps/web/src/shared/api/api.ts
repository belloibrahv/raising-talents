import {
  buildPath,
  endpoints,
  type EndpointDefinition,
  type EndpointName,
  type EndpointQuery,
  type EndpointRequest,
  type EndpointResponse,
  type Endpoints,
  type PathParams,
} from '@rt/contracts';
import type { WebHttpClient } from './web-http-client';

type BodyOption<N extends EndpointName> = [EndpointRequest<N>] extends [undefined]
  ? { readonly body?: undefined }
  : { readonly body: EndpointRequest<N> };

type ParamsOption<N extends EndpointName> = [keyof PathParams<Endpoints[N]['path']>] extends [never]
  ? { readonly params?: undefined }
  : { readonly params: PathParams<Endpoints[N]['path']> };

/**
 * Endpoints that check the version: send the version from the last read. The API's ETag
 * is that number in quotes, and every such response carries it in the body as well.
 */
type IfMatchOption<N extends EndpointName> = Endpoints[N] extends { concurrency: 'if-match' }
  ? { readonly ifMatch?: number | null }
  : { readonly ifMatch?: undefined };

/** Query string values, as the endpoint's schema accepts them before parsing. */
type QueryOption<N extends EndpointName> = Endpoints[N] extends { query: unknown }
  ? { readonly query?: EndpointQuery<N> }
  : { readonly query?: undefined };

export type CallOptions<N extends EndpointName> = BodyOption<N> &
  ParamsOption<N> &
  IfMatchOption<N> &
  QueryOption<N>;

/** Options can be left out only when the endpoint needs neither a body nor path parameters. */
type CallArgs<N extends EndpointName> =
  { body?: undefined; params?: undefined } extends CallOptions<N>
    ? [options?: CallOptions<N>]
    : [options: CallOptions<N>];

export interface Api {
  call<N extends EndpointName>(name: N, ...args: CallArgs<N>): Promise<EndpointResponse<N>>;
}

/**
 * Calls the API by endpoint name. Path, method, whether a token is needed and the
 * response schema all come from the shared catalogue, so the app cannot call a
 * route the API does not serve, or send a body the API does not accept.
 */
export function createApi(http: WebHttpClient): Api {
  return {
    async call<N extends EndpointName>(
      name: N,
      ...args: CallArgs<N>
    ): Promise<EndpointResponse<N>> {
      const endpoint: EndpointDefinition = endpoints[name];
      const options = (args[0] ?? {}) as {
        body?: unknown;
        params?: Record<string, string>;
        ifMatch?: number | null;
        query?: Record<string, string | number | undefined>;
      };
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined && value !== '') search.set(key, String(value));
      }
      const queryString = search.size > 0 ? `?${search.toString()}` : '';
      const result = await http.request(
        `${buildPath(endpoint.path, options.params)}${queryString}`,
        {
          method: endpoint.method,
          authenticated: endpoint.auth,
          ...(typeof options.ifMatch === 'number'
            ? { headers: { 'if-match': `"${String(options.ifMatch)}"` } }
            : {}),
          ...(options.body === undefined ? {} : { body: options.body }),
          ...(endpoint.response ? { schema: endpoint.response } : {}),
        },
      );
      return result as EndpointResponse<N>;
    },
  };
}
