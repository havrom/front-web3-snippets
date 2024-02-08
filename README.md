# Overview
This is the part of DEX exchange project.

## Details

**`AccountHealth`** is a widget (the pic below) that displays how far user is away from margin call. Margin ratio is calculated based on backend data about particular account and converted into health percentage. 
It has some basic markup along with Tailwind CSS classes and renderChart method that turns in into a widget bar - using for loop to create 5 bars, then fill them according to percentage number using some calculations for filled part width and color. It looks like this

![image](https://github.com/havrom/front-web3-snippets/assets/142303074/93639719-b4e3-4cd0-af67-d9f5c7562ca9)

*********************

**`TradingView`** is a component that displays asset price’s chart using TradingView charting library api. It is configured for different screen sizes with own styles and feature sets. Also it uses both Binance and custom data feed which can be toggled between - it triggers reinitialisation of chart with new data. Mobile version was tweaked to have custom “no data” message and icon displayed as default one provided by library couldn’t be placed correctly.

*********************

**`Chart`** is a graph component that displays dynamic of user’s balance over time. Using ApexCharts library it is customised to match required design and on click/hover shows custom tooltip widget which provides detailed information about account status for given timestamp.

![image](https://github.com/havrom/front-web3-snippets/assets/142303074/c9205f50-8b3f-4c13-95a8-11f7cacc6c9e)

********************
**web3 folder:**

`connectWallet.ts` holds all necessary methods to ensure wallet connection, listening to wallet events and creating wallet client instance. It was necessary to not use React Context or state managers like Zustand or Redux. The file holds mutable walletClient variable and exports methods to interact with wallets. WalletConnect is used if no extensions are installed in browser that makes is possible to use app for example in incognito mode or on mobile device in native browser.

`helpers.ts` and `transactions.ts` hold all methods that are used for interacting with smart contracts - opening/closing positions and limit orders, providing liquidity, deposits and withdrawals to and from exchange. Helpers are more utility low level functions used repeatedly, transactions export all methods that are being tied to specific user actions on website.
