/* eslint-disable import/no-mutable-exports */
import {
  createWalletClient,
  custom,
  WalletClient,
  toHex,
  RpcError,
  getAddress,
} from "viem"
import { checkWhitelistStatus, toast } from "shared/helpers"
import useAccountStore from "stores/account"
import { unsubscribeFromAccountChannel } from "api/ws-api"
import { abort } from "api/rest-api"
import { chain, initializeProvider, deactivateProvider } from "./provider"

let provider: any

let connectedAccount = ""

let walletClient: null | WalletClient = null

let isWalletConnecting = true

const setPersistedConnection = (account: string) => {
  localStorage.setItem("connectedAccount", account)
}
const removePersistedConnection = () => {
  localStorage.setItem("connectedAccount", "")
}
const hasPersistedConnection = !!localStorage.getItem("connectedAccount")

const resetAccountData = () => {
  deactivateProvider(provider).then(() => {
    provider = null
    connectedAccount = ""
    useAccountStore.getState().setAddress("")
    removePersistedConnection()
    walletClient = null
  })
}

const handleError = (message: string) => {
  // Infinite error toast if account is not whitelisted
  toast.error(message, message === "Account is not whitelisted")
  resetAccountData()
  isWalletConnecting = false
}

const handleAccountsChange = async (accounts: string[]) => {
  if (!walletClient) return

  // cancel pending api calls
  abort("account changed")

  if (accounts.length === 0) {
    resetAccountData()
  } else {
    const account = getAddress(accounts[0])

    const { isWhitelisted, hasNFT } = await checkWhitelistStatus(account)

    if (!isWhitelisted && !hasNFT) {
      handleError("Account is not whitelisted")
      return
    }

    connectedAccount = account
    useAccountStore.getState().setAddress(account)
    setPersistedConnection(account)
  }
}

const handleChainChange = async (chainId?: string) => {
  if (!walletClient) return
  try {
    const currentChainId: string =
      chainId || toHex(await walletClient.getChainId())
    if (currentChainId !== toHex(chain.id)) {
      // Clean account address from store and show error toast to prompt user without entering catch block
      handleError(
        "Request to switch chain is pending, please change chain to zkSync Testnet in the wallet"
      )
      await walletClient.addChain({ chain })
      await walletClient.switchChain({ id: chain.id })
    }
    // After successful chain switch clean error and write account address to store
    if (connectedAccount) {
      useAccountStore.getState().setAddress(connectedAccount)
    }
  } catch (e) {
    if ((e as RpcError).code === -32002) {
      // Request to switch chain is already pending, so do nothing
    } else if ((e as RpcError).code === -32602) {
      // Invalid method parameter(s).
      handleError(
        "Make sure that you are on zkSync Testnet! If the issue persists, please see a team member."
      )
    } else {
      handleError(`An error occurred please see a team member.`)
    }
  } finally {
    isWalletConnecting = false
  }
}

const initProviderListeners = () => {
  if (!provider) return

  provider.removeListener("accountsChanged", handleAccountsChange)
  provider.removeListener("chainChanged", handleChainChange)

  provider.on("accountsChanged", handleAccountsChange)
  provider.on("chainChanged", handleChainChange)
}

// If isAction is True, then user is initiating the connection
// Otherwise, the app is automatically attempting to retrieve wallet information
const connectWallet = async (
  isAction?: boolean,
  useWalletConnect?: boolean
) => {
  isWalletConnecting = true

  // Show walletconnect modal if no browser extensions installed
  if (useWalletConnect) {
    try {
      if (!provider) {
        provider = await initializeProvider()
        if (!provider.session?.acknowledged) {
          await provider.connect()
        }
      }
    } catch (error) {
      // walletconnect throws error when closing modal
      provider = null
    }
  } else {
    provider = window.ethereum
  }

  const client =
    walletClient ||
    createWalletClient({
      chain,
      transport: custom(provider),
    })

  const [account] =
    isAction || !hasPersistedConnection
      ? await client.requestAddresses()
      : await client.getAddresses()
  if (!account) {
    return
  }

  const { isWhitelisted, hasNFT } = await checkWhitelistStatus(account)

  if (!isWhitelisted && !hasNFT) {
    handleError("Account is not whitelisted")
    return
  }

  connectedAccount = account

  setPersistedConnection(account)

  // Lift account into wallet client instance
  if (!walletClient?.account) {
    walletClient = createWalletClient({
      account,
      chain,
      transport: custom(provider),
    })
  }

  initProviderListeners()

  await handleChainChange()
}

const initWalletConnection = async () => {
  try {
    if (hasPersistedConnection) {
      await connectWallet(false, !window.ethereum)
    }

    if (connectedAccount) {
      useAccountStore.getState().setAddress(connectedAccount)
    }
  } catch (error) {
    toast.error((error as Error).message)
  }
}

const disconnectWallet = () => {
  unsubscribeFromAccountChannel(connectedAccount)
  abort("account disconnected")
  resetAccountData()
}

export {
  walletClient,
  connectWallet,
  initWalletConnection,
  disconnectWallet,
  connectedAccount,
  isWalletConnecting,
}
