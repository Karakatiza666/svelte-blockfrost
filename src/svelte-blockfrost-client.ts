import type { BlockFrostAPI } from '@blockfrost/blockfrost-js'
import { paginateMethod } from '@blockfrost/blockfrost-js/lib/utils/index.js'
import type { NetworkId } from '@stricahq/typhonjs/dist/types.js'
import { fromBase64, fromHex, isBase64, isHex, makeHex, toHex, type Hex } from 'ts-binary-newtypes'
import { mapObj, mapObj_, nonNull } from 'ts-practical-fp'
import { components } from '@blockfrost/openapi'

const typhonNetworks = {
   'mainnet': 1,
   'testnet': 0,
   'preprod': 2,
   'preview': 3
}

export type Network = keyof typeof typhonNetworks
export const showNetwork = (network: NetworkId) =>
   (n => n ?? (() => { throw new Error(`Unknown network ${network}`)})() )
   (Object.entries(typhonNetworks).find(t => t[1] == network)?.[0] as Network)

// type BlockfrostError = {
//    status_code: number,
//    error: string,
//    message: string
// }

const querySuffix = (query?: Record<string, string | number | boolean>) => !query || !Object.keys(query) ? '' : '?' + new URLSearchParams(mapObj_(query)(v => v.toString()))

// export class HttpError extends Error {
//    constructor(message: string) {
//       super(message)
//    }
// 	public status: number;
// 	body: App.Error;
// }
const errorCause = (cause: Record<string, unknown>, message?: string) => {
   const err = new Error(message)
   Object.entries(cause).forEach(([k, v]) => (err as any)[k] = v)
   return err
}
const onHttpError = <T>(code: number, val: T) => (error: any) =>
   error.status && error.status === code ? val : Promise.reject(error)

// Creates a wrapper with interface identical to BlockfrostAPI, that sends request to server-side svelte endpoint
// which in turn calls Blockfrost from backend
export const makeBlockfrostApiClient = (endpoint: string, networkId: NetworkId): BlockFrostAPI => {
   const req = (path: string, query?: Record<string, string | number>, init?: RequestInit) =>
      fetch(`${endpoint}/${showNetwork(networkId)}${path}` + querySuffix(query), init)
         .then(res => res.ok || res.redirected
            ? res.json()
            : Promise.reject(errorCause({ status: res.status, statusText: res.statusText }))
         )
   return {
      addressesUtxos: (addr, pagination) => req(`/addresses/${addr}/utxos`, pagination).catch(onHttpError(404, [])),
      addressesUtxosAsset: (addr, asset, pagination) => req(`/addresses/${addr}/utxos/${asset}`, pagination).catch(onHttpError(404, [])),
      assetsHistory: (asset, pagination) =>
         req(`/assets/${asset}/history`, pagination),
      assetsHistoryAll: (asset, allMethodOptions = {batchSize: 100, order: 'asc'}) =>
         paginateMethod(pagination => req(`/assets/${asset}/history`, pagination) as any, allMethodOptions),
      blocksLatest: () => req(`/blocks/latest`),
      ...(() => {
         const epochsParameters = (epoch?: number) => req(`/epochs/${epoch ?? 'latest'}/parameters`)
         return {
            epochsParameters,
            epochsLatestParameters: () => epochsParameters()
         }
      })(),
      scriptsDatum: (datumHash: string) => req(`/scripts/datum/${datumHash}`),
      txsMetadata: (hash) => req(`/txs/${hash}/metadata`),
      txSubmit: (transaction: string | Uint8Array) => req(`/tx/submit`, {}, {
         method: 'POST',
         headers: { "Content-Type": "application/cbor" },
         body: typeof transaction == 'string' ? transaction : toHex(transaction)
      }),
      utilsTxsEvaluate: (transaction: string | Uint8Array) => req(`/utils/txs/evaluate`, {}, {
         method: 'POST',
         headers: { "Content-Type": "application/cbor" },
         body: typeof transaction == 'string' ? transaction : toHex(transaction)
      }),
      // isHex(cbor) ? fromHex(cbor) : isBase64(cbor) ? fromBase64(cbor) : (() => { throw new Error('utilsTxsEvaluate neither base16 not base64')})()
      txs: (hash) => req(`/txs/${hash}`)
   } as BlockFrostAPI & { utilsTxsEvaluate: unknown }
}