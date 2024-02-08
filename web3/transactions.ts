import useAccountStore from "stores/account"
import { LIMIT_ORDER } from "shared/constants/common"
import { QueuedOrderType, OrderType } from "api/types/common"
import ADDRESSES from "./addresses"
import {
  sendWriteContractRequest,
  sendIsolatedWriteContractRequest,
  createIsolatedWalletAndSendOrder,
  constructOrderParams,
  sendUsdcWriteContractRequest,
  sendExchangeWriteContractRequest,
  createQueuedRequest,
  toUsdcBytesValue,
  publicClient,
  constructOrdersBatchParams,
} from "./helpers"
import { IOrder, IIsolated } from "./types"

/** 
 * Submit a Market Order or Limit Order
 * @returns {string} Transaction hash.
 * */
const sendOrder = async (
  orderType: string,
  symbol: string,
  sizeDelta: number,
  limitPrice: number,
  slTpType: OrderType,
  { isIsolated, isolatedWallet }: IIsolated
) => {
  const account = useAccountStore.getState().address as `0x${string}`
  // Construct parameters
  const { args } = constructOrderParams(
    account,
    orderType,
    symbol,
    sizeDelta,
    limitPrice,
    slTpType
  )

  // Market Order uses batchEnqueueOrders even for 1 order (without sltp)
  const functionName =
    orderType === LIMIT_ORDER ? "addLimitOrder" : "batchEnqueueOrders"
  // batchEnqueueOrders function requires array of orders as parameter
  const abiArgs = orderType === LIMIT_ORDER ? args : [args]

  let txHash: string = ""

  // Execute basic or isolated contact write request
  if (isIsolated) {
    txHash = isolatedWallet
      ? await sendIsolatedWriteContractRequest(
          account,
          isolatedWallet as `0x${string}`,
          functionName,
          abiArgs,
          Math.abs(sizeDelta)
        )
      : await createIsolatedWalletAndSendOrder(
          account,
          functionName,
          abiArgs,
          symbol,
          Math.abs(sizeDelta)
        )
  } else {
    txHash = await sendWriteContractRequest(account, functionName, abiArgs)
  }

  return txHash
}

/** 
 * Submit batch of orders when setting or editing SLTP
 * @returns {string} Transaction hash.
 * */
const sendOrdersBatch = async (
  orders: IOrder[],
  { isIsolated, isolatedWallet }: IIsolated,
  isPositionClosing?: boolean,
  existingOrderIds?: string[]
) => {
  const account = useAccountStore.getState().address as `0x${string}`

  const { tradeAmount, functionName, args } = constructOrdersBatchParams(
    account,
    orders,
    existingOrderIds || []
  )

  let txHash: string = ""

  // Execute basic or isolated contact write request
  if (isIsolated) {
    txHash = isolatedWallet
      ? await sendIsolatedWriteContractRequest(
          account,
          isolatedWallet as `0x${string}`,
          functionName,
          args,
          tradeAmount,
          isPositionClosing
        )
      : await createIsolatedWalletAndSendOrder(
          account,
          functionName,
          args,
          orders[0].symbol,
          Math.abs(orders[0].sizeDelta)
        )
  } else {
    txHash = await sendWriteContractRequest(account, functionName, args)
  }

  return txHash
}

/** 
 * Cancel a limit order by orderId
 * @param orderId Id in bytes
 * @returns {string} Transaction hash.
 * */
const cancelOrderById = async (orderId: string) => {
  const account = useAccountStore.getState().address

  const txHash = await sendWriteContractRequest(
    account as `0x${string}`,
    "createQueuedRequest",
    [QueuedOrderType.DELETE_ORDER, [orderId as `0x${string}`]]
  )

  return txHash
}

/** 
 * Deposit collateral tokens to account balance
 * @param amount Amount to deposit
 * @returns {string} Transaction hash.
 * */
const collateralDeposit = async (amount: number) => {
  const account = useAccountStore.getState().address
  const sizeValue = toUsdcBytesValue(amount)

  const approveHash = await sendUsdcWriteContractRequest(
    account as `0x${string}`,
    "approve",
    [ADDRESSES.EXCHANGE, sizeValue]
  )
  // wait for usdc.approve confirmation
  await publicClient.waitForTransactionReceipt({
    hash: approveHash as `0x${string}`,
  })

  const txHash = await sendExchangeWriteContractRequest(
    account as `0x${string}`,
    "accountDepositWithTransfer",
    [sizeValue]
  )
  return txHash
}

/** 
 * Withdraw collateral tokens from account balance
 * @param amount Amount to withdraw
 * @returns {string} Transaction hash.
 * */
const collateralWithdraw = async (amount: number) => {
  const account = useAccountStore.getState().address as `0x${string}`

  // try {
  const txHash = await createQueuedRequest(
    account,
    QueuedOrderType.ACCOUNT_BALANCE_WITHDRAW,
    amount
  )

  return txHash
}


/** 
 * Mint mock USDC of requested amount. FOR TESTNET PURPOSES ONLY
 * @param amount Amount to mint
 * @returns {string} Transaction hash.
 * */
const collateralMint = async (amount: number) => {
  const account = useAccountStore.getState().address as `0x${string}`
  const args = [toUsdcBytesValue(amount)]

  const txHash = await sendUsdcWriteContractRequest(account, "publicMint", args)

  return txHash
}

/**
 * Submit deposit or withdrawal LP request.
 * @param amount Amount to deposit or withdraw
 * @param sizeDecimals Asset's decimal count
 * @param requestType Deposit, schedule withdraw or immediate withdraw enum
 * @param period Lock up period (for schedule withdraw)
 * @returns {string} Transaction hash.
 * */
const sumbitLPRequest = async (
  amount: number,
  sizeDecimals: number,
  requestType: Exclude<
    QueuedOrderType,
    | QueuedOrderType.ACCOUNT_BALANCE_WITHDRAW
    | QueuedOrderType.ACCOUNT_BALANCE_DEPOSIT
    | QueuedOrderType.DELETE_ORDER
  >
  // period?: string
) => {
  const account = useAccountStore.getState().address

  const txHash = await createQueuedRequest(
    account as `0x${string}`,
    requestType,
    amount
  )

  return txHash
}

/**
 * Submit LP deposit directly from wallet.
 * @param amount Amount to deposit or withdraw
 * @returns {string} Transaction hash.
 * */
const liquidityErcDeposit = async (amount: number) => {
  const account = useAccountStore.getState().address
  const sizeValue = toUsdcBytesValue(amount)

  const approveHash = await sendUsdcWriteContractRequest(
    account as `0x${string}`,
    "approve",
    [ADDRESSES.EXCHANGE, sizeValue]
  )
  // wait for usdc.approve confirmation
  await publicClient.waitForTransactionReceipt({
    hash: approveHash as `0x${string}`,
  })

  const txHash = await sendWriteContractRequest(
    account as `0x${string}`,
    "liquidityDepositWithERC20",
    [sizeValue]
  )

  return txHash
}

export {
  sendOrder,
  sendOrdersBatch,
  cancelOrderById,
  collateralDeposit,
  collateralWithdraw,
  collateralMint,
  sumbitLPRequest,
  liquidityErcDeposit,
}
