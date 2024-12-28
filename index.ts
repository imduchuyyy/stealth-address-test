import {
  getPublicKey,
  getSharedSecret,
  ProjectivePoint,
  utils,
  CURVE,
} from "@noble/secp256k1";
import { bytesToHex, hexToBytes, keccak256, type Hex } from "viem";
import {
  english,
  generateMnemonic,
  mnemonicToAccount,
  privateKeyToAccount,
  publicKeyToAddress,
} from "viem/accounts";

const STEALTH_ADDRESS_SIGNATURE = "Stealth Signed Message:\n";

interface Key {
  publicKey: Hex;
  privateKey: Hex;
}

interface StealthKey {
  viewingKey: Key;
  spendingKey: Key;
}

interface StealthMetaPublicKey {
  viewingPublicKey: Hex;
  spendingPublicKey: Hex;
}

interface StealthAddress {
  stealthPublicKey: Hex;
  ephemeralPublicKey: Hex;
  viewTag: Hex;
}

const extractPortions = (signature: Hex) => {
  const startIndex = 2; // first two characters are 0x, so skip these
  const length = 64; // each 32 byte chunk is in hex, so 64 characters
  const portion1 = signature.slice(startIndex, startIndex + length);
  const portion2 = signature.slice(
    startIndex + length,
    startIndex + length + length
  );
  const lastByte = signature.slice(signature.length - 2);

  return { portion1, portion2, lastByte };
};

const generateStealthMetaAddressFromKeys = (
  spendingPublicKey: Hex,
  viewingPublicKey: Hex
): Hex => {
  return `0x${spendingPublicKey.slice(2)}${viewingPublicKey.slice(2)}`;
};

const generateStealthKeyFromSignature = (signature: Hex): StealthKey => {
  const { portion1, portion2, lastByte } = extractPortions(signature);

  if (`0x${portion1}${portion2}${lastByte}` !== signature) {
    throw new Error("Signature incorrectly generated or parsed");
  }

  const spendingPrivateKey = hexToBytes(keccak256(`0x${portion1}`));
  const viewingPrivateKey = hexToBytes(keccak256(`0x${portion2}`));

  const spendingPublicKey = bytesToHex(getPublicKey(spendingPrivateKey, true));
  const viewingPublicKey = bytesToHex(getPublicKey(viewingPrivateKey, true));

  return {
    spendingKey: {
      publicKey: spendingPublicKey,
      privateKey: bytesToHex(spendingPrivateKey),
    },
    viewingKey: {
      publicKey: viewingPublicKey,
      privateKey: bytesToHex(viewingPrivateKey),
    },
  };
};

const parseKeysFromStealthMetaAddress = (
  stealthMeta: Hex
): StealthMetaPublicKey => {
  const spendingPublicKey = `0x${stealthMeta.slice(2, 68)}` as Hex;
  const viewingPublicKey = `0x${stealthMeta.slice(68)}` as Hex;

  return {
    spendingPublicKey,
    viewingPublicKey,
  };
};

const getViewTag = (hashSharedSecret: Hex): Hex => {
  return `0x${hashSharedSecret.toString().substring(2, 4)}`;
};

const getStealthPublicKey = (
  spendingPublicKey: Hex,
  hashSharedSecret: Hex
): Hex => {
  const hashedSharedSecretPoint = ProjectivePoint.fromPrivateKey(
    hexToBytes(hashSharedSecret)
  );

  return bytesToHex(
    ProjectivePoint.fromHex(spendingPublicKey.slice(2))
      .add(hashedSharedSecretPoint)
      .toRawBytes(false)
  );
};

const generateStealthAddress = (
  stealthMeta: StealthMetaPublicKey
): StealthAddress => {
  const ephemeralPrivateKey = utils.randomPrivateKey();
  const ephemeralPublicKey = getPublicKey(ephemeralPrivateKey, true);
  const sharedSecret = getSharedSecret(
    ephemeralPrivateKey,
    ProjectivePoint.fromHex(stealthMeta.viewingPublicKey.slice(2)).toRawBytes(
      true
    )
  );

  const hashSharedSecret = keccak256(sharedSecret);
  const viewTag = getViewTag(hashSharedSecret);

  const newStealthPublicKey = getStealthPublicKey(
    stealthMeta.spendingPublicKey,
    hashSharedSecret
  );
  const newStealthAddress = publicKeyToAddress(newStealthPublicKey);

  return {
    stealthPublicKey: newStealthAddress,
    ephemeralPublicKey: bytesToHex(ephemeralPublicKey),
    viewTag,
  };
};

function addPriv({ a, b }: { a: bigint; b: bigint }) {
  const curveOrderBigInt = BigInt(CURVE.n);
  return (a + b) % curveOrderBigInt;
}

const computeStealthPrivateKey = (
  stealthKey: StealthKey,
  ephemeralPublicKey: Hex
): Hex => {
  const sharedSecret = getSharedSecret(
    hexToBytes(stealthKey.viewingKey.privateKey),
    hexToBytes(ephemeralPublicKey)
  );

  const hashSharedSecret = keccak256(sharedSecret);

  const spendingPrivateKeyBigInt = BigInt(stealthKey.spendingKey.privateKey);
  const hashedSecretBigInt = BigInt(hashSharedSecret);

  const stealthPrivateKeyBigInt = addPriv({
    a: spendingPrivateKeyBigInt,
    b: hashedSecretBigInt,
  });

  return `0x${stealthPrivateKeyBigInt.toString(16).padStart(64, "0")}` as Hex;
};

const checkStealthAddress = (
  stealthAddress: Hex,
  ephemeralPublicKey: Hex,
  spendingPublicKey: Hex,
  viewingPrivateKey: Hex,
  viewTag: Hex
): boolean => {
  const sharedSecret = getSharedSecret(
    hexToBytes(viewingPrivateKey),
    hexToBytes(ephemeralPublicKey)
  );

  const hashSharedSecret = keccak256(sharedSecret);
  const computedViewTag = getViewTag(hashSharedSecret);

  if (computedViewTag !== viewTag) {
    return false;
  }

  const newStealthPublicKey = getStealthPublicKey(
    spendingPublicKey,
    hashSharedSecret
  );
  const newStealthAddress = publicKeyToAddress(newStealthPublicKey);

  return stealthAddress === newStealthAddress;
};

const main = async () => {
  const mnemonic = generateMnemonic(english);
  console.log("Generated mnemonic:", mnemonic);
  const account = mnemonicToAccount(mnemonic);
  console.log("Main account:", account.address);

  const signature = await account.signMessage({
    message: STEALTH_ADDRESS_SIGNATURE + account.address,
  });

  console.log("Signature:", signature);

  const stealthKey: StealthKey = generateStealthKeyFromSignature(signature);

  console.log("Stealth key:", stealthKey);

  const stealthMeta: Hex = generateStealthMetaAddressFromKeys(
    stealthKey.spendingKey.publicKey,
    stealthKey.viewingKey.publicKey
  );

  console.log("Stealth meta address:", stealthMeta);

  const parsedStealthKeys: StealthMetaPublicKey =
    parseKeysFromStealthMetaAddress(stealthMeta);
  console.log("Parsed stealth keys:", parsedStealthKeys);

  const newStealthAddress: StealthAddress =
    generateStealthAddress(parsedStealthKeys);
  console.log("New stealth address:", newStealthAddress);

  const isValidStealthAddress = checkStealthAddress(
    newStealthAddress.stealthPublicKey,
    newStealthAddress.ephemeralPublicKey,
    parsedStealthKeys.spendingPublicKey,
    stealthKey.viewingKey.privateKey,
    newStealthAddress.viewTag
  );

  console.log("Is valid stealth address:", isValidStealthAddress);

  const newStealthPrivateKey: Hex = computeStealthPrivateKey(
    stealthKey,
    newStealthAddress.ephemeralPublicKey
  );

  console.log("New stealth private key:", newStealthPrivateKey);

  const newStealthAccount = privateKeyToAccount(newStealthPrivateKey);
  console.log(
    "Is valid stealth account:",
    newStealthAccount.address === newStealthAddress.stealthPublicKey
  );
};

main();
