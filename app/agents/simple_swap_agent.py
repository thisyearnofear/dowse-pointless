import re
import logging
from typing import Dict, Any, Optional, List, Tuple
from pydantic import BaseModel, validator

from app.services.token_service import TokenService

logger = logging.getLogger(__name__)

class SwapResponse(BaseModel):
    """Response model for swap commands."""
    amount: float
    token_in: Optional[str] = None
    token_out: Optional[str] = None
    from_currency: Optional[str] = None
    to_currency: Optional[str] = None
    from_token: Optional[str] = None
    to_token: Optional[str] = None
    input_token: Optional[str] = None
    output_token: Optional[str] = None
    is_target_amount: bool = False
    amount_is_usd: bool = True  # Default to True since most users think in USD
    natural_command: Optional[str] = None

    @validator("amount")
    def validate_amount(cls, v):
        """Validate and normalize the amount."""
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        # Round to 8 decimal places to avoid floating point issues
        return round(float(v), 8)

    @validator("token_in", "token_out", "from_currency", "to_currency", "from_token", "to_token", "input_token", "output_token")
    def validate_token(cls, v):
        """Validate and normalize token symbols."""
        if v is None:
            return v
        if not v:
            raise ValueError("Token cannot be empty")
        # Preserve $ prefix but normalize the rest
        token = v.strip()
        return f"${token[1:].upper()}" if token.startswith('$') else token.upper()

    @classmethod
    def parse_command(cls, command: str) -> Dict[str, Any]:
        """
        Parse a natural language swap command into structured data.
        
        Examples:
        - "swap 1 ETH for USDC"          -> 1 ETH
        - "swap $1 of ETH to USDC"       -> $1 USD worth of ETH
        - "swap $50 worth of ETH for $PEPE" -> $50 USD worth of ETH
        """
        command = command.lower().strip()

        # Extract amount and determine if it's USD
        # Look for patterns like:
        # - "$1"
        # - "$1.5"
        # - "1"
        # - "1.5"
        amount_patterns = [
            r'\$(\d+(?:\.\d+)?)\s+(?:of|worth\s+of)?',  # $1 of, $1.5 worth of
            r'\$(\d+(?:\.\d+)?)',  # Just $1 or $1.5
            r'(\d+(?:\.\d+)?)\s+(?:of|worth\s+of)?',  # 1 of, 1.5 worth of
            r'(\d+(?:\.\d+)?)',  # Just 1 or 1.5
        ]

        amount = None
        amount_is_usd = False

        for pattern in amount_patterns:
            match = re.search(pattern, command)
            if match:
                amount = float(match[1])
                # If the pattern started with $, or had "worth" in it, it's USD
                amount_is_usd = pattern.startswith(r'\$') or 'worth' in command
                break

        if amount is None:
            raise ValueError("No amount found in command")

        # Extract tokens
        # Look for patterns like:
        # - "X to Y"
        # - "X for Y"
        # - "of X to/for Y"
        # - "worth of X to/for Y"
        token_patterns = [
            r'(?:of\s+)?(\$?\w+)(?:\s+(?:to|for)\s+)(\$?\w+)',  # ETH to USDC
            r'(?:worth\s+of\s+)?(\$?\w+)(?:\s+(?:to|for)\s+)(\$?\w+)',  # worth of ETH to USDC
            r'(\$?\w+)(?:\s+(?:to|for)\s+)(\$?\w+)',  # ETH to USDC
        ]

        for pattern in token_patterns:
            match = re.search(pattern, command)
            if match:
                token_in, token_out = match.groups()
                # Clean up tokens
                token_in = token_in.strip()
                token_out = token_out.strip()

                # Preserve $ prefix
                if not token_in.startswith('$'):
                    token_in = token_in.upper()
                if not token_out.startswith('$'):
                    token_out = token_out.upper()

                return {
                    "amount": amount,
                    "from_token": token_in,
                    "to_token": token_out,
                    "amount_is_usd": amount_is_usd,
                    "natural_command": command
                }

        raise ValueError("Could not parse tokens from command")

    def get_token_in(self) -> Optional[str]:
        """Get the input token, checking all possible input token fields."""
        return (
            self.token_in or 
            self.from_currency or 
            self.from_token or 
            self.input_token
        )

    def get_token_out(self) -> Optional[str]:
        """Get the output token, checking all possible output token fields."""
        return (
            self.token_out or 
            self.to_currency or 
            self.to_token or 
            self.output_token
        )

class SimpleSwapAgent:
    """A simplified agent for processing swap commands."""
    
    def __init__(self):
        self.token_service = TokenService()
    
    async def process_swap_command(self, command: str, chain_id: int = 1) -> Dict[str, Any]:
        """Process a swap command and return structured data."""
        try:
            # Try to parse the command directly
            try:
                parsed_data = SwapResponse.parse_command(command)
                logger.info(f"Successfully parsed command: {parsed_data}")
                
                # Extract tokens
                token_in = parsed_data.get("from_token")
                token_out = parsed_data.get("to_token")
                amount = parsed_data.get("amount", 1.0)
                amount_is_usd = parsed_data.get("amount_is_usd", False)
                
                # Look up token info
                logger.info(f"Looking up token_in: {token_in}")
                token_in_info = await self.token_service.lookup_token(token_in, chain_id)
                logger.info(f"token_in_info: {token_in_info}")
                
                logger.info(f"Looking up token_out: {token_out}")
                token_out_info = await self.token_service.lookup_token(token_out, chain_id)
                logger.info(f"token_out_info: {token_out_info}")
                
                # Extract token info
                from_address, from_symbol, from_name, from_metadata = token_in_info
                to_address, to_symbol, to_name, to_metadata = token_out_info
                
                # Create swap confirmation
                confirmation = {
                    "type": "swap_confirmation",
                    "amount": amount,
                    "token_in": {
                        "address": from_address,
                        "symbol": from_symbol,
                        "name": from_name,
                        "metadata": from_metadata
                    },
                    "token_out": {
                        "address": to_address,
                        "symbol": to_symbol,
                        "name": to_name,
                        "metadata": to_metadata
                    },
                    "is_target_amount": False,
                    "amount_is_usd": amount_is_usd
                }
                
                # Return the structured response
                return {
                    "content": confirmation,
                    "error": None,
                    "metadata": {
                        "command": command,
                        "chain_id": chain_id,
                        "token_in_info": from_metadata,
                        "token_out_info": to_metadata,
                        "swap_details": parsed_data
                    }
                }
                
            except Exception as parse_error:
                logger.error(f"Error parsing command: {str(parse_error)}")
                return {
                    "content": None,
                    "error": f"Failed to parse swap command: {str(parse_error)}",
                    "metadata": {"command": command}
                }
                
        except Exception as e:
            logger.error(f"Error processing swap command: {str(e)}")
            return {
                "content": None,
                "error": f"Failed to process swap command: {str(e)}",
                "metadata": {"command": command}
            } 