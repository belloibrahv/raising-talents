import {
  buildPath,
  endpoints,
  type EndpointDefinition,
  type EndpointName,
  type EndpointRequest,
  type EndpointResponse,
  type Endpoints,
  type PathParams,
} from '@rt/contracts';
import type { HttpClient } from './http-client';

type BodyOption<N extends EndpointName> = [EndpointRequest<N>] extends [undefined]
  ? { readonly body?: undefined }
  : { readonly body: EndpointRequest<N> };

type ParamsOption<N extends EndpointName> = [keyof PathParams<Endpoints[N]['path']>] extends [never]
  ? { readonly params?: undefined }
  : { readonly params: PathParams<Endpoints[N]['path']> };

export type CallOptions<N extends EndpointName> = BodyOption<N> & ParamsOption<N>;

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
export function createApi(http: HttpClient): Api {
  return {
    async call<N extends EndpointName>(
      name: N,
      ...args: CallArgs<N>
    ): Promise<EndpointResponse<N>> {
      const endpoint: EndpointDefinition = endpoints[name];
      const options = (args[0] ?? {}) as { body?: unknown; params?: Record<string, string> };
      const result = await http.request(buildPath(endpoint.path, options.params), {
        method: endpoint.method,
        authenticated: endpoint.auth,
        ...(options.body === undefined ? {} : { body: options.body }),
        ...(endpoint.response ? { schema: endpoint.response } : {}),
      });
      return result as EndpointResponse<N>;
    },
  };
}
