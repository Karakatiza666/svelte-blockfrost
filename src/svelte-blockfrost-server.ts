import { json, type RequestHandler } from "@sveltejs/kit"
import { error } from "@sveltejs/kit"
import { assertUnion } from "ts-practical-fp"
import { makeRedirectEndpoint } from "svelte-server-proxy"

const blockfrostNetworks = ['mainnet', 'testnet', 'preprod', 'preview'] as const
type BlockfrostNetwork = typeof blockfrostNetworks[number]

const requireSupportedEndpoint = (projectId: string) => {
   const network = projectId.slice(0, 7)
   try {
      assertUnion(blockfrostNetworks, network, 'Unsupported Blockfrost project id')
   } catch (e) {
      (() => {throw error(404, e as Error)})()
   }
   return network
}

const isBlockfrostErrorResponse = (data: unknown): data is {
   status_code: number;
   message: string;
   error: string;
   url: string;
   body?: unknown;
} => {
    // type guard for narrowing response body to an error object that should be returned by Blockfrost API
    return (typeof data === 'object' &&
        data !== null &&
        'status_code' in data &&
        'message' in data &&
        'error' in data);
}

export const makeBlockfrostApiEndpoint = <T extends {
   'networkId': string,
   'endpoint': string
}>({keys, endpoints}: {keys: Record<BlockfrostNetwork, string>, endpoints: Record<BlockfrostNetwork, string>}): RequestHandler<T> => async (event) => {
   const {params} = event
   // TODO: add api.rateLimiter functionality
   const net = requireSupportedEndpoint(params.networkId)
   const root = endpoints[net]
   const headers = {'project_id': keys[net]}
   if (!root || !headers.project_id) {
      throw error(404, 'Unsupported Cardano network type')
   }
   const response = await makeRedirectEndpoint(root, headers)({...event, params: {params: params.endpoint }})
   const jsonResult = await response.json()
   if (isBlockfrostErrorResponse(jsonResult)) {
      throw error(jsonResult.status_code, new Error(jsonResult.message))
   }
   return json(jsonResult)
}