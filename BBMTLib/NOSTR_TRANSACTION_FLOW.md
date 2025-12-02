# Nostr Transaction Flow

A simplified guide to how Nostr is used for TSS keygen and Bitcoin transactions in BoldWallet.

## Quick Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    HIGH-LEVEL FLOW                          │
└─────────────────────────────────────────────────────────────┘

KEYGEN:
  NostrJoinKeygen() → Setup → Exchange Messages → Get Keyshare

TRANSACTION:
  Pre-Agreement → Build TX → Sign Each Input → Broadcast
```

---

## Table of Contents

1. [Keygen Flow](#keygen-flow)
2. [Transaction Flow](#transaction-flow)
3. [Message Encryption Flow](#message-encryption-flow)
4. [Key Components](#key-components)

---

## Keygen Flow

### Overview

Generate a shared cryptographic key using Nostr for communication between parties.

### Steps

```
1. Setup
   ├─ Derive npub from nsec
   ├─ Create Nostr client (connect to relays)
   └─ Create session coordinator

2. Coordination
   ├─ Publish "ready" event (kind:30301)
   ├─ Wait for all peers to publish "ready"
   └─ All parties synchronized

3. Key Generation
   ├─ Start TSS keygen protocol
   ├─ Exchange encrypted messages via Nostr
   │   └─ Messages: Rumor → Seal → Wrap (NIP-44/NIP-59)
   └─ Receive keyshare when complete

4. Completion
   ├─ Publish "complete" event (kind:30302)
   └─ Return keyshare JSON with Nostr fields
```

### Entry Point

**Function**: `NostrJoinKeygen()` (`tss/mpc_nostr.go:132`)

**Parameters**:
- `relaysCSV`: Comma-separated Nostr relay URLs
- `partyNsec`: Your Nostr secret key (nsec1...)
- `partiesNpubsCSV`: All party npubs (including yours)
- `sessionID`: Unique session identifier
- `sessionKey`: Session encryption key (hex)
- `chaincode`: Chain code for key derivation
- `ppmPath`: Path to pre-params file (optional)

**Returns**: Keyshare JSON with Nostr credentials

---

## Transaction Flow

### Overview

Send Bitcoin using Nostr for secure multi-party signing.

### Phase 1: Pre-Agreement

**Purpose**: Agree on fees and generate session parameters

```
1. Calculate session flag
   └─ SHA256(npubs + balance + amount)

2. Exchange with peer
   ├─ Send: <nonce>:<fees>
   ├─ Receive: <peerNonce>:<peerFees>
   └─ Messages encrypted via Nostr (Rumor/Seal/Wrap)

3. Calculate session parameters
   ├─ fullNonce = sorted join of nonces
   ├─ averageFees = (localFees + peerFees) / 2
   ├─ sessionID = SHA256(npubs + balance + amount + fullNonce)
   └─ sessionKey = SHA256(npubs + sessionID)
```

### Phase 2: Build Transaction

```
1. Fetch UTXOs
   └─ Get available unspent outputs from sender address

2. Select UTXOs
   └─ Choose UTXOs covering amount + fees

3. Build Transaction
   ├─ Add inputs (selected UTXOs)
   ├─ Add output (recipient address + amount)
   └─ Add change output (if needed)
```

### Phase 3: Sign Each Input

**For each UTXO input:**

```
1. Calculate Sighash
   ├─ For SegWit: CalcWitnessSigHash()
   └─ For Legacy: CalcSignatureHash()

2. Run Keysign via Nostr
   ├─ Setup session (ready/await coordination)
   ├─ Exchange TSS messages (encrypted via Nostr)
   └─ Receive signature

3. Apply Signature
   ├─ For SegWit: Add to Witness field
   └─ For Legacy: Add to SignatureScript

4. Validate
   └─ Verify script execution succeeds
```

### Phase 4: Broadcast

```
1. Serialize transaction
2. Broadcast to Bitcoin network
3. Return transaction ID
```

### Entry Point

**Function**: `NostrMpcSendBTC()` (`tss/mpc_nostr.go:569`)

**Parameters**:
- `relaysCSV`: Nostr relay URLs
- `partyNsec`: Your Nostr secret key
- `partiesNpubsCSV`: All party npubs
- `sessionID`: Session identifier
- `sessionKey`: Session encryption key
- `keyshareJSON`: Your keyshare from keygen
- `derivePath`: HD derivation path
- `publicKey`: Public key for address
- `senderAddress`: Source Bitcoin address
- `receiverAddress`: Destination Bitcoin address
- `amountSatoshi`: Amount to send
- `estimatedFee`: Estimated fee in satoshis

**Returns**: Transaction ID (hex string)

---

## Message Encryption Flow

### Outgoing Message (Sending)

When TSS library needs to send a message:

```
TSS Message
    │
    ├─> Encode to JSON + Base64
    │
    └─> messenger.SendMessage()
        │
        ├─> Chunk message (if large)
        │
        └─> For each chunk:
            │
            ├─> Create RUMOR (kind:14)
            │   └─> JSON with chunk data
            │
            ├─> Create SEAL (kind:13)
            │   ├─> Encrypt rumor with NIP-44
            │   └─> Sign with sender's key
            │
            ├─> Create WRAP (kind:1059)
            │   ├─> Encrypt seal with NIP-44
            │   ├─> Use one-time random key
            │   └─> Add tags: ["p", "t", "chunk"]
            │
            └─> Publish to Nostr relays
```

### Incoming Message (Receiving)

When receiving a message from Nostr:

```
Nostr Relay Event (kind:1059)
    │
    ├─> Unwrap gift wrap
    │   └─> Decrypt with NIP-44 → Get SEAL
    │
    ├─> Unseal
    │   └─> Decrypt seal with NIP-44 → Get RUMOR
    │
    ├─> Extract chunk data
    │   └─> Parse rumor JSON
    │
    ├─> Reassemble chunks
    │   └─> Wait for all chunks, verify hash
    │
    └─> Deliver to TSS service
        └─> TSS processes message
```

### Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│              MESSAGE ENCRYPTION LAYERS                      │
└─────────────────────────────────────────────────────────────┘

SENDER:
  Plaintext → Chunk → Rumor → Seal → Wrap → Nostr Relay

RECEIVER:
  Nostr Relay → Wrap → Seal → Rumor → Chunk → Plaintext

Encryption:
  Rumor → Seal: NIP-44 (sender key → recipient)
  Seal → Wrap:  NIP-44 (one-time key → recipient)
```

---

## Key Components

### 1. Nostr Client (`nostrtransport.Client`)

**Purpose**: Manages connections to Nostr relays

**Key Functions**:
- `NewClient()`: Connect to relays
- `Publish()`: Publish events (ready, complete)
- `PublishWrap()`: Publish gift wrap events
- `Subscribe()`: Subscribe to events

**Location**: `tss/nostrtransport/client.go`

### 2. Messenger (`nostrtransport.Messenger`)

**Purpose**: Encrypts and sends TSS messages

**Key Functions**:
- `SendMessage()`: Encrypt, chunk, and publish messages
  - Creates rumor/seal/wrap layers
  - Handles chunking for large messages
  - Publishes to relays

**Location**: `tss/nostrtransport/messenger.go`

### 3. Message Pump (`nostrtransport.MessagePump`)

**Purpose**: Receives and decrypts messages

**Key Functions**:
- `Run()`: Subscribe to events and process messages
  - Unwraps gift wraps
  - Unseals encrypted content
  - Reassembles chunks
  - Delivers to TSS service

**Location**: `tss/nostrtransport/pump.go`

### 4. Session Coordinator (`nostrtransport.SessionCoordinator`)

**Purpose**: Coordinates session start/end

**Key Functions**:
- `PublishReady()`: Announce party is ready
- `AwaitPeers()`: Wait for all peers to be ready
- `PublishComplete()`: Announce completion

**Location**: `tss/nostrtransport/session.go`

### 5. TSS Service (`tss.ServiceImpl`)

**Purpose**: Manages TSS protocol state

**Key Functions**:
- `KeygenECDSA()`: Start key generation
- `KeysignECDSA()`: Start signing operation
- Processes incoming/outgoing TSS protocol messages

**Location**: `tss/tss.go`

---

## Event Kinds Used

| Kind | Name | Purpose |
|------|------|---------|
| **14** | Rumor | Unsigned event with message content |
| **13** | Seal | NIP-44 encrypted rumor, signed by sender |
| **1059** | Gift Wrap | NIP-59 wrapped seal with one-time key |
| **30301** | Ready | Session coordination - party ready |
| **30302** | Complete | Session coordination - party done |

---

## Common Patterns

### Pattern 1: Session Setup

Every operation (keygen, keysign) follows this pattern:

```
1. Create client → Connect to relays
2. Publish ready → Wait for peers
3. Exchange messages → Process protocol
4. Publish complete → Cleanup
```

### Pattern 2: Message Exchange

All TSS messages are encrypted the same way:

```
Plaintext → Chunk → Rumor → Seal → Wrap → Relay
```

### Pattern 3: Per-Input Signing

For Bitcoin transactions with multiple inputs:

```
For each UTXO:
  1. Calculate sighash
  2. Run keysign (with session setup)
  3. Apply signature
  4. Validate
```

---

## Code Locations

### Main Entry Points
- **Keygen**: `tss/mpc_nostr.go` → `NostrJoinKeygen()`
- **Transaction**: `tss/mpc_nostr.go` → `NostrMpcSendBTC()`

### Transport Layer
- **Client**: `tss/nostrtransport/client.go`
- **Messenger**: `tss/nostrtransport/messenger.go`
- **Pump**: `tss/nostrtransport/pump.go`
- **Session**: `tss/nostrtransport/session.go`
- **Crypto**: `tss/nostrtransport/crypto.go`

### TSS Core
- **Service**: `tss/tss.go`
- **Bitcoin**: `tss/btc.go`
- **Common**: `tss/common.go`

---

## Quick Reference

### Starting Keygen
```go
keyshareJSON := NostrJoinKeygen(
    relaysCSV,      // "wss://relay1.com,wss://relay2.com"
    partyNsec,      // "nsec1..."
    partiesNpubsCSV, // "npub1...,npub2..."
    sessionID,      // Unique session ID
    sessionKey,     // Session encryption key (hex)
    chaincode,      // Chain code (hex)
    ppmPath,        // Pre-params path or ""
)
```

### Sending Bitcoin
```go
txid := NostrMpcSendBTC(
    relaysCSV,
    partyNsec,
    partiesNpubsCSV,
    sessionID,
    sessionKey,
    keyshareJSON,
    derivePath,     // "m/84'/0'/0'/0/0"
    publicKey,      // Hex public key
    senderAddress,  // Bitcoin address
    receiverAddress,// Bitcoin address
    amountSatoshi,  // Amount in satoshis
    estimatedFee,   // Fee in satoshis
)
```

---

## Troubleshooting

### Common Issues

1. **Peers not ready**
   - Check relay connectivity
   - Verify all parties are online
   - Check session ID matches

2. **Messages not received**
   - Verify relay filters (kind:1059, tags)
   - Check recipient npub in wrap tags
   - Ensure relays support gift wraps

3. **Decryption fails**
   - Verify nsec/npub match
   - Check session key is correct
   - Ensure NIP-44 encryption is working

---

## Related Documentation

- [NIP-44 Encryption and Rumor/Seal/Wrap Pattern](./NIP44_RUMOR_SEAL_WRAP.md)
- [Code Simplification Proposal](./SIMPLIFICATION_PROPOSAL.md)
