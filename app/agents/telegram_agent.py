"""
Telegram-specific agent for handling Telegram bot interactions.
"""
import logging
import json
import re
import random
import hashlib
import time
import os
from typing import Dict, Any, List, Optional, Union, Tuple, Callable
from pydantic import Field
from app.agents.messaging_agent import MessagingAgent
from app.services.token_service import TokenService
from app.services.swap_service import SwapService
from app.services.wallet_service import WalletService

# Try to import the SmartWalletService if available
try:
    from app.services.smart_wallet_service import SmartWalletService
    SMART_WALLET_AVAILABLE = True
except ImportError:
    SMART_WALLET_AVAILABLE = False

from app.services.gemini_service import GeminiService
from app.services.prices import price_service

logger = logging.getLogger(__name__)

# Default blockchain network
DEFAULT_CHAIN = "base_sepolia"

class TelegramAgent(MessagingAgent):
    """
    Agent for handling Telegram-specific interactions.
    
    This agent extends the MessagingAgent with Telegram-specific features
    like commands, wallet creation, and inline buttons.
    """
    command_handlers: Dict[str, Callable] = Field(default_factory=dict)
    wallet_service: Optional[WalletService] = None
    gemini_service: Optional[GeminiService] = None
    
    model_config = {
        "arbitrary_types_allowed": True
    }

    def __init__(
        self, 
        token_service: TokenService, 
        swap_service: SwapService,
        wallet_service: Optional[WalletService] = None,
        gemini_service: Optional[GeminiService] = None
    ):
        """
        Initialize the Telegram agent.
        
        Args:
            token_service: Service for managing tokens and chains
            swap_service: Service for swap-related operations
            wallet_service: Optional wallet service for wallet operations
            gemini_service: Optional Gemini service for AI-powered responses
        """
        super().__init__(token_service, swap_service)
        self.wallet_service = wallet_service
        self.gemini_service = gemini_service
        
        # Register command handlers
        self.command_handlers = {
            "start": self._handle_start_command,
            "help": self._handle_help_command,
            "connect": self._handle_connect_command,
            "balance": self._handle_balance_command,
            "price": self._handle_price_command,
            "swap": self._handle_swap_command,
            "disconnect": self._handle_disconnect_command,
            "networks": self._handle_networks_command,
            "network": self._handle_network_command,
            "keys": self._handle_keys_command,
            "faucet": self._handle_faucet_command
        }
        
        logger.info("TelegramAgent initialized with commands: %s", list(self.command_handlers.keys()))

    async def process_telegram_update(
        self,
        update: Dict[str, Any],
        user_id: str,
        wallet_address: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a Telegram update object.
        
        Args:
            update: Telegram update object
            user_id: Telegram user ID
            wallet_address: User's wallet address if already connected
            metadata: Additional metadata
            
        Returns:
            Dict with response content and any additional information
        """
        logger.info(f"Processing Telegram update for user {user_id}")
        
        # Handle different types of updates
        if "message" in update and "text" in update["message"]:
            message_text = update["message"]["text"]
            return await self._process_telegram_message(message_text, user_id, wallet_address, metadata)
        elif "callback_query" in update:
            # Handle button callbacks
            callback_data = update["callback_query"]["data"]
            return await self._process_callback_query(user_id, callback_data, wallet_address)
        else:
            # Default response for unsupported update types
            return {
                "content": "Sorry, I can only handle text messages and button clicks for now.",
                "metadata": {"telegram_buttons": None}
            }

    async def _process_telegram_message(
        self,
        message: str,
        user_id: str,
        wallet_address: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Process a text message from Telegram.
        
        Args:
            message: Message text
            user_id: Telegram user ID
            wallet_address: User's wallet address if already connected
            metadata: Additional metadata
            
        Returns:
            Dict with response content and any additional information
        """
        # Check if this is a command
        if message.startswith("/"):
            command_parts = message.split(" ", 1)
            command = command_parts[0].lower()
            args = command_parts[1] if len(command_parts) > 1 else ""
            
            # Dispatch to the appropriate command handler
            if command in self.command_handlers:
                return await self.command_handlers[command](user_id, args, wallet_address)
            else:
                return {
                    "content": "I don't recognize that command. Try /help to see what I can do."
                }
        
        # If not a command, process as a regular message
        result = await self.process_message(
            message=message,
            platform="telegram",
            user_id=user_id,
            wallet_address=wallet_address,
            metadata=metadata
        )
        
        # Add Telegram-specific personality
        result["content"] = self._add_telegram_personality(result["content"])
        
        return result

    async def _process_callback_query(
        self,
        user_id: str,
        callback_data: str,
        wallet_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a callback query from an inline button.
        
        Args:
            user_id: Telegram user ID
            callback_data: Data from the callback query
            wallet_address: User's wallet address
            
        Returns:
            Dict with response content
        """
        logger.info(f"Processing callback query: {callback_data}")
        
        # Handle different callback queries
        if callback_data == "connect_wallet":
            return await self._handle_connect_command(user_id, "", wallet_address)
        
        elif callback_data == "check_balance":
            return await self._handle_balance_command(user_id, "", wallet_address)
        
        elif callback_data == "show_help":
            return await self._handle_help_command(user_id, "", wallet_address)
        
        elif callback_data == "show_networks":
            return await self._handle_networks_command(user_id, "", wallet_address)
        
        elif callback_data == "create_new_wallet":
            return await self._handle_connect_command(user_id, "new", wallet_address)
        
        elif callback_data == "get_faucet":
            return await self._handle_faucet_command(user_id, "", wallet_address)
        
        elif callback_data == "show_address":
            if wallet_address:
                return {
                    "content": f"Your wallet address is:\n\n`{wallet_address}`\n\nYou can copy this address to receive funds."
                }
            else:
                return {
                    "content": "You don't have a wallet connected yet. Use /connect to create one."
                }
                
        elif callback_data.startswith("network:"):
            network = callback_data.split(":", 1)[1]
            return await self._handle_network_command(user_id, network, wallet_address)
        
        elif callback_data.startswith("swap_approve:"):
            swap_id = callback_data.split(":", 1)[1]
            return await self._approve_swap(user_id, swap_id, wallet_address)
        
        elif callback_data.startswith("swap_cancel:"):
            swap_id = callback_data.split(":", 1)[1]
            return await self._cancel_swap(user_id, swap_id, wallet_address)
        
        elif callback_data == "suggest_help":
            return {
                "content": "Here are some things you can ask me about:\n\n" +
                          "• Cryptocurrency prices\n" +
                          "• How to set up a wallet\n" +
                          "• What are smart contracts\n" +
                          "• Differences between blockchains\n" +
                          "• What is Base/Scroll\n\n" +
                          "You can also use /help to see available commands."
            }
        
        # Default response
        return {
            "content": "I'm not sure how to handle that request. Try using /help to see available commands."
        }

    def _add_telegram_personality(self, content: str) -> str:
        """
        Add personality to Telegram responses.
        
        Args:
            content: Original response content
            
        Returns:
            Enhanced content with personality
        """
        if not content:
            return content
            
        # Define snail emojis to add personality
        snail_emojis = ["🐌", "🐌 ", "🐌💨", "🐢"]
        
        # Define quips about being slow but reliable
        slow_quips = [
            "(Sorry for the delay, moving as fast as my shell allows!)",
            "(Zooming at snail speed...)",
            "(I might be slow, but I'll get you there safely!)",
            "(Taking my time to get things right! 🐌)",
            "(Slow and steady wins the DeFi race!)",
            "(Every transaction is a marathon, not a sprint!)",
            "(Quality over speed, that's the snail way!)"
        ]
        
        # Get a random emoji and quip
        emoji = random.choice(snail_emojis) if random.random() < 0.4 else ""
        quip = random.choice(slow_quips) if random.random() < 0.25 and len(content) > 50 else ""
        
        # Avoid adding emoji to error messages
        if "error" in content.lower() or "sorry" in content.lower():
            emoji = ""
            quip = ""
            
        # Format the content with emoji and quip
        result = content
        
        # Add emoji if not already at the beginning
        if emoji and not content.startswith("🐌") and not content.startswith("🐢"):
            # Add emoji at a logical position, not breaking markdown or between words
            if "\n" in content[:20]:
                # Add after the first line
                first_newline = content.find("\n")
                result = content[:first_newline+1] + emoji + " " + content[first_newline+1:]
            else:
                # Add at the beginning
                result = emoji + " " + content
                
        # Add quip to the end
        if quip and not content.endswith(")"):
            result += f"\n\n{quip}"
            
        # Enhance command visibility by adding asterisks around commands
        command_pattern = r'(/[a-z_]+)'
        result = re.sub(command_pattern, r'*\1*', result)
        
        return result

    async def _handle_start_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /start command.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        # Create buttons for getting started
        buttons = []
        
        # If user already has a wallet, show wallet options
        if wallet_address:
            buttons.append([
                {"text": "💰 Check Balance", "callback_data": "check_balance"},
                {"text": "🌐 Switch Network", "callback_data": "show_networks"}
            ])
            buttons.append([
                {"text": "📊 Price Check", "callback_data": "suggest_price"},
                {"text": "🔄 Swap Tokens", "callback_data": "suggest_swap"}
            ])
            
            return {
                "content": f"Welcome back to Snel DeFi Assistant! 🐌\n\n" +
                    f"Your wallet `{wallet_address[:6]}...{wallet_address[-4:]}` is connected.\n\n" +
                    f"What would you like to do today?",
                "metadata": {
                    "telegram_buttons": buttons
                }
            }
        
        # New user flow
        buttons.append([
            {"text": "💼 Create Wallet", "callback_data": "create_wallet"}
        ])
        buttons.append([
            {"text": "ℹ️ Learn More", "callback_data": "show_help"}
        ])
        
        return {
            "content": "Hello! I'm Snel, your friendly DeFi assistant! 🐌\n\n" +
                "I can help you navigate the world of decentralized finance with:\n\n" +
                "• Crypto wallet management\n" +
                "• Token swaps and transfers\n" +
                "• Price tracking and alerts\n" +
                "• Multi-chain support\n\n" +
                "Would you like to create a wallet to get started?",
            "metadata": {
                "telegram_buttons": buttons
            }
        }

    async def _handle_help_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /help command.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        # Create buttons for common actions
        buttons = []
        
        # Add wallet-specific buttons if user has a wallet
        if wallet_address:
            buttons.append([
                {"text": "💰 Check Balance", "callback_data": "check_balance"},
                {"text": "🌐 Switch Network", "callback_data": "show_networks"}
            ])
        else:
            buttons.append([
                {"text": "💼 Create Wallet", "callback_data": "create_wallet"}
            ])
            
        # Add general help buttons
        buttons.append([
            {"text": "🔍 View Networks", "callback_data": "show_networks"},
            {"text": "🔐 Key Custody", "callback_data": "keys_help"}
        ])
        
        # Create help text
        help_text = "🐌 **Snel DeFi Assistant Commands:**\n\n"
        
        # Wallet commands
        help_text += "**Wallet Commands:**\n"
        help_text += "• */connect* - Create or connect a wallet\n"
        help_text += "• */balance* - Check your wallet balance\n"
        help_text += "• */disconnect* - Disconnect your wallet\n"
        help_text += "• */keys* - Learn about key management\n\n"
        
        # Trading commands
        help_text += "**Trading Commands:**\n"
        help_text += "• */price ETH* - Check token prices\n"
        help_text += "• */swap 0.1 ETH for USDC* - Swap tokens\n\n"
        
        # Network commands
        help_text += "**Network Commands:**\n"
        help_text += "• */networks* - See available networks\n"
        help_text += "• */network base_sepolia* - Switch to a network\n\n"
        
        # Informational commands
        help_text += "**Other Commands:**\n"
        help_text += "• */help* - Show this help message\n\n"
        
        # Add info about general questions
        help_text += "You can also ask me general questions about DeFi, crypto, and blockchain technology!"
        
        return {
            "content": help_text,
            "metadata": {
                "telegram_buttons": buttons
            }
        }

    async def _handle_connect_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /connect command to connect or create a wallet.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content and optional button markup
        """
        # User wants to create a new wallet (even if they have an existing one)
        create_new = "new" in args.lower()
        
        # If the user already has a wallet and isn't creating a new one
        if wallet_address and not create_new:
            buttons = [
                [
                    {"text": "💰 Check Balance", "callback_data": "check_balance"},
                    {"text": "🌐 Switch Networks", "callback_data": "show_networks"}
                ],
                [
                    {"text": "🔄 Create New Wallet", "callback_data": "create_new_wallet"}
                ]
            ]
            
            return {
                "content": f"You already have a wallet connected: `{wallet_address}`\n\n" +
                           "You can check your balance, switch networks, or create a new wallet if needed.",
                "metadata": {
                    "telegram_buttons": buttons
                }
            }
            
        # If creating a new wallet, disconnect any existing wallet
        if wallet_address and self.wallet_service:
            try:
                # Attempt to delete existing wallet data
                await self.wallet_service.delete_wallet(
                    user_id=str(user_id),
                    platform="telegram"
                )
                wallet_address = None
                logger.info(f"Disconnected existing wallet for user {user_id}")
            except Exception as e:
                logger.exception(f"Error disconnecting wallet during connect: {e}")
                
                # Try deleting from the messaging namespace too (check both formats)
                try:
                    # Delete from messaging:telegram:user:userid:wallet
                    message_key = f"messaging:telegram:user:{user_id}:wallet"
                    if hasattr(self.wallet_service, 'redis_client') and self.wallet_service.redis_client:
                        await self.wallet_service.redis_client.delete(message_key)
                        logger.info(f"Deleted messaging wallet key for user {user_id}")
                except Exception as e2:
                    logger.exception(f"Error clearing messaging wallet key: {e2}")
            
        # Check if wallet service is available
        if not self.wallet_service:
            return {
                "content": "Sorry, wallet services are not available at the moment. Please try again later."
            }
        
        # Check if we're using SmartWalletService or WalletService
        is_smart_wallet = isinstance(self.wallet_service, SmartWalletService) if SMART_WALLET_AVAILABLE else False
        
        # Create a new wallet
        try:
            if is_smart_wallet:
                # Using Coinbase CDP Smart Wallet
                wallet_result = await self.wallet_service.create_smart_wallet(
                    user_id=str(user_id),
                    platform="telegram"
                )
                
                if "error" in wallet_result:
                    return {
                        "content": f"⚠️ I couldn't create a wallet right now. Error: {wallet_result['error']}\n\n" +
                                  "Please try again later."
                    }
                    
                new_wallet_address = wallet_result.get("address")
                wallet_type = "coinbase_cdp"
            else:
                # Legacy wallet creation using simulated wallets
                wallet_result = await self.wallet_service.create_wallet(
                    user_id=str(user_id),
                    platform="telegram",
                    wallet_address=None,  # Force creation of a new wallet
                    chain=DEFAULT_CHAIN
                )
                
                if not wallet_result.get("success"):
                    return {
                        "content": f"⚠️ I couldn't create a wallet right now. This might be due to:\n\n" +
                                  "• Temporary service disruption\n" +
                                  "• Network connectivity issues\n\n" +
                                  "Please try again later."
                    }
                    
                new_wallet_address = wallet_result.get("wallet_address")
                wallet_type = wallet_result.get("wallet_type", "standard")
            
            # Return success response
            buttons = [
                [
                    {"text": "💰 Check Balance", "callback_data": "check_balance"},
                    {"text": "📝 View Address", "callback_data": "show_address"}
                ],
                [
                    {"text": "🚰 Get Test ETH", "callback_data": "get_faucet"}
                ]
            ]
            
            network_name = "Base Sepolia (testnet)" if is_smart_wallet else "Scroll Sepolia (testnet)"
            
            return {
                "content": f"✅ Your wallet has been created successfully!\n\n" +
                           f"Wallet Type: {wallet_type.capitalize()}\n" +
                           f"Network: {network_name}\n\n" +
                           "Your wallet address is:\n" +
                           f"`{new_wallet_address}`\n\n" +
                           "You can now use this wallet to check prices, make swaps, and more.\n\n" +
                           "To get started, you'll need some testnet ETH. Click 'Get Test ETH' below.",
                "wallet_address": new_wallet_address,
                "metadata": {
                    "telegram_buttons": buttons
                }
            }
            
        except Exception as e:
            logger.exception(f"Error creating wallet: {e}")
            return {
                "content": "⚠️ Sorry, I encountered an error while creating your wallet. Please try again later."
            }

    async def _handle_balance_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /balance command to check wallet balance.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address
            
        Returns:
            Dict with response content
        """
        if not wallet_address:
            buttons = [
                [
                    {"text": "🔗 Connect Wallet", "callback_data": "connect_wallet"}
                ]
            ]
            
            return {
                "content": "You don't have a wallet connected yet. Please connect a wallet first.",
                "metadata": {
                    "telegram_buttons": buttons
                }
            }
        
        if not self.wallet_service:
            return {
                "content": "Sorry, wallet services are not available at the moment."
            }
        
        # Check if we're using SmartWalletService or WalletService
        is_smart_wallet = isinstance(self.wallet_service, SmartWalletService) if SMART_WALLET_AVAILABLE else False
        
        try:
            if is_smart_wallet:
                # Using Coinbase CDP Smart Wallet
                balance_result = await self.wallet_service.get_wallet_balance(
                    user_id=str(user_id),
                    platform="telegram"
                )
                
                if "error" in balance_result:
                    return {
                        "content": f"⚠️ I couldn't retrieve your balance. Error: {balance_result['error']}"
                    }
                
                eth_balance = balance_result.get("balance", {}).get("eth", "0.0")
                
                buttons = [
                    [
                        {"text": "🚰 Get Test ETH", "callback_data": "get_faucet"},
                        {"text": "📝 View Address", "callback_data": "show_address"}
                    ]
                ]
                
                return {
                    "content": f"💰 Your wallet balance:\n\n" +
                               f"ETH: {eth_balance}\n" +
                               f"Address: `{wallet_address}`\n" +
                               f"Network: Base Sepolia (testnet)",
                    "metadata": {
                        "telegram_buttons": buttons
                    }
                }
            else:
                # Legacy balance check
                # Get wallet data from the wallet service
                wallet_data = await self.wallet_service.get_wallet(
                    user_id=str(user_id),
                    platform="telegram"
                )
                
                if not wallet_data.get("success"):
                    return {
                        "content": "⚠️ I couldn't retrieve your wallet information. Please try reconnecting your wallet."
                    }
                
                chain = wallet_data.get("chain", DEFAULT_CHAIN)
                
                # Get balance for the wallet
                balance_result = await self.wallet_service.get_wallet_balance(
                    user_id=str(user_id),
                    platform="telegram",
                    chain=chain
                )
                
                if not balance_result.get("success"):
                    return {
                        "content": "⚠️ I couldn't retrieve your balance. This might be due to network issues."
                    }
                
                chain_info = balance_result.get("chain_info", {})
                chain_name = chain_info.get("name", "Unknown Network")
                eth_balance = balance_result.get("balance", {}).get("eth", "0.0")
                
                # Add token balances if available
                token_balances = balance_result.get("balance", {}).get("tokens", [])
                token_balance_strings = []
                
                for token in token_balances:
                    if token.get("balance") and float(token.get("balance", 0)) > 0:
                        token_balance = token.get("balance", "0")
                        token_symbol = token.get("symbol", "???")
                        token_balance_strings.append(f"{token_symbol}: {token_balance}")
                
                token_balance_text = "\n".join(token_balance_strings) if token_balance_strings else "No token balances"
                
                buttons = [
                    [
                        {"text": "🚰 Get Test ETH", "callback_data": "get_faucet"},
                        {"text": "🌐 Switch Networks", "callback_data": "show_networks"}
                    ]
                ]
                
                return {
                    "content": f"💰 Your wallet balance:\n\n" +
                               f"ETH: {eth_balance}\n\n" +
                               f"Token Balances:\n{token_balance_text}\n\n" +
                               f"Address: `{wallet_address}`\n" +
                               f"Network: {chain_name}",
                    "metadata": {
                        "telegram_buttons": buttons
                    }
                }
                
        except Exception as e:
            logger.exception(f"Error retrieving balance: {e}")
            return {
                "content": "⚠️ Sorry, I encountered an error while checking your balance. Please try again later."
            }

    async def _handle_price_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /price command.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments (token symbol)
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        if not args:
            return {
                "content": "Please specify a token symbol. Example: /price ETH"
            }
            
        # Extract token symbol
        token_symbol = args.strip().upper()
        
        try:
            # Try to get the price from the price service
            price_data = await price_service.get_token_price(token_symbol)
            
            if not price_data or "error" in price_data:
                return {
                    "content": f"Sorry, I couldn't find price information for {token_symbol}. Try a popular token like ETH, BTC, USDC, or USDT."
                }
                
            price = price_data.get("price", 0)
            change_24h = price_data.get("change_24h", 0)
            
            # Format the price based on its value
            if price >= 100:
                price_str = f"${price:,.2f}"
            elif price >= 1:
                price_str = f"${price:.4f}"
            else:
                price_str = f"${price:.6f}"
                
            # Determine if the price went up or down
            if change_24h > 0:
                change_text = f"📈 +{change_24h:.2f}%"
            elif change_24h < 0:
                change_text = f"📉 {change_24h:.2f}%"
            else:
                change_text = "➡️ 0.00%"
                
            # Create buttons for common actions
            buttons = []
            buttons.append([
                {"text": f"Swap {token_symbol}", "callback_data": f"suggest_swap_{token_symbol}"},
                {"text": "Check Another", "callback_data": "suggest_price"}
            ])
            
            return {
                "content": f"💰 **{token_symbol} Price**\n\n" +
                    f"Current Price: {price_str}\n" +
                    f"24h Change: {change_text}\n\n" +
                    f"Last updated: {price_data.get('last_updated', 'just now')}\n\n" +
                    f"To check another token price, use */price [symbol]*\n" +
                    f"To swap tokens, use */swap [amount] [token] for [token]*",
                "metadata": {
                    "telegram_buttons": buttons
                }
            }
            
        except Exception as e:
            logger.exception(f"Error getting price for {token_symbol}: {e}")
            return {
                "content": f"Sorry, I encountered an error getting the price for {token_symbol}. Please try again later."
            }

    async def _handle_swap_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /swap command.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content and optional button markup
        """
        logger.info(f"Processing swap command: '{args}' for user {user_id}")
        
        if not wallet_address:
            return {
                "content": "You need to connect a wallet first. Use /connect to set up your wallet."
            }
        
        if not args:
            return {
                "content": "Please specify the swap details. Example: /swap 0.1 ETH for USDC"
            }
        
        # Parse the swap text - be more flexible with the regex pattern
        swap_match = re.search(r"(\d+\.?\d*)\s+(\w+)(?:\s+(?:to|for)\s+)(\w+)", args, re.I)
        
        if not swap_match:
            return {
                "content": "I couldn't understand your swap request. Please use the format:\n" +
                    "/swap [amount] [token] for [token]\n\n" +
                    "Example: /swap 0.1 ETH for USDC"
            }
        
        amount, from_token, to_token = swap_match.groups()
        
        # For MVP, simulate getting a quote
        estimated_output = round(float(amount) * (random.random() * 0.2 + 0.9) * 1800, 2)
        
        # Prepare swap info for button callback
        swap_info = {
            "from_token": from_token.upper(),
            "to_token": to_token.upper(),
            "amount": float(amount),
            "estimated_output": estimated_output
        }
        
        # Create buttons for swap options
        buttons = [
            [
                {"text": "✅ Approve Swap", "callback_data": f"approve_swap:{json.dumps(swap_info)}"},
                {"text": "❌ Cancel", "callback_data": "cancel_swap"}
            ]
        ]
        
        return {
            "content": f"Swap Quote:\n\n" +
                f"From: {amount} {from_token.upper()}\n" +
                f"To: ~{estimated_output} {to_token.upper()}\n" +
                f"Fee: 0.3%\n\n" +
                f"Do you want to proceed with this swap?",
            "metadata": {
                "telegram_buttons": buttons
            }
        }

    async def _handle_disconnect_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /disconnect command to disconnect a wallet.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        if not wallet_address:
            return {
                "content": "You don't have a wallet connected. Use /connect to set up a wallet."
            }
            
        # If we have a wallet service, remove the wallet from it
        if self.wallet_service:
            try:
                await self.wallet_service.delete_wallet(
                    user_id=str(user_id),
                    platform="telegram"
                )
            except Exception as e:
                logger.exception(f"Error disconnecting wallet: {e}")
        
        return {
            "content": f"Wallet disconnected successfully. Your data has been removed from our service.\n\nUse /connect if you'd like to reconnect or create a new wallet.",
            "wallet_address": None  # Signal to remove the wallet
        }

    async def _handle_networks_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /networks command to show available networks.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        if not self.wallet_service:
            networks = [
                {"id": "scroll_sepolia", "name": "Scroll Sepolia", "description": "Scroll L2 testnet"},
                {"id": "base_sepolia", "name": "Base Sepolia", "description": "Base L2 testnet"},
                {"id": "ethereum_sepolia", "name": "Ethereum Sepolia", "description": "Ethereum testnet"}
            ]
        else:
            try:
                networks = await self.wallet_service.get_supported_chains()
            except Exception as e:
                logger.exception(f"Error getting networks: {e}")
                networks = []
                
        if not networks:
            return {
                "content": "No networks available at the moment. Please try again later."
            }
            
        # Create network buttons for selection
        buttons = []
        row = []
        
        # Get current network if user has a wallet
        current_network = DEFAULT_CHAIN
        if wallet_address and self.wallet_service:
            try:
                wallet_info = await self.wallet_service.get_wallet_info(str(user_id), "telegram")
                if wallet_info and "chain" in wallet_info:
                    current_network = wallet_info["chain"]
            except Exception as e:
                logger.exception(f"Error getting current network: {e}")
        
        # Format network list with buttons
        networks_text = "🌐 Available Networks:\n\n"
        
        for i, network in enumerate(networks):
            network_id = network["id"]
            network_name = network["name"]
            network_desc = network.get("description", "")
            
            # Mark current network
            current_marker = "✅ " if network_id == current_network else ""
            
            networks_text += f"{current_marker}**{network_name}** ({network_id})\n{network_desc}\n\n"
            
            # Add button for this network
            row.append({"text": network_name, "callback_data": f"select_network:{network_id}"})
            
            # Create rows of 2 buttons
            if len(row) == 2 or i == len(networks) - 1:
                buttons.append(row)
                row = []
        
        # Add instructions
        if wallet_address:
            networks_text += "Click a network below to switch, or use the command:\n/network [network_id]"
        else:
            networks_text += "Connect a wallet first with /connect to use these networks."
            buttons = []  # No buttons if no wallet
        
        return {
            "content": networks_text,
            "metadata": {
                "telegram_buttons": buttons
            } if buttons else None
        }

    async def _handle_network_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /network command to switch networks.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments (should be network name)
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        if not args:
            return {
                "content": "Please specify a network name. Example: /network base_sepolia\n\nUse /networks to see a list of available networks."
            }
        
        if not self.wallet_service:
            return {
                "content": "Network switching is not available in this version."
            }
        
        # Extract network name from args
        network_name = args.strip().lower()
        
        # If the user wrote network names like "Base Sepolia", convert to base_sepolia format
        network_name = network_name.replace(" ", "_")
        
        # Add check for common shorthand
        shorthand_mappings = {
            "scroll": "scroll_sepolia",
            "base": "base_sepolia",
            "ethereum": "ethereum_sepolia",
            "sepolia": "ethereum_sepolia"  # Assume regular sepolia is ethereum sepolia
        }
        
        network_name = shorthand_mappings.get(network_name, network_name)
        
        # Switch the network
        result = await self.wallet_service.switch_chain(
            user_id=str(user_id),
            platform="telegram",
            chain=network_name
        )
        
        if result["success"]:
            return {
                "content": f"🌐 Switched network to {result['chain_info']['name']} successfully!\n\nYou can now use other commands like /swap and /balance on this network."
            }
        else:
            available_chains = await self.wallet_service.get_supported_chains()
            network_list = ", ".join([chain["id"] for chain in available_chains])
            
            return {
                "content": f"❌ {result['message']}\n\nAvailable networks: {network_list}\n\nUse /networks to see details."
            }

    async def _handle_keys_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /keys command to explain key custody.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content
        """
        # Create buttons for wallet management if they have a wallet
        buttons = []
        if wallet_address:
            buttons.append([
                {"text": "📱 Open Web App", "url": "https://snel-pointless.vercel.app"}
            ])
        
        # Check if we're using SmartWalletService or WalletService
        is_smart_wallet = isinstance(self.wallet_service, SmartWalletService) if SMART_WALLET_AVAILABLE else False
        
        if is_smart_wallet:
            # Coinbase CDP wallet information
            return {
                "content": "🔐 **Key Custody & Security**\n\n" +
                    "Your wallet security is our priority. Here's how it works:\n\n" +
                    "• Your wallet is powered by Coinbase Developer Platform (CDP)\n" +
                    "• CDP creates an ERC-4337 compatible smart wallet for you\n" +
                    "• Your private keys are securely managed by CDP\n" +
                    "• The wallet uses Account Abstraction technology for improved security and usability\n" +
                    "• YOU maintain full control of your wallet through your Telegram account\n" +
                    "• Our bot NEVER has access to your private keys\n\n" +
                    "For full wallet management including advanced features, please use our web interface at:\n" +
                    "https://snel-pointless.vercel.app\n\n" +
                    "There you can access the full Coinbase CDP dashboard to manage all aspects of your wallet security.",
                "metadata": {
                    "telegram_buttons": buttons
                } if buttons else None
            }
        else:
            # Legacy/simulated wallet information
            return {
                "content": "🔐 **Key Custody & Security**\n\n" +
                    "Your wallet security is our priority. Here's how it works:\n\n" +
                    "• You're currently using a simulated wallet for testing\n" +
                    "• For a real wallet with improved security, you'll need to upgrade\n" +
                    "• Real wallets use Coinbase CDP technology with ERC-4337 Account Abstraction\n" +
                    "• Simulated wallets are perfect for learning but aren't suitable for real assets\n\n" +
                    "For full wallet management including advanced features, please use our web interface at:\n" +
                    "https://snel-pointless.vercel.app",
                "metadata": {
                    "telegram_buttons": buttons
                } if buttons else None
            }

    async def _handle_faucet_command(self, user_id: str, args: str, wallet_address: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle the /faucet command to get testnet ETH.
        
        Args:
            user_id: Telegram user ID
            args: Command arguments
            wallet_address: User's wallet address
            
        Returns:
            Dict with response content
        """
        if not wallet_address:
            buttons = [
                [
                    {"text": "🔗 Connect Wallet", "callback_data": "connect_wallet"}
                ]
            ]
            
            return {
                "content": "You don't have a wallet connected yet. Please connect a wallet first.",
                "metadata": {
                    "telegram_buttons": buttons
                }
            }
        
        # Check if we're using SmartWalletService
        is_smart_wallet = isinstance(self.wallet_service, SmartWalletService) if SMART_WALLET_AVAILABLE else False
        
        if is_smart_wallet:
            try:
                faucet_info = await self.wallet_service.fund_wallet_from_faucet(
                    user_id=str(user_id),
                    platform="telegram"
                )
                
                faucet_url = faucet_info.get("faucet_url", "https://faucet.base.org")
                
                return {
                    "content": f"🚰 To get testnet ETH for your wallet:\n\n" +
                               f"1. Visit {faucet_url}\n" +
                               f"2. Enter your wallet address: `{wallet_address}`\n" +
                               f"3. Complete any verification steps\n\n" +
                               f"The testnet ETH should arrive in your wallet shortly after.\n\n" +
                               f"Once you have ETH, you can use /balance to check your balance."
                }
            except Exception as e:
                logger.exception(f"Error getting faucet info: {e}")
        
        # Default response for both wallet types
        network = "Base Sepolia" if is_smart_wallet else "Scroll Sepolia"
        faucet_url = "https://faucet.base.org" if is_smart_wallet else "https://faucet.scroll.io/sepolia"
        
        return {
            "content": f"🚰 To get testnet ETH for your wallet:\n\n" +
                       f"1. Visit {faucet_url}\n" +
                       f"2. Enter your wallet address: `{wallet_address}`\n" +
                       f"3. Complete any verification steps\n\n" +
                       f"The testnet ETH should arrive in your wallet shortly after.\n\n" +
                       f"This testnet ETH is for testing only and has no real value."
        }

    async def process_callback_query(
        self,
        user_id: str,
        callback_data: str,
        wallet_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a callback query from Telegram.
        
        Args:
            user_id: Telegram user ID
            callback_data: The callback data from the button
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content and any additional information
        """
        logger.info(f"Processing callback query from user {user_id}: {callback_data}")
        
        return await self._process_callback_query(
            user_id=user_id,
            callback_data=callback_data,
            wallet_address=wallet_address
        )

    async def process_command(
        self,
        command: str,
        args: str,
        user_id: str,
        wallet_address: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Process a command from Telegram.
        
        Args:
            command: The command (e.g., /start, /help)
            args: Command arguments
            user_id: Telegram user ID
            wallet_address: User's wallet address if already connected
            
        Returns:
            Dict with response content and any additional information
        """
        logger.info(f"Processing command: {command} with args: {args} for user {user_id}")
        
        # Handle all commands that start with a /
        if command.startswith('/'):
            # Remove the / prefix
            command_name = command[1:]
            
            # Check if we have a handler for this command
            if command_name in self.command_handlers:
                handler = self.command_handlers[command_name]
                logger.info(f"Executing handler for command: {command_name}")
                
                # Execute the handler
                response = await handler(user_id, args, wallet_address)
                
                # Add personality to the response
                if "content" in response:
                    response["content"] = self._add_telegram_personality(response["content"])
                    
                return response
            else:
                # Unknown command
                return {
                    "content": f"I don't recognize the command '{command}'. Type /help to see available commands."
                }
        
        # Not a command
        return {
            "content": "This doesn't look like a command. Try /help to see what I can do!"
        } 