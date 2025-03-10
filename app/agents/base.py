from typing import Optional, Dict, Any, Type, TypeVar, Union, List
import logging
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
import traceback
import os

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)

class AgentMessage(BaseModel):
    """Base message type for agent responses."""
    content: Optional[Any] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

    model_config = {
        "arbitrary_types_allowed": True
    }

class PointlessAgent(BaseModel):
    """Base class for Pointless agents."""
    prompt: str
    model: str = "gpt-4-turbo-preview"
    temperature: float = 0.7
    client: Optional[AsyncOpenAI] = None
    
    model_config = {
        "arbitrary_types_allowed": True
    }

    def __init__(self, prompt: str, model: str = "gpt-4-turbo-preview", temperature: float = 0.7, provider = None):
        super().__init__(
            prompt=prompt,
            model=model,
            temperature=temperature
        )
        if provider:
            # Check if it's an OpenAIProvider from emp_agents.providers
            if hasattr(provider, 'api_key'):
                # Create our own client using the provider's API key
                self.client = AsyncOpenAI(
                    api_key=provider.api_key,
                )
            elif hasattr(provider, 'client'):
                # Use the provider's client directly
                self.client = provider.client
            else:
                # Fallback to creating our own client
                logger.warning(f"Unknown provider type: {type(provider)}. Creating default client.")
                self.client = AsyncOpenAI(
                    api_key=os.getenv("OPENAI_API_KEY"),
                )
        else:
            self.client = AsyncOpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
            )

    def _format_messages(self, user_input: str) -> List[Dict[str, str]]:
        """Format the system prompt and user input as chat messages."""
        # Ensure the prompt contains the word 'json' if it doesn't already
        prompt = self.prompt
        if "json" not in prompt.lower():
            prompt += "\nPlease provide your response in JSON format."

        return [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_input}
        ]

    def _process_response(self, response: Any) -> Dict[str, Any]:
        """Process and validate the response from the model."""
        try:
            if isinstance(response, BaseModel):
                return response.model_dump()
            elif isinstance(response, dict):
                return response
            elif isinstance(response, str):
                return {"content": response}
            else:
                return {"content": str(response)}
        except Exception as e:
            logger.warning(f"Error processing response: {e}")
            return {"content": str(response)}
    
    async def process(self, input_text: str, metadata: Optional[Dict[str, Any]] = None, response_format: Optional[Type[T]] = None) -> Dict[str, Any]:
        """Process input text and return a response."""
        try:
            # Prepare messages
            messages = self._format_messages(input_text)
            
            # Prepare completion kwargs
            completion_kwargs = {
                "model": self.model,
                "messages": messages,
                "temperature": self.temperature,
            }
            
            # Add response format if provided
            if response_format:
                # Make sure the word 'json' is in the system message
                if "json" not in messages[0]["content"].lower():
                    messages[0]["content"] += "\nPlease provide your response in JSON format."
                    completion_kwargs["messages"] = messages
                
                completion_kwargs["response_format"] = {"type": "json_object"}
            
            # Call OpenAI
            response = await self.client.chat.completions.create(**completion_kwargs)
            
            # Extract content from response
            content = response.choices[0].message.content
            
            # Parse response if needed
            if response_format and isinstance(content, str):
                import json
                try:
                    content = json.loads(content)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse JSON response: {e}")
                    return AgentMessage(
                        content=None,
                        error=f"Invalid JSON response: {str(e)}",
                        metadata=metadata or {}
                    ).model_dump()
            
            return AgentMessage(
                content=content,
                error=None,
                metadata=metadata or {}
            ).model_dump()
            
        except Exception as e:
            error_msg = f"Error in agent processing: {str(e)}"
            logger.error(error_msg)
            
            # Get full traceback for debugging
            tb = traceback.format_exc()
            logger.debug(f"Traceback: {tb}")
            
            return AgentMessage(
                content=None,
                error=error_msg,
                metadata=metadata or {}
            ).model_dump()