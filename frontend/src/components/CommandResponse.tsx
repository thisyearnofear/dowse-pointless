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
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  QuestionIcon,
  WarningIcon,
  TimeIcon,
  ChatIcon,
} from "@chakra-ui/icons";

type CommandResponseProps = {
  content: string;
  timestamp: string;
  isCommand: boolean;
  status?: "pending" | "processing" | "success" | "error";
  awaitingConfirmation?: boolean;
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

export const CommandResponse = ({
  content,
  timestamp,
  isCommand,
  status = "pending",
  awaitingConfirmation,
}: CommandResponseProps) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const isError = status === "error";
  const isLoading = status === "processing";
  const isSuccess = status === "success";
  const needsConfirmation = awaitingConfirmation;

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

  const formatContent = (content: string) => {
    if (isError) {
      // Handle specific error cases
      if (content.includes("User rejected the request")) {
        return "Transaction cancelled by user.";
      }
      if (content.includes("No valid swap route found")) {
        return "No valid swap route found. Try a different amount or token pair.";
      }
      if (content.includes("Not enough liquidity")) {
        return "Not enough liquidity for this swap. Try a smaller amount.";
      }
      if (content.includes("Failed to execute swap")) {
        return "Failed to execute the swap. Please try again.";
      }
      // For other errors, clean up and return a user-friendly message
      if (content.includes("Transaction failed:")) {
        const cleanedError = content
          .replace(/Transaction failed: /g, "")
          .replace(/Request Arguments:[\s\S]*$/, "")
          .trim();
        return cleanedError;
      }
      // Return the original error if none of the above match
      return content;
    }

    if (isLoading) {
      return LoadingSteps[currentStep];
    }

    if (isCommand && !isSuccess) {
      const { preview, success } = formatSwapResponse(content);
      if (success) {
        return preview;
      }
    }

    // Format block explorer links
    if (content.includes("block explorer")) {
      return content.split("\n").map((line, i) => {
        if (line.startsWith("http")) {
          return (
            <Link
              key={i}
              href={line}
              isExternal
              color="blue.500"
              wordBreak="break-all"
              display="inline-block"
            >
              {line}
            </Link>
          );
        }
        return <Text key={i}>{line}</Text>;
      });
    }

    return content;
  };

  const getBadgeProps = () => {
    if (isError) {
      return {
        colorScheme: "red",
        icon: WarningIcon,
        text: "Error",
      };
    }
    if (needsConfirmation) {
      return {
        colorScheme: "orange",
        icon: WarningIcon,
        text: "Needs Confirmation",
      };
    }
    if (isLoading) {
      return {
        colorScheme: "blue",
        icon: TimeIcon,
        text: "Processing",
      };
    }
    if (isSuccess) {
      return {
        colorScheme: "green",
        icon: CheckCircleIcon,
        text: "Success",
      };
    }
    return {
      colorScheme: isCommand ? "purple" : "blue",
      icon: isCommand ? ChatIcon : QuestionIcon,
      text: isCommand ? "User" : "Question",
    };
  };

  const badge = getBadgeProps();
  const formattedContent = formatContent(content);

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p={{ base: 2, sm: 4 }}
      bg="white"
      shadow="sm"
      borderColor={
        isError
          ? "red.200"
          : needsConfirmation
          ? "orange.200"
          : isSuccess
          ? "green.200"
          : undefined
      }
    >
      <HStack align="start" spacing={{ base: 2, sm: 3 }}>
        <Avatar
          size={{ base: "xs", sm: "sm" }}
          name={isCommand && !isSuccess ? "You" : "Pointless"}
          bg={
            isError
              ? "red.500"
              : needsConfirmation
              ? "orange.500"
              : isSuccess
              ? "green.500"
              : isCommand
              ? "purple.500"
              : "twitter.500"
          }
          color="white"
        />
        <VStack align="stretch" flex={1} spacing={{ base: 1, sm: 2 }}>
          <HStack
            flexWrap="wrap"
            spacing={{ base: 1, sm: 2 }}
            fontSize={{ base: "xs", sm: "sm" }}
          >
            <Text fontWeight="bold">
              {isCommand && !isSuccess ? "You" : "Pointless"}
            </Text>
            <Text color="gray.500">
              {isCommand && !isSuccess ? "@user" : "@pointless_agent"}
            </Text>
            <Text color="gray.500">·</Text>
            <Text color="gray.500">{timestamp}</Text>
            <Badge
              colorScheme={badge.colorScheme}
              ml={{ base: 0, sm: "auto" }}
              display="flex"
              alignItems="center"
              gap={1}
              fontSize={{ base: "2xs", sm: "xs" }}
            >
              {isLoading && <Spinner size="xs" mr={1} />}
              <Icon as={badge.icon} />
              {badge.text}
            </Badge>
          </HStack>
          <Box
            whiteSpace="pre-wrap"
            color={isError ? "red.600" : "gray.700"}
            fontSize={{ base: "sm", sm: "md" }}
          >
            {formattedContent}
          </Box>
          {isLoading && (
            <List spacing={1} mt={2} fontSize={{ base: "xs", sm: "sm" }}>
              {LoadingSteps.map((step, index) => (
                <ListItem
                  key={index}
                  color={index <= currentStep ? "blue.500" : "gray.400"}
                  display="flex"
                  alignItems="center"
                >
                  {index < currentStep ? (
                    <ListIcon as={CheckCircleIcon} color="green.500" />
                  ) : index === currentStep ? (
                    <Spinner size="xs" mr={2} />
                  ) : (
                    <ListIcon as={TimeIcon} />
                  )}
                  {step}
                </ListItem>
              ))}
            </List>
          )}
          {needsConfirmation && (
            <Text fontSize={{ base: "xs", sm: "sm" }} color="orange.600" mt={2}>
              ⚠️ This action will execute a blockchain transaction that cannot
              be undone.
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
};
