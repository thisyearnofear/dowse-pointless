"use client";

import * as React from "react";
import Image from "next/image";
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
  Link,
  Button,
  Icon,
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
import { ExternalLinkIcon, SettingsIcon, QuestionIcon } from "@chakra-ui/icons";
import { ApiKeyModal } from "../components/ApiKeyModal";
import { LogoModal } from "../components/LogoModal";
import { HelpModal } from "../components/HelpModal";
import { fetchUserProfile, getDisplayName } from "../services/profileService";
import { useState, useEffect } from "react";
import { Response } from "../types/responses";
import { SUPPORTED_CHAINS } from "../constants/chains";
import { ApiService } from "../services/apiService";
import { TransactionService } from "../services/transactionService";
import { DCAService } from "../services/dcaService";

export default function Home() {
  const [responses, setResponses] = useState<Response[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const toast = useToast();
  const responsesEndRef = React.useRef<HTMLDivElement>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userId, setUserId] = useState<string>("");

  // Initialize services
  const apiService = React.useMemo(() => new ApiService(), []);
  const transactionService = React.useMemo(
    () =>
      walletClient && publicClient && chainId
        ? new TransactionService(walletClient, publicClient, chainId)
        : null,
    [walletClient, publicClient, chainId]
  );
  const dcaService = React.useMemo(
    () => (chainId ? new DCAService(chainId) : null),
    [chainId]
  );

  // Fetch user profile when address changes
  useEffect(() => {
    const fetchProfile = async () => {
      if (address) {
        const profile = await fetchUserProfile(address);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
    };

    fetchProfile();
  }, [address]);

  // Add chain change effect
  useEffect(() => {
    if (chainId) {
      const isSupported = chainId in SUPPORTED_CHAINS;
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

  // Add extraction of userId from walletAddress
  useEffect(() => {
    if (walletClient && address) {
      setUserId(address);
    } else {
      setUserId("");
    }
  }, [walletClient, address]);

  const scrollToBottom = () => {
    responsesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [responses]);

  const handleQuoteSelection = async (response: Response, quote: any) => {
    try {
      setIsLoading(true);

      // Add a confirmation response before executing the swap
      const confirmSelectionResponse: Response = {
        content: {
          type: "message",
          message: `Selected ${quote.protocol} for your swap. Preparing transaction...`,
        },
        timestamp: new Date().toISOString(),
        isCommand: false,
        status: "processing",
        agentType: "swap",
      };
      setResponses((prev) => [...prev, confirmSelectionResponse]);

      // For Scroll chain, provide clearer messaging about the two-step process
      if (chainId === 534352) {
        setResponses((prev) => [
          ...prev,
          {
            content:
              "Preparing your swap on Scroll...\n\nNote: Scroll swaps typically require two transactions:\n1. First to approve token spending\n2. Then to execute the actual swap",
            timestamp: new Date().toISOString(),
            isCommand: false,
            status: "processing",
            agentType: "swap",
          },
        ]);
      }

      // Execute the swap - only do this once
      const txData = await apiService.executeSwap(address, chainId, quote);

      if (txData.error) {
        throw new Error(txData.error);
      }

      // Execute the transaction
      if (txData.to && txData.data && transactionService) {
        console.log(
          "Transaction data received:",
          JSON.stringify(txData, null, 2)
        );
        const transaction = await transactionService.executeTransaction(txData);
        console.log("Transaction successful:", transaction);

        // Add success message with block explorer link
        const explorerLink = transactionService.getBlockExplorerLink(
          transaction.hash
        );

        const successResponse: Response = {
          content: {
            type: "message",
            message: `Transaction submitted successfully! View status on [block explorer](${explorerLink}).\n\nYour swap will be confirmed shortly and will appear in your wallet history.`,
          },
          timestamp: new Date().toISOString(),
          isCommand: false,
          status: "success",
          agentType: "swap",
          metadata: {
            txHash: transaction.hash,
            blockExplorerLink: explorerLink,
          },
        };
        setResponses((prev) => [...prev, successResponse]);
      } else {
        throw new Error("Invalid transaction data received from API");
      }
    } catch (error) {
      console.error("Error during quote selection:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isUserRejection =
        errorMessage.includes("user denied") ||
        errorMessage.includes("User denied") ||
        errorMessage.includes("User rejected") ||
        errorMessage.includes("rejected the request") ||
        errorMessage.includes("Transaction cancelled");

      // Get the transaction hash from the error if available
      const txHashMatch = errorMessage.match(/0x[a-fA-F0-9]{64}/);
      const txHash = txHashMatch ? txHashMatch[0] : null;
      let formattedMessage = isUserRejection
        ? "Transaction was cancelled by user"
        : `Error selecting quote: ${errorMessage}`;

      // If we have a transaction hash, add a link to the block explorer
      if (txHash && transactionService) {
        const explorerLink = transactionService.getBlockExplorerLink(txHash);
        formattedMessage += ` [View on Explorer](${explorerLink})`;
      }

      const errorResponse: Response = {
        content: formattedMessage,
        timestamp: new Date().toISOString(),
        isCommand: false,
        status: "error",
        metadata: txHash
          ? {
              txHash,
              blockExplorerLink:
                transactionService?.getBlockExplorerLink(txHash),
            }
          : undefined,
      };
      setResponses((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const processCommand = async (command: string) => {
    try {
      // Don't process confirmation responses as new commands
      if (
        [
          "yes",
          "y",
          "yeah",
          "yep",
          "ok",
          "okay",
          "sure",
          "confirm",
          "no",
          "n",
          "nope",
          "cancel",
          "abort",
        ].includes(command.toLowerCase().trim())
      ) {
        const isConfirmation = [
          "yes",
          "y",
          "yeah",
          "yep",
          "ok",
          "okay",
          "sure",
          "confirm",
        ].includes(command.toLowerCase().trim());

        // Add response indicating we're processing a confirmation
        const confirmationResponse: Response = {
          content: {
            type: "message",
            message: isConfirmation
              ? "Processing your confirmation..."
              : "Cancelled. Let me know if you need anything else.",
          },
          timestamp: new Date().toISOString(),
          isCommand: false,
          status: "success",
        };
        setResponses((prev) => [...prev, confirmationResponse]);

        // If confirmed, get quotes - BUT only for swap operations (not bridge/brian)
        if (isConfirmation) {
          // Find the last response that has an agent type or content type that can help identify it
          const lastMeaningfulResponse = responses
            .slice()
            .reverse()
            .find(
              (r) =>
                r.agentType ||
                (r.content && typeof r.content === "object" && r.content.type)
            );

          // Check if this response was from the Brian agent or is a Brian-specific operation
          const isBrianOperation =
            lastMeaningfulResponse?.agentType === "brian" ||
            (lastMeaningfulResponse?.content &&
              typeof lastMeaningfulResponse.content === "object" &&
              ["brian_confirmation", "transaction"].includes(
                lastMeaningfulResponse.content.type
              ));

          // If it's a Brian operation, we just need to process the command with the backend
          if (isBrianOperation) {
            try {
              // For Brian operations, directly process the command through the server
              const data = await apiService.processCommand(
                "yes",
                address,
                chainId
              );

              // Handle transaction if present
              if (data.transaction && transactionService) {
                console.log(
                  "Brian transaction data received:",
                  data.transaction
                );
                const transaction = await transactionService.executeTransaction(
                  data.transaction
                );

                // Add success message with block explorer link
                const explorerLink = transactionService.getBlockExplorerLink(
                  transaction.hash
                );
                const successResponse: Response = {
                  content: `Transaction submitted! [View on block explorer](${explorerLink})`,
                  timestamp: new Date().toISOString(),
                  isCommand: false,
                  status: "success",
                  agentType: data.agent_type || "brian",
                  metadata: {
                    txHash: transaction.hash,
                    blockExplorerLink: explorerLink,
                  },
                };
                setResponses((prev) => [...prev, successResponse]);
              }
              // We've directly handled the Brian operation, so we can return
              return;
            } catch (error) {
              console.error("Error processing Brian confirmation:", error);
              setIsLoading(false);
              const errorResponse: Response = {
                content: `Error executing transaction: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                timestamp: new Date().toISOString(),
                isCommand: false,
                status: "error",
              };
              setResponses((prev) => [...prev, errorResponse]);
              return;
            }
          }

          // For regular swap operations (non-Brian), proceed with getting quotes
          if (!isBrianOperation) {
            try {
              setIsLoading(true);
              const quotesData = await apiService.getSwapQuotes(
                address,
                chainId
              );
              setIsLoading(false);

              if (quotesData.is_brian_operation) {
                // If the backend tells us this is a Brian operation, don't try to get swap quotes
                // Instead skip to yes processing which will execute the Brian operation
                await processCommand("yes");
                return;
              }

              if (quotesData.error) {
                throw new Error(quotesData.error);
              }

              // If we have quotes, display them for selection
              if (quotesData.quotes && quotesData.quotes.length > 0) {
                // Display quotes for selection
                const quotesResponse: Response = {
                  content: quotesData,
                  timestamp: new Date().toISOString(),
                  isCommand: false,
                  requires_selection: true,
                  all_quotes: quotesData.quotes,
                  status: "success",
                };

                setResponses((prev) => [...prev, quotesResponse]);
              } else {
                throw new Error("No quotes available for this swap");
              }
            } catch (error) {
              console.error("Error getting swap quotes:", error);
              setIsLoading(false);
              const errorResponse: Response = {
                content: `Error getting swap quotes: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                timestamp: new Date().toISOString(),
                isCommand: false,
                status: "error",
              };
              setResponses((prev) => [...prev, errorResponse]);
            }
          }
        }

        return; // Don't proceed with normal command processing
      }

      setIsLoading(true);

      // Allow greeting and help commands without a wallet
      const greetings = [
        "gm",
        "good morning",
        "hello",
        "hi",
        "hey",
        "howdy",
        "sup",
        "yo",
      ];
      const isGreeting = greetings.some((greeting) =>
        command.toLowerCase().includes(greeting)
      );
      const isHelp =
        command.toLowerCase().includes("help") ||
        command.toLowerCase().includes("what can you do");

      if (!walletClient || !address) {
        // For greetings and help, proceed without a wallet
        if (isGreeting || isHelp) {
          const userCommand: Response = {
            content: command,
            timestamp: new Date().toISOString(),
            isCommand: true,
          };
          setResponses((prev) => [...prev, userCommand]);

          try {
            const data = await apiService.processCommand(
              command,
              undefined,
              undefined,
              undefined
            );

            const apiResponse: Response = {
              content: data.content || "I didn't understand that command.",
              timestamp: new Date().toISOString(),
              isCommand: false,
              status: "success",
              agentType: data.agent_type || "default",
              metadata: data.metadata,
            };
            setResponses((prev) => [...prev, apiResponse]);
          } catch (error) {
            const errorResponse: Response = {
              content: "Failed to process your command. Please try again.",
              timestamp: new Date().toISOString(),
              isCommand: false,
              status: "error",
            };
            setResponses((prev) => [...prev, errorResponse]);
          }
          return;
        }

        const errorResponse: Response = {
          content: "Please connect your wallet to continue.",
          timestamp: new Date().toISOString(),
          isCommand: false,
          status: "error",
        };
        setResponses((prev) => [...prev, errorResponse]);
        return;
      }

      // Add the user command to responses
      const userCommand: Response = {
        content: command,
        timestamp: new Date().toISOString(),
        isCommand: true,
      };
      setResponses((prev) => [...prev, userCommand]);

      // Process different command types
      if (command.toLowerCase().startsWith("swap ")) {
        await processSwapCommand(command);
      } else if (
        command.toLowerCase().startsWith("dca ") ||
        command.toLowerCase().startsWith("dollar cost average ")
      ) {
        await processDCACommand(command);
      } else {
        // Process general command
        try {
          const data = await apiService.processCommand(
            command,
            address,
            chainId,
            getDisplayName(address, userProfile)
          );

          // Handle transaction if present
          if (data.transaction && transactionService) {
            console.log("Transaction data received:", data.transaction);
            const processingResponse: Response = {
              content: {
                type: "message",
                message:
                  typeof data.content === "object" && data.content.message
                    ? data.content.message
                    : "Processing your transaction...",
              },
              timestamp: new Date().toISOString(),
              isCommand: false,
              status: "processing",
              agentType: data.agent_type || "brian",
            };
            setResponses((prev) => [...prev, processingResponse]);

            try {
              // Execute the transaction
              console.log("Executing transaction with data:", data.transaction);
              const transaction = await transactionService.executeTransaction(
                data.transaction
              );
              console.log("Transaction successful:", transaction);

              // Add success message with block explorer link
              const explorerLink = transactionService.getBlockExplorerLink(
                transaction.hash
              );
              const successResponse: Response = {
                content: {
                  type: "message",
                  message: `Transaction submitted! [View on block explorer](${explorerLink})`,
                },
                timestamp: new Date().toISOString(),
                isCommand: false,
                status: "success",
                agentType: data.agent_type || "brian",
                metadata: {
                  txHash: transaction.hash,
                  blockExplorerLink: explorerLink,
                },
              };
              setResponses((prev) => [...prev, successResponse]);
            } catch (error) {
              // Handle transaction errors (user rejected, etc)
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              const errorResponse: Response = {
                content: `Transaction failed: ${errorMessage}`,
                timestamp: new Date().toISOString(),
                isCommand: false,
                status: "error",
                agentType: data.agent_type || "brian",
              };
              setResponses((prev) => [...prev, errorResponse]);
            }
          } else {
            // Regular response (no transaction)
            const botResponse: Response = {
              content: data.content || data,
              timestamp: new Date().toISOString(),
              isCommand: false,
              agentType: data.agent_type || "default",
              metadata: data.metadata,
              awaitingConfirmation: data.awaiting_confirmation,
            };

            if (data.status) {
              botResponse.status = data.status;
            }

            setResponses((prev) => [...prev, botResponse]);
          }
        } catch (error) {
          const errorResponse: Response = {
            content: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
            timestamp: new Date().toISOString(),
            isCommand: false,
            status: "error",
          };
          setResponses((prev) => [...prev, errorResponse]);
        }
      }
    } catch (error) {
      console.error("Error processing command:", error);
      const errorResponse: Response = {
        content: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
        isCommand: false,
        status: "error",
      };
      setResponses((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const processSwapCommand = async (command: string) => {
    try {
      const data = await apiService.processSwapCommand(
        command,
        address,
        chainId
      );

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.content?.type === "swap_confirmation") {
        const isScrollChain = chainId === 534352;
        let confirmationContent = data.content;

        if (isScrollChain) {
          confirmationContent = {
            ...data.content,
            note: "Note: On Scroll, swaps require two separate transactions: first to approve token spending, then to execute the swap.",
          };
        }

        const swapConfirmationResponse: Response = {
          content: confirmationContent,
          timestamp: new Date().toISOString(),
          isCommand: false,
          awaitingConfirmation: true,
          confirmation_type: "token_confirmation",
          metadata: data.metadata,
          status: "success",
        };

        setResponses((prev) => [...prev, swapConfirmationResponse]);
      } else {
        const botResponse: Response = {
          content: data.content || data,
          timestamp: new Date().toISOString(),
          isCommand: false,
          metadata: data.metadata,
          status: "success",
        };

        setResponses((prev) => [...prev, botResponse]);
      }
    } catch (error) {
      console.error("Error processing swap command:", error);
      const errorResponse: Response = {
        content: `Error processing swap: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
        isCommand: false,
        status: "error",
      };
      setResponses((prev) => [...prev, errorResponse]);
    }
  };

  const processDCACommand = async (command: string) => {
    try {
      const data = await apiService.processDCACommand(
        command,
        address,
        chainId
      );

      const botResponse: Response = {
        content: data.content,
        timestamp: new Date().toISOString(),
        isCommand: false,
        agentType: "dca",
        awaitingConfirmation:
          data.content && data.content.type === "dca_confirmation",
        confirmation_type: "token_confirmation",
        pendingCommand: data.pending_command,
        metadata: data.metadata,
        transaction: data.transaction,
      };

      setResponses((prev) => [...prev, botResponse]);

      if (data.content && data.content.type === "dca_confirmation") {
        // Handle DCA confirmation in the next step
      }
    } catch (error) {
      console.error("Error processing DCA command:", error);
      const errorResponse: Response = {
        content: `Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
        isCommand: false,
        status: "error",
      };
      setResponses((prev) => [...prev, errorResponse]);
    }
  };

  const handleSubmit = async (command: string) => {
    const lastResponse = responses[responses.length - 1];

    if (lastResponse?.awaitingConfirmation) {
      if (
        ["yes", "confirm", "proceed", "ok", "go ahead"].includes(
          command.toLowerCase()
        )
      ) {
        const userConfirmation: Response = {
          content: command,
          timestamp: new Date().toISOString(),
          isCommand: true,
        };
        setResponses((prev) => [...prev, userConfirmation]);

        // Find the last response that has an agent type or content type that can help identify it
        const lastMeaningfulResponse = responses
          .slice()
          .reverse()
          .find(
            (r) =>
              r.agentType ||
              (r.content && typeof r.content === "object" && r.content.type)
          );

        // Check if this response was from the Brian agent or is a Brian-specific operation
        const isBrianOperation =
          lastMeaningfulResponse?.agentType === "brian" ||
          (lastMeaningfulResponse?.content &&
            typeof lastMeaningfulResponse.content === "object" &&
            ["brian_confirmation", "transaction"].includes(
              lastMeaningfulResponse.content.type
            ));

        if (
          lastResponse.content?.type === "swap_confirmation" &&
          !isBrianOperation
        ) {
          try {
            setIsLoading(true);
            const quotesData = await apiService.getSwapQuotes(address, chainId);

            if (quotesData.is_brian_operation) {
              // If the backend tells us this is a Brian operation, don't show quotes
              await processCommand("yes");
            } else if (quotesData.error) {
              throw new Error(quotesData.error);
            } else if (quotesData.quotes?.length > 0) {
              const quotesResponse: Response = {
                content: "Please select a provider for your swap:",
                timestamp: new Date().toISOString(),
                isCommand: false,
                status: "success",
                agentType: "swap",
                requires_selection: true,
                all_quotes: quotesData.quotes,
                metadata: {
                  token_out_symbol: quotesData.token_out?.symbol || "tokens",
                  token_out_decimals: quotesData.token_out?.decimals || 18,
                },
              };
              setResponses((prev) => [...prev, quotesResponse]);
            } else {
              throw new Error("No quotes available for this swap");
            }
          } catch (error) {
            const errorResponse: Response = {
              content: `Unable to get swap quotes: ${
                error instanceof Error ? error.message : String(error)
              }`,
              timestamp: new Date().toISOString(),
              isCommand: false,
              status: "error",
              agentType: "swap",
            };
            setResponses((prev) => [...prev, errorResponse]);
          } finally {
            setIsLoading(false);
          }
        } else {
          await processCommand("yes");
        }
        return;
      } else if (["no", "cancel", "stop"].includes(command.toLowerCase())) {
        const userDecline: Response = {
          content: command,
          timestamp: new Date().toISOString(),
          isCommand: true,
        };

        const botResponse: Response = {
          content: "Operation cancelled. How else can I help you?",
          timestamp: new Date().toISOString(),
          isCommand: false,
          status: "success",
        };

        setResponses((prev) => [...prev, userDecline, botResponse]);
        return;
      }
    }

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
                  colorScheme="blue"
                  onClick={() => setIsHelpModalOpen(true)}
                  leftIcon={<Icon as={QuestionIcon} />}
                >
                  Help
                </Button>
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
                <AlertTitle>
                  Welcome! I, SNEL, am in beta, kindly go slow.
                </AlertTitle>
                <AlertDescription>
                  By continuing, you agree to my{" "}
                  <Link href="/terms" color="blue.500" isExternal>
                    Terms 🐌
                  </Link>
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
                  key={index}
                  content={response.content}
                  timestamp={response.timestamp}
                  isCommand={response.isCommand}
                  status={response.status}
                  awaitingConfirmation={response.awaitingConfirmation}
                  agentType={response.agentType}
                  metadata={response.metadata}
                  requires_selection={response.requires_selection}
                  all_quotes={response.all_quotes}
                  onQuoteSelect={handleQuoteSelection}
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
          <HelpModal
            isOpen={isHelpModalOpen}
            onClose={() => setIsHelpModalOpen(false)}
          />
        </VStack>
      </Container>
    </Box>
  );
}
