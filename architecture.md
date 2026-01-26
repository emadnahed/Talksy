# Talksy Backend Architecture

> A horizontally scalable real-time AI assistant backend built with NestJS

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Module Architecture](#module-architecture)
5. [Authentication System](#authentication-system)
6. [Session Management](#session-management)
7. [AI Provider System](#ai-provider-system)
8. [Tools System](#tools-system)
9. [WebSocket Gateway](#websocket-gateway)
10. [Storage Layer](#storage-layer)
11. [Rate Limiting](#rate-limiting)
12. [API Endpoints](#api-endpoints)
13. [Data Flow Patterns](#data-flow-patterns)
14. [Configuration](#configuration)
15. [Design Patterns](#design-patterns)
16. [Horizontal Scaling](#horizontal-scaling)

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TALKSY BACKEND                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │
│   │   Clients    │    │   Clients    │    │   Clients    │                 │
│   │  (Browser)   │    │   (Mobile)   │    │    (CLI)     │                 │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                 │
│          │                   │                   │                          │
│          └───────────────────┼───────────────────┘                          │
│                              │                                              │
│                              ▼                                              │
│          ┌───────────────────────────────────────┐                          │
│          │         Load Balancer / Gateway        │                          │
│          └───────────────────┬───────────────────┘                          │
│                              │                                              │
│       ┌──────────────────────┼──────────────────────┐                       │
│       │                      │                      │                       │
│       ▼                      ▼                      ▼                       │
│  ┌─────────┐           ┌─────────┐           ┌─────────┐                   │
│  │ Talksy  │           │ Talksy  │           │ Talksy  │                   │
│  │ Node 1  │           │ Node 2  │           │ Node N  │                   │
│  └────┬────┘           └────┬────┘           └────┬────┘                   │
│       │                     │                     │                        │
│       └─────────────────────┼─────────────────────┘                        │
│                             │                                              │
│                             ▼                                              │
│          ┌──────────────────────────────────────┐                          │
│          │              Redis Cluster            │                          │
│          │  (Sessions, Tokens, WebSocket Pub/Sub)│                          │
│          └──────────────────────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **JWT Authentication** - Stateless access tokens for horizontal scaling
- **Real-time Communication** - WebSocket-based messaging with Socket.IO
- **Multiple AI Providers** - Pluggable architecture (Mock, OpenAI, Groq)
- **Tool System** - Extensible, sandboxed tool execution
- **Session Management** - Automatic lifecycle with reconnection support
- **Rate Limiting** - Sliding window algorithm for abuse prevention
- **Redis Integration** - Optional Redis for horizontal scaling

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | NestJS 10.x |
| **Language** | TypeScript 5.x |
| **Runtime** | Node.js 18+ |
| **WebSocket** | Socket.IO 4.x |
| **Cache/Storage** | Redis (ioredis) |
| **Authentication** | JWT, bcrypt, Passport.js |
| **Validation** | class-validator, Joi |
| **AI Providers** | OpenAI API, Groq API |
| **Testing** | Jest, Supertest |

---

## Project Structure

```
src/
├── main.ts                      # Application bootstrap
├── app.module.ts                # Root module
├── app.controller.ts            # Health & info endpoints
├── app.service.ts               # App service
│
├── config/
│   └── config.schema.ts         # Joi validation schema
│
├── auth/                        # Authentication Module
│   ├── auth.module.ts
│   ├── auth.service.ts          # JWT & refresh token logic
│   ├── auth.controller.ts       # Auth endpoints
│   ├── auth.guard.ts            # JWT guard (HTTP + WebSocket)
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── dto/
│   │   ├── register.dto.ts
│   │   ├── login.dto.ts
│   │   └── refresh-token.dto.ts
│   └── interfaces/
│       ├── jwt-payload.interface.ts
│       └── auth-user.interface.ts
│
├── user/                        # User Module
│   ├── user.module.ts
│   ├── user.service.ts          # User CRUD, password hashing
│   ├── user.entity.ts
│   └── interfaces/
│       └── user.interface.ts
│
├── session/                     # Session Module
│   ├── session.module.ts
│   ├── session.service.ts       # Session lifecycle
│   ├── constants/
│   ├── dto/
│   └── interfaces/
│
├── ai/                          # AI Provider Module
│   ├── ai.module.ts
│   ├── ai.service.ts            # Provider orchestration
│   ├── providers/
│   │   ├── mock-ai.provider.ts
│   │   ├── openai.provider.ts
│   │   └── groq.provider.ts
│   └── interfaces/
│
├── gateway/                     # WebSocket Gateway
│   ├── gateway.module.ts
│   ├── assistant.gateway.ts     # Main WebSocket handler
│   ├── dto/
│   └── filters/
│       └── ws-exception.filter.ts
│
├── tools/                       # Tools Module
│   ├── tools.module.ts
│   ├── services/
│   │   ├── tool-registry.service.ts
│   │   └── tool-executor.service.ts
│   └── interfaces/
│
├── storage/                     # Storage Module
│   ├── storage.module.ts
│   ├── storage.service.ts
│   ├── adapters/
│   │   ├── in-memory-storage.adapter.ts
│   │   └── redis-storage.adapter.ts
│   └── interfaces/
│
├── rate-limit/                  # Rate Limiting Module
│   ├── rate-limit.module.ts
│   ├── rate-limit.service.ts
│   ├── rate-limit.guard.ts
│   └── interfaces/
│
├── adapters/
│   └── redis-io.adapter.ts      # Socket.IO Redis adapter
│
└── common/                      # Shared Utilities
    ├── dto/
    ├── guards/
    ├── interceptors/
    ├── filters/
    └── middleware/
```

---

## Module Architecture

### Dependency Graph

```
                              AppModule
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
   ConfigModule              EventEmitter             StorageModule
   (global)                  Module (global)            (global)
        │                                                   │
        │         ┌─────────────────────────────────────────┤
        │         │                                         │
        ▼         ▼                                         ▼
   UserModule  AuthModule                           SessionModule
        │         │                                   (global)
        │    ┌────┴────┐                                   │
        │    │         │                                   │
        └────┤   JWT   │                                   │
             │ Module  │                                   │
             └─────────┘                                   │
                                                           │
        ┌──────────────────────────────────────────────────┤
        │                                                  │
        ▼                                                  ▼
   AIModule                                         GatewayModule
   (global)                                              │
        │                                                 │
        ├── MockProvider                                  │
        ├── OpenAIProvider                                │
        └── GroqProvider                                  │
                                                          │
        ┌─────────────────────────────────────────────────┤
        │                                                 │
        ▼                                                 ▼
   ToolsModule                                    RateLimitModule
   (global)                                         (global)
        │
        ├── ToolRegistryService
        └── ToolExecutorService
```

### Module Responsibilities

| Module | Scope | Responsibility |
|--------|-------|----------------|
| **ConfigModule** | Global | Environment configuration with Joi validation |
| **AuthModule** | Local | JWT authentication, user login/register |
| **UserModule** | Local | User CRUD, password hashing with bcrypt |
| **SessionModule** | Global | Conversation session lifecycle management |
| **AIModule** | Global | AI provider orchestration and fallback |
| **GatewayModule** | Local | WebSocket event handling |
| **ToolsModule** | Global | Tool registration and execution |
| **StorageModule** | Global | Redis/In-memory storage abstraction |
| **RateLimitModule** | Global | Request rate limiting |

---

## Authentication System

### Token Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     TOKEN ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ACCESS TOKEN (Short-lived)         REFRESH TOKEN (Long-lived) │
│   ┌─────────────────────────┐        ┌─────────────────────────┐│
│   │ {                       │        │ {                       ││
│   │   sub: "user-id",       │        │   sub: "user-id",       ││
│   │   email: "user@...",    │        │   tokenId: "uuid",      ││
│   │   iat: 1234567890,      │        │   iat: 1234567890,      ││
│   │   exp: +15 minutes      │        │   exp: +7 days          ││
│   │ }                       │        │ }                       ││
│   └─────────────────────────┘        └─────────────────────────┘│
│            │                                    │                │
│            │ Stateless                          │ Stored in      │
│            │ (verified locally)                 │ Redis/Memory   │
│            │                                    │ (revocable)    │
│            ▼                                    ▼                │
│   ┌─────────────────────────────────────────────────────────────┤
│   │              HORIZONTAL SCALING SUPPORT                     │
│   │  - Access tokens verified on ANY instance                   │
│   │  - Refresh tokens stored centrally in Redis                 │
│   │  - Token rotation on refresh                                │
│   └─────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Authentication Flow

```
┌──────────┐                                              ┌──────────┐
│  Client  │                                              │  Server  │
└────┬─────┘                                              └────┬─────┘
     │                                                         │
     │  POST /auth/register {email, password}                  │
     │────────────────────────────────────────────────────────>│
     │                                                         │
     │  ┌─────────────────────────────────────────────────────┐│
     │  │ 1. Validate input (DTO)                             ││
     │  │ 2. Check email not registered                       ││
     │  │ 3. Hash password (bcrypt, 12 rounds)                ││
     │  │ 4. Create user in storage                           ││
     │  │ 5. Generate access + refresh tokens                 ││
     │  │ 6. Store refresh token (Redis/memory)               ││
     │  └─────────────────────────────────────────────────────┘│
     │                                                         │
     │<────────────────────────────────────────────────────────│
     │  {accessToken, refreshToken, expiresIn, user}           │
     │                                                         │
     │  GET /auth/me                                           │
     │  Authorization: Bearer <accessToken>                    │
     │────────────────────────────────────────────────────────>│
     │                                                         │
     │  ┌─────────────────────────────────────────────────────┐│
     │  │ 1. Extract token from header                        ││
     │  │ 2. Verify JWT signature                             ││
     │  │ 3. Return user info                                 ││
     │  └─────────────────────────────────────────────────────┘│
     │                                                         │
     │<────────────────────────────────────────────────────────│
     │  {id, email, createdAt}                                 │
     │                                                         │
     │  POST /auth/refresh {refreshToken}                      │
     │────────────────────────────────────────────────────────>│
     │                                                         │
     │  ┌─────────────────────────────────────────────────────┐│
     │  │ 1. Verify refresh token JWT                         ││
     │  │ 2. Check token not revoked                          ││
     │  │ 3. Revoke old refresh token (rotation)              ││
     │  │ 4. Generate new token pair                          ││
     │  └─────────────────────────────────────────────────────┘│
     │                                                         │
     │<────────────────────────────────────────────────────────│
     │  {accessToken, refreshToken, expiresIn}                 │
     │                                                         │
```

### JWT Guard Behavior

| Context | Token Source | On Invalid |
|---------|--------------|------------|
| **HTTP** | `Authorization: Bearer <token>` | 401 Unauthorized |
| **WebSocket** | `handshake.auth.token` or query param | WsException |
| **Dev Mode** | Optional (bypass enabled) | Allow through |

---

## Session Management

### Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    ┌──────────────┐                                              │
│    │   CLIENT     │                                              │
│    │  CONNECTS    │                                              │
│    └──────┬───────┘                                              │
│           │                                                      │
│           ▼                                                      │
│    ┌──────────────┐      TTL: 15 min (configurable)             │
│    │   ACTIVE     │◄────────────────────────────────┐           │
│    │   SESSION    │                                  │           │
│    └──────┬───────┘                                  │           │
│           │                                          │           │
│    ┌──────┴──────┐                            (activity)        │
│    │             │                                  │           │
│    ▼             ▼                                  │           │
│ (timeout)   (disconnect)                            │           │
│    │             │                                  │           │
│    ▼             ▼                                  │           │
│ ┌──────┐   ┌────────────┐                          │           │
│ │EXPIRE│   │DISCONNECTED│     Grace: 5 min         │           │
│ │      │   │  (grace)   │◄─────────────────┐       │           │
│ └──┬───┘   └─────┬──────┘                  │       │           │
│    │             │                         │       │           │
│    │      ┌──────┴──────┐                  │       │           │
│    │      │             │                  │       │           │
│    │      ▼             ▼                  │       │           │
│    │  (timeout)    (reconnect)             │       │           │
│    │      │             │                  │       │           │
│    ▼      ▼             ▼                  │       │           │
│ ┌────────────┐   ┌──────────────┐          │       │           │
│ │  DESTROY   │   │   RESTORE    │──────────┴───────┘           │
│ │  SESSION   │   │   SESSION    │                               │
│ └────────────┘   │ (keep history)│                               │
│                  └──────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Session Data Structure

```typescript
interface Session {
  id: string;                      // Client ID
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  status: 'active' | 'disconnected';
  disconnectedAt?: Date;
  conversationHistory: Message[];  // Max 100 messages
  metadata?: Record<string, unknown>;
}
```

### Session Events

| Event | Trigger | Client Receives |
|-------|---------|-----------------|
| `SESSION_CREATED` | New connection | `{sessionId, expiresAt}` |
| `SESSION_RESTORED` | Reconnection | `{sessionId, history}` |
| `session_info` | Client request | `{status, messageCount, expiresAt}` |
| `conversation_history` | Client request | `Message[]` |

---

## AI Provider System

### Provider Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI PROVIDER SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                      AIService                            │  │
│   │  ┌─────────────────────────────────────────────────────┐ │  │
│   │  │  • Provider registration                            │ │  │
│   │  │  • Provider selection (config-based)                │ │  │
│   │  │  • Automatic fallback to Mock                       │ │  │
│   │  │  • generateCompletion() / generateStream()          │ │  │
│   │  └─────────────────────────────────────────────────────┘ │  │
│   └────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│   ┌───────────┐      ┌───────────┐      ┌───────────┐          │
│   │   Mock    │      │  OpenAI   │      │   Groq    │          │
│   │ Provider  │      │ Provider  │      │ Provider  │          │
│   ├───────────┤      ├───────────┤      ├───────────┤          │
│   │ Always    │      │ Requires  │      │ Free tier │          │
│   │ Available │      │ API Key   │      │ 30 req/min│          │
│   │           │      │           │      │           │          │
│   │ Simulated │      │ GPT-3.5   │      │ Llama 3.1 │          │
│   │ responses │      │ GPT-4     │      │ Mixtral   │          │
│   └───────────┘      └───────────┘      └───────────┘          │
│         ▲                                                       │
│         │                                                       │
│         └─────── FALLBACK (if configured provider unavailable) │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Interface

```typescript
interface AIProvider {
  name: string;
  isAvailable: boolean;

  generateCompletion(
    messages: Message[],
    options?: AICompletionOptions
  ): Promise<AICompletionResult>;

  generateStream?(
    messages: Message[],
    options?: AICompletionOptions
  ): AsyncGenerator<AIStreamChunk>;
}
```

### Provider Configuration

| Provider | Env Variables | Default Model |
|----------|---------------|---------------|
| **Mock** | `AI_MOCK_RESPONSE_DELAY_MS` | N/A |
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL` | gpt-3.5-turbo |
| **Groq** | `GROQ_API_KEY`, `GROQ_MODEL` | llama-3.1-8b-instant |

---

## Tools System

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      TOOLS SYSTEM                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                 ToolRegistryService                     │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Register tools with definitions + handlers    │  │    │
│   │  │  • Organize by category                          │  │    │
│   │  │  • Lookup tools by name                          │  │    │
│   │  │  • List available tools                          │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│                            ▼                                     │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                 ToolExecutorService                     │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Parameter validation                          │  │    │
│   │  │  • Timeout enforcement (30s default)             │  │    │
│   │  │  • Concurrency control (5 per session)           │  │    │
│   │  │  • Error handling & reporting                    │  │    │
│   │  │  • Execution metrics                             │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────────────────────────────────────┘    │
│                                                                  │
│   Tool Categories:                                               │
│   ┌──────────┬──────────┬───────────────┬──────────┬────────┐  │
│   │ UTILITY  │   DATA   │ COMMUNICATION │  SYSTEM  │ CUSTOM │  │
│   └──────────┴──────────┴───────────────┴──────────┴────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tool Definition

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ParameterSchema>;
    required?: string[];
  };
  category?: ToolCategory;
  timeout?: number;  // ms
}

type ToolHandler<TParams, TResult> = (
  params: TParams,
  context: ToolExecutionContext
) => Promise<TResult>;
```

### Tool Execution Flow

```
Client: call_tool {toolName, parameters, callId}
         │
         ▼
┌─────────────────────────────────────────┐
│ 1. Validate request format              │
│ 2. Lookup tool in registry              │
│ 3. Validate parameters against schema   │
│ 4. Check concurrency limits             │
│ 5. Execute with timeout                 │
│ 6. Return result with metrics           │
└─────────────────────────────────────────┘
         │
         ▼
Client: tool_result {callId, result, executionTimeMs}
```

---

## WebSocket Gateway

### Event Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    WEBSOCKET EVENTS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CLIENT → SERVER (Subscribe)           SERVER → CLIENT (Emit)  │
│   ─────────────────────────            ─────────────────────    │
│                                                                  │
│   Message Flow:                                                  │
│   ├── user_message        ────────►    assistant_response       │
│   └── user_message_stream ────────►    stream_start             │
│                                        stream_chunk              │
│                                        stream_end                │
│                                                                  │
│   Session Management:                                            │
│   ├── get_history         ────────►    conversation_history     │
│   └── get_session_info    ────────►    session_info             │
│                                                                  │
│   Tool Operations:                                               │
│   ├── list_tools          ────────►    tools_list               │
│   ├── call_tool           ────────►    tool_result              │
│   └── get_tool_info       ────────►    tool_info                │
│                                                                  │
│   System Events:                                                 │
│   └── (connection)        ────────►    SESSION_CREATED          │
│                                        SESSION_RESTORED          │
│                                        rate_limit                │
│                                        error                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Response Format

```typescript
interface WsResponse<T> {
  data: T | null;
  code: string;           // MSG_SUCCESS, MSG_ERROR, etc.
  status: 'success' | 'error';
  description: string;
  timestamp: number;
}
```

---

## Storage Layer

### Adapter Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│                    STORAGE ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌────────────────────────────────────────────────────────┐    │
│   │                   StorageService                        │    │
│   │  ┌──────────────────────────────────────────────────┐  │    │
│   │  │  • Adapter selection (Redis > In-Memory)         │  │    │
│   │  │  • Automatic fallback on failure                 │  │    │
│   │  │  • Unified interface for all storage ops         │  │    │
│   │  └──────────────────────────────────────────────────┘  │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│              ┌─────────────┴─────────────┐                      │
│              │                           │                      │
│              ▼                           ▼                      │
│   ┌───────────────────┐       ┌───────────────────┐            │
│   │  Redis Adapter    │       │ In-Memory Adapter │            │
│   ├───────────────────┤       ├───────────────────┤            │
│   │ • Persistent      │       │ • Ephemeral       │            │
│   │ • Horizontal scale│       │ • Single instance │            │
│   │ • TTL support     │       │ • Fast access     │            │
│   │ • Pub/Sub capable │       │ • No dependencies │            │
│   └───────────────────┘       └───────────────────┘            │
│              ▲                           ▲                      │
│              │                           │                      │
│              └───────── FALLBACK ────────┘                      │
│                    (on Redis failure)                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Patterns

| Data Type | Key Pattern | TTL |
|-----------|-------------|-----|
| Sessions | `talksy:session:{clientId}` | 15 min |
| Users | `talksy:user:{userId}` | Persistent |
| Email Index | `talksy:user:email:{email}` | Persistent |
| Refresh Tokens | `talksy:refresh:{tokenId}` | 7 days |

---

## Rate Limiting

### Sliding Window Algorithm

```
┌─────────────────────────────────────────────────────────────────┐
│                 SLIDING WINDOW RATE LIMITING                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Window: 60 seconds │ Max Requests: 10                          │
│                                                                  │
│   Time ───────────────────────────────────────────────────────► │
│                                                                  │
│   │◄──────────── 60 second window ──────────────►│              │
│                                                                  │
│   │  X  X     X  X  X     X  X     X  │  X  X     │              │
│   │  1  2     3  4  5     6  7     8  │  9  10    │              │
│   │                                   │           │              │
│   └───────────────────────────────────┴───────────┘              │
│                                       │                          │
│                                  Current Time                    │
│                                                                  │
│   Requests 1-8: Outside window (not counted)                    │
│   Requests 9-10: Inside window (counted)                        │
│   Remaining: 8 requests                                          │
│                                                                  │
│   If client exceeds limit:                                       │
│   ├── Return retryAfter (seconds until oldest expires)          │
│   ├── Emit 'rate_limit' event                                   │
│   └── Reject request with 429                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Rate Limit Response

```typescript
interface RateLimitResult {
  allowed: boolean;
  remaining: number;      // Requests left in window
  resetAt: number;        // Timestamp when limit resets
  retryAfter?: number;    // Seconds to wait (if limited)
}
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login, get tokens | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Revoke refresh token | No |
| GET | `/auth/me` | Get current user | Yes |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Application info |
| GET | `/health` | Simple health check |
| GET | `/health/detailed` | Detailed component status |

---

## Data Flow Patterns

### Message Processing Flow

```
┌─────────┐     user_message      ┌─────────────┐
│ Client  │ ───────────────────► │   Gateway   │
└─────────┘                       └──────┬──────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
             ┌──────────┐         ┌──────────┐         ┌──────────┐
             │ Validate │         │   Rate   │         │ Session  │
             │ Message  │         │  Limit   │         │  Check   │
             └──────────┘         └──────────┘         └──────────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    Store     │
                                  │   Message    │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │  AIService   │
                                  │  Completion  │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │    Store     │
                                  │   Response   │
                                  └──────┬───────┘
                                         │
                                         ▼
┌─────────┐   assistant_response  ┌─────────────┐
│ Client  │ ◄─────────────────── │   Gateway   │
└─────────┘                       └─────────────┘
```

### Token Validation Flow

```
Request with Bearer Token
         │
         ▼
┌─────────────────────────────────────────┐
│       Extract Token from Header         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Verify JWT Signature            │
│      (using JWT_SECRET)                 │
└─────────────────────────────────────────┘
         │
    ┌────┴────┐
    │         │
  Valid    Invalid
    │         │
    ▼         ▼
┌────────┐ ┌────────────────┐
│ Attach │ │ Throw 401      │
│ User   │ │ Unauthorized   │
│ to Req │ └────────────────┘
└────────┘
```

---

## Configuration

### Environment Variables

```bash
# Core
NODE_ENV=development|production|test
PORT=3000
CORS_ORIGIN=*

# Authentication
AUTH_ENABLED=true
AUTH_BYPASS_IN_DEV=true
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

# AI Providers
AI_PROVIDER=mock|openai|groq
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-3.5-turbo
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.1-8b-instant

# Redis
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=talksy:

# Session
SESSION_TTL_MS=900000
SESSION_MAX_HISTORY=100
SESSION_DISCONNECT_GRACE_MS=300000

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=10

# Logging
LOG_LEVEL=log
LOG_FORMAT=json
```

---

## Design Patterns

| Pattern | Usage |
|---------|-------|
| **Adapter** | Storage (Redis/Memory), AI Providers, WebSocket Adapter |
| **Provider** | AIService with pluggable providers |
| **Guard** | JwtAuthGuard, RateLimitGuard, ApiKeyGuard |
| **Interceptor** | ResponseInterceptor, WsLoggingInterceptor |
| **Factory** | Token generation, Session creation |
| **Observer** | EventEmitter for tool events |
| **Strategy** | Different AI/storage strategies |
| **Facade** | AIService, StorageService |
| **Decorator** | @CurrentUser, NestJS decorators |
| **Singleton** | Global modules |

---

## Horizontal Scaling

### Multi-Instance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   HORIZONTAL SCALING                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                    ┌─────────────────┐                          │
│                    │  Load Balancer  │                          │
│                    └────────┬────────┘                          │
│                             │                                    │
│         ┌───────────────────┼───────────────────┐               │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│   ┌──────────┐        ┌──────────┐        ┌──────────┐         │
│   │ Instance │        │ Instance │        │ Instance │         │
│   │    1     │        │    2     │        │    N     │         │
│   └────┬─────┘        └────┬─────┘        └────┬─────┘         │
│        │                   │                   │                │
│        └───────────────────┼───────────────────┘                │
│                            │                                    │
│                            ▼                                    │
│              ┌─────────────────────────┐                       │
│              │     Redis Cluster       │                       │
│              ├─────────────────────────┤                       │
│              │ • Session Storage       │                       │
│              │ • User Data             │                       │
│              │ • Refresh Tokens        │                       │
│              │ • Socket.IO Pub/Sub     │                       │
│              └─────────────────────────┘                       │
│                                                                  │
│   Key Enablers:                                                 │
│   ✓ Stateless JWT access tokens (verify on any instance)       │
│   ✓ Redis-backed session storage (shared state)                │
│   ✓ Redis Socket.IO adapter (cross-instance messaging)         │
│   ✓ Centralized refresh token storage                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Scaling Checklist

- [x] Stateless JWT authentication
- [x] Redis session storage
- [x] Redis refresh token storage
- [x] Socket.IO Redis adapter
- [x] Graceful fallback to in-memory
- [ ] Redis caching layer (optional enhancement)
- [ ] Database clustering (if using persistent DB)

---

## Summary

Talksy is a production-ready, horizontally scalable real-time AI assistant backend featuring:

| Feature | Implementation |
|---------|----------------|
| **Authentication** | JWT with refresh token rotation |
| **Real-time** | Socket.IO with Redis adapter |
| **AI Integration** | Pluggable providers (Mock, OpenAI, Groq) |
| **Session Management** | Lifecycle with reconnection support |
| **Rate Limiting** | Sliding window algorithm |
| **Storage** | Redis with automatic fallback |
| **Security** | bcrypt, CORS, input validation |
| **Observability** | Structured logging, health checks |

---

*Generated for Talksy Backend v0.0.1*
