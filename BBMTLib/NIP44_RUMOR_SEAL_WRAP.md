# NIP-44 Encryption and Rumor/Seal/Wrap Pattern

This document explains how NIP-44 encryption and the rumor/seal/wrap pattern works in the BoldWallet TSS (Threshold Signature Scheme) implementation.

## Table of Contents

1. [Overview](#overview)
2. [NIP-44 Encryption Basics](#nip-44-encryption-basics)
3. [Rumor/Seal/Wrap Pattern](#rumorsealwrap-pattern)
4. [Complete Message Flow](#complete-message-flow)
5. [Implementation Details](#implementation-details)

---

## Overview

The BoldWallet TSS implementation uses a three-layer encryption pattern based on Nostr Improvement Proposals (NIPs):

- **NIP-44**: Encrypted Direct Messages using shared secret derivation
- **NIP-59**: Gift Wraps for additional privacy
- **Custom Pattern**: Rumor → Seal → Wrap for TSS message transport

This provides:
- **End-to-end encryption** between parties
- **Metadata privacy** (relays can't see sender/recipient relationships)
- **Forward secrecy** (one-time keys for wraps)
- **Authentication** (signed seals verify sender identity)

---

## NIP-44 Encryption Basics

### Conversation Key Generation

NIP-44 uses a shared secret (conversation key) derived from the sender's private key and recipient's public key:

```
┌─────────────────────────────────────────────────────────┐
│           NIP-44 Conversation Key Generation            │
└─────────────────────────────────────────────────────────┘

Sender (Alice)                    Recipient (Bob)
┌──────────────┐                 ┌──────────────┐
│ nsec (hex)   │                 │ npub (hex)   │
│ Private Key  │                 │ Public Key   │
└──────┬───────┘                 └──────┬───────┘
       │                                │
       └──────────┬─────────────────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ nip44.Generate  │
         │ ConversationKey │
         │ (recipientNpub, │
         │  senderNsec)    │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────┐
         │ Conversation Key│
         │   [32 bytes]    │
         └─────────────────┘
```

**Key Properties:**
- Same conversation key is derived by both parties (symmetric)
- Alice: `GenerateConversationKey(BobNpub, AliceNsec)`
- Bob: `GenerateConversationKey(AliceNpub, BobNsec)` → Same key!

### Encryption/Decryption

```
┌─────────────────────────────────────────────────────────┐
│              NIP-44 Encryption Flow                     │
└─────────────────────────────────────────────────────────┘

Plaintext Message
       │
       ▼
┌──────────────────┐
│ nip44.Encrypt()  │ ← Conversation Key
└────────┬─────────┘
         │
         ▼
   Encrypted String
   (Base64 encoded)
```

---

## Rumor/Seal/Wrap Pattern

The three-layer pattern provides multiple levels of encryption and privacy:

### Layer 1: Rumor (Kind 14)

**Purpose**: Unsigned event containing the actual message data

```
┌─────────────────────────────────────────────────────────┐
│                    RUMOR (Kind 14)                     │
├─────────────────────────────────────────────────────────┤
│ Type:     Unsigned Nostr Event                         │
│ Kind:     14 (Chat Message)                            │
│ Content:  JSON with chunk data                         │
│ Tags:     [["p", recipientPubkey]]                     │
│ ID:       Calculated from content (unsigned)           │
└─────────────────────────────────────────────────────────┘

Example Content:
{
  "session_id": "abc123",
  "chunk": "hash/0/3",
  "data": "base64EncodedChunkData"
}
```

### Layer 2: Seal (Kind 13)

**Purpose**: Encrypted rumor, signed by sender

```
┌─────────────────────────────────────────────────────────┐
│                    SEAL (Kind 13)                       │
├─────────────────────────────────────────────────────────┤
│ Type:     Signed Nostr Event                           │
│ Kind:     13 (Sealed Direct Message)                   │
│ Content:  NIP-44 encrypted rumor JSON                  │
│ Tags:     [] (empty - privacy)                         │
│ Signature: Signed with sender's nsec                   │
└─────────────────────────────────────────────────────────┘

Encryption:
  Rumor JSON → NIP-44 Encrypt (senderNsec, recipientNpub)
              → Encrypted Content
```

### Layer 3: Wrap (Kind 1059)

**Purpose**: Gift wrap with one-time key for metadata privacy

```
┌─────────────────────────────────────────────────────────┐
│                  WRAP (Kind 1059)                       │
├─────────────────────────────────────────────────────────┤
│ Type:     Signed Nostr Event                           │
│ Kind:     1059 (Gift Wrap - NIP-59)                    │
│ Content:  NIP-44 encrypted seal JSON                   │
│ Tags:     [["p", recipientHex], ["t", sessionID],     │
│           ["chunk", "hash/index/total"]]               │
│ Signature: Signed with random one-time key             │
│ PubKey:   One-time public key (not sender's!)          │
└─────────────────────────────────────────────────────────┘

Encryption:
  Seal JSON → NIP-44 Encrypt (wrapNsec, recipientNpub)
            → Encrypted Content
  
Key Generation:
  wrapNsec = GenerateRandomPrivateKey()
  wrapNpub = DerivePublicKey(wrapNsec)
```

---

## Complete Message Flow

### Sending Flow (Messenger.SendMessage)

```
┌─────────────────────────────────────────────────────────────┐
│              SENDING MESSAGE FLOW                          │
└─────────────────────────────────────────────────────────────┘

1. Input: Plaintext TSS Message
   │
   ▼
2. Chunk Message
   ┌─────────────────────────────────────┐
   │ Split into chunks (16KB default)    │
   │ Each chunk has:                     │
   │   - Hash (SHA256 of all chunks)     │
   │   - Index (0, 1, 2, ...)           │
   │   - Total count                     │
   └──────────────┬──────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────────┐
   │ For each chunk:                       │
   │                                        │
   │ 3. Create Rumor (Kind 14)             │
   │    ┌──────────────────────────────┐   │
   │    │ Content: JSON with chunk data│   │
   │    │ Tags: [["p", recipient]]    │   │
   │    │ Unsigned event               │   │
   │    └──────────┬───────────────────┘   │
   │               │                        │
   │               ▼                        │
   │ 4. Create Seal (Kind 13)               │
   │    ┌──────────────────────────────┐   │
   │    │ Serialize rumor to JSON      │   │
   │    │ NIP-44 Encrypt:              │   │
   │    │   encryptNIP44(rumorJSON,    │   │
   │    │                senderNsec,   │   │
   │    │                recipientNpub)│   │
   │    │ Sign with sender's nsec      │   │
   │    └──────────┬───────────────────┘   │
   │               │                        │
   │               ▼                        │
   │ 5. Create Wrap (Kind 1059)            │
   │    ┌──────────────────────────────┐   │
   │    │ Generate random wrapNsec     │   │
   │    │ Serialize seal to JSON      │   │
   │    │ NIP-44 Encrypt:              │   │
   │    │   encryptNIP44(sealJSON,     │   │
   │    │                wrapNsec,     │   │
   │    │                recipientNpub)│   │
   │    │ Add tags: ["p", "t", "chunk"]│   │
   │    │ Sign with wrapNsec           │   │
   │    └──────────┬───────────────────┘   │
   │               │                        │
   │               ▼                        │
   │ 6. Publish Wrap to Nostr Relays       │
   │    ┌──────────────────────────────┐   │
   │    │ PublishWrap(wrap)            │   │
   │    │ Returns on first success     │   │
   │    │ Retries if all relays fail   │   │
   │    └──────────────────────────────┘   │
   └────────────────────────────────────────┘
```

### Receiving Flow (MessagePump.Run)

```
┌─────────────────────────────────────────────────────────────┐
│              RECEIVING MESSAGE FLOW                         │
└─────────────────────────────────────────────────────────────┘

1. Subscribe to Gift Wraps (Kind 1059)
   ┌─────────────────────────────────────┐
   │ Filter:                             │
   │   - Kind: 1059                      │
   │   - Tag "t": sessionID              │
   │   - Tag "p": localNpub (hex)        │
   └──────────────┬──────────────────────┘
                  │
                  ▼
2. Receive Wrap Event
   │
   ▼
3. Unwrap Gift (unwrapGift)
   ┌─────────────────────────────────────┐
   │ Extract wrap.PubKey (wrapNpub hex)  │
   │ NIP-44 Decrypt:                     │
   │   decryptNIP44(wrap.Content,        │
   │                recipientNsec,       │
   │                wrapNpubHex)         │
   │ Parse JSON → Seal Event             │
   └──────────────┬──────────────────────┘
                  │
                  ▼
4. Verify Seal Sender
   ┌─────────────────────────────────────┐
   │ Check seal.PubKey is in expected    │
   │ peers list                           │
   └──────────────┬──────────────────────┘
                  │
                  ▼
5. Unseal (unseal)
   ┌─────────────────────────────────────┐
   │ NIP-44 Decrypt:                     │
   │   decryptNIP44(seal.Content,        │
   │                recipientNsec,       │
   │                senderNpub)          │
   │ Parse JSON → Rumor Event             │
   └──────────────┬──────────────────────┘
                  │
                  ▼
6. Extract Chunk Data
   ┌─────────────────────────────────────┐
   │ Parse rumor.Content JSON:            │
   │   - session_id                       │
   │   - chunk (hash/index/total)         │
   │   - data (base64 chunk)              │
   │ Verify session_id matches            │
   └──────────────┬──────────────────────┘
                  │
                  ▼
7. Reassemble Chunks
   ┌─────────────────────────────────────┐
   │ Add chunk to ChunkAssembler          │
   │ Wait for all chunks (by hash)        │
   │ Verify SHA256 hash matches           │
   └──────────────┬──────────────────────┘
                  │
                  ▼
8. Deliver Plaintext to Handler
   ┌─────────────────────────────────────┐
   │ handler(reassembledPlaintext)        │
   └──────────────────────────────────────┘
```

### Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE MESSAGE FLOW                            │
└─────────────────────────────────────────────────────────────────────┘

SENDER SIDE                                    RECEIVER SIDE
═════════════                                  ═════════════

Plaintext Message
       │
       ▼
   [Chunking]
       │
       ▼
┌──────────────┐
│   RUMOR      │  Kind 14
│  (Unsigned)  │  Content: JSON chunk data
└──────┬───────┘
       │
       │ NIP-44 Encrypt
       │ (senderNsec, recipientNpub)
       ▼
┌──────────────┐
│    SEAL      │  Kind 13
│   (Signed)   │  Content: Encrypted rumor
└──────┬───────┘
       │
       │ NIP-44 Encrypt
       │ (wrapNsec, recipientNpub)
       │ + One-time key
       ▼
┌──────────────┐
│    WRAP      │  Kind 1059
│   (Signed)   │  Content: Encrypted seal
│ One-time key │  Tags: ["p", "t", "chunk"]
└──────┬───────┘
       │
       │ Publish to Nostr Relays
       │
       ═══════════════════════════════════════════════════════
                          NOSTR RELAYS
       ═══════════════════════════════════════════════════════
       │
       │ Subscribe (filter by kind:1059, tags)
       │
       ▼
┌──────────────┐
│    WRAP      │  Kind 1059
│   (Signed)   │  Received from relay
└──────┬───────┘
       │
       │ NIP-44 Decrypt
       │ (recipientNsec, wrapNpub)
       ▼
┌──────────────┐
│    SEAL      │  Kind 13
│   (Signed)   │  Decrypted from wrap
└──────┬───────┘
       │
       │ Verify sender
       │
       │ NIP-44 Decrypt
       │ (recipientNsec, senderNpub)
       ▼
┌──────────────┐
│   RUMOR      │  Kind 14
│  (Unsigned)  │  Decrypted from seal
└──────┬───────┘
       │
       │ Extract chunk data
       │
       ▼
   [Reassemble]
       │
       ▼
Plaintext Message
```

---

## Implementation Details

### Key Functions

#### 1. Conversation Key Generation

```go
func generateConversationKey(senderNsec string, recipientNpub string) ([32]byte, error)
```

**Process:**
1. Convert `senderNsec` from bech32 to hex (if needed)
2. Convert `recipientNpub` from bech32 to hex (if needed)
3. Call `nip44.GenerateConversationKey(recipientNpubHex, senderNsecHex)`
4. Returns 32-byte conversation key

**Important:** The conversation key is symmetric - both parties derive the same key:
- Sender: `GenerateConversationKey(recipientNpub, senderNsec)`
- Recipient: `GenerateConversationKey(senderNpub, recipientNsec)`

#### 2. Creating Rumor

```go
func createRumor(content string, senderPubkey string, recipientPubkey string) nostr.Event
```

**Creates:**
- Kind: 14 (Chat Message)
- Content: Plain JSON string
- Tags: `[["p", recipientPubkey]]`
- Unsigned (ID calculated but not signed)

#### 3. Creating Seal

```go
func createSeal(rumor nostr.Event, senderNsec string, recipientNpub string) (*nostr.Event, error)
```

**Process:**
1. Serialize rumor to JSON
2. Encrypt rumor JSON with NIP-44: `encryptNIP44(rumorJSON, senderNsec, recipientNpub)`
3. Create new event:
   - Kind: 13
   - Content: Encrypted string
   - Tags: Empty (for privacy)
4. Sign with sender's nsec

#### 4. Creating Wrap

```go
func createWrap(seal *nostr.Event, recipientNpub string, sessionID string, chunkTag string) (*nostr.Event, error)
```

**Process:**
1. Generate random one-time key: `wrapNsec = nostr.GeneratePrivateKey()`
2. Serialize seal to JSON
3. Encrypt seal JSON with NIP-44: `encryptNIP44(sealJSON, wrapNsec, recipientNpub)`
4. Convert recipient npub to hex for "p" tag
5. Create new event:
   - Kind: 1059 (Gift Wrap)
   - Content: Encrypted string
   - Tags: `[["p", recipientHex], ["t", sessionID], ["chunk", chunkTag]]`
6. Sign with wrapNsec (one-time key)

#### 5. Unwrapping

```go
func unwrapGift(wrap *nostr.Event, recipientNsec string) (*nostr.Event, error)
```

**Process:**
1. Extract `wrap.PubKey` (wrapNpub in hex format)
2. Decrypt: `decryptNIP44(wrap.Content, recipientNsec, wrapNpubHex)`
3. Parse decrypted JSON to get Seal event

#### 6. Unsealing

```go
func unseal(seal *nostr.Event, recipientNsec string, senderNpub string) (*nostr.Event, error)
```

**Process:**
1. Decrypt: `decryptNIP44(seal.Content, recipientNsec, senderNpub)`
2. Parse decrypted JSON to get Rumor event

### Security Properties

1. **End-to-End Encryption**: Only sender and recipient can decrypt
2. **Metadata Privacy**: Relays see gift wraps with random keys, not sender identity
3. **Forward Secrecy**: Each wrap uses a new one-time key
4. **Authentication**: Seals are signed, verifying sender identity
5. **Replay Protection**: Chunk hash verification prevents duplicate processing

### Event Kind Summary

| Kind | Name | Purpose | Signed | Encryption |
|------|------|---------|--------|------------|
| 14 | Rumor | Contains actual message data | No | None |
| 13 | Seal | Encrypted rumor, signed by sender | Yes | NIP-44 (sender → recipient) |
| 1059 | Wrap | Gift wrap with one-time key | Yes | NIP-44 (wrap key → recipient) |
| 30301 | Ready | Session coordination (ready signal) | Yes | None |
| 30302 | Complete | Session coordination (completion) | Yes | None |

### Chunking Details

Messages are split into chunks (default 16KB) for:
- **Relay compatibility**: Some relays have message size limits
- **Reliability**: Smaller chunks are less likely to fail transmission
- **Parallel processing**: Multiple chunks can be processed simultaneously

Each chunk includes:
- **Hash**: SHA256 of the complete message (all chunks)
- **Index**: Position in sequence (0, 1, 2, ...)
- **Total**: Total number of chunks
- **Session ID**: Links chunk to specific session
- **Data**: Base64-encoded chunk payload

The receiver reassembles chunks by:
1. Grouping by hash
2. Ordering by index
3. Verifying all chunks received (count matches total)
4. Verifying SHA256 hash of reassembled message

---

## Example: Complete Message Journey

Let's trace a simple message "Hello" from Alice to Bob:

### Step 1: Chunking
```
Message: "Hello"
Chunks: 1 chunk (small message)
Chunk 0: {
  "session_id": "session123",
  "chunk": "abc123hash/0/1",
  "data": "SGVsbG8="  // base64("Hello")
}
```

### Step 2: Create Rumor
```json
{
  "id": "rumor_id_calculated",
  "kind": 14,
  "pubkey": "alice_hex_pubkey",
  "created_at": 1234567890,
  "content": "{\"session_id\":\"session123\",\"chunk\":\"abc123hash/0/1\",\"data\":\"SGVsbG8=\"}",
  "tags": [["p", "bob_npub"]]
}
```

### Step 3: Create Seal
```json
{
  "id": "seal_id_calculated",
  "kind": 13,
  "pubkey": "alice_hex_pubkey",
  "created_at": 1234567891,
  "content": "NIP44_ENCRYPTED_RUMOR_JSON",
  "tags": [],
  "sig": "seal_signature"
}
```

### Step 4: Create Wrap
```json
{
  "id": "wrap_id_calculated",
  "kind": 1059,
  "pubkey": "random_onetime_pubkey",
  "created_at": 1234567892,
  "content": "NIP44_ENCRYPTED_SEAL_JSON",
  "tags": [
    ["p", "bob_hex_pubkey"],
    ["t", "session123"],
    ["chunk", "abc123hash/0/1"]
  ],
  "sig": "wrap_signature"
}
```

### Step 5: Publish
Wrap is published to Nostr relays. Relays see:
- Random one-time pubkey (not Alice's!)
- Encrypted content
- Tags for filtering

### Step 6: Receive & Decrypt
Bob receives wrap, unwraps → seal, unseals → rumor, extracts "Hello"

---

## Code References

- **Crypto functions**: `BBMTLib/tss/nostrtransport/crypto.go`
- **Messenger (sending)**: `BBMTLib/tss/nostrtransport/messenger.go`
- **Message pump (receiving)**: `BBMTLib/tss/nostrtransport/pump.go`
- **Client (publishing)**: `BBMTLib/tss/nostrtransport/client.go`

---

## Differences from NIP-59 Specification

This implementation follows NIP-59 closely but has some differences and extensions:

### ✅ Compliant Aspects

1. **Seal (Kind 13)**:
   - ✅ Uses kind:13
   - ✅ Tags are empty (as required)
   - ✅ Encrypted with NIP-44
   - ✅ Signed by sender

2. **Gift Wrap (Kind 1059)**:
   - ✅ Uses kind:1059
   - ✅ Includes "p" tag with recipient pubkey
   - ✅ Uses one-time random key
   - ✅ Encrypted with NIP-44

3. **Rumor**:
   - ✅ Unsigned event
   - ✅ Serialized to JSON before encryption

### Differences and Extensions

1. **Rumor Event Kind**:
   - **NIP-59**: Says any event kind can be a rumor (by removing signature)
   - **This Code**: Uses kind:14 specifically for rumors
   - **Note**: This is compliant since NIP-59 allows any kind; using kind:14 is valid

2. **Rumor Tags**:
   - **NIP-59**: Doesn't specify what tags rumors should have
   - **This Code**: Includes `[["p", recipientPubkey]]` tag in rumor
   - **Note**: This is an extension, not a violation

3. **Gift Wrap Tags**:
   - **NIP-59**: Says tags SHOULD include recipient's "p" tag
   - **This Code**: Includes "p" tag PLUS additional tags:
     - `["t", sessionID]` - for session filtering
     - `["chunk", "hash/index/total"]` - for chunk metadata
   - **Note**: NIP-59 doesn't prohibit additional tags; this is an extension for TSS-specific functionality

4. **Recipient Pubkey Format in Wrap**:
   - **NIP-59**: Doesn't specify format (bech32 or hex)
   - **This Code**: Converts recipient npub to hex format for "p" tag
   - **Note**: This is a compatibility improvement for stricter relays

5. **Rumor Content Structure**:
   - **NIP-59**: Generic - can wrap any event
   - **This Code**: Uses structured JSON with `session_id`, `chunk`, and `data` fields
   - **Note**: This is application-specific content, compliant with NIP-59

### Summary

The implementation is **fully compliant** with NIP-59 core requirements:
- ✅ Seals use kind:13 with empty tags
- ✅ Wraps use kind:1059 with recipient "p" tag
- ✅ Uses NIP-44 encryption
- ✅ Uses one-time keys for wraps

The differences are **extensions** that add TSS-specific functionality (chunking, session management) without violating the specification. The code correctly implements the rumor/seal/wrap pattern as specified in [NIP-59](https://www.e2encrypted.com/nostr/nips/59/).

---

## References

- [NIP-44: Encrypted Direct Messages](https://github.com/nostr-protocol/nips/blob/master/44.md)
- [NIP-59: Gift Wraps](https://www.e2encrypted.com/nostr/nips/59/)
- [NIP-19: bech32-encoded entities](https://github.com/nostr-protocol/nips/blob/master/19.md)

