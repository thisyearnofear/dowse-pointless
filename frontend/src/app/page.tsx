"use client";

import * as React from "react";
import Image from "next/image";
import NextLink from "next/link";
import {
  Box,
  Container,
  VStack,
  Heading,
  Text,
  useToast,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  HStack,
  Link as ChakraLink,
  Button,
  Icon,
  Badge,
} from "@chakra-ui/react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useChainId,
} from "wagmi";
import { CommandInput } from "../components/CommandInput";
import { CommandResponse } from "../components/CommandResponse";
import { WalletButton } from "../components/WalletButton";
import { ExternalLinkIcon, SettingsIcon } from "@chakra-ui/icons";
import { ApiKeyModal } from "../components/ApiKeyModal";
import { LogoModal } from "../components/LogoModal";

type Response = {
  content: string;
  timestamp: string;
  isCommand: boolean;
  pendingCommand?: string;
  awaitingConfirmation?: boolean;
  status?: "pending" | "processing" | "success" | "error";
  agentType?: "default" | "swap";
  metadata?: {
    token_in_address?: string;
    token_in_symbol?: string;
    token_in_name?: string;
    token_in_verified?: boolean;
    token_in_source?: string;
    token_out_address?: string;
    token_out_symbol?: string;
    token_out_name?: string;
    token_out_verified?: boolean;
    token_out_source?: string;
  };
};

type TransactionData = {
  to: string;
  data: string;
  value: string;
  chainId: number;
  method: string;
  gasLimit: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  needs_approval?: boolean;
  token_to_approve?: string;
  spender?: string;
  pending_command?: string;
  skip_approval?: boolean;
  metadata?: {
    token_in_address?: string;
    token_in_symbol?: string;
    token_in_name?: string;
    token_in_verified?: boolean;
    token_in_source?: string;
    token_out_address?: string;
    token_out_symbol?: string;
    token_out_name?: string;
    token_out_verified?: boolean;
    token_out_source?: string;
  };
  // Add properties that might come from API responses
  gas_limit?: string;
  gas_price?: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
};

// Add supported chains constant
const SUPPORTED_CHAINS = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  10: "Optimism",
  137: "Polygon",
  43114: "Avalanche",
  534352: "Scroll",
} as const;

export default function Home() {
  const [responses, setResponses] = React.useState<Response[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const toast = useToast();
  const responsesEndRef = React.useRef<HTMLDivElement>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = React.useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = React.useState(false);

  // Add chain change effect
  React.useEffect(() => {
    if (chainId) {
      const isSupported = chainId in SUPPORTED_CHAINS;
      // Only clear pending transactions if switching to an unsupported chain
      if (!isSupported) {
        setResponses((prev) => prev.filter((r) => !r.awaitingConfirmation));
        toast({
          title: "Unsupported Network",
          description: `Please switch to a supported network: ${Object.values(
            SUPPORTED_CHAINS
          ).join(", ")}`,
          status: "warning",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  }, [chainId, toast]);

  const scrollToBottom = () => {
    responsesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [responses]);

  const getBlockExplorerLink = (hash: string) => {
    if (!chainId) return `https://basescan.org/tx/${hash}`;

    const explorers = {
      1: `https://etherscan.io/tx/${hash}`,
      8453: `https://basescan.org/tx/${hash}`,
      42161: `https://arbiscan.io/tx/${hash}`,
      10: `https://optimistic.etherscan.io/tx/${hash}`,
      137: `https://polygonscan.com/tx/${hash}`,
      43114: `https://snowtrace.io/tx/${hash}`,
      534352: `https://scrollscan.com/tx/${hash}`,
    };

    return (
      explorers[chainId as keyof typeof explorers] ||
      `https://basescan.org/tx/${hash}`
    );
  };

  const getApiKeys = () => {
    if (typeof window === "undefined") return {};
    return {
      openaiKey: localStorage.getItem("openai_api_key") || "",
      alchemyKey: localStorage.getItem("alchemy_api_key") || "",
      coingeckoKey: localStorage.getItem("coingecko_api_key") || "",
    };
  };

  const getApiHeaders = () => {
    const { openaiKey, alchemyKey, coingeckoKey } = getApiKeys();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (openaiKey) headers["X-OpenAI-Key"] = openaiKey;
    if (alchemyKey) headers["X-Alchemy-Key"] = alchemyKey;
    if (coingeckoKey) headers["X-CoinGecko-Key"] = coingeckoKey;

    return headers;
  };

  const executeTransaction = async (txData: TransactionData) => {
    if (!walletClient) {
      throw new Error("Wallet not connected");
    }

    try {
      // If approval is needed, handle it first
      if (
        txData.needs_approval &&
        txData.token_to_approve &&
        txData.spender &&
        !txData.skip_approval
      ) {
        const tokenSymbol = txData.metadata?.token_in_symbol || "Token";

        setResponses((prev) => [
          ...prev,
          {
            content: `Please approve ${tokenSymbol} spending for the swap...`,
            timestamp: new Date().toLocaleTimeString(),
            isCommand: false,
            status: "processing",
            agentType: "swap",
          },
        ]);

        // Generate proper ERC20 approve function data
        // Function signature: approve(address,uint256)
        const approveSignature = "0x095ea7b3"; // approve(address,uint256) function selector
        // Pad the address to 32 bytes (remove 0x prefix first)
        const paddedSpender = txData.spender.slice(2).padStart(64, "0");
        // Use a very large value to approve (uint256 max value to approve "unlimited")
        const maxUint256 =
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

        const approveData = `${approveSignature}${paddedSpender}${maxUint256}`;

        const approveParams = {
          to: txData.token_to_approve as `0x${string}`,
          data: approveData as `0x${string}`,
          value: BigInt(0),
          chainId: txData.chainId,
          gas: BigInt(100000),
        };

        const approveHash = await walletClient.sendTransaction(approveParams);
        const approveReceipt = await publicClient?.waitForTransactionReceipt({
          hash: approveHash,
        });

        if (!approveReceipt?.status) {
          throw new Error("Approval transaction failed");
        }

        setResponses((prev) => [
          ...prev,
          {
            content: `${tokenSymbol} approved successfully! Proceeding with swap...`,
            timestamp: new Date().toLocaleTimeString(),
            isCommand: false,
            status: "success",
            agentType: "swap",
          },
        ]);

        // Retry the original transaction after approval
        if (txData.pending_command) {
          const response = await fetch(`/api/execute-transaction`, {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({
              command: txData.pending_command,
              wallet_address: address,
              chain_id: chainId,
              creator_id: address ? address.toLowerCase() : "anonymous",
              skip_approval: txData.pending_command.startsWith("approved:"),
            }),
          });

          if (!response.ok) {
            throw new Error(
              `Failed to execute swap after approval: ${await response.text()}`
            );
          }

          const swapData = await response.json();
          // Convert snake_case to camelCase for proper execution
          const mappedData: TransactionData = {
            to: swapData.to,
            data: swapData.data,
            value: swapData.value,
            chainId: chainId,
            method: swapData.method,
            gasLimit: swapData.gas_limit,
            gasPrice: swapData.gas_price,
            maxFeePerGas: swapData.max_fee_per_gas,
            maxPriorityFeePerGas: swapData.max_priority_fee_per_gas,
            needs_approval: false, // Skip approval since we just did it
            token_to_approve: swapData.token_to_approve,
            spender: swapData.spender,
            pending_command: swapData.pending_command,
            skip_approval: true,
            metadata: swapData.metadata,
          };
          return executeTransaction(mappedData);
        }
      }

      // Execute the main transaction
      const transaction = {
        to: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || "0"),
        chainId: txData.chainId,
        gas: BigInt(txData.gasLimit || txData.gas_limit || "300000"),
      };

      const hash = await walletClient.sendTransaction(transaction);

      setResponses((prev) => [
        ...prev.filter((r) => !r.status?.includes("processing")),
        {
          content: `Transaction submitted!\nView on block explorer:\n${getBlockExplorerLink(
            hash
          )}`,
          timestamp: new Date().toLocaleTimeString(),
          isCommand: false,
          status: "processing",
          agentType: "swap",
          metadata: txData.metadata,
        },
      ]);

      const receipt = await publicClient?.waitForTransactionReceipt({
        hash,
      });

      if (!receipt) {
        throw new Error("Failed to get transaction receipt");
      }

      const isSuccess = Boolean(receipt.status);

      setResponses((prev) => [
        ...prev.filter((r) => !r.status?.includes("processing")),
        {
          content: isSuccess
            ? `Transaction completed successfully! 🎉\nView on block explorer:\n${getBlockExplorerLink(
                hash
              )}`
            : "Transaction failed. Please try again.",
          timestamp: new Date().toLocaleTimeString(),
          isCommand: false,
          status: isSuccess ? "success" : "error",
          agentType: "swap",
          metadata: txData.metadata,
        },
      ]);

      return hash;
    } catch (error) {
      console.error("Transaction error:", error);
      let errorMessage = "Transaction failed";

      if (error instanceof Error) {
        if (
          error.message.includes("user rejected") ||
          error.message.includes("User rejected")
        ) {
          errorMessage = "Transaction was cancelled by user";
        } else if (error.message.includes("insufficient funds")) {
          errorMessage = "Insufficient funds for transaction";
        } else if (error.message.includes("TRANSFER_FROM_FAILED")) {
          errorMessage =
            "Failed to transfer USDC. Please make sure you have enough USDC and have approved the swap.";
        } else {
          // For other errors, extract a more readable message
          const message = error.message;

          // If the error contains transaction data (which is very long), simplify it
          if (
            message.includes("Request Arguments:") &&
            message.includes("data:")
          ) {
            // Extract just the basic information
            const fromMatch = message.match(/from:\s+([0-9a-fA-Fx]+)/);
            const toMatch = message.match(/to:\s+([0-9a-fA-Fx]+)/);
            const valueMatch = message.match(/value:\s+([\d.]+\s+ETH)/);

            const from = fromMatch ? fromMatch[1] : "unknown";
            const to = toMatch ? toMatch[1] : "unknown";
            const value = valueMatch ? valueMatch[1] : "unknown amount";

            errorMessage = `Transaction failed: ${message
              .split("Request Arguments:")[0]
              .trim()}`;
            errorMessage += `\nTransaction details: ${value} from ${from.substring(
              0,
              8
            )}... to ${to.substring(0, 8)}...`;
          } else {
            // For other errors, use the first line or first 100 characters
            errorMessage = message.split("\n")[0];
            if (errorMessage.length > 100) {
              errorMessage = errorMessage.substring(0, 100) + "...";
            }
          }
        }
      }

      setResponses((prev) => [
        ...prev.filter((r) => !r.status?.includes("processing")),
        {
          content: `Transaction failed: ${errorMessage}`,
          timestamp: new Date().toLocaleTimeString(),
          isCommand: false,
          status: "error",
          agentType: "swap",
        },
      ]);

      throw error;
    }
  };

  const processCommand = async (command: string) => {
    // Determine if this is a swap-related query
    const isSwapRelated =
      /\b(swap|token|price|approve|allowance|liquidity)\b/i.test(command);
    const agentType = isSwapRelated ? "swap" : "default";

    // Add the user's command to the responses
    setResponses((prev) => [
      ...prev,
      {
        content: command,
        timestamp: new Date().toLocaleTimeString(),
        isCommand: true,
        status: "success",
        agentType: "default", // User messages are always default
      },
    ]);

    if (
      !isConnected &&
      !command.toLowerCase().startsWith("what") &&
      !command.toLowerCase().startsWith("how")
    ) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to execute transactions",
        status: "warning",
        duration: 5000,
      });
      return;
    }

    if (!chainId) {
      toast({
        title: "Chain not detected",
        description:
          "Please make sure your wallet is connected to a supported network",
        status: "warning",
        duration: 5000,
      });
      return;
    }

    if (isSwapRelated && !(chainId in SUPPORTED_CHAINS)) {
      toast({
        title: "Unsupported Network",
        description: `Please switch to a supported network: ${Object.values(
          SUPPORTED_CHAINS
        ).join(", ")}`,
        status: "warning",
        duration: 5000,
      });
      return;
    }

    setIsLoading(true);
    try {
      // Always send the command to the backend, even if it's a confirmation
      const response = await fetch(`/api/process-command`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({
          content: command,
          creator_name: "@user",
          creator_id: address ? address.toLowerCase() : "anonymous",
          chain_id: chainId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to process command");
      }

      // If this is a confirmation and we have a pending command from the backend
      if (data.pending_command && /^(yes|confirm)$/i.test(command.trim())) {
        try {
          // Clear any existing pending commands in the UI
          setResponses((prev) =>
            prev.map((r) =>
              r.awaitingConfirmation ? { ...r, awaitingConfirmation: false } : r
            )
          );

          // Execute the transaction
          const txResponse = await fetch(`/api/execute-transaction`, {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({
              command: data.pending_command,
              wallet_address: address,
              chain_id: chainId,
              creator_id: address ? address.toLowerCase() : "anonymous",
              skip_approval: data.pending_command.startsWith("approved:"),
            }),
          });

          const txData = await txResponse.json();
          if (!txResponse.ok) {
            throw new Error(txData.detail || "Failed to prepare transaction");
          }

          await executeTransaction({
            to: txData.to,
            data: txData.data,
            value: txData.value,
            chainId: chainId,
            method: txData.method,
            gasLimit: txData.gas_limit,
            gasPrice: txData.gas_price,
            maxFeePerGas: txData.max_fee_per_gas,
            maxPriorityFeePerGas: txData.max_priority_fee_per_gas,
            needs_approval: txData.needs_approval,
            token_to_approve: txData.token_to_approve,
            spender: txData.spender,
            pending_command: txData.pending_command,
            skip_approval:
              txData.skip_approval ||
              data.pending_command.startsWith("approved:"),
            metadata: txData.metadata,
          });
        } catch (error) {
          console.error("Transaction error:", error);
          setResponses((prev) => [
            ...prev,
            {
              content: `Transaction failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
              timestamp: new Date().toLocaleTimeString(),
              isCommand: false,
              status: "error",
              agentType: "swap",
            },
          ]);
        }
        return;
      }
      // If this is a cancellation
      else if (/^(no|cancel)$/i.test(command.trim())) {
        // Clear any existing pending commands in the UI
        setResponses((prev) => [
          ...prev.map((r) =>
            r.awaitingConfirmation ? { ...r, awaitingConfirmation: false } : r
          ),
          {
            content: data.content || "Transaction cancelled.",
            timestamp: new Date().toLocaleTimeString(),
            isCommand: false,
            status: "success",
            agentType: "swap",
          },
        ]);
        return;
      }

      const isQuestion =
        command.toLowerCase().startsWith("what") ||
        command.toLowerCase().startsWith("how");

      // Add the bot's response
      setResponses((prev) => [
        ...prev,
        {
          content: data.content,
          timestamp: new Date().toLocaleTimeString(),
          isCommand: false, // Bot responses are never commands
          pendingCommand: data.pending_command,
          awaitingConfirmation: Boolean(data.pending_command),
          status: data.pending_command ? "pending" : "success",
          agentType: data.agent_type || "default", // Use the agent_type from the response
          metadata: data.metadata,
        },
      ]);
    } catch (error) {
      console.error("Error:", error);
      setResponses((prev) => [
        ...prev,
        {
          content:
            error instanceof Error
              ? `Sorry, I encountered an error: ${error.message}`
              : "An unknown error occurred. Please try again.",
          timestamp: new Date().toLocaleTimeString(),
          isCommand: false,
          status: "error",
          agentType: "default", // Use default agent (SNEL) for general errors
        },
      ]);

      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to process command. Please try again.",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (command: string) => {
    await processCommand(command);
  };

  return (
    <Box
      minH="100vh"
      bg="gray.50"
      py={{ base: 4, sm: 10 }}
      pb={{ base: 16, sm: 20 }}
    >
      <Container maxW="container.md" px={{ base: 2, sm: 4 }}>
        <VStack spacing={{ base: 4, sm: 8 }}>
          <Box textAlign="center" w="100%">
            <HStack
              justify="space-between"
              w="100%"
              mb={4}
              flexDir={{ base: "column", sm: "row" }}
              spacing={{ base: 2, sm: 4 }}
            >
              <HStack spacing={2} align="center">
                <Box
                  as="button"
                  onClick={() => setIsLogoModalOpen(true)}
                  cursor="pointer"
                  transition="transform 0.2s"
                  _hover={{ transform: "scale(1.1)" }}
                >
                  <Image
                    src="/icon.png"
                    alt="SNEL Logo"
                    width={32}
                    height={32}
                    priority
                    style={{
                      marginRight: "4px",
                      objectFit: "contain",
                    }}
                  />
                </Box>
                <Heading size={{ base: "lg", sm: "xl" }}>SNEL</Heading>
              </HStack>
              <HStack spacing={{ base: 2, sm: 4 }}>
                <Button
                  size="sm"
                  variant="outline"
                  colorScheme="gray"
                  onClick={() => setIsApiKeyModalOpen(true)}
                  leftIcon={<Icon as={SettingsIcon} />}
                >
                  API Keys
                </Button>
                <WalletButton />
              </HStack>
            </HStack>
            <Text color="gray.600" fontSize={{ base: "md", sm: "lg" }}>
              Super poiNtlEss Lazy agents
            </Text>
            <Text color="gray.500" fontSize={{ base: "xs", sm: "sm" }} mt={2}>
              swap tokens, check balance etc. <br />
              double check all i do please.
            </Text>
          </Box>

          {!isConnected && (
            <Alert
              status="warning"
              borderRadius="md"
              fontSize={{ base: "sm", sm: "md" }}
            >
              <AlertIcon />
              <Box>
                <AlertTitle>Wallet not connected!</AlertTitle>
                <AlertDescription>
                  Please connect your wallet to execute transactions. You can
                  still ask questions without connecting.
                </AlertDescription>
              </Box>
            </Alert>
          )}

          {responses.length === 0 ? (
            <Alert
              status="info"
              borderRadius="md"
              fontSize={{ base: "sm", sm: "md" }}
            >
              <AlertIcon />
              <Box>
                <AlertTitle>Welcome! Why are you here?</AlertTitle>
                <AlertDescription>
                  Click the help icon if you need help.
                </AlertDescription>
              </Box>
            </Alert>
          ) : (
            <VStack
              spacing={{ base: 2, sm: 4 }}
              w="100%"
              align="stretch"
              mb={{ base: 4, sm: 8 }}
            >
              {responses.map((response, index) => (
                <CommandResponse
                  key={`response-${index}`}
                  content={response.content}
                  timestamp={response.timestamp}
                  isCommand={response.isCommand}
                  status={response.status}
                  awaitingConfirmation={response.awaitingConfirmation}
                  agentType={response.agentType}
                  metadata={response.metadata}
                />
              ))}
              <div ref={responsesEndRef} />
            </VStack>
          )}

          <CommandInput onSubmit={handleSubmit} isLoading={isLoading} />

          <LogoModal
            isOpen={isLogoModalOpen}
            onClose={() => setIsLogoModalOpen(false)}
          />
          <ApiKeyModal
            isOpen={isApiKeyModalOpen}
            onClose={() => setIsApiKeyModalOpen(false)}
          />
        </VStack>
      </Container>
    </Box>
  );
}
