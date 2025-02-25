import {
  Box,
  Link as ChakraLink,
  Text,
  HStack,
  Divider,
} from "@chakra-ui/react";
import NextLink from "next/link";

export const Footer = () => {
  return (
    <Box
      as="footer"
      position="fixed"
      bottom="0"
      width="100%"
      py={2}
      px={4}
      bg="white"
      borderTop="1px"
      borderColor="gray.100"
      textAlign="center"
      fontSize={{ base: "xs", sm: "sm" }}
      color="gray.600"
      backdropFilter="blur(10px)"
      backgroundColor="rgba(255, 255, 255, 0.9)"
      zIndex="banner"
    >
      <HStack spacing={2} justify="center" wrap="wrap">
        <Text>
          <ChakraLink
            href="https://hey.xyz/u/papajams"
            isExternal
            color="blue.500"
            _hover={{ textDecoration: "none", color: "blue.600" }}
          >
            papa
          </ChakraLink>
          <Text as="span" mx={2} color="gray.400">
            |
          </Text>
          <ChakraLink
            href="https://hey.xyz/u/pointless"
            isExternal
            color="blue.500"
            _hover={{ textDecoration: "none", color: "blue.600" }}
          >
            pointless
          </ChakraLink>
        </Text>
        <Divider orientation="vertical" height="20px" />
        <ChakraLink
          as={NextLink}
          href="/terms"
          color="blue.500"
          _hover={{ textDecoration: "none", color: "blue.600" }}
        >
          terms
        </ChakraLink>
      </HStack>
    </Box>
  );
};
