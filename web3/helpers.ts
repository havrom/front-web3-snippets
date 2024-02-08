import {
  http,
  createPublicClient,
  keccak256,
  toHex,
  encodeFunctionData,
  trim,
  encodeAbiParameters,
  decodeFunctionResult,
  formatEther,
} from "viem"
import { zkSyncTestnet as chain } from "viem/chains"
import useMarketStore from "stores/markets"
import { QueuedOrderType, OrderType } from "api/types/common"
import { LIMIT_ORDER } from "shared/constants/common"
import ABI from "./abi"
import ADDRESSES, { ISOLATED_WALLET_TOPIC } from "./addresses"
import { walletClient } from "./connectWallet"
import { IOrder } from "./types"

const transport = http(process.env.VITE_ALCHEMY_API_KEY)
// Define public client
export const publicClient = createPublicClient({
  chain,
  transport,
})

/**
 * Convert regular USDC amount to correct value in bytes.
 * @param amount Human readable amount.
 * @returns {`0x${string}`} Amount in bytes.
 * */
export const toUsdcBytesValue = (amount: number) => {
  const usdcDecimals = 18
  const bigNumAmount = Math.round(amount * 10 ** usdcDecimals)
  return toHex(bigNumAmount, { size: 32 })
}

/**
 * Execute basic write contract request on Router contract
 *
 * @param account Sender's account address
 * @param functionName ABI function name
 * @param args ABI function args
 * @returns Transaction hash
 */
export const sendWriteContractRequest = async (
  account: `0x${string}`,
  functionName: any,
  args: any
) => {
  if (!walletClient) {
    throw new Error("Wallet client not defined")
  }

  const { request } = await publicClient.simulateContract({
    address: ADDRESSES.ROUTER,
    abi: ABI.ROUTER,
    // @ts-ignore
    functionName,
    args,
    account,
  })

  const hash = await walletClient.writeContract(request)
  return hash as string
}

/**
 * Execute basic write contract request on USDC contract
 *
 * @param account Sender's account address
 * @param functionName ABI function name
 * @param args ABI function args
 * @returns Transaction hash
 */
export const sendUsdcWriteContractRequest = async (
  account: `0x${string}`,
  functionName: "publicMint" | "approve",
  args: any
) => {
  if (!walletClient) {
    throw new Error("Wallet client not defined")
  }

  const { request } = await publicClient.simulateContract({
    address: ADDRESSES.USDC,
    abi: ABI.USDC,
    // @ts-ignore
    functionName,
    args,
    account,
  })

  const hash = await walletClient.writeContract(request)
  return hash as string
}

/**
 * Check USDC balance that account holds on wallet
 *
 * @param account Account address
 * @returns Formatted balance
 */
export const checkUsdcBalance = async (account: `0x${string}`) => {
  const { data } = await publicClient.call({
    account,
    data: encodeFunctionData({
      abi: ABI.USDC,
      functionName: "balanceOf",
      args: [account],
    }),
    to: ADDRESSES.USDC,
  })
  if (!data) return 0

  const formattedBalance = formatEther(
    decodeFunctionResult({
      abi: ABI.USDC,
      functionName: "balanceOf",
      data,
    })
  )
  return Number(formattedBalance)
}

/**
 * Execute basic write contract request on Exchange contract
 *
 * @param account Sender's account address
 * @param functionName ABI function name
 * @param args ABI function args
 * @returns Transaction hash
 */
export const sendExchangeWriteContractRequest = async (
  account: `0x${string}`,
  functionName: any,
  args: any
) => {
  if (!walletClient) {
    throw new Error("Wallet client not defined")
  }

  const { request } = await publicClient.simulateContract({
    address: ADDRESSES.EXCHANGE,
    abi: ABI.EXCHANGE,
    // @ts-ignore
    functionName,
    args,
    account,
  })

  const hash = await walletClient.writeContract(request)

  return hash as string
}

/**
 * Execute write contract request with isolated wallet
 * as sender
 *
 * @param account Sender's account address
 * @param isolatedWalletAddress Isolated (proxy) wallet address
 * @param functionName ABI function name
 * @param args ABI function args
 * @returns Transaction hash
 */
export const sendIsolatedWriteContractRequest = async (
  account: `0x${string}`,
  isolatedWalletAddress: `0x${string}`,
  functionName: any,
  args: any,
  amount: number,
  isPositionClosing?: boolean
) => {
  if (!walletClient) {
    throw new Error("Wallet client not defined")
  }

  const sizeValue = toUsdcBytesValue(amount)

  const approveHash = await sendUsdcWriteContractRequest(
    account as `0x${string}`,
    "approve",
    [isolatedWalletAddress, sizeValue]
  )
  // wait for usdc.approve confirmation
  await publicClient.waitForTransactionReceipt({
    hash: approveHash as `0x${string}`,
  })

  const newArgs = Array.isArray(args[0])
    ? [args[0].map((arg) => ({ ...arg, account: isolatedWalletAddress }))]
    : // @ts-ignore
      args.map((arg) => ({ ...arg, account: isolatedWalletAddress }))

  const approvalTransactions = [
    {
      target: ADDRESSES.USDC,
      value: "0",
      callData: encodeFunctionData({
        abi: ABI.USDC,
        functionName: "transferFrom",
        args: [account, isolatedWalletAddress, sizeValue] as any,
      }),
    },
    {
      target: ADDRESSES.USDC,
      value: "0",
      callData: encodeFunctionData({
        abi: ABI.USDC,
        functionName: "approve",
        args: [ADDRESSES.EXCHANGE, sizeValue] as any,
      }),
    },
    {
      target: ADDRESSES.EXCHANGE,
      value: "0",
      callData: encodeFunctionData({
        abi: ABI.EXCHANGE,
        functionName: "accountDepositWithTransfer",
        args: [sizeValue] as any,
      }),
    },
  ]

  const multicallTransaction = {
    target: ADDRESSES.ROUTER,
    value: "0",
    callData: encodeFunctionData({
      abi: ABI.ROUTER,
      functionName,
      args: newArgs,
    }),
  }

  const { request } = await publicClient.simulateContract({
    address: isolatedWalletAddress,
    abi: ABI.WALLET_LOGIC,
    functionName: "multiCall",
    account,
    args: [
      isPositionClosing
        ? [multicallTransaction]
        : [...approvalTransactions, multicallTransaction],
    ],
  })

  const hash = await walletClient.writeContract(request)

  return hash as string
}

/**
 * Create and deploy proxy wallet contract to be used for
 * isolated margin trades. Then internally execute transaction
 * with given arguments.
 * Gets isolated wallet address from transaction logs
 *
 * @param account Sender account
 * @param functionName Function to be executed after wallet is created
 * @param args ABI function arguments
 * @param symbol Current market (for storing isolated wallet on BE)
 * @returns Transaction hash
 */
export const createIsolatedWalletAndSendOrder = async (
  account: string,
  functionName: any,
  args: any,
  symbol: string,
  amount: number
) => {
  if (!walletClient) {
    throw new Error("Wallet client not defined")
  }

  const { request } = await publicClient.simulateContract({
    address: ADDRESSES.WALLET_FACTORY,
    abi: ABI.WALLET_FACTORY,
    functionName: "createIsolatedWallet",
    account: account as `0x${string}`,
    args: [
      [
        {
          target: ADDRESSES.ROUTER,
          value: "0",
          callData: encodeFunctionData({
            abi: ABI.ROUTER,
            functionName,
            args,
          }),
        },
        {
          target: ADDRESSES.USDC,
          value: "0",
          callData: encodeFunctionData({
            abi: ABI.USDC,
            functionName: "approve",
            args: [ADDRESSES.EXCHANGE, BigInt(amount * 10 ** 18)],
          }),
        },
      ],
      {
        token: ADDRESSES.USDC,
        value: toUsdcBytesValue(amount),
      },
    ],
  })

  const hash = await walletClient.writeContract(request)

  const unwatch = publicClient.watchEvent({
    onLogs: async () => {
      // gets isolated wallet address from tx topics
      const transaction = await publicClient.getTransactionReceipt({ hash })
      const tx = transaction.logs.find((txn) =>
        txn.topics.includes(ISOLATED_WALLET_TOPIC as never)
      )
      const isolatedWallet: string =
        tx && tx?.topics[1] ? trim(tx.topics[1]) : ""

      // store isolated wallet address on BE
      if (isolatedWallet) {
        // await storeIsolatedWallet({ account, market: symbol, isolatedWallet })
        unwatch()
      }
    },
    onError: () => {
      unwatch()
    },
  })

  return hash as string
}

// Get Market/Limit order args, function name and encrypted token name
export const constructOrderParams = (
  account: `0x${string}`,
  orderType: string,
  symbol: string,
  sizeDelta: number,
  limitPrice: number,
  slTpType: OrderType
) => {
  const marketSpec = useMarketStore.getState().markets[symbol]
  const sizeDecimals = marketSpec?.sizeDecimal
  const priceDecimals = marketSpec?.priceDecimal
  const underlying = keccak256(toHex(symbol))
  const limitOrder = orderType === LIMIT_ORDER
  const args = [
    {
      limitOrder,
      account,
      underlying,
      sizeDelta: Math.round(sizeDelta * 10 ** sizeDecimals).toString(),
      limitPrice: Math.round(limitPrice * 10 ** priceDecimals).toString(),
      slTpType: 0,
    },
  ] as Record<string, string | number | `0x${string}` | boolean>[]

  if (slTpType === OrderType.STOP_LOSS) {
    args[0].slTpType = 1
  } else if (slTpType === OrderType.TAKE_PROFIT) {
    args[0].slTpType = 2
  }

  return {
    args,
    underlying,
  }
}

export const constructOrdersBatchParams = (
  account: `0x${string}`,
  orders: IOrder[],
  existingIds: string[]
) => {
  // Orders data for POST request
  const ordersList: {
    account: `0x${string}`
    underlying: `0x${string}`
    sizeDelta: number
    limitPrice: number
    slTpType?: OrderType
  }[] = []

  // Process limit and market order args for contract call
  const marketOrdersArgs: Record<string, string | number | boolean>[] = []
  const limitOrdersArgs: Record<string, string | number | boolean>[] = []
  orders.forEach(({ orderType, symbol, sizeDelta, limitPrice, slTpType }) => {
    const { args, underlying } = constructOrderParams(
      account,
      orderType,
      symbol,
      sizeDelta,
      limitPrice,
      slTpType
    )

    if (orderType === LIMIT_ORDER) {
      limitOrdersArgs.push(args[0])
    } else {
      marketOrdersArgs.push(args[0])
    }

    // Process orders data for POST request
    ordersList.push({ account, underlying, sizeDelta, limitPrice, slTpType })
  })

  const tradeAmount = ordersList
    .map(({ sizeDelta }) => Math.abs(sizeDelta))
    .sort((a, b) => (a > b ? -1 : 1))[0]

  let functionName = ""
  let args = []

  const ordersArgs = marketOrdersArgs.length
    ? [marketOrdersArgs, limitOrdersArgs]
    : [limitOrdersArgs]

  if (existingIds.length) {
    functionName = "deleteAndAddLimitOrders"
    args = [existingIds, ...ordersArgs]
  } else if (marketOrdersArgs.length) {
    functionName = "enqueueOrdersAndAddLimitOrders"
    args = ordersArgs
  } else {
    functionName = "addLimitOrders"
    args = ordersArgs
  }

  return {
    tradeAmount,
    functionName,
    args,
    ordersList,
  }
}

/**
 * Create and deploy proxy wallet contract to be used for isolated margin trades.
 * @param account user's wallet address
 * @returns {string} isolated wallet contract address.
 * */
export const createIsolatedWallet = async (account: string) => {
  if (!walletClient) {
    throw new Error("Wallet client not defined")
  }

  const { request } = await publicClient.simulateContract({
    address: ADDRESSES.WALLET_FACTORY,
    abi: ABI.WALLET_FACTORY,
    functionName: "createIsolatedWallet",
    account: account as `0x${string}`,
    args: [
      [],
      {
        token: "0x0000000000000000000000000000000000000000",
        value: "0",
      },
    ],
  })

  const hash = await walletClient.writeContract(request)

  return new Promise<string>((resolve, reject) => {
    const unwatch = publicClient.watchEvent({
      onLogs: async () => {
        // gets isolated wallet address from tx topics
        const transaction = await publicClient.getTransactionReceipt({ hash })
        const tx = transaction.logs.find((txn) =>
          txn.topics.includes(ISOLATED_WALLET_TOPIC as never)
        )
        const contractAddress: string =
          tx && tx?.topics[1] ? trim(tx.topics[1]) : ""
        unwatch()
        resolve(contractAddress)
      },
      onError: (error) => {
        unwatch()
        reject(error.message)
      },
    })
  })
}

/**
 * Create queued request responsible for LP actions and collateral withdrawal.
 * @param account User's wallet address
 * @param requestType QueuedRequest enum
 * @param amount Asset amount
 * @returns Transaction hash
 * */
export const createQueuedRequest = async (
  account: `0x${string}`,
  requestType: QueuedOrderType,
  amount: number
) => {
  let callData: any

  if (requestType === QueuedOrderType.ACCOUNT_BALANCE_WITHDRAW) {
    callData = encodeAbiParameters(
      [
        { name: "account", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      // @ts-ignore
      [account, ADDRESSES.USDC, toUsdcBytesValue(amount)]
    )
  } else {
    callData = toUsdcBytesValue(amount)
  }

  const txHash = await sendWriteContractRequest(
    account,
    "createQueuedRequest",
    [requestType, [callData]]
  )

  return txHash
}
