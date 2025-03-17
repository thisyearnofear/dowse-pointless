import "dotenv/config";
import { Bot, InlineKeyboard, session } from "grammy";
import fetch from "node-fetch";
import {
  generateWalletAddress,
  storeWalletInfo,
  getWalletInfo,
  getWalletBalance,
} from "./wallet.js";

// Initialize the bot
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Middleware for session management
bot.use(
  session({
    initial: () => ({
      walletAddress: null,
      pendingSwap: null,
    }),
  })
);

// Command handlers
bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Welcome to Snel! I'm your DeFi assistant on Telegram.\n\n" +
      "I'm a Scroll-native multichain agent that can help you with:\n" +
      "• Checking token prices\n" +
      "• Swapping tokens across chains\n" +
      "• Managing your wallet\n" +
      "• Executing transactions\n\n" +
      "Try /help to see available commands, or visit our web app at https://snel-pointless.vercel.app/\n\n" +
      "🐌 I might be slow, but I'll get you there safely!"
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "🔍 Here's what I can do:\n\n" +
      "/connect - Connect or create a wallet\n" +
      "/price [token] - Check token price (e.g., /price ETH)\n" +
      "/swap [amount] [token] for [token] - Create a swap (e.g., /swap 0.1 ETH for USDC)\n" +
      "/balance - Check your wallet balance\n" +
      "/disconnect - Disconnect your wallet\n\n" +
      "I'm still learning, so please be patient with me! 🐌"
  );
});

// Connect wallet command
bot.command("connect", async (ctx) => {
  // Check if user already has a wallet
  const userId = ctx.from.id.toString();
  const existingWallet = getWalletInfo(userId);

  if (existingWallet && ctx.session.walletAddress) {
    return ctx.reply(
      `You already have a wallet connected!\n\n` +
        `Address: ${ctx.session.walletAddress}\n\n` +
        `Use /disconnect if you want to disconnect this wallet.`
    );
  }

  // For MVP, we'll simulate wallet creation
  const keyboard = new InlineKeyboard()
    .text("Create New Wallet", "create_wallet")
    .text("Connect Existing", "connect_existing");

  await ctx.reply(
    "Let's set up your wallet. You can create a new wallet or connect an existing one:",
    { reply_markup: keyboard }
  );
});

// Balance command
bot.command("balance", async (ctx) => {
  const userId = ctx.from.id.toString();

  // Check if user has a wallet
  if (!ctx.session.walletAddress) {
    const walletAddress = getWalletInfo(userId);

    if (walletAddress) {
      ctx.session.walletAddress = walletAddress;
    } else {
      return ctx.reply(
        "You don't have a wallet connected yet. Use /connect to set up your wallet."
      );
    }
  }

  // Get wallet balance
  const balance = getWalletBalance(ctx.session.walletAddress);

  await ctx.reply(
    `Your wallet balance:\n\n` +
      `ETH: ${balance.eth}\n` +
      `USDC: ${balance.usdc}\n` +
      `USDT: ${balance.usdt}\n` +
      `DAI: ${balance.dai}\n\n` +
      `Wallet: ${ctx.session.walletAddress.substring(
        0,
        6
      )}...${ctx.session.walletAddress.substring(38)}`
  );
});

// Disconnect command
bot.command("disconnect", async (ctx) => {
  if (!ctx.session.walletAddress) {
    return ctx.reply("You don't have a wallet connected.");
  }

  const walletAddress = ctx.session.walletAddress;
  ctx.session.walletAddress = null;

  await ctx.reply(
    `Wallet disconnected: ${walletAddress.substring(
      0,
      6
    )}...${walletAddress.substring(38)}`
  );
});

// Function to create the request body for API calls
function createTelegramRequestBody(userId, message) {
  return {
    platform: "telegram",
    user_id: userId.toString(),
    message: message,
    metadata: {
      source: "telegram_bot",
      version: "1.0.0",
      timestamp: Date.now(),
    },
  };
}

// Price command
bot.command("price", async (ctx) => {
  const message = ctx.message.text;
  const parts = message.split(" ");

  if (parts.length < 2) {
    return ctx.reply("Please specify a token. Example: /price ETH");
  }

  const token = parts[1].toUpperCase();

  // Use the dedicated Telegram endpoint
  try {
    const response = await fetch(
      `${process.env.API_URL}/api/messaging/telegram/process`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          createTelegramRequestBody(ctx.from.id, `price of ${token}`)
        ),
      }
    );

    const data = await response.json();
    await ctx.reply(data.content);
  } catch (error) {
    console.error("Error fetching price:", error);
    await ctx.reply(
      `Sorry, I couldn't get the price of ${token}. Please try again later.`
    );
  }
});

// Swap command
bot.command("swap", async (ctx) => {
  const userId = ctx.from.id.toString();

  // Check if user has a wallet
  if (!ctx.session.walletAddress) {
    const walletAddress = getWalletInfo(userId);

    if (walletAddress) {
      ctx.session.walletAddress = walletAddress;
    } else {
      return ctx.reply(
        "You need to connect a wallet first. Use /connect to set up your wallet."
      );
    }
  }

  const message = ctx.message.text;

  // Skip the /swap part
  const swapText = message.substring(6).trim();

  if (!swapText) {
    return ctx.reply(
      "Please specify the swap details. Example: /swap 0.1 ETH for USDC"
    );
  }

  // Parse the swap text
  const swapMatch = swapText.match(/(\d+\.?\d*)\s+(\w+)\s+(?:to|for)\s+(\w+)/i);

  if (!swapMatch) {
    return ctx.reply(
      "I couldn't understand your swap request. Please use the format:\n" +
        "/swap [amount] [token] for [token]\n\n" +
        "Example: /swap 0.1 ETH for USDC"
    );
  }

  const [_, amount, fromToken, toToken] = swapMatch;

  // For MVP, we'll simulate getting a quote
  const estimatedOutput = (
    parseFloat(amount) *
    (Math.random() * 0.2 + 0.9) *
    1800
  ).toFixed(2);

  const keyboard = new InlineKeyboard()
    .text("Approve Swap", "approve_swap")
    .text("Cancel", "cancel_swap");

  // Store the swap request in session
  ctx.session.pendingSwap = {
    fromToken: fromToken.toUpperCase(),
    toToken: toToken.toUpperCase(),
    amount: parseFloat(amount),
    estimatedOutput: parseFloat(estimatedOutput),
    timestamp: Date.now(),
  };

  await ctx.reply(
    `Swap Quote:\n\n` +
      `From: ${amount} ${fromToken.toUpperCase()}\n` +
      `To: ~${estimatedOutput} ${toToken.toUpperCase()}\n` +
      `Fee: 0.3%\n\n` +
      `Do you want to proceed with this swap?`,
    { reply_markup: keyboard }
  );
});

// Handle callback queries
bot.on("callback_query", async (ctx) => {
  const callbackData = ctx.callbackQuery.data;
  const userId = ctx.from.id.toString();

  if (callbackData === "create_wallet") {
    // Generate a deterministic wallet address
    const walletAddress = generateWalletAddress(userId);

    // Store in session
    ctx.session.walletAddress = walletAddress;

    // Store wallet info
    storeWalletInfo(userId, walletAddress);

    await ctx.reply(
      "🎉 I've created a new wallet for you!\n\n" +
        `Address: ${walletAddress}\n\n` +
        "This is a simulation for the MVP. In the full version, this would create a real smart contract wallet."
    );
  } else if (callbackData === "connect_existing") {
    await ctx.reply(
      "To connect an existing wallet, you would scan a QR code or enter your wallet address.\n\n" +
        "This feature will be implemented in the next version."
    );
  } else if (callbackData === "approve_swap") {
    if (!ctx.session.pendingSwap) {
      return ctx.reply(
        "No pending swap found. Please create a new swap request."
      );
    }

    const swap = ctx.session.pendingSwap;

    // Generate a fake transaction hash
    const txHash = `0x${Math.random().toString(16).substring(2, 62)}`;

    await ctx.reply(
      "✅ Swap approved!\n\n" +
        `Swapping ${swap.amount} ${swap.fromToken} for ~${swap.estimatedOutput} ${swap.toToken}\n\n` +
        `Transaction hash: ${txHash}\n\n` +
        "This is a simulation for the MVP. In the full version, this would execute the actual swap transaction."
    );

    // Clear the pending swap
    ctx.session.pendingSwap = null;
  } else if (callbackData === "cancel_swap") {
    ctx.session.pendingSwap = null;
    await ctx.reply("Swap cancelled.");
  }

  // Answer the callback query to remove the loading state
  await ctx.answerCallbackQuery();
});

// Handle regular messages
bot.on("message", async (ctx) => {
  const message = ctx.message.text;

  if (!message) return;

  // Simple message handling for the MVP
  if (
    message.toLowerCase().includes("price") ||
    message.toLowerCase().includes("how much is")
  ) {
    // Forward to our dedicated Telegram endpoint
    try {
      const response = await fetch(
        `${process.env.API_URL}/api/messaging/telegram/process`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(createTelegramRequestBody(ctx.from.id, message)),
        }
      );

      const data = await response.json();
      await ctx.reply(data.content);
    } catch (error) {
      console.error("Error processing message:", error);
      await ctx.reply(
        "Sorry, I couldn't process your request. Please try again later."
      );
    }
  } else if (message.toLowerCase().includes("swap")) {
    // Suggest using the /swap command
    await ctx.reply(
      "It looks like you want to swap tokens. Please use the /swap command followed by the details.\n\n" +
        "Example: /swap 0.1 ETH for USDC"
    );
  } else {
    // Default response
    await ctx.reply(
      "I'm not sure what you're asking. Here are some things I can help with:\n\n" +
        "• /price ETH - Check token prices\n" +
        "• /swap 0.1 ETH for USDC - Swap tokens\n" +
        "• /connect - Set up your wallet\n\n" +
        "Or try /help for all commands.\n\n" +
        "You can also visit our web app: https://snel-pointless.vercel.app/"
    );
  }
});

// Start the bot
bot.start();
console.log("Bot started!");
