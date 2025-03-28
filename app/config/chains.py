from eth_typing import HexAddress
from typing import Dict, Optional

# Token decimals mapping
TOKEN_DECIMALS = {
    "ETH": 18,
    "WETH": 18,
    "USDC": 6,
    "USDT": 6,
    "DAI": 18,
    "UNI": 18,
    "LINK": 18,
    "AAVE": 18,
    "SNX": 18,
    "COMP": 18,
    "SCR": 18,
    "OP": 18,
    "ARB": 18,
    "MATIC": 18,
    "BTC": 8,
    "WBTC": 8,
    "NURI": 18,
    "POINTLESS": 18,
    "$POINTLESS": 18
}

# Token aliases mapping
TOKEN_ALIASES = {
    # Common aliases
    "ETH": ["WETH", "ETHEREUM"],
    "USDC": ["USD", "USDC.E"],
    "USDT": ["TETHER"],
    "BTC": ["WBTC", "BITCOIN"],
    
    # Chain-specific tokens
    "SCR": ["$SCR", "SCROLL"],  # Scroll token
    "OP": ["$OP", "OPTIMISM"],  # Optimism token
    "ARB": ["$ARB", "ARBITRUM"],  # Arbitrum token
    "BASE": ["$BASE"],  # Base token
    "MATIC": ["$MATIC", "POLYGON"],  # Polygon token
    "NURI": ["$NURI"],  # NURI token
    "POINTLESS": ["$POINTLESS"]  # Pointless token
}

class ChainConfig:
    """Configuration for supported chains."""
    SUPPORTED_CHAINS = {
        1: "Ethereum",
        8453: "Base",
        42161: "Arbitrum",
        10: "Optimism",
        137: "Polygon",
        43114: "Avalanche",
        534352: "Scroll",
        324: "zkSync Era"
    }

    @staticmethod
    def is_supported(chain_id: int) -> bool:
        """Check if a chain ID is supported by the application."""
        return chain_id in ChainConfig.SUPPORTED_CHAINS

    @staticmethod
    def get_chain_name(chain_id: int) -> str:
        """Get the human-readable name for a chain ID."""
        return ChainConfig.SUPPORTED_CHAINS.get(chain_id, "Unknown")

# Token address mapping for each chain
# This is the source of truth for token addresses across all supported chains
TOKEN_ADDRESSES: Dict[int, Dict[str, HexAddress]] = {
    1: {  # Ethereum
        "ETH": HexAddress("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"),
        "USDC": HexAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
        "UNI": HexAddress("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"),
    },
    8453: {  # Base
        "ETH": HexAddress("0x4200000000000000000000000000000000000006"),
        "USDC": HexAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
        "UNI": HexAddress("0x0000000000000000000000000000000000000000"),
        "DICKBUTT": HexAddress("0x92d90f7f8413749bd4bea26dde4e29efc9e9a0b6"),
        "$DICKBUTT": HexAddress("0x92d90f7f8413749bd4bea26dde4e29efc9e9a0b6"),
        "POINTLESS": HexAddress("0xaF13924f23Be104b96c6aC424925357463b0d105"),
        "$POINTLESS": HexAddress("0xaF13924f23Be104b96c6aC424925357463b0d105"),
        "HIGHER": HexAddress("0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe"),
    },
    10: {  # Optimism
        "ETH": HexAddress("0x4200000000000000000000000000000000000006"),
        "USDC": HexAddress("0x7F5c764cBc14f9669B88837ca1490cCa17c31607"),
    },
    42161: {  # Arbitrum
        "ETH": HexAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"),
        "USDC": HexAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
    },
    137: {  # Polygon
        "ETH": HexAddress("0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"),
        "USDC": HexAddress("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"),
        "POINTLESS": HexAddress("0x9B8cc6320F22325759B7D2CA5CD27347bB4eCD86"),
        "$POINTLESS": HexAddress("0x9B8cc6320F22325759B7D2CA5CD27347bB4eCD86"),
    },
    43114: {  # Avalanche
        "ETH": HexAddress("0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB"),
        "USDC": HexAddress("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"),
        "JOE": HexAddress("0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd"),
    },
    534352: {  # Scroll
        "ETH": HexAddress("0x5300000000000000000000000000000000000004"),
        "USDC": HexAddress("0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4"),
        "SCR": HexAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"),  # Scroll token
        "NURI": HexAddress("0x0261c29c68a85c1d9f9d2dc0c02b1f9e8e0dC7cc"),  # NURI token
    },
    324: {  # zkSync Era
        "ETH": HexAddress("0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91"),  # WETH on zkSync
        "USDC": HexAddress("0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4"),
        "POINTLESS": HexAddress("0xFD21D5E148dF3B93AE6deC416544Fb3d3E21260C"),
        "$POINTLESS": HexAddress("0xFD21D5E148dF3B93AE6deC416544Fb3d3E21260C"),
        "ZK": HexAddress("0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E"),
    }
}

# Set of all native token addresses across all chains
# Used to quickly check if an address represents a native token
NATIVE_TOKENS = {
    "0x4200000000000000000000000000000000000006",  # WETH on OP/Base
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",  # ETH
    "0x5300000000000000000000000000000000000004",  # ETH on Scroll
}

# Helper functions for token address management

def get_token_address(token_symbol: str, chain_id: int) -> Optional[HexAddress]:
    """
    Get the address for a token on a specific chain.
    
    Args:
        token_symbol: The token symbol (e.g., 'ETH', 'USDC')
        chain_id: The chain ID to get the address for
        
    Returns:
        The token address for the specified chain, or None if not found
    """
    if not ChainConfig.is_supported(chain_id):
        return None
        
    chain_tokens = TOKEN_ADDRESSES.get(chain_id, {})
    return chain_tokens.get(token_symbol.upper())

def get_native_token_address(chain_id: int) -> Optional[HexAddress]:
    """
    Get the native token address for a specific chain.
    
    Args:
        chain_id: The chain ID to get the native token address for
        
    Returns:
        The native token address for the specified chain, or None if not found
    """
    return get_token_address("ETH", chain_id)

def is_native_token(address: str) -> bool:
    """
    Check if an address represents a native token.
    
    Args:
        address: The token address to check
        
    Returns:
        True if the address represents a native token, False otherwise
    """
    return address in NATIVE_TOKENS

def get_chain_specific_address(token_symbol: str, chain_id: int, default_address: Optional[str] = None) -> str:
    """
    Get the chain-specific address for a token, with fallback to a default address.
    
    This is particularly useful for protocols that expect specific addresses for native tokens.
    
    Args:
        token_symbol: The token symbol (e.g., 'ETH', 'USDC')
        chain_id: The chain ID to get the address for
        default_address: A default address to return if the token is not found
        
    Returns:
        The chain-specific token address, or the default address if not found
    """
    address = get_token_address(token_symbol, chain_id)
    return address or default_address 