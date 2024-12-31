import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  defineChain,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  http,
  type Hex,
} from "viem";
import { english, generateMnemonic, mnemonicToAccount } from "viem/accounts";

const mainnet = defineChain({
  id: 88,
  name: "Viction",
  nativeCurrency: {
    decimals: 18,
    name: "Viction",
    symbol: "VIC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.viction.xyz"],
      webSocket: ["wss://ws.viction.xyz"],
    },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://vicscan.xyz" },
  },
  testnet: false,
});

const abi = [
  {
    type: "function",
    name: "Announcement",
    inputs: [
      {
        type: "bytes",
        name: "ephemeralPublicKey",
      },
      {
        type: "uint8",
        name: "viewTag",
      },
    ],
  },
];

const main = async () => {
  const account = mnemonicToAccount(generateMnemonic(english));
  console.log("Generated account:", account);

  const encodedEvent = encodeFunctionData({
    abi: abi,
    functionName: "Announcement",
    args: [
      "0x02f9230aabb043bda2e3044e93dd955d197343e0d15d5a5214c08ea7b5bcbae307",
      "0x66",
    ],
  });

  const callData =
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: ["0x1234567890123456789012345678901234567890", 0n],
    }) + encodedEvent.slice(2);

  console.log("Encoded event:", encodedEvent);
  console.log("Encoded call data:", callData);

  const client = createPublicClient({
    chain: mainnet,
    transport: http(),
  });

  /*
  const transactionHash = await client.sendTransaction({
    to: "0x0Fd0288AAAE91eaF935e2eC14b23486f86516c8C",
    data: callData as Hex,
    gasLimit: 1000000n,
    gas: 250000n,
  })

  console.log("Transaction hash:", transactionHash);
  */

  const transaction = await client.getTransaction({
    hash: "0x3bb7da6474a956719d573ecb24013b80677f26b5ce6b7ab060a67427c2cb51ee",
  });

  const eventData =
    "0x" +
    transaction.input.slice(
      transaction.input.indexOf("d651db7d"), // signature of Announcement
      transaction.input.length
    );

  const decodedEvent = decodeFunctionData({
    abi: abi,
    data: eventData as Hex,
  });

  console.log("Decoded event:", decodedEvent);
};

main();
