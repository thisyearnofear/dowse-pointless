import * as React from "react";
import {
  Box,
  HStack,
  VStack,
  Avatar,
  Text,
  Badge,
  Icon,
  List,
  ListItem,
  ListIcon,
  Spinner,
  Link,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Divider,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  QuestionIcon,
  WarningIcon,
  TimeIcon,
  ChatIcon,
  InfoIcon,
} from "@chakra-ui/icons";
import { SwapConfirmation } from "./SwapConfirmation";

interface CommandResponseProps {
  content: string | any; // Updated to accept structured content
  timestamp: string;
  isCommand: boolean;
  status?: "pending" | "processing" | "success" | "error";
  awaitingConfirmation?: boolean;
  agentType?: "default" | "swap";
  metadata?: any;
}

type TokenInfo = {
  address?: string;
  symbol?: string;
  name?: string;
  verified?: boolean;
  source?: string;
  warning?: string;
};

const LoadingSteps = [
  "Processing your command...",
  "Classifying command type...",
  "Getting token information...",
  "Converting amounts...",
  "Getting best swap route...",
  "Preparing transaction...",
];

const formatSwapResponse = (
  content: string
): { preview: string; success: boolean } => {
  try {
    if (content.includes("SwapArgs")) {
      const match = content.match(/amount_in=(\d+),\s*amount_out=(\d+)/);
      if (match) {
        const amountIn = parseFloat(match[1]) / 1e18;
        const amountOut = parseFloat(match[2]) / 1e18;
        return {
          preview: `I'll swap ${amountIn.toFixed(
            4
          )} ETH for approximately ${amountOut.toFixed(
            4
          )} UNI tokens.\n\nDoes this look good? Reply with 'yes' to confirm or 'no' to cancel.`,
          success: true,
        };
      }
    }
    return { preview: content, success: false };
  } catch (error) {
    return { preview: content, success: false };
  }
};

export const CommandResponse: React.FC<CommandResponseProps> = ({
  content,
  timestamp,
  isCommand,
  status = "success",
  awaitingConfirmation = false,
  agentType = "default",
  metadata,
}) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const isError = status === "error";
  const isLoading = status === "processing";
  const isSuccess = status === "success";
  const needsConfirmation = awaitingConfirmation;

  const bgColor = useColorModeValue(
    isCommand ? "blue.50" : "gray.50",
    isCommand ? "blue.900" : "gray.700"
  );
  const borderColor = useColorModeValue(
    isCommand ? "blue.200" : "gray.200",
    isCommand ? "blue.700" : "gray.600"
  );
  const textColor = useColorModeValue("gray.800", "white");

  // Extract token information from metadata
  const tokenInInfo: TokenInfo = metadata
    ? {
        address: metadata.token_in_address,
        symbol: metadata.token_in_symbol,
        name: metadata.token_in_name,
        verified: metadata.token_in_verified,
        source: metadata.token_in_source,
      }
    : {};

  const tokenOutInfo: TokenInfo = metadata
    ? {
        address: metadata.token_out_address,
        symbol: metadata.token_out_symbol,
        name: metadata.token_out_name,
        verified: metadata.token_out_verified,
        source: metadata.token_out_source,
      }
    : {};

  // Simulate progress through steps when loading
  React.useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setCurrentStep((prev) =>
          prev < LoadingSteps.length - 1 ? prev + 1 : prev
        );
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCurrentStep(0);
    }
  }, [isLoading]);

  // Check if content is a structured swap confirmation
  const isStructuredSwapConfirmation =
    typeof content === "object" &&
    content !== null &&
    content.type === "swap_confirmation";

  // Handle confirmation actions
  const handleConfirm = () => {
    // Simulate typing "yes" in the command input
    const inputElement = document.querySelector(
      'input[placeholder="Type a command..."]'
    ) as HTMLInputElement;
    if (inputElement) {
      inputElement.value = "yes";
      inputElement.focus();
      // Trigger the Enter key press
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      });
      inputElement.dispatchEvent(enterEvent);
    }
  };

  const handleCancel = () => {
    // Simulate typing "no" in the command input
    const inputElement = document.querySelector(
      'input[placeholder="Type a command..."]'
    ) as HTMLInputElement;
    if (inputElement) {
      inputElement.value = "no";
      inputElement.focus();
      // Trigger the Enter key press
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
      });
      inputElement.dispatchEvent(enterEvent);
    }
  };

  const formatContent = (text: string) => {
    return text.split("\n").map((line, i) => (
      <React.Fragment key={i}>
        {line}
        {i < text.split("\n").length - 1 && <br />}
      </React.Fragment>
    ));
  };

  // Format links in content
  const formatLinks = (text: string) => {
    // Regex to match URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <Link key={i} href={part} isExternal color="blue.500">
            {part}
          </Link>
        );
      }
      return formatContent(part);
    });
  };

  // Render status icon
  const renderStatusIcon = () => {
    if (status === "pending") {
      return <InfoIcon color="blue.500" />;
    } else if (status === "processing") {
      return <Spinner size="sm" color="blue.500" />;
    } else if (status === "success") {
      return <CheckCircleIcon color="green.500" />;
    } else if (status === "error") {
      return <WarningIcon color="red.500" />;
    }
    return null;
  };

  // Get agent name and avatar based on agent type
  const getAgentInfo = () => {
    if (agentType === "swap") {
      return {
        name: "Wheeler-Dealer",
        handle: "@wheeler_dealer",
        avatarSrc: "/avatars/🕴️.png",
      };
    }
    return {
      name: "SNEL",
      handle: "@snel_agent",
      avatarSrc: "/avatars/🐌.png",
    };
  };

  const { name, handle, avatarSrc } = getAgentInfo();

  // Render token information if available
  const renderTokenInfo = () => {
    if (!metadata || isCommand || !isSuccess) return null;

    // Only show token info for swap transactions
    if (!content.includes("swap") && !content.includes("Swap")) return null;

    return (
      <Box mt={3} fontSize="sm">
        <Divider mb={2} />
        <Text fontWeight="bold" mb={1}>
          Token Information:
        </Text>

        {tokenInInfo.symbol && (
          <Box mb={2}>
            <Text fontWeight="semibold">From: {tokenInInfo.symbol}</Text>
            {tokenInInfo.name && (
              <Text color="gray.600">{tokenInInfo.name}</Text>
            )}
            {tokenInInfo.address && (
              <Text fontSize="xs" color="gray.500" wordBreak="break-all">
                Address: {tokenInInfo.address}
              </Text>
            )}
            {tokenInInfo.verified && (
              <Badge colorScheme="green" fontSize="xs">
                Verified
              </Badge>
            )}
            {tokenInInfo.source && (
              <Text fontSize="xs" color="gray.500">
                Source: {tokenInInfo.source}
              </Text>
            )}
          </Box>
        )}

        {tokenOutInfo.symbol && (
          <Box>
            <Text fontWeight="semibold">To: {tokenOutInfo.symbol}</Text>
            {tokenOutInfo.name && (
              <Text color="gray.600">{tokenOutInfo.name}</Text>
            )}
            {tokenOutInfo.address && (
              <Text fontSize="xs" color="gray.500" wordBreak="break-all">
                Address: {tokenOutInfo.address}
              </Text>
            )}
            {tokenOutInfo.verified ? (
              <Badge colorScheme="green" fontSize="xs">
                Verified
              </Badge>
            ) : (
              <Badge colorScheme="yellow" fontSize="xs">
                Unverified
              </Badge>
            )}
            {tokenOutInfo.source && (
              <Text fontSize="xs" color="gray.500">
                Source: {tokenOutInfo.source}
              </Text>
            )}
          </Box>
        )}

        {(!tokenInInfo.verified || !tokenOutInfo.verified) && (
          <Alert status="warning" mt={2} size="sm" borderRadius="md">
            <AlertIcon />
            <Box>
              <AlertTitle fontSize="xs">Caution</AlertTitle>
              <AlertDescription fontSize="xs">
                One or more tokens in this transaction are unverified. Always
                double-check contract addresses before proceeding.
              </AlertDescription>
            </Box>
          </Alert>
        )}
      </Box>
    );
  };

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      borderColor={borderColor}
      bg={bgColor}
      p={3}
      position="relative"
      width="100%"
    >
      <HStack spacing={3} align="flex-start">
        {!isCommand && (
          <Avatar
            src={avatarSrc}
            name={name}
            size="sm"
            bg="transparent"
            fontSize="xl"
          />
        )}
        <Box pt={1}>{renderStatusIcon()}</Box>
        <VStack spacing={1} align="stretch" flex={1}>
          <HStack
            justify="space-between"
            align="center"
            spacing={2}
            width="100%"
          >
            <Badge
              colorScheme={
                isCommand ? "blue" : agentType === "swap" ? "purple" : "gray"
              }
              fontSize="xs"
            >
              {isCommand
                ? "@user"
                : agentType === "swap"
                ? "@wheeler_dealer"
                : "@snel"}
            </Badge>
            <Text
              fontSize="xs"
              color="gray.500"
              flexShrink={0}
              ml={1}
              noOfLines={1}
            >
              {timestamp}
            </Text>
          </HStack>

          {isStructuredSwapConfirmation ? (
            <SwapConfirmation
              message={content}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          ) : (
            <Text
              fontSize="sm"
              color={textColor}
              wordBreak="break-word"
              overflowWrap="break-word"
              whiteSpace="pre-wrap"
            >
              {typeof content === "string"
                ? formatLinks(content)
                : JSON.stringify(content)}
            </Text>
          )}

          {awaitingConfirmation && (
            <Badge colorScheme="yellow" alignSelf="flex-start" mt={2}>
              Needs Confirmation
            </Badge>
          )}

          {status === "processing" && (
            <Badge colorScheme="blue" alignSelf="flex-start" mt={2}>
              Processing
            </Badge>
          )}

          {status === "error" && (
            <Badge colorScheme="red" alignSelf="flex-start" mt={2}>
              Error
            </Badge>
          )}

          {status === "success" &&
            !isCommand &&
            !isStructuredSwapConfirmation && (
              <Badge colorScheme="green" alignSelf="flex-start" mt={2}>
                Success
              </Badge>
            )}
        </VStack>
      </HStack>
    </Box>
  );
};
