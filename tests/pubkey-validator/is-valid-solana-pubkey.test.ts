import { describe, expect, test } from "bun:test";
import { isValidSolanaPubkey } from "@/lib/pubkey-validator";

// Known pubkeys from repo context
const SENTINEL = "Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph"; // 44 chars
const TREASURY = "9cssRtj1tpo8juYMKVw4BLonEXnSH2e6bfc9Qp88fN48"; // 44 chars
const VAULT = "3SPm6qbgsDkj24MuR8Ss4sH97fziqyCiqFKDyeVU2igq"; // 44 chars

// 32-char minimum-length valid pubkey (System Program)
const SYSTEM_PROGRAM = "11111111111111111111111111111111"; // 32 chars

describe("isValidSolanaPubkey — golden pubkeys → true", () => {
  test("sentinel pubkey", () => {
    expect(isValidSolanaPubkey(SENTINEL)).toBe(true);
  });

  test("treasury pubkey", () => {
    expect(isValidSolanaPubkey(TREASURY)).toBe(true);
  });

  test("vault pubkey", () => {
    expect(isValidSolanaPubkey(VAULT)).toBe(true);
  });

  test("32-char system program pubkey", () => {
    expect(isValidSolanaPubkey(SYSTEM_PROGRAM)).toBe(true);
  });
});

describe("isValidSolanaPubkey — wrong types → false", () => {
  test("empty string", () => {
    expect(isValidSolanaPubkey("")).toBe(false);
  });

  test("undefined", () => {
    expect(isValidSolanaPubkey(undefined)).toBe(false);
  });

  test("null", () => {
    expect(isValidSolanaPubkey(null)).toBe(false);
  });

  test("number", () => {
    expect(isValidSolanaPubkey(42)).toBe(false);
  });

  test("object", () => {
    expect(isValidSolanaPubkey({})).toBe(false);
  });
});

describe("isValidSolanaPubkey — wrong length → false", () => {
  // 31 chars of valid alphabet
  test("31-char string", () => {
    expect(isValidSolanaPubkey("1111111111111111111111111111111")).toBe(false);
  });

  // 45 chars of valid alphabet
  test("45-char string", () => {
    expect(isValidSolanaPubkey("111111111111111111111111111111111111111111111")).toBe(false);
  });
});

describe("isValidSolanaPubkey — invalid characters → false", () => {
  // 32-char string with a '0' (not in base58 alphabet)
  test("32-char string containing '0'", () => {
    expect(isValidSolanaPubkey("1111111111111111111111111111110" + "1")).toBe(false);
  });

  // 32-char string with an 'O' (not in base58 alphabet)
  test("32-char string containing 'O'", () => {
    expect(isValidSolanaPubkey("111111111111111111111111111111O1")).toBe(false);
  });

  // 32-char string with an 'I' (not in base58 alphabet)
  test("32-char string containing 'I'", () => {
    expect(isValidSolanaPubkey("111111111111111111111111111111I1")).toBe(false);
  });

  // 32-char string with an 'l' (lowercase L, not in base58 alphabet)
  test("32-char string containing lowercase 'l'", () => {
    expect(isValidSolanaPubkey("111111111111111111111111111111l1")).toBe(false);
  });
});

describe("isValidSolanaPubkey — hallucinated input (shape-only check)", () => {
  // 36 chars, valid base58 alphabet — shape passes, but this is a hallucinated pubkey.
  // The validator's contract is string-shape only; re-prompting is the second layer.
  test("BzG3LcMaskBearer4267xKqPnRvSwTzAa9BC (36 chars, valid alphabet) → true", () => {
    expect(isValidSolanaPubkey("BzG3LcMaskBearer4267xKqPnRvSwTzAa9BC")).toBe(true);
  });
});

describe("isValidSolanaPubkey — type guard narrows to string", () => {
  test("narrows unknown to string when true", () => {
    const input: unknown = SENTINEL;
    if (isValidSolanaPubkey(input)) {
      // TypeScript must allow string methods here — compile-time check
      expect(input.toUpperCase()).toBe(SENTINEL.toUpperCase());
    } else {
      throw new Error("expected true");
    }
  });
});
